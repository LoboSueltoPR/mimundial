-- ============================================================
--  0023 — DOS LINKS POR DESAFÍO, uno por equipo
--
--  Hasta acá un partido tenía un solo `token` y un solo link. En un
--  desafío eso no alcanza: cada capitán tiene que poder mandarle el
--  link a SU gente, y el que lo abre tiene que caer en el equipo
--  correcto sin elegir nada.
--
--  Peor todavía, con un solo link el desafío estaba roto: `anotarse`
--  inserta sin `lado`, así que cualquiera que entrara por el link de
--  un desafío quedaba anotado en NINGUNO de los dos equipos — ni le
--  contaba el partido ni aparecía en el sorteo.
--
--  Decisión: `token` pasa a ser el link del lado 'a' (el del que armó
--  el desafío) y se agrega `token_b` para el lado del rival. **El lado
--  sale de qué columna matcheó**, no de un parámetro en la URL: con
--  `?lado=b` cualquiera se cambiaría de equipo.
--
--  Las cinco funciones que resuelven un partido por token pasan a
--  aceptar los dos. Se tocan las cinco a propósito: tocar solo las dos
--  obvias (`ver_partido_por_token` y `anotarse`) dejaría a la gente
--  del lado 'b' sin poder reclamar su fila ni avisar que pagó, que es
--  la misma falla de "arreglaste un lado y dejaste el otro" que este
--  proyecto ya pisó tres veces.
--
--  Los cuerpos de las cinco NO están transcritos a mano: se sacaron de
--  la base con `pg_get_functiondef` y se les aplicó un reemplazo exacto
--  y verificado (si el ancla no aparecía exactamente una vez, la
--  generación cortaba). Los archivos de migración de este repo ya
--  mintieron una vez sobre el estado real (la 0004 quedó a medias y
--  estuvo 12 días rota), así que la fuente es la base.
--
--  Ninguna función se dropea: `create or replace` con la MISMA firma,
--  que es lo que hicieron 0017 y 0020. El desastre documentado fue
--  dropear y recrear cambiando la firma.
-- ============================================================

-- ---------- la columna ----------

alter table public.partidos
  add column if not exists token_b text;

-- Un token por lado, y nunca el mismo: si `token_b` fuera igual a
-- `token`, el `or` de abajo devolvería el lado equivocado.
alter table public.partidos drop constraint if exists partidos_token_b_distinto;
alter table public.partidos
  add constraint partidos_token_b_distinto check (token_b is null or token_b <> token);

-- `token` ya tiene su índice único desde la 0002. Sin este, un
-- `token_b` podría colisionar con otro y el `select into` del `or`
-- agarraría una fila arbitraria — silencioso y sirviendo el partido
-- de otro.
create unique index if not exists partidos_token_b_idx
  on public.partidos (token_b) where token_b is not null;

-- Los desafíos que ya existen (los creados entre el deploy de la 0021
-- y esta migración) no tienen token_b: sin backfill su segundo link no
-- existiría y el rival no tendría cómo invitar.
update public.partidos
set token_b = public.nuevo_token()
where es_desafio and token_b is null;

CREATE OR REPLACE FUNCTION public.ver_partido_por_token(tok text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p          public.partidos%rowtype;
  cabezas    int;
  logueado   boolean;
  mi         public.jugadores%rowtype;
  ca         public.canchas%rowtype;
  lado_dueno text;
  gol_a      int;
  gol_b      int;
  v_lado     text;
begin
  -- Dos links por desafío: el lado sale de QUÉ columna matcheó (ver 0023).
  select * into p from public.partidos where token = tok or token_b = tok;
  if not found then
    return null;
  end if;

  /* De qué lado entra: lo decide QUÉ token abrió la puerta, no un
     parámetro que se pueda editar en la URL. En un picadito no hay
     lados y queda en null, exactamente como siempre. */
  v_lado := case when p.es_desafio
                 then (case when p.token_b = tok then 'b' else 'a' end)
                 else null end;

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
    'es_desafio', coalesce(p.es_desafio, false),
    'lado_link', v_lado,
    'equipo_del_link', case when v_lado = 'a' then p.nombre_a
                            when v_lado = 'b' then p.nombre_b end,
    'equipo_rival',    case when v_lado = 'a' then p.nombre_b
                            when v_lado = 'b' then p.nombre_a end,
    'capitan_del_link', case when v_lado = 'b'
      then (select nombre from public.perfiles where id = p.rival_id)
      else (select nombre from public.perfiles where id = p.user_id) end,
    'cupo_lado', case when v_lado is null then null else greatest(1, p.cupo / 2) end,
    'cabezas_lado', case when v_lado is null then null else (
      select coalesce(sum(1 + j.invitados), 0)::int from public.jugadores j
      where j.partido_id = p.id and j.lado = v_lado) end,
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
    'alias_pago', p.alias_pago,
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
$function$;

CREATE OR REPLACE FUNCTION public.anotarse(tok text, p_nombre text, p_invitados integer, p_claim uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p       public.partidos%rowtype;
  limpio  text;
  inv     int;
  cabezas int;
  cuantos int;
  v_lado  char(1);
  v_cupo  int;
begin
  limpio := btrim(coalesce(p_nombre, ''));
  inv    := least(greatest(coalesce(p_invitados, 0), 0), 5);

  if length(limpio) < 2 then
    return json_build_object('ok', false, 'error', 'Poné tu nombre (mínimo 2 letras).');
  end if;
  if length(limpio) > 40 then
    return json_build_object('ok', false, 'error', 'Ese nombre es muy largo.');
  end if;
  if p_claim is null then
    return json_build_object('ok', false, 'error', 'Falta el identificador del navegador.');
  end if;

  -- Dos links por desafío: el lado sale de QUÉ columna matcheó (ver 0023).
  select * into p from public.partidos where token = tok or token_b = tok;
  if not found then
    return json_build_object('ok', false, 'error', 'Ese link no existe.');
  end if;
  if not p.abierto then
    return json_build_object('ok', false, 'error', 'El anfitrión cerró las anotaciones.');
  end if;

  /* De qué lado entra: lo decide QUÉ token abrió la puerta, no un
     parámetro que se pueda editar en la URL. En un picadito no hay
     lados y queda en null, exactamente como siempre. */
  v_lado := case when p.es_desafio
                 then (case when p.token_b = tok then 'b' else 'a' end)
                 else null end;

  select count(*) into cuantos from public.jugadores where partido_id = p.id;
  if cuantos >= 60 then
    return json_build_object('ok', false, 'error', 'Este partido ya tiene demasiada gente anotada.');
  end if;

  if exists (select 1 from public.jugadores where partido_id = p.id and claim = p_claim) then
    return json_build_object('ok', false, 'error', 'Ya estás anotado en este partido.');
  end if;

  if auth.uid() is not null and exists (
    select 1 from public.jugadores where partido_id = p.id and user_id = auth.uid()
  ) then
    return json_build_object('ok', false, 'error', 'Ya estás anotado en este partido.');
  end if;

  if exists (select 1 from public.jugadores
             where partido_id = p.id and lower(nombre) = lower(limpio)) then
    return json_build_object('ok', false, 'error', 'Ya hay alguien anotado con ese nombre.');
  end if;

  /* En un desafío el cupo es POR LADO. Medido contra el total, los
     cinco que entran por el link de un equipo se comerían el lugar
     del otro y el segundo link rechazaría a todos con "no hay
     lugar" — que es el modo de falla más probable el primer fin de
     semana que esto se use. */
  if v_lado is null then
    select coalesce(sum(1 + invitados), 0) into cabezas
    from public.jugadores where partido_id = p.id;
    v_cupo := p.cupo;
  else
    select coalesce(sum(1 + invitados), 0) into cabezas
    from public.jugadores where partido_id = p.id and lado = v_lado;
    v_cupo := greatest(1, p.cupo / 2);
  end if;

  if cabezas + 1 + inv > v_cupo then
    return json_build_object('ok', false,
      'error', 'No entran: quedan ' || greatest(0, v_cupo - cabezas) || ' lugares.');
  end if;

  insert into public.jugadores (partido_id, nombre, invitados, claim, se_anoto_solo, orden, user_id, lado)
  values (p.id, limpio, inv, p_claim, true, cuantos, auth.uid(), v_lado);

  -- `equipos` se reconstruye desde las filas, nunca se escribe a mano.
  -- Corre como el dueño de la función, así que el revoke de la 0022 no estorba.
  if p.es_desafio then
    perform public.rearmar_equipos_desafio(p.id);
  end if;

  return json_build_object('ok', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.mi_parte(tok text, p_claim uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p          public.partidos%rowtype;
  j          public.jugadores%rowtype;
  cabezas    int;
  por_cabeza numeric;
  debe       numeric;
  pago       numeric;
begin
  -- Dos links por desafío: el lado sale de QUÉ columna matcheó (ver 0023).
  select * into p from public.partidos where token = tok or token_b = tok;
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
    'adelante',  coalesce(p.puso = j.id, false),
    'aviso_pago_en', j.aviso_pago_en
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.reclamar_anotacion(tok text, p_jugador_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p public.partidos%rowtype;
  j public.jugadores%rowtype;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'Entrá con tu cuenta primero.');
  end if;

  -- Dos links por desafío: el lado sale de QUÉ columna matcheó (ver 0023).
  select * into p from public.partidos where token = tok or token_b = tok;
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
$function$;

CREATE OR REPLACE FUNCTION public.avisar_que_pague(tok text, p_claim uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p          public.partidos%rowtype;
  j          public.jugadores%rowtype;
  cabezas    int;
  debe       numeric;
  anfitrion  text;
begin
  -- Dos links por desafío: el lado sale de QUÉ columna matcheó (ver 0023).
  select * into p from public.partidos where token = tok or token_b = tok;
  if not found then
    return json_build_object('ok', false, 'error', 'Ese link no existe.');
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

  -- Ya avisó: no se vuelve a molestar al organizador.
  if j.aviso_pago_en is not null then
    return json_build_object('ok', true, 'repetido', true);
  end if;

  update public.jugadores set aviso_pago_en = now() where id = j.id;

  select coalesce(sum(1 + invitados), 0) into cabezas
  from public.jugadores where partido_id = p.id;
  debe := case when cabezas > 0
               then round((p.costo / cabezas) * (1 + coalesce(j.invitados, 0)))
               else 0 end;

  perform public.mandar_push(
    array[p.user_id],
    array[]::uuid[],
    j.nombre || ' dice que te transfirió',
    '$' || debe::bigint || ' · ' || coalesce(p.lugar, 'el partido') ||
      '. Entrá y confirmá si te llegó.',
    '/partidos/' || p.id
  );

  return json_build_object('ok', true);
end;
$function$;

-- ============================================================
--  Que todo desafío nazca con su segundo link
--
--  Un default en la columna no sirve: se lo pondría también a los
--  picaditos, y ahí `token_b` sería un segundo link fantasma que
--  resuelve al mismo partido. El trigger lo pone solo cuando hace
--  falta, sin que el cliente tenga que saber nada.
-- ============================================================
create or replace function public.token_b_de_desafio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.es_desafio and new.token_b is null then
    new.token_b := public.nuevo_token();
  end if;
  return new;
end;
$$;

revoke execute on function public.token_b_de_desafio() from public, anon, authenticated;

drop trigger if exists partidos_token_b on public.partidos;
create trigger partidos_token_b
  before insert or update of es_desafio on public.partidos
  for each row execute function public.token_b_de_desafio();

-- ============================================================
--  ACL — se rehace porque `create or replace` lo resetea a los
--  defaults de Supabase (que otorgan a anon, authenticated y
--  service_role). Ver la 0022: revocarle a PUBLIC no le saca nada a
--  `anon`, hay que nombrarlo.
--
--  OJO: estas cinco son anon-facing A PROPÓSITO — son la puerta del
--  que entra por el link sin cuenta. Acá NO va la regla de la 0022 de
--  revocarle a anon; se respeta lo que cada una tenía:
--
--    ver_partido_por_token  anon + authenticated   (0002)
--    anotarse               anon + authenticated   (0002)
--    mi_parte               anon                   (0015/0020: solo public)
--    avisar_que_pague       anon                   (0020: solo public)
--    reclamar_anotacion     SOLO authenticated     (0014: revoca anon)
-- ============================================================

revoke execute on function public.ver_partido_por_token(text) from public;
grant  execute on function public.ver_partido_por_token(text) to anon, authenticated;

revoke execute on function public.anotarse(text, text, int, uuid) from public;
grant  execute on function public.anotarse(text, text, int, uuid) to anon, authenticated;

revoke execute on function public.mi_parte(text, uuid) from public;
grant  execute on function public.mi_parte(text, uuid) to anon, authenticated;

revoke execute on function public.avisar_que_pague(text, uuid) from public;
grant  execute on function public.avisar_que_pague(text, uuid) to anon, authenticated;

-- Esta sí es de logueados: reclamar una fila es decir "ese soy yo".
revoke execute on function public.reclamar_anotacion(text, uuid) from public, anon;
grant  execute on function public.reclamar_anotacion(text, uuid) to authenticated;

-- ============================================================
--  `mi_desafio` devuelve el link del lado propio
--
--  Cada capitán comparte el suyo: el anfitrión el `token` de siempre,
--  el rival el `token_b`. Mandar el que no es le llenaría el equipo
--  de enfrente, que es un error silencioso y molesto de deshacer.
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
    -- El link que le toca compartir a QUIEN pregunta.
    'mi_token', case when v_lado = 'a' then v_p.token else v_p.token_b end,
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

revoke execute on function public.mi_desafio(uuid) from public, anon;
grant  execute on function public.mi_desafio(uuid) to authenticated;
