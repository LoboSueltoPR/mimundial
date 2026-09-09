-- ============================================================
--  MiMundial 0025 — el aviso le llega a todos, y la lista sabe qué pasó
--
--  Dos cosas que se arrastraban desde que existe la pantalla de
--  partidos, y que resultaron ser la misma: la app sabía muchas cosas
--  del partido que solo le contaba al que lo armó.
--
--  ── 1. Los avisos eran del anfitrión ──────────────────────
--
--  Cuando alguien se anotaba, el push salía únicamente para el dueño
--  del partido. Los otros nueve anotados —los que también están
--  esperando a ver si se junta— no se enteraban de nada hasta que el
--  cupo se completaba de golpe. Justo al revés de cómo se vive: lo que
--  el grupo mira toda la semana es si estamos llegando.
--
--  Ahora el aviso va a todos los que ya están anotados. Con dos
--  cuidados, que son los que evitan que esto se vuelva ruido:
--
--    · al que se acaba de anotar no se le avisa de sí mismo;
--    · al que hizo la acción tampoco. Si el anfitrión cargó a alguien
--      a mano, ya sabe lo que hizo: `se_anoto_solo` es exactamente esa
--      distinción y existe desde 0002.
--
--  El anfitrión sigue recibiendo su propio texto —el suyo dice el
--  nombre y cuántos faltan, porque es el que tiene que salir a buscar
--  gente— y el resto recibe uno más corto. Son dos mensajes distintos
--  y no uno repetido: quien organiza necesita el número, el que juega
--  necesita saber que se está llenando.
--
--  ── 2. La lista no sabía si el partido ya se jugó ──────────
--
--  `mis_partidos_anotado` devolvía cuánta gente hay anotada AHORA y
--  nada más. La pantalla, sin más datos que ese, etiquetaba un partido
--  de hace tres semanas con "Falta gente", como si todavía se pudiera
--  sumar alguien. Y al revés: uno que se jugó con 13 de 14 porque
--  alguien se bajó a último momento seguía figurando como incompleto,
--  aunque el resultado estuviera cargado.
--
--  Se agregan dos campos:
--
--    · `jugado`       — el dueño cerró el partido. Alcanza para no
--                       decir nunca más que pinchó uno que se jugó.
--    · `mi_resultado` — cómo salió PARA VOS, no para el dueño.
--                       `resultado` está escrito desde el lugar del
--                       que armó el partido: para un tercero que jugó
--                       en el otro equipo dice exactamente lo
--                       contrario de lo que pasó. Se da vuelta con el
--                       mismo criterio de `mis_resultados_ajenos`
--                       (0014), y queda en null cuando no se puede
--                       saber de qué lado jugaste — sin sorteo
--                       guardado no hay de dónde deducirlo.
--
--  Nada de esto expone plata: sigue valiendo el criterio de 0005, que
--  la cuenta de un partido ajeno no es asunto tuyo.
-- ============================================================

/* ------------------------------------------------------------
   1. mis_partidos_anotado: qué pasó, no solo cuántos van
   ------------------------------------------------------------ */
create or replace function public.mis_partidos_anotado()
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
    select json_agg(json_build_object(
             'id', p.id,
             'token', p.token,
             'fecha', p.fecha,
             'hora', p.hora,
             'lugar', p.lugar,
             'cupo', p.cupo,
             'abierto', p.abierto,
             'anfitrion', pf.nombre,
             'cabezas', cab.cabezas,
             'faltan', greatest(0, p.cupo - cab.cabezas),
             'mi_invitados', j.invitados,
             'jugado', p.resultado is not null,
             'mi_resultado', case
               when p.resultado is null then null
               when p.resultado = 'empate' then 'empate'
               -- Sin sorteo guardado no se sabe de qué lado jugaste, y
               -- adivinar sería peor que no decir nada.
               when lados.mi_lado is null or p.equipo_ganador is null then null
               when p.equipo_ganador = lados.mi_lado then 'ganamos'
               else 'perdimos'
             end
           ) order by p.fecha desc, p.creado_en desc)
    from public.jugadores j
    join public.partidos p on p.id = j.partido_id
    left join public.perfiles pf on pf.id = p.user_id
    join lateral (
      select coalesce(sum(1 + invitados), 0) as cabezas
      from public.jugadores j2 where j2.partido_id = p.id
    ) cab on true
    join lateral (
      select public.lado_en_equipos(p.equipos, j.user_id) as mi_lado
    ) lados on true
    where j.user_id = auth.uid()
      and p.user_id <> auth.uid()
  ), '[]'::json);
end;
$$;

revoke execute on function public.mis_partidos_anotado() from public;
revoke execute on function public.mis_partidos_anotado() from anon;
grant  execute on function public.mis_partidos_anotado() to authenticated;

/* ------------------------------------------------------------
   2. El trigger: el aviso también para los que ya están anotados
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
  cuantos   int;
  destinos  uuid[];
  claims    uuid[];
  marcado   boolean := false;
begin
  select * into p from public.partidos where id = new.partido_id;
  if not found then
    return new;
  end if;

  select coalesce(sum(1 + invitados), 0), count(*)
    into cabezas, cuantos
  from public.jugadores where partido_id = p.id;

  -- ── al anfitrión ──
  -- Solo cuando alguien SE ANOTA SOLO por el link. Cuando el anfitrión
  -- carga gente a mano desde su pantalla ya sabe lo que hizo: avisarle de
  -- su propio toque seria ruido. `se_anoto_solo` es justo esa distincion
  -- y existe desde 0002.
  if new.se_anoto_solo and new.user_id is distinct from p.user_id then
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

  -- ── al resto de los anotados ──
  -- El que espera que se junte también quiere ver cómo viene. Se manda
  -- siempre que sume alguien, se haya anotado solo o lo haya cargado el
  -- anfitrión: para el que ya está anotado es la misma noticia.
  --
  -- Quedan afuera tres: el recién llegado (no se avisa de sí mismo), el
  -- anfitrión (ya tuvo el suyo, o fue quien cargó la fila) y el aviso de
  -- "está completo", que sale una sola vez más abajo y diría lo mismo
  -- dos veces seguidas.
  if cabezas < p.cupo then
    select coalesce(array_agg(distinct j.user_id) filter (
             where j.user_id is not null
               and j.user_id <> p.user_id
               and j.user_id is distinct from new.user_id
           ), array[]::uuid[]),
           coalesce(array_agg(distinct j.claim) filter (
             where j.claim is not null
               and j.claim is distinct from new.claim
           ), array[]::uuid[])
      into destinos, claims
    from public.jugadores j
    where j.partido_id = p.id;

    if array_length(destinos, 1) > 0 or array_length(claims, 1) > 0 then
      perform public.mandar_push(
        destinos,
        claims,
        'Se sumó ' || new.nombre,
        coalesce(p.lugar, 'El partido') ||
          ' — van ' || cabezas || ' de ' || p.cupo ||
          ' · faltan ' || (p.cupo - cabezas),
        '/p/' || p.token
      );
    end if;
  end if;

  -- ── a todos, una sola vez ──
  if cabezas >= p.cupo and p.aviso_completo_en is null then
    update public.partidos
       set aviso_completo_en = now()
     where id = p.id and aviso_completo_en is null;
    get diagnostics cuantos = row_count;
    marcado := cuantos > 0;
  end if;

  if marcado then
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
        ' — somos ' || cabezas || '. Está confirmado.',
      '/p/' || p.token
    );
  end if;

  return new;
end;
$$;

revoke execute on function public.avisar_anotado() from public;
revoke execute on function public.avisar_anotado() from anon, authenticated;
