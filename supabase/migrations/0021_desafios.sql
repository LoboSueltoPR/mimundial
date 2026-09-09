-- ============================================================
--  0021 — DESAFÍOS: tu equipo contra otro equipo
--
--  Hasta acá un partido era siempre un picadito: se anota gente suelta
--  y el bombo la reparte en claros y oscuros. Un desafío es el otro
--  formato del fútbol amateur — dos equipos que YA existen y se cruzan.
--
--  Decisión de fondo: un desafío NO es una tabla nueva. Es un `partido`
--  con los dos lados declarados en vez de sorteados. Todo lo que ya está
--  construido sobre `partidos` + `jugadores` (el camino, la plata, los
--  avatares, el perfil público, la invitación por token) sigue andando
--  sin enterarse.
--
--  Eso obliga a una cosa que NO es opcional: las filas de `jugadores`
--  tienen que existir para los dos lados. El `uid` que va adentro del
--  jsonb `equipos` es una copia denormalizada — `mis_resultados_ajenos`,
--  `camino_de_amigos` y `perfil_publico` las tres arrancan su FROM en
--  `jugadores`. Un desafío que solo escriba `equipos` le movería el
--  camino únicamente al dueño y a nadie más, que es exactamente el bug
--  que la 0014 y la 0019 vinieron a arreglar dos veces.
--
--  Por eso `equipos` no lo escribe el cliente nunca: lo reconstruye
--  `rearmar_equipos_desafio()` desde `jugadores.lado` adentro de la
--  misma transacción que agrega o saca a alguien. Además de mantener
--  las dos fuentes en sincronía, cierra por construcción la trampa de
--  `jsonb || NULL` (que no suma campos: borra el objeto entero).
-- ============================================================

-- ---------- columnas ----------

alter table public.partidos
  add column if not exists es_desafio      boolean not null default false,
  -- El capitán de enfrente. null = todavía busca rival.
  add column if not exists rival_id        uuid references auth.users(id) on delete set null,
  -- null con rival_id cargado = lo desafiaste y todavía no contestó.
  add column if not exists rival_acepto_en timestamptz,
  add column if not exists nombre_a        text,
  add column if not exists nombre_b        text;

-- De qué lado juega cada uno. null en los picaditos: ahí el lado lo
-- decide el sorteo y vive solo en el jsonb.
alter table public.jugadores
  add column if not exists lado char(1);

alter table public.jugadores drop constraint if exists jugadores_lado_check;
alter table public.jugadores
  add constraint jugadores_lado_check check (lado is null or lado in ('a', 'b'));

create index if not exists partidos_desafios_abiertos_idx
  on public.partidos (fecha desc)
  where es_desafio and rival_id is null and abierto;

-- ============================================================
--  Reconstruir `equipos` desde las filas
--
--  Interna: no se le da EXECUTE a nadie. La llaman las RPC de abajo.
--  `n` sigue significando lo mismo que en el sorteo — cuántas cabezas
--  había cuando se armó — así que se recalcula acá y el aviso de "la
--  lista cambió" sigue teniendo sentido.
-- ============================================================
create or replace function public.rearmar_equipos_desafio(p_partido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a jsonb;
  v_b jsonb;
  v_n int;
begin
  -- Una cabeza por jugador más una por cada invitado que trae, igual
  -- que `cabezasLista` en el cliente. El invitado lleva `jid` pero no
  -- `uid`: no es una cuenta y no le cuenta el camino a nadie.
  with cabezas as (
    select
      j.lado,
      j.orden,
      0 as sub,
      jsonb_build_object(
        'label', j.nombre,
        'inv', false,
        'jid', j.id,
        'uid', j.user_id
      ) as c
    from public.jugadores j
    where j.partido_id = p_partido_id and j.lado is not null
    union all
    select
      j.lado,
      j.orden,
      g.i as sub,
      jsonb_build_object(
        'label', 'Invitado de ' || j.nombre,
        'inv', true,
        'de', j.nombre,
        'jid', j.id
      )
    from public.jugadores j
      cross join lateral generate_series(1, coalesce(j.invitados, 0)) as g(i)
    where j.partido_id = p_partido_id and j.lado is not null
  )
  -- El orden va pedido adentro del agregado. Un `order by` en una
  -- subconsulta no garantiza el orden con el que agrega jsonb_agg.
  select
    coalesce(jsonb_agg(c order by orden, sub) filter (where lado = 'a'), '[]'::jsonb),
    coalesce(jsonb_agg(c order by orden, sub) filter (where lado = 'b'), '[]'::jsonb),
    count(*)
  into v_a, v_b, v_n
  from cabezas;

  -- Sin nadie de ningún lado, `equipos` vuelve a null: es lo que lee la
  -- app para saber que todavía no hay nada armado.
  update public.partidos
  set equipos = case
        when v_n = 0 then null
        else jsonb_build_object('a', v_a, 'b', v_b, 'n', v_n)
      end
  where id = p_partido_id;
end;
$$;

revoke execute on function public.rearmar_equipos_desafio(uuid) from public;

-- ============================================================
--  Quién puede tocar qué lado
--
--  El dueño arma el lado 'a', el rival aceptado arma el 'b'. Devuelve
--  null si el que pregunta no es ninguno de los dos: las RPC de abajo
--  lo usan como control de acceso, no como conveniencia.
-- ============================================================
create or replace function public.mi_lado_capitan(p_partido_id uuid)
returns char(1)
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.user_id = auth.uid() then 'a'
    when p.rival_id = auth.uid() and p.rival_acepto_en is not null then 'b'
    else null
  end::char(1)
  from public.partidos p
  where p.id = p_partido_id and p.es_desafio;
$$;

revoke execute on function public.mi_lado_capitan(uuid) from public;
grant execute on function public.mi_lado_capitan(uuid) to authenticated;

-- ============================================================
--  Los desafíos que me tocan a mí
--
--  Tres cosas distintas en una sola consulta, marcadas con `rol`:
--    · 'abierto'  — un amigo busca rival y yo podría tomarlo
--    · 'invitado' — me desafiaron a mí y todavía no contesté
--    · 'rival'    — ya lo tomé y tengo que terminar de armar mi equipo
--
--  El tercero no es un detalle: sin él, el capitán rival puede armar su
--  equipo UNA sola vez, en la pantalla que se abre justo después de
--  aceptar. Si la cierra, el desafío ya no le aparece por ningún lado
--  — `mis_partidos_anotado` lo manda a `/p/[token]`, que es la
--  invitación y no deja sumar gente a un lado.
--
--  El filtro de amistad es el que hace que esto sea un tablero entre
--  amigos y no un padrón público. Va también en la rama 'invitado': si
--  el dueño escribe un `rival_id` de alguien que no es su amigo, esa
--  fila simplemente no le aparece nunca.
-- ============================================================
create or replace function public.desafios_para_mi()
returns table (
  id            uuid,
  token         text,
  fecha         date,
  hora          text,
  lugar         text,
  cupo          int,
  anfitrion     text,
  anfitrion_id  uuid,
  avatar_url    text,
  nombre_a      text,
  cabezas_a     int,
  rol           text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.token,
    p.fecha,
    p.hora,
    p.lugar,
    p.cupo,
    pf.nombre,
    p.user_id,
    pf.avatar_url,
    p.nombre_a,
    (
      select coalesce(sum(1 + coalesce(j.invitados, 0)), 0)::int
      from public.jugadores j
      where j.partido_id = p.id and j.lado = 'a'
    ),
    case
      when p.rival_acepto_en is not null then 'rival'
      when p.rival_id = auth.uid()       then 'invitado'
      else 'abierto'
    end
  from public.partidos p
    join public.perfiles pf on pf.id = p.user_id
  where p.es_desafio
    and p.abierto
    and p.resultado is null
    and p.user_id <> auth.uid()
    and (
      -- todavía se puede tomar: abierto a cualquiera, o dirigido a mí
      (p.rival_acepto_en is null and (p.rival_id is null or p.rival_id = auth.uid()))
      -- o ya lo tomé y me falta terminar de armar
      or (p.rival_acepto_en is not null and p.rival_id = auth.uid())
    )
    and exists (
      select 1 from public.amigos a
      where a.user_id = auth.uid() and a.amigo_id = p.user_id
    )
  order by p.fecha, p.hora nulls last;
$$;

revoke execute on function public.desafios_para_mi() from public;
grant execute on function public.desafios_para_mi() to authenticated;

-- ============================================================
--  Aceptar
--
--  Se toma el desafío y se entra en la misma llamada: el que acepta
--  queda anotado de su lado. Si no quedara anotado, el partido no le
--  contaría para SU camino — que es todo el punto de jugarlo.
-- ============================================================
create or replace function public.aceptar_desafio(p_partido_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p       public.partidos%rowtype;
  v_nombre  text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Entrá con tu cuenta.');
  end if;

  select * into v_p from public.partidos where id = p_partido_id and es_desafio;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese desafío no existe.');
  end if;
  if v_p.user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'Es tu propio desafío.');
  end if;
  if v_p.rival_acepto_en is not null then
    return jsonb_build_object('ok', false, 'error', 'Ya lo tomó otro equipo.');
  end if;
  if v_p.rival_id is not null and v_p.rival_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'Este desafío es para otro.');
  end if;
  if not v_p.abierto then
    return jsonb_build_object('ok', false, 'error', 'El desafío está cerrado.');
  end if;
  if not exists (
    select 1 from public.amigos a
    where a.user_id = auth.uid() and a.amigo_id = v_p.user_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Solo entre amigos.');
  end if;

  /* Si el anfitrión ya te había sumado a SU equipo, aceptar como rival
     te movería de lado en silencio y lo dejaría con un jugador menos
     sin que se entere. Se rechaza y se explica: quién juega de qué
     lado es una decisión de personas, no algo para resolver a dedo. */
  if exists (
    select 1 from public.jugadores
    where partido_id = p_partido_id and user_id = auth.uid() and lado = 'a'
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ya estás en el equipo de enfrente. Que te saquen de ahí primero.'
    );
  end if;

  select nombre into v_nombre from public.perfiles where id = auth.uid();
  v_nombre := nullif(btrim(coalesce(v_nombre, '')), '');
  if v_nombre is null then
    return jsonb_build_object('ok', false, 'error', 'Cargá tu nombre en el perfil.');
  end if;

  update public.partidos
  set rival_id = auth.uid(), rival_acepto_en = now()
  where id = p_partido_id;

  -- El capitán entra primero en su propio lado, igual que el que arma
  -- un picadito arranca anotado. Si ya tenía fila (raro pero posible si
  -- el dueño lo cargó a mano), se le marca el lado en vez de duplicarla.
  if exists (
    select 1 from public.jugadores
    where partido_id = p_partido_id and user_id = auth.uid()
  ) then
    update public.jugadores
    set lado = 'b'
    where partido_id = p_partido_id and user_id = auth.uid();
  else
    insert into public.jugadores (partido_id, nombre, orden, user_id, lado)
    select p_partido_id, v_nombre,
           coalesce(max(orden), -1) + 1, auth.uid(), 'b'
    from public.jugadores where partido_id = p_partido_id;
  end if;

  perform public.rearmar_equipos_desafio(p_partido_id);
  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ya hay alguien con tu nombre anotado en ese partido.'
    );
end;
$$;

revoke execute on function public.aceptar_desafio(uuid) from public;
grant execute on function public.aceptar_desafio(uuid) to authenticated;

-- ============================================================
--  Sumar a alguien a MI lado
--
--  La misma función para los dos capitanes: el lado no se pide por
--  parámetro, se deduce de quién llama. Un solo camino de código para
--  los dos lados es lo que evita que se arreglen las cosas de a una
--  mitad, que en este proyecto ya pasó tres veces.
-- ============================================================
create or replace function public.sumar_a_mi_lado(
  p_partido_id uuid,
  p_nombre     text,
  p_user_id    uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lado   char(1);
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_id     uuid;
begin
  v_lado := public.mi_lado_capitan(p_partido_id);
  if v_lado is null then
    return jsonb_build_object('ok', false, 'error', 'No sos capitán de este desafío.');
  end if;
  if v_nombre is null then
    return jsonb_build_object('ok', false, 'error', 'Falta el nombre.');
  end if;
  if exists (select 1 from public.partidos where id = p_partido_id and resultado is not null) then
    return jsonb_build_object('ok', false, 'error', 'El partido ya se jugó.');
  end if;
  if p_user_id is not null and exists (
    select 1 from public.jugadores
    where partido_id = p_partido_id and user_id = p_user_id
  ) then
    return jsonb_build_object('ok', false, 'error', v_nombre || ' ya está en este partido.');
  end if;

  insert into public.jugadores (partido_id, nombre, orden, user_id, lado)
  select p_partido_id, v_nombre, coalesce(max(orden), -1) + 1, p_user_id, v_lado
  from public.jugadores where partido_id = p_partido_id
  returning id into v_id;

  perform public.rearmar_equipos_desafio(p_partido_id);
  return jsonb_build_object('ok', true, 'id', v_id);
exception
  when unique_violation then
    -- `jugadores` tiene único (partido_id, lower(nombre)) desde la 0001,
    -- y vale para el partido entero: dos "Juan", uno por lado, chocan.
    return jsonb_build_object(
      'ok', false,
      'error', 'Ya hay un ' || v_nombre || ' en este partido. Ponele el apellido.'
    );
end;
$$;

revoke execute on function public.sumar_a_mi_lado(uuid, text, uuid) from public;
grant execute on function public.sumar_a_mi_lado(uuid, text, uuid) to authenticated;

-- ============================================================
--  Sacar a alguien de MI lado
--
--  Acotado al propio lado a propósito: un capitán no le desarma el
--  equipo al otro.
-- ============================================================
create or replace function public.quitar_de_mi_lado(
  p_partido_id uuid,
  p_jugador_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lado char(1);
begin
  v_lado := public.mi_lado_capitan(p_partido_id);
  if v_lado is null then
    return jsonb_build_object('ok', false, 'error', 'No sos capitán de este desafío.');
  end if;

  delete from public.jugadores
  where id = p_jugador_id and partido_id = p_partido_id and lado = v_lado;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese jugador no es de tu lado.');
  end if;

  perform public.rearmar_equipos_desafio(p_partido_id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.quitar_de_mi_lado(uuid, uuid) from public;
grant execute on function public.quitar_de_mi_lado(uuid, uuid) to authenticated;

-- ============================================================
--  Los invitados que trae uno de mi lado
--
--  `invitados` es una columna de `jugadores` y la RLS no deja que el
--  rival toque filas de un partido ajeno, así que necesita puerta.
-- ============================================================
create or replace function public.invitados_de_mi_lado(
  p_partido_id uuid,
  p_jugador_id uuid,
  p_invitados  int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lado char(1);
begin
  v_lado := public.mi_lado_capitan(p_partido_id);
  if v_lado is null then
    return jsonb_build_object('ok', false, 'error', 'No sos capitán de este desafío.');
  end if;

  update public.jugadores
  set invitados = greatest(0, least(10, coalesce(p_invitados, 0)))
  where id = p_jugador_id and partido_id = p_partido_id and lado = v_lado;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese jugador no es de tu lado.');
  end if;

  perform public.rearmar_equipos_desafio(p_partido_id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.invitados_de_mi_lado(uuid, uuid, int) from public;
grant execute on function public.invitados_de_mi_lado(uuid, uuid, int) to authenticated;

-- ============================================================
--  Mi lado, para armarlo
--
--  El rival no puede hacer `select` sobre `partidos` ni `jugadores` de
--  un partido ajeno (RLS por dueño), así que la pantalla donde arma su
--  equipo lee todo por acá. Devuelve SU lado con nombres e ids, y del
--  lado de enfrente solo cuántos son: cuántos faltan es información
--  que necesita para armar, quiénes son no.
-- ============================================================
create or replace function public.mi_desafio(p_partido_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lado char(1);
  v_p    public.partidos%rowtype;
begin
  v_lado := public.mi_lado_capitan(p_partido_id);
  if v_lado is null then
    return jsonb_build_object('ok', false, 'error', 'No sos capitán de este desafío.');
  end if;

  select * into v_p from public.partidos where id = p_partido_id;

  return jsonb_build_object(
    'ok', true,
    'lado', v_lado,
    'id', v_p.id,
    'token', v_p.token,
    'fecha', v_p.fecha,
    'hora', v_p.hora,
    'lugar', v_p.lugar,
    'cupo', v_p.cupo,
    'jugado', v_p.resultado is not null,
    'mi_nombre_equipo', case when v_lado = 'a' then v_p.nombre_a else v_p.nombre_b end,
    'rival_nombre_equipo', case when v_lado = 'a' then v_p.nombre_b else v_p.nombre_a end,
    'anfitrion', (select nombre from public.perfiles where id = v_p.user_id),
    'rival', (select nombre from public.perfiles where id = v_p.rival_id),
    'los_mios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', j.id, 'nombre', j.nombre, 'invitados', coalesce(j.invitados, 0),
        'user_id', j.user_id, 'avatar_url', pf.avatar_url
      ) order by j.orden)
      from public.jugadores j
        left join public.perfiles pf on pf.id = j.user_id
      where j.partido_id = p_partido_id and j.lado = v_lado
    ), '[]'::jsonb),
    'cabezas_rival', (
      select coalesce(sum(1 + coalesce(j.invitados, 0)), 0)::int
      from public.jugadores j
      where j.partido_id = p_partido_id
        and j.lado = case when v_lado = 'a' then 'b' else 'a' end
    )
  );
end;
$$;

revoke execute on function public.mi_desafio(uuid) from public;
grant execute on function public.mi_desafio(uuid) to authenticated;

-- ============================================================
--  Nombre de mi equipo
-- ============================================================
create or replace function public.nombrar_mi_lado(
  p_partido_id uuid,
  p_nombre     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lado char(1);
  v_n    text := nullif(btrim(coalesce(p_nombre, '')), '');
begin
  v_lado := public.mi_lado_capitan(p_partido_id);
  if v_lado is null then
    return jsonb_build_object('ok', false, 'error', 'No sos capitán de este desafío.');
  end if;

  if v_lado = 'a' then
    update public.partidos set nombre_a = left(v_n, 28) where id = p_partido_id;
  else
    update public.partidos set nombre_b = left(v_n, 28) where id = p_partido_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.nombrar_mi_lado(uuid, text) from public;
grant execute on function public.nombrar_mi_lado(uuid, text) to authenticated;
