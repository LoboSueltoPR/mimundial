-- ============================================================
--  MiMundial 0015 — el invitado ve los equipos y lo que le toca
--
--  Hasta acá el que entraba por el link veía quiénes van y nada más:
--  ni el sorteo ni la plata. Tenía que preguntar las dos cosas por
--  WhatsApp, que es exactamente el ritual que la app vino a sacar.
--
--  Se abre lo mínimo y se deja cerrado el resto:
--
--  · **Equipos**: sí, pero LIMPIOS. `partidos.equipos` es un jsonb
--    crudo y desde 0014 cada cabeza lleva `uid` y `jid` adentro.
--    Devolverlo tal cual le entrega a `anon` los user_id de todos
--    los que jugaron. Se reconstruye dejando solo label/inv/de.
--
--  · **Plata**: total, cuánto sale por cabeza y el NOMBRE del que
--    adelantó. `puso` sigue sin salir: es un id de `jugadores`, un
--    handle a la tabla; el nombre es lo que la persona necesita.
--    Lo que pagó o debe CADA UNO sigue sin exponerse — decisión
--    tomada a mano: la deuda ajena no cuelga de un link al portador.
--
--  · **Lo mío**: va en una función aparte, `mi_parte`, porque es lo
--    único que depende de quién pregunta. `ver_partido_por_token`
--    se deja con su firma intacta: es la única puerta de `anon` y
--    dropearla para agregarle un parámetro deja la invitación
--    muerta si el create de abajo falla por un typo. Ese es el modo
--    de falla de la 0004, no se repite.
-- ============================================================

/* ------------------------------------------------------------
   1. Los equipos, sin los ids de nadie.

      Reconstruye el jsonb con las tres claves que la pantalla
      pública necesita y ninguna más. El jsonb_typeof es por si
      `equipos` viene malformado: sin eso jsonb_array_elements
      revienta la consulta entera.
   ------------------------------------------------------------ */
create or replace function public.lado_publico(p_lado jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
             'label', c->>'label',
             'inv',   coalesce((c->>'inv')::boolean, false),
             'de',    c->>'de'
           ))
    from jsonb_array_elements(
      case when jsonb_typeof(p_lado) = 'array' then p_lado else '[]'::jsonb end
    ) c
  ), '[]'::jsonb);
$$;

create or replace function public.equipos_publicos(p_equipos jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case when p_equipos is null then null else jsonb_build_object(
    'a', public.lado_publico(p_equipos->'a'),
    'b', public.lado_publico(p_equipos->'b'),
    'n', coalesce(p_equipos->'n', '0'::jsonb)
  ) end;
$$;

revoke execute on function public.lado_publico(jsonb) from public;
revoke execute on function public.equipos_publicos(jsonb) from public;
grant  execute on function public.lado_publico(jsonb) to anon, authenticated;
grant  execute on function public.equipos_publicos(jsonb) to anon, authenticated;

/* ------------------------------------------------------------
   2. Lo que me toca a mí, y solo a mí.

      Logueado: se resuelve por auth.uid(). Sin cuenta: por el
      claim del navegador, que es la misma credencial que ya
      autoriza actualizar_anotado y borrarse desde 0002. Se prueba
      auth.uid() primero para que el logueado no dependa de que
      este sea el navegador donde se anotó.

      Si no encontrás fila, devuelve anotado:false y ningún número
      — nunca los de otro.

      El que adelantó la plata tiene su parte cubierta: misma regla
      que `pagadoEfectivo` en calculos.ts, replicada acá porque el
      cliente público no recibe `puso` para poder deducirla.
   ------------------------------------------------------------ */
create or replace function public.mi_parte(tok text, p_claim uuid default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p          public.partidos%rowtype;
  j          public.jugadores%rowtype;
  cabezas    int;
  por_cabeza numeric;
  debe       numeric;
  pago       numeric;
begin
  select * into p from public.partidos where token = tok;
  if not found then
    return json_build_object('anotado', false);
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
    return json_build_object('anotado', false);
  end if;

  select coalesce(sum(1 + invitados), 0) into cabezas
  from public.jugadores where partido_id = p.id;

  por_cabeza := case when cabezas > 0 then p.costo / cabezas else 0 end;
  debe       := round(por_cabeza * (1 + coalesce(j.invitados, 0)));
  pago       := case when p.puso = j.id then debe else greatest(0, coalesce(j.pagado, 0)) end;

  return json_build_object(
    'anotado',   true,
    'nombre',    j.nombre,
    'invitados', j.invitados,
    'debe',      debe,
    'pagado',    pago,
    'saldo',     debe - pago,
    -- coalesce y no `p.puso = j.id` a secas: con puso en null la
    -- comparacion da NULL, y un booleano que a veces viene null es una
    -- trampa para el que lo lea del otro lado.
    'adelante',  coalesce(p.puso = j.id, false)
  );
end;
$$;

revoke execute on function public.mi_parte(text, uuid) from public;
grant  execute on function public.mi_parte(text, uuid) to anon, authenticated;

/* ------------------------------------------------------------
   3. ver_partido_por_token: se le suman equipos y plata de grupo.

      Copiada entera de 0014 (create or replace pisa todo) con
      cuatro campos nuevos: equipos (limpios), costo, por_cabeza y
      puso_nombre. Sigue SIN exponer `puso` (el id), lo que pagó
      cada uno, ni el claim.
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
    'equipos',    public.equipos_publicos(p.equipos),
    'costo',      p.costo,
    'por_cabeza', case when cabezas > 0 then round(p.costo / cabezas) else 0 end,
    'puso_nombre', (select nombre from public.jugadores where id = p.puso),
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
