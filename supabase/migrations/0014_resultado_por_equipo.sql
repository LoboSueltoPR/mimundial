-- ============================================================
--  MiMundial 0014 — el resultado le llega a todos los que jugaron
--
--  Hasta acá `partidos.resultado` era "ganamos / empate / perdimos"
--  desde el punto de vista del DUEÑO del partido, y `partidos` tiene
--  RLS por user_id. O sea: si Rodri marcaba ganado, el que estaba en
--  su equipo no se enteraba — su camino ni se movía.
--
--  Se agrega `equipo_ganador` ('a' = claros, 'b' = oscuros). Ese dato
--  sí es objetivo: no depende de quién lo carga. Con eso, y sabiendo
--  en qué lado quedó cada cuenta en el sorteo, se puede dar vuelta el
--  resultado para cada uno.
--
--  `resultado` NO se toca ni se deja de escribir: sigue siendo lo que
--  leen stats, cuentas y el camino del dueño. `equipo_ganador` es
--  información de más, no un reemplazo.
--
--  Ojo: esto NO es retroactivo. Los partidos ya jugados no tienen
--  `equipo_ganador` ni `uid` adentro de `equipos`, así que no se les
--  puede asignar lado a nadie. Empiezan a contar los que se carguen
--  de ahora en adelante.
-- ============================================================

/* ------------------------------------------------------------
   1. Qué equipo ganó
   ------------------------------------------------------------ */
alter table public.partidos
  add column if not exists equipo_ganador text;

alter table public.partidos
  drop constraint if exists partidos_equipo_ganador_check;
alter table public.partidos
  add constraint partidos_equipo_ganador_check
  check (equipo_ganador is null or equipo_ganador in ('a', 'b'));

/* ------------------------------------------------------------
   2. "Ese soy yo": enganchar mi cuenta a una fila que cargó el
      anfitrión a mano.

      Solo filas huérfanas de verdad: sin cuenta (`user_id is null`)
      y sin claim de navegador (`claim is null`, o sea que NO se anotó
      nadie solo por el link — esa fila la escribió el anfitrión).
      Nunca se pisa la anotación de otro.
   ------------------------------------------------------------ */
create or replace function public.reclamar_anotacion(
  tok           text,
  p_jugador_id  uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.partidos%rowtype;
  j public.jugadores%rowtype;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'Entrá con tu cuenta primero.');
  end if;

  select * into p from public.partidos where token = tok;
  if not found then
    return json_build_object('ok', false, 'error', 'Ese link no existe.');
  end if;

  select * into j from public.jugadores
  where id = p_jugador_id and partido_id = p.id;
  if not found then
    return json_build_object('ok', false, 'error', 'Esa anotación no es de este partido.');
  end if;

  if j.user_id is not null then
    return json_build_object('ok', false, 'error', 'Esa anotación ya tiene cuenta.');
  end if;
  if j.claim is not null then
    return json_build_object('ok', false, 'error', 'Esa anotación la hizo otra persona por el link.');
  end if;

  if exists (
    select 1 from public.jugadores
    where partido_id = p.id and user_id = auth.uid()
  ) then
    return json_build_object('ok', false, 'error', 'Ya estás anotado en este partido.');
  end if;

  update public.jugadores set user_id = auth.uid() where id = j.id;

  return json_build_object('ok', true);
end;
$$;

revoke execute on function public.reclamar_anotacion(text, uuid) from anon;
revoke execute on function public.reclamar_anotacion(text, uuid) from public;
grant  execute on function public.reclamar_anotacion(text, uuid) to authenticated;

/* ------------------------------------------------------------
   3. El anfitrión engancha una fila que cargó a mano con la cuenta
      de quien realmente es: él mismo o uno de sus amigos.

      Sin esto, el anfitrión que se anota a sí mismo escribiendo su
      nombre queda como una fila sin cuenta — y sin cuenta no hay
      forma de saber de qué lado del sorteo estuvo, que es de lo que
      depende todo el punto 4.

      `p_user_id` en null desengancha (por si se marcó al que no era).
   ------------------------------------------------------------ */
create or replace function public.enganchar_anotado(
  p_jugador_id uuid,
  p_user_id    uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jugadores%rowtype;
  p public.partidos%rowtype;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'Sin sesión.');
  end if;

  select * into j from public.jugadores where id = p_jugador_id;
  if not found then
    return json_build_object('ok', false, 'error', 'No existe esa anotación.');
  end if;

  select * into p from public.partidos where id = j.partido_id;
  if p.user_id <> auth.uid() then
    return json_build_object('ok', false, 'error', 'Ese partido no es tuyo.');
  end if;

  -- Solo se puede enganchar a uno mismo o a un amigo: no a cualquier uuid.
  if p_user_id is not null
     and p_user_id <> auth.uid()
     and not exists (
       select 1 from public.amigos
       where user_id = auth.uid() and amigo_id = p_user_id
     ) then
    return json_build_object('ok', false, 'error', 'Esa persona no es tu amiga.');
  end if;

  if p_user_id is not null and exists (
    select 1 from public.jugadores
    where partido_id = j.partido_id and user_id = p_user_id and id <> j.id
  ) then
    return json_build_object('ok', false, 'error', 'Esa cuenta ya está en otra fila de este partido.');
  end if;

  update public.jugadores set user_id = p_user_id where id = j.id;

  return json_build_object('ok', true);
end;
$$;

revoke execute on function public.enganchar_anotado(uuid, uuid) from anon;
revoke execute on function public.enganchar_anotado(uuid, uuid) from public;
grant  execute on function public.enganchar_anotado(uuid, uuid) to authenticated;

/* ------------------------------------------------------------
   3 bis. En qué lado del sorteo quedó una cuenta.

      `equipos` es el jsonb que escribe el navegador: { a: [...],
      b: [...], n }. Cada cabeza es { label, inv, jid, uid } — `uid`
      lo empezó a guardar esta misma versión, así que los sorteos de
      antes no lo tienen y esta función devuelve null para todos.

      Se compara con ->>'uid' contra el uuid pasado a text, no con
      el operador @>: acá lo que importa es que sea obvio qué está
      comparando con qué, y la lista tiene 20 elementos, no 20 mil.
      El jsonb_typeof es por si `equipos` viene null o malformado:
      sin eso, jsonb_array_elements revienta la consulta entera.
   ------------------------------------------------------------ */
create or replace function public.lado_en_equipos(
  p_equipos jsonb,
  p_user_id uuid
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_equipos is null or p_user_id is null then null
    when exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(p_equipos->'a') = 'array' then p_equipos->'a' else '[]'::jsonb end
      ) c where c->>'uid' = p_user_id::text
    ) then 'a'
    when exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(p_equipos->'b') = 'array' then p_equipos->'b' else '[]'::jsonb end
      ) c where c->>'uid' = p_user_id::text
    ) then 'b'
  end;
$$;

-- No lee ninguna tabla, pero la disciplina de la casa es no dejarle
-- nada a PUBLIC: mis_resultados_ajenos la llama como security definer.
revoke execute on function public.lado_en_equipos(jsonb, uuid) from anon;
revoke execute on function public.lado_en_equipos(jsonb, uuid) from public;
grant  execute on function public.lado_en_equipos(jsonb, uuid) to authenticated;

/* ------------------------------------------------------------
   4. Los partidos AJENOS que jugué, con el resultado dado vuelta
      para mí.

      Los propios no van acá: esos ya salen de la tabla con su RLS.
      Reglas:

      · Solo entran los que tienen mi lado identificado en el sorteo
        y `equipo_ganador` cargado (o empate). Si no se sabe de qué
        lado estuve, el partido no cuenta — no se adivina.
      · `cierra_mundial` se devuelve SIEMPRE en false: es una decisión
        del dueño sobre SU mundial. Si Rodri da por terminado el suyo,
        el mío no se entera.
      · Nada de plata: ni costo, ni puso, ni pagado. Mismo criterio
        que mis_partidos_anotado (0005).
   ------------------------------------------------------------ */
create or replace function public.mis_resultados_ajenos()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return '[]'::json;
  end if;

  return coalesce((
    select json_agg(x order by x.fecha, x.creado_en)
    from (
      select
        p.id,
        p.fecha,
        p.creado_en,
        p.lugar,
        (select nombre from public.perfiles where id = p.user_id) as anfitrion,
        false as cierra_mundial,
        case
          when p.resultado = 'empate' then 'empate'
          when p.equipo_ganador = lados.mi_lado then 'ganamos'
          else 'perdimos'
        end as resultado,
        case when lados.mi_lado = lados.lado_dueno then p.goles_favor else p.goles_contra end
          as goles_favor,
        case when lados.mi_lado = lados.lado_dueno then p.goles_contra else p.goles_favor end
          as goles_contra
      from public.jugadores j
      join public.partidos p on p.id = j.partido_id
      join lateral (
        select
          public.lado_en_equipos(p.equipos, j.user_id) as mi_lado,
          public.lado_en_equipos(p.equipos, p.user_id) as lado_dueno
      ) lados on true
      where j.user_id = auth.uid()
        and p.user_id <> auth.uid()
        and p.resultado is not null
        and p.equipos is not null
        and lados.mi_lado is not null
        and (p.resultado = 'empate' or p.equipo_ganador is not null)
    ) x
  ), '[]'::json);
end;
$$;

revoke execute on function public.mis_resultados_ajenos() from anon;
revoke execute on function public.mis_resultados_ajenos() from public;
grant  execute on function public.mis_resultados_ajenos() to authenticated;

/* ------------------------------------------------------------
   5. ver_partido_por_token: dos datos más para el logueado.

      · `id` de cada anotado — hace falta para poder decir "ese soy
        yo". Va solo si hay sesión, igual que user_id/username.
      · `reclamable`: la fila no tiene cuenta NI claim de navegador,
        o sea que la escribió el anfitrión a mano y no es de nadie.

      Copiada entera de 0013 (create or replace pisa todo) y con los
      revoke/grant repetidos abajo por el mismo motivo. Sigue sin
      exponer costo, puso, pagado ni el claim.
   ------------------------------------------------------------ */
create or replace function public.ver_partido_por_token(tok text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p        public.partidos%rowtype;
  cabezas  int;
  logueado boolean;
  mi       public.jugadores%rowtype;
  ca       public.canchas%rowtype;
begin
  select * into p from public.partidos where token = tok;
  if not found then
    return null;
  end if;

  logueado := auth.uid() is not null;

  select coalesce(sum(1 + invitados), 0) into cabezas
  from public.jugadores where partido_id = p.id;

  if logueado then
    select * into mi from public.jugadores
    where partido_id = p.id and user_id = auth.uid();
  end if;

  if p.cancha_id is not null then
    select * into ca from public.canchas where id = p.cancha_id;
  end if;

  return json_build_object(
    'id',       p.id,
    'fecha',    p.fecha,
    'hora',     p.hora,
    'lugar',    p.lugar,
    'cupo',     p.cupo,
    'abierto',  p.abierto,
    'cabezas',  cabezas,
    'faltan',   greatest(0, p.cupo - cabezas),
    'anfitrion', (select nombre from public.perfiles where id = p.user_id),
    'soy_anotado', mi.id is not null,
    'mi_nombre', mi.nombre,
    'mi_invitados', mi.invitados,
    'cancha_lat',    ca.lat,
    'cancha_lng',    ca.lng,
    'cancha_notas',  ca.notas,
    'anotados', coalesce((
      select json_agg(json_build_object(
               'id', case when logueado then j.id else null end,
               'nombre', j.nombre,
               'invitados', j.invitados,
               'user_id', case when logueado then j.user_id else null end,
               'username', case when logueado then pf.username else null end,
               'avatar_url', case when logueado then pf.avatar_url else null end,
               'reclamable', logueado and j.user_id is null and j.claim is null
             ) order by j.orden, j.creado_en)
      from public.jugadores j
      left join public.perfiles pf on pf.id = j.user_id
      where j.partido_id = p.id
    ), '[]'::json)
  );
end;
$$;

revoke execute on function public.ver_partido_por_token(text) from public;
grant  execute on function public.ver_partido_por_token(text) to anon, authenticated;
