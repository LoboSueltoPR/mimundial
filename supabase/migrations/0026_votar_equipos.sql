-- ============================================================
--  MiMundial 0026 — tres sorteos y que voten los que juegan
--
--  Hasta acá los equipos los decidía el anfitrión: sorteaba, retocaba a
--  mano y listo. Ahora puede, en vez de eso, sortear TRES repartos
--  distintos y que el grupo elija. El sorteo de siempre sigue: esto es
--  una opción más, no un reemplazo.
--
--  Cómo queda:
--    1. El anfitrión arma las tres opciones (el reparto se hace en el
--       navegador con el mismo `sortear()` de siempre, que es quien
--       sabe hacerlas distintas) y abre la votación.
--    2. A cada anotado le llega un push con el link.
--    3. Cada uno vota UNA opción, una sola vez.
--    4. Cuando una opción junta más de la mitad de los votantes, se
--       cierra sola y esa opción pasa a ser `partidos.equipos`. Desde
--       ahí se retoca a mano igual que cualquier sorteo.
--
--  ── Quién vota ────────────────────────────────────────────
--
--  Cada fila de `jugadores` que tenga identidad: cuenta (`user_id`) o
--  navegador (`claim`). Es la misma regla con la que `mi_parte` (0015)
--  sabe quién sos. Los invitados no votan — no son nadie, son un lugar
--  que ocupa alguien sin nombre — y la fila que el anfitrión cargó a
--  mano sin enganchar a una cuenta tampoco: no hay forma de saber
--  quién la está usando. Esas no cuentan para la mayoría, porque si
--  contaran podría no llegarse nunca.
--
--  ── Los votos son secretos ────────────────────────────────
--
--  `votos_equipos` tiene RLS prendida y CERO políticas: no se lee por
--  PostgREST, ni siquiera el anfitrión. Lo único que sale es:
--    · a cada uno, SU voto;
--    · a todos, cuántos votaron de cuántos;
--    · al anfitrión, además, QUIÉN falta votar — nunca qué votó cada
--      uno, ni cuántos votos lleva cada opción.
--  Que el conteo por opción no salga ni siquiera al final es a
--  propósito: en un grupo de diez, "la 2 ganó 6 a 4" alcanza para
--  deducir quién votó qué.
--
--  ── Si no hay mayoría ─────────────────────────────────────
--
--  Con tres opciones puede pasar que voten todos y ninguna pase la
--  mitad (4-3-3). Ahí gana la más votada, y si empatan arriba decide
--  el azar entre esas. Es un sorteo — y esto ya era un sorteo. La
--  alternativa, dejarla abierta para siempre, deja al partido sin
--  equipos justo cuando ya no queda nadie por votar.
--
--  El anfitrión puede además cerrarla antes (gana la más votada hasta
--  ahí) o cancelarla y volver a como estaba.
-- ============================================================

/* ------------------------------------------------------------
   1. Las tablas.

      Una votación por partido: abrir una nueva pisa la anterior.
      `opciones` es un array de tres `Equipos` con la misma forma que
      `partidos.equipos` (con `jid` y `uid` adentro), así el ganador
      se copia tal cual y 0014 sigue sabiendo de qué lado jugó cada
      uno.
   ------------------------------------------------------------ */
create table if not exists public.votaciones_equipos (
  partido_id uuid primary key references public.partidos(id) on delete cascade,
  opciones   jsonb not null,
  abierta_en timestamptz not null default now(),
  cerrada_en timestamptz,
  ganadora   smallint check (ganadora between 0 and 2)
);

create table if not exists public.votos_equipos (
  partido_id uuid not null references public.votaciones_equipos(partido_id) on delete cascade,
  -- Si alguien se baja del partido, su voto se va con él: no tiene
  -- sentido que decida los equipos uno que no juega.
  jugador_id uuid not null references public.jugadores(id) on delete cascade,
  opcion     smallint not null check (opcion between 0 and 2),
  votado_en  timestamptz not null default now(),
  primary key (partido_id, jugador_id)
);

alter table public.votaciones_equipos enable row level security;
alter table public.votos_equipos      enable row level security;
revoke all on public.votaciones_equipos from anon, authenticated;
revoke all on public.votos_equipos      from anon, authenticated;

/* ------------------------------------------------------------
   2. Internas: quién vota, quién gana, cerrar.
   ------------------------------------------------------------ */

/* Los que votan: filas con cuenta o con navegador. */
create or replace function public.votantes_de(p_partido_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.jugadores
  where partido_id = p_partido_id
    and (user_id is not null or claim is not null);
$$;

/* La más votada; si empatan arriba, una de esas al azar. */
create or replace function public.mas_votada(p_partido_id uuid)
returns smallint
language sql
volatile
security definer
set search_path = public
as $$
  select v.opcion
  from public.votos_equipos v
  where v.partido_id = p_partido_id
  group by v.opcion
  order by count(*) desc, random()
  limit 1;
$$;

/*
 * Cierra con la opción dada y la vuelve el sorteo del partido.
 *
 * El `where cerrada_en is null` con row_count es el mismo freno que
 * `aviso_completo_en` (0016): si dos votos llegan a la vez y los dos
 * completan la mayoría, uno solo cierra y avisa.
 */
create or replace function public.cerrar_votacion(p_partido_id uuid, p_ganadora smallint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  p        public.partidos%rowtype;
  v        public.votaciones_equipos%rowtype;
  filas    int;
  destinos uuid[];
  claims   uuid[];
begin
  update public.votaciones_equipos
     set cerrada_en = now(), ganadora = p_ganadora
   where partido_id = p_partido_id and cerrada_en is null
  returning * into v;
  get diagnostics filas = row_count;
  if filas = 0 then
    return false;
  end if;

  update public.partidos
     set equipos = v.opciones -> p_ganadora::int
   where id = p_partido_id
  returning * into p;

  select coalesce(array_agg(distinct j.user_id) filter (
           where j.user_id is not null and j.user_id <> p.user_id
         ), array[]::uuid[]),
         coalesce(array_agg(distinct j.claim) filter (where j.claim is not null), array[]::uuid[])
    into destinos, claims
  from public.jugadores j where j.partido_id = p.id;

  if array_length(destinos, 1) > 0 or array_length(claims, 1) > 0 then
    perform public.mandar_push(
      destinos,
      claims,
      'Equipos elegidos',
      coalesce(p.lugar, 'El partido') || ' — ganó la opción ' || (p_ganadora + 1) || '. Mirá cómo quedaste.',
      '/p/' || p.token
    );
  end if;

  -- El anfitrión, a su pantalla: es el que los puede retocar.
  perform public.mandar_push(
    array[p.user_id],
    array[]::uuid[],
    'Equipos elegidos',
    coalesce(p.lugar, 'El partido') || ' — ganó la opción ' || (p_ganadora + 1) || '.',
    '/partidos/' || p.id
  );

  return true;
end;
$$;

revoke execute on function public.votantes_de(uuid)                from public, anon, authenticated;
revoke execute on function public.mas_votada(uuid)                 from public, anon, authenticated;
revoke execute on function public.cerrar_votacion(uuid, smallint)  from public, anon, authenticated;

/* ------------------------------------------------------------
   3. Abrir la votación (anfitrión).

      Los equipos que hubiera se borran: mientras se vota no hay
      sorteo, y dejar uno viejo a la vista confunde ("¿y estos?").
      Se valida la forma de las tres opciones porque de acá salen los
      equipos del partido. El dueño igual puede escribir `equipos` a
      mano por la tabla, así que esto es cordura y no seguridad.
   ------------------------------------------------------------ */
create or replace function public.abrir_votacion_equipos(p_partido_id uuid, p_opciones jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p        public.partidos%rowtype;
  destinos uuid[];
  claims   uuid[];
begin
  select * into p from public.partidos where id = p_partido_id;
  if not found or p.user_id is distinct from auth.uid() then
    return json_build_object('ok', false, 'error', 'Este partido no es tuyo.');
  end if;

  if coalesce(p.es_desafio, false) then
    return json_build_object('ok', false, 'error', 'En un desafío cada capitán arma su equipo.');
  end if;

  if jsonb_typeof(p_opciones) is distinct from 'array' or jsonb_array_length(p_opciones) <> 3
     or exists (
       select 1 from jsonb_array_elements(p_opciones) o
       where jsonb_typeof(o -> 'a') is distinct from 'array'
          or jsonb_typeof(o -> 'b') is distinct from 'array'
     ) then
    return json_build_object('ok', false, 'error', 'Tienen que ser tres repartos.');
  end if;

  insert into public.votaciones_equipos (partido_id, opciones)
  values (p.id, p_opciones)
  on conflict (partido_id) do update
    set opciones = excluded.opciones,
        abierta_en = now(),
        cerrada_en = null,
        ganadora = null;

  -- Los votos de una votación anterior no valen para estas opciones.
  delete from public.votos_equipos where partido_id = p.id;

  update public.partidos set equipos = null, equipo_ganador = null where id = p.id;

  -- A todos los que votan menos al que la abrió, que ya sabe.
  select coalesce(array_agg(distinct j.user_id) filter (
           where j.user_id is not null and j.user_id <> p.user_id
         ), array[]::uuid[]),
         coalesce(array_agg(distinct j.claim) filter (where j.claim is not null), array[]::uuid[])
    into destinos, claims
  from public.jugadores j where j.partido_id = p.id;

  if array_length(destinos, 1) > 0 or array_length(claims, 1) > 0 then
    perform public.mandar_push(
      destinos,
      claims,
      'Votá los equipos',
      coalesce(p.lugar, 'El partido') ||
        case when p.hora is not null then ' · ' || p.hora else '' end ||
        ' — hay tres opciones. Elegí una.',
      '/p/' || p.token
    );
  end if;

  return json_build_object('ok', true);
end;
$$;

/* ------------------------------------------------------------
   4. Votar.

      Identidad igual que `mi_parte`: primero la cuenta, después el
      claim del navegador. Un voto por fila y no se cambia — el
      `on conflict do nothing` es el que lo garantiza, no la UI.

      El `for update` sobre la votación pone en fila a los que votan
      al mismo tiempo: sin eso, dos votos simultáneos podrían ver los
      dos "falta uno" y ninguno cerrar.
   ------------------------------------------------------------ */
create or replace function public.votar_equipos(
  tok      text,
  p_opcion int,
  p_claim  uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p        public.partidos%rowtype;
  v        public.votaciones_equipos%rowtype;
  j        public.jugadores%rowtype;
  filas    int;
  total    int;
  a_favor  int;
  votaron  int;
  cerro    boolean := false;
begin
  select * into p from public.partidos where token = tok;
  if not found then
    return json_build_object('ok', false, 'error', 'Ese link no existe.');
  end if;

  select * into v from public.votaciones_equipos where partido_id = p.id for update;
  if not found or v.cerrada_en is not null then
    return json_build_object('ok', false, 'error', 'La votación ya se cerró.');
  end if;

  if p_opcion is null or p_opcion not between 0 and 2 then
    return json_build_object('ok', false, 'error', 'Esa opción no existe.');
  end if;

  if auth.uid() is not null then
    select * into j from public.jugadores
    where partido_id = p.id and user_id = auth.uid();
  end if;
  if j.id is null and p_claim is not null then
    select * into j from public.jugadores
    where partido_id = p.id and claim = p_claim;
  end if;
  if j.id is null then
    return json_build_object('ok', false, 'error', 'No estás anotado en este partido.');
  end if;

  insert into public.votos_equipos (partido_id, jugador_id, opcion)
  values (p.id, j.id, p_opcion)
  on conflict (partido_id, jugador_id) do nothing;
  get diagnostics filas = row_count;
  if filas = 0 then
    return json_build_object('ok', false, 'error', 'Ya votaste.');
  end if;

  total := public.votantes_de(p.id);
  select count(*) filter (where vo.opcion = p_opcion), count(*)
    into a_favor, votaron
  from public.votos_equipos vo
  join public.jugadores jj on jj.id = vo.jugador_id
  where vo.partido_id = p.id
    and (jj.user_id is not null or jj.claim is not null);

  if a_favor * 2 > total then
    cerro := public.cerrar_votacion(p.id, p_opcion::smallint);
  elsif votaron >= total then
    cerro := public.cerrar_votacion(p.id, public.mas_votada(p.id));
  end if;

  return json_build_object('ok', true, 'cerrada', cerro);
end;
$$;

/* ------------------------------------------------------------
   5. Cerrar antes, o cancelar (anfitrión).
   ------------------------------------------------------------ */
create or replace function public.cerrar_votacion_equipos(p_partido_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.partidos%rowtype;
  g smallint;
begin
  select * into p from public.partidos where id = p_partido_id;
  if not found or p.user_id is distinct from auth.uid() then
    return json_build_object('ok', false, 'error', 'Este partido no es tuyo.');
  end if;

  perform 1 from public.votaciones_equipos
  where partido_id = p.id and cerrada_en is null
  for update;
  if not found then
    return json_build_object('ok', false, 'error', 'No hay votación abierta.');
  end if;

  g := public.mas_votada(p.id);
  if g is null then
    return json_build_object('ok', false, 'error', 'Nadie votó todavía. Si querés, cancelala.');
  end if;

  perform public.cerrar_votacion(p.id, g);
  return json_build_object('ok', true, 'ganadora', g);
end;
$$;

create or replace function public.cancelar_votacion_equipos(p_partido_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.partidos%rowtype;
begin
  select * into p from public.partidos where id = p_partido_id;
  if not found or p.user_id is distinct from auth.uid() then
    return json_build_object('ok', false, 'error', 'Este partido no es tuyo.');
  end if;

  -- Los votos se van en cascada.
  delete from public.votaciones_equipos where partido_id = p.id and cerrada_en is null;
  return json_build_object('ok', true);
end;
$$;

/* ------------------------------------------------------------
   6. Lo que ve el anfitrión.

      Quién falta, y si puede votar o no (la fila cargada a mano sin
      cuenta no puede: hay que engancharla en "Quién es quién"). Nada
      de quién votó qué ni de cuántos votos lleva cada opción.
   ------------------------------------------------------------ */
create or replace function public.votacion_del_partido(p_partido_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p  public.partidos%rowtype;
  v  public.votaciones_equipos%rowtype;
  yo public.jugadores%rowtype;
begin
  select * into p from public.partidos where id = p_partido_id;
  if not found or p.user_id is distinct from auth.uid() then
    return null;
  end if;

  select * into v from public.votaciones_equipos where partido_id = p.id;
  if not found then
    return null;
  end if;

  select * into yo from public.jugadores where partido_id = p.id and user_id = auth.uid();

  return json_build_object(
    'abierta',  v.cerrada_en is null,
    'opciones', v.opciones,
    'ganadora', v.ganadora,
    'total',    public.votantes_de(p.id),
    'votaron',  (
      select count(*) from public.votos_equipos vo
      join public.jugadores j on j.id = vo.jugador_id
      where vo.partido_id = p.id and (j.user_id is not null or j.claim is not null)
    ),
    'puedo_votar', yo.id is not null,
    'mi_voto',  (select opcion from public.votos_equipos where partido_id = p.id and jugador_id = yo.id),
    'faltan', coalesce((
      select json_agg(json_build_object(
               'nombre', j.nombre,
               'puede',  j.user_id is not null or j.claim is not null
             ) order by j.orden, j.creado_en)
      from public.jugadores j
      where j.partido_id = p.id
        and not exists (
          select 1 from public.votos_equipos vo
          where vo.partido_id = p.id and vo.jugador_id = j.id
        )
    ), '[]'::json)
  );
end;
$$;

/* ------------------------------------------------------------
   7. Lo que ve el que entra por el link.

      Va aparte de `ver_partido_por_token` por la misma razón que
      `mi_parte` (0015): depende de quién pregunta, y esa función es
      la puerta de `anon` — no se la reescribe entera para sumarle un
      campo. Las opciones salen limpias con `equipos_publicos`: sin
      los `uid`/`jid` de nadie.
   ------------------------------------------------------------ */
create or replace function public.votacion_por_token(tok text, p_claim uuid default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.partidos%rowtype;
  v public.votaciones_equipos%rowtype;
  j public.jugadores%rowtype;
begin
  select * into p from public.partidos where token = tok;
  if not found then
    return null;
  end if;

  select * into v from public.votaciones_equipos where partido_id = p.id;
  if not found then
    return null;
  end if;

  if auth.uid() is not null then
    select * into j from public.jugadores where partido_id = p.id and user_id = auth.uid();
  end if;
  if j.id is null and p_claim is not null then
    select * into j from public.jugadores where partido_id = p.id and claim = p_claim;
  end if;

  return json_build_object(
    'abierta',  v.cerrada_en is null,
    'opciones', (
      select jsonb_agg(public.equipos_publicos(o) order by i)
      from jsonb_array_elements(v.opciones) with ordinality t(o, i)
    ),
    'ganadora', v.ganadora,
    'total',    public.votantes_de(p.id),
    'votaron',  (
      select count(*) from public.votos_equipos vo
      join public.jugadores jj on jj.id = vo.jugador_id
      where vo.partido_id = p.id and (jj.user_id is not null or jj.claim is not null)
    ),
    'puedo_votar', j.id is not null,
    'mi_voto',  (select opcion from public.votos_equipos where partido_id = p.id and jugador_id = j.id)
  );
end;
$$;

/* ------------------------------------------------------------
   8. Permisos.

      Se le revoca a PUBLIC y no solo a anon: es el agujero que ya
      apareció tres veces en este proyecto (ver 0022).
   ------------------------------------------------------------ */
revoke execute on function public.abrir_votacion_equipos(uuid, jsonb)  from public, anon;
revoke execute on function public.cerrar_votacion_equipos(uuid)        from public, anon;
revoke execute on function public.cancelar_votacion_equipos(uuid)      from public, anon;
revoke execute on function public.votacion_del_partido(uuid)           from public, anon;
grant  execute on function public.abrir_votacion_equipos(uuid, jsonb)  to authenticated;
grant  execute on function public.cerrar_votacion_equipos(uuid)        to authenticated;
grant  execute on function public.cancelar_votacion_equipos(uuid)      to authenticated;
grant  execute on function public.votacion_del_partido(uuid)           to authenticated;

-- Las dos del link: el que vota puede no tener cuenta.
revoke execute on function public.votar_equipos(text, int, uuid)       from public;
revoke execute on function public.votacion_por_token(text, uuid)       from public;
grant  execute on function public.votar_equipos(text, int, uuid)       to anon, authenticated;
grant  execute on function public.votacion_por_token(text, uuid)       to anon, authenticated;
