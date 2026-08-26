-- ============================================================
--  MiMundial 0017 — al completarse se sortea solo, y el resultado
--  se ve desde el link
--
--  Tres cosas:
--
--  1. Cuando el partido llega al cupo, los equipos se sortean solos
--     y el aviso de "se juega" ya lo dice. Antes había que entrar a
--     la app y tocar "Sortear".
--
--  2. El sorteo tiene que producir EXACTAMENTE la misma forma que
--     `sortear()` de lib/calculos.ts, con `jid` y `uid` adentro de
--     cada cabeza. No es cosmético: de ese `uid` depende que 0014
--     sepa de qué lado jugó cada uno y le mueva el camino. Un sorteo
--     sin `uid` no le llega a nadie.
--
--  3. El que entra por el link puede ver cómo salió: qué equipo ganó
--     y el marcador. `resultado` no sirve para eso — está escrito
--     desde el punto de vista del dueño ("ganamos") y para un tercero
--     no significa nada. Se manda `equipo_ganador` y los goles ya
--     mapeados a claros/oscuros.
-- ============================================================

/* ------------------------------------------------------------
   1. El sorteo, en la base.

      Fisher-Yates de verdad no hace falta: `order by random()` en
      Postgres es un shuffle uniforme y acá la lista tiene 12
      elementos, no un millón. Lo que sí importa es la FORMA:

        jugador  → { label, inv:false, jid, uid }
        invitado → { label:'Invitado de X', inv:true, de, jid }

      El invitado no lleva `uid` — igual que en el TS — porque no es
      una cuenta: es un lugar que ocupa alguien sin nombre propio.

      Con impar, el primer equipo lleva uno más (ceil), igual que
      `sortear()`.
   ------------------------------------------------------------ */
create or replace function public.sortear_equipos_auto(p_partido_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with todas as (
    -- el jugador
    select jsonb_build_object(
             'label', j.nombre,
             'inv',   false,
             'jid',   j.id,
             'uid',   j.user_id
           ) as c
    from public.jugadores j
    where j.partido_id = p_partido_id

    union all

    -- una entrada por cada invitado que trae
    select jsonb_build_object(
             'label', 'Invitado de ' || j.nombre,
             'inv',   true,
             'de',    j.nombre,
             'jid',   j.id
           )
    from public.jugadores j,
         generate_series(1, j.invitados) g
    where j.partido_id = p_partido_id and coalesce(j.invitados, 0) > 0
  ),
  mezcladas as (
    -- `order by random()` es un shuffle uniforme; con 12 cabezas no
    -- hace falta Fisher-Yates a mano. `count(*) over ()` da el total
    -- en la misma pasada, sin tabla temporal ni segunda consulta.
    select c,
           row_number() over (order by random()) as r,
           count(*)     over ()                  as n,
           -- la mitad se calcula acá y no en el filter de abajo: una
           -- funcion de ventana no se puede usar adentro de un FILTER,
           -- pero una columna comun si.
           ceil(count(*) over () / 2.0)          as mitad
    from todas
  )
  select case when max(n) < 2 then null else jsonb_build_object(
           'a', coalesce(jsonb_agg(c order by r) filter (where r <= mitad), '[]'::jsonb),
           'b', coalesce(jsonb_agg(c order by r) filter (where r >  mitad), '[]'::jsonb),
           'n', max(n)
         ) end
  from mezcladas;
$$;

revoke execute on function public.sortear_equipos_auto(uuid) from public;
revoke execute on function public.sortear_equipos_auto(uuid) from anon, authenticated;

/* ------------------------------------------------------------
   2. El trigger, otra vez, ahora con el sorteo adentro.

      Cambios respecto de 0016:

      · Al completarse, si NO hay equipos todavía, se sortean. Si ya
        hay, no se tocan: el anfitrión pudo haberlos acomodado a mano
        y pisarle eso sería peor que no sortear.
      · Ahora también dispara con UPDATE de `invitados`. El partido
        se puede completar porque alguien suma un invitado, que es un
        update y no un insert — sin esto, ese caso no avisaba ni
        sorteaba nunca.
   ------------------------------------------------------------ */
create or replace function public.avisar_anotado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p         public.partidos%rowtype;
  cabezas   int;
  filas     int;
  destinos  uuid[];
  claims    uuid[];
  marcado   boolean := false;
  eq        jsonb;
  sorteados boolean := false;
begin
  select * into p from public.partidos where id = new.partido_id;
  if not found then
    return new;
  end if;

  select coalesce(sum(1 + invitados), 0) into cabezas
  from public.jugadores where partido_id = p.id;

  -- ── al anfitrión ──
  -- Solo cuando alguien SE ANOTA SOLO por el link, y solo al insertar.
  -- Cuando el anfitrión carga gente a mano ya sabe lo que hizo, y un
  -- update de invitados no es "se anotó alguien".
  if tg_op = 'INSERT' and new.se_anoto_solo and new.user_id is distinct from p.user_id then
    perform public.mandar_push(
      array[p.user_id],
      array[]::uuid[],
      'Se anotó ' || new.nombre,
      case
        when cabezas >= p.cupo then 'Ya son ' || cabezas || '. Está completo.'
        else 'Van ' || cabezas || ' de ' || p.cupo || ' · faltan ' || (p.cupo - cabezas)
      end,
      '/partidos/' || p.id
    );
  end if;

  -- ── a todos, una sola vez ──
  if cabezas >= p.cupo and p.aviso_completo_en is null then
    update public.partidos
       set aviso_completo_en = now()
     where id = p.id and aviso_completo_en is null;
    get diagnostics filas = row_count;
    marcado := filas > 0;
  end if;

  if not marcado then
    return new;
  end if;

  -- Se completó: sortear si no había sorteo hecho.
  if p.equipos is null then
    eq := public.sortear_equipos_auto(p.id);
    if eq is not null then
      update public.partidos set equipos = eq where id = p.id;
      sorteados := true;
    end if;
  end if;

  select coalesce(array_agg(distinct j.user_id) filter (where j.user_id is not null), array[]::uuid[]),
         coalesce(array_agg(distinct j.claim)   filter (where j.claim   is not null), array[]::uuid[])
    into destinos, claims
  from public.jugadores j where j.partido_id = p.id;

  -- el anfitrión entra aunque no esté anotado como jugador
  destinos := destinos || p.user_id;

  perform public.mandar_push(
    destinos,
    claims,
    'Se juega',
    coalesce(p.lugar, 'El partido') ||
      case when p.hora is not null then ' · ' || p.hora else '' end ||
      ' — somos ' || cabezas || '.' ||
      case when sorteados then ' Equipos sorteados.' else '' end,
    '/p/' || p.token
  );

  return new;
end;
$$;

drop trigger if exists jugadores_avisar on public.jugadores;
create trigger jugadores_avisar
  after insert or update of invitados on public.jugadores
  for each row execute function public.avisar_anotado();

revoke execute on function public.avisar_anotado() from public;
revoke execute on function public.avisar_anotado() from anon, authenticated;

/* ------------------------------------------------------------
   3. ver_partido_por_token: cómo salió.

      `resultado` crudo no se manda: dice "ganamos" desde el lugar
      del dueño y para un tercero no quiere decir nada. Se manda
      `equipo_ganador` (claros/oscuros), si fue empate, y los goles
      ya dados vuelta a claros/oscuros usando de qué lado jugó el
      dueño (`lado_en_equipos`, de 0014).

      Si no se sabe de qué lado jugó el dueño, los goles no se
      pueden mapear y van en null: se muestra quién ganó y nada más.
      Adivinar el marcador al revés sería peor que no mostrarlo.
   ------------------------------------------------------------ */
create or replace function public.ver_partido_por_token(tok text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p          public.partidos%rowtype;
  cabezas    int;
  logueado   boolean;
  mi         public.jugadores%rowtype;
  ca         public.canchas%rowtype;
  lado_dueno text;
  gol_a      int;
  gol_b      int;
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

  lado_dueno := public.lado_en_equipos(p.equipos, p.user_id);
  if lado_dueno = 'a' then
    gol_a := p.goles_favor;  gol_b := p.goles_contra;
  elsif lado_dueno = 'b' then
    gol_a := p.goles_contra; gol_b := p.goles_favor;
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
    'equipos',    public.equipos_publicos(p.equipos),
    'costo',      p.costo,
    'por_cabeza', case when cabezas > 0 then round(p.costo / cabezas) else 0 end,
    'puso_nombre', (select nombre from public.jugadores where id = p.puso),
    -- cómo salió, para cualquiera que tenga el link
    'jugado',        p.resultado is not null,
    'empate',        p.resultado = 'empate',
    'equipo_ganador', p.equipo_ganador,
    'goles_claros',  gol_a,
    'goles_oscuros', gol_b,
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

-- Los revokes, repetidos porque el create or replace de arriba los borró.
revoke execute on function public.ver_partido_por_token(text) from public;
grant  execute on function public.ver_partido_por_token(text) to anon, authenticated;
