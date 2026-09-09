-- ============================================================
--  0024 — EL CAPITÁN RIVAL SALE DEL LINK
--
--  Hasta acá, para que un desafío tuviera rival hacía falta que la
--  otra persona fuera amiga tuya y lo tomara del tablero de Partidos.
--  Eso no sirve para el caso más común: le mandás el link al otro
--  equipo por WhatsApp y el primero que entra se hace cargo.
--
--  No hay token nuevo: es el mismo `token_b` de la 0023. Cambia lo que
--  ese link hace según si el lado ya tiene capitán o no:
--
--    · sin capitán  → el primero que entre logueado se la puede quedar
--    · con capitán  → es el link del equipo, para que sumen gente
--
--  **La amistad deja de hacer falta por esta puerta, a propósito.** El
--  link es una capacidad al portador: si lo tenés es porque alguien te
--  lo mandó, exactamente el mismo modelo que la invitación de siempre
--  (ver la decisión del `claim` en la 0004). El filtro de amigos sigue
--  vivo donde tiene sentido: el TABLERO de "buscan rival" es
--  descubrimiento, y ahí sí es entre amigos para no exponer el padrón.
-- ============================================================

-- ============================================================
--  1. `desafios_para_mi` — el que ya es rival lo ve aunque no sean amigos
--
--  Sin esto, un capitán que llegó por link y no es amigo del anfitrión
--  arma su equipo una vez y nunca más lo encuentra: la lista lo filtra
--  por amistad y el desafío le desaparece. Es el mismo agujero de
--  "podés armar tu equipo una sola vez" que ya se tapó en la 0021,
--  reaparecido por otro lado.
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
    p.id, p.token, p.fecha, p.hora, p.lugar, p.cupo,
    pf.nombre, p.user_id, pf.avatar_url, p.nombre_a,
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
      /* Ya soy el rival. La amistad acá no pinta nada: puedo haber
         llegado por el link. Si no lo viera, no tendría cómo volver a
         entrar a armar mi equipo. */
      (p.rival_acepto_en is not null and p.rival_id = auth.uid())
      or
      /* Todavía se puede tomar. Esto SÍ es descubrimiento — que un
         desafío abierto le aparezca a alguien es exponerle que existe,
         así que va solo entre amigos. */
      (
        p.rival_acepto_en is null
        and (p.rival_id is null or p.rival_id = auth.uid())
        and exists (
          select 1 from public.amigos a
          where a.user_id = auth.uid() and a.amigo_id = p.user_id
        )
      )
    )
  order by p.fecha, p.hora nulls last;
$$;

revoke execute on function public.desafios_para_mi() from public, anon;
grant  execute on function public.desafios_para_mi() to authenticated;

-- ============================================================
--  2. Quedarse con la capitanía desde el link
-- ============================================================
create or replace function public.tomar_capitania(tok text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p        public.partidos%rowtype;
  v_nombre text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Entrá con tu cuenta para ser capitán.');
  end if;

  -- Solo por el link del lado rival: el `token` principal es el del
  -- anfitrión y ese lado ya tiene dueño por definición.
  select * into p from public.partidos where token_b = tok and es_desafio;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese link no existe.');
  end if;
  if not p.abierto then
    return jsonb_build_object('ok', false, 'error', 'El desafío está cerrado.');
  end if;
  if p.resultado is not null then
    return jsonb_build_object('ok', false, 'error', 'Ese partido ya se jugó.');
  end if;
  if p.user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'Es tu propio desafío: ya sos capitán del otro equipo.');
  end if;
  /* Ojo con el orden de estos dos: `rival_id = auth.uid()` no alcanza
     para decir "ya sos capitán". Si el desafío TE fue dirigido pero
     todavía no lo aceptaste, `rival_acepto_en` está en null y hay que
     seguir de largo para aceptarlo de verdad. Devolver ok acá dejaba
     la capitanía a medias — sin aceptación y sin fila en `jugadores` —
     y desde afuera se veía idéntico a haber funcionado. */
  if p.rival_id = auth.uid() and p.rival_acepto_en is not null then
    return jsonb_build_object('ok', true, 'ya_eras', true, 'partido_id', p.id);
  end if;
  -- Reservado para otro: o ya lo tomaron, o está dirigido a alguien más.
  if p.rival_id is not null and p.rival_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'error',
      case when p.rival_acepto_en is not null
           then 'Este equipo ya tiene capitán.'
           else 'Este desafío está dirigido a otra persona.' end);
  end if;

  select nombre into v_nombre from public.perfiles where id = auth.uid();
  v_nombre := nullif(btrim(coalesce(v_nombre, '')), '');
  if v_nombre is null then
    return jsonb_build_object('ok', false, 'error', 'Cargá tu nombre en el perfil.');
  end if;

  if exists (
    select 1 from public.jugadores
    where partido_id = p.id and user_id = auth.uid() and lado = 'a'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ya estás jugando en el otro equipo.');
  end if;

  update public.partidos
  set rival_id = auth.uid(), rival_acepto_en = now()
  where id = p.id;

  /* Puede que ya se haya anotado por el link antes de loguearse: esa
     fila tiene `claim` pero no `user_id`, y volver a insertarla
     chocaría contra el único (partido_id, lower(nombre)). Mismo patrón
     que `reclamar_anotacion`: primero buscar la propia, después crear. */
  if exists (
    select 1 from public.jugadores where partido_id = p.id and user_id = auth.uid()
  ) then
    update public.jugadores set lado = 'b'
    where partido_id = p.id and user_id = auth.uid();
  else
    insert into public.jugadores (partido_id, nombre, orden, user_id, lado)
    select p.id, v_nombre, coalesce(max(orden), -1) + 1, auth.uid(), 'b'
    from public.jugadores where partido_id = p.id;
  end if;

  perform public.rearmar_equipos_desafio(p.id);
  return jsonb_build_object('ok', true, 'partido_id', p.id);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error',
      'Ya hay alguien anotado con tu nombre. Anotate por el link y después reclamá esa fila.');
end;
$$;

revoke execute on function public.tomar_capitania(text) from public, anon;
grant  execute on function public.tomar_capitania(text) to authenticated;

-- ============================================================
--  3. `ver_partido_por_token` — suma `busca_capitan`
--
--  Regenerada desde la definición viva de la base (pg_get_functiondef)
--  con un reemplazo exacto, igual que en la 0023. El ACL se rehace
--  abajo porque `create or replace` lo resetea a los defaults de
--  Supabase — es la tercera vez en el día que se reemplaza esta
--  función y las tres veces hubo que volver a acomodarlo.
-- ============================================================

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
    /* Si este lado todavia no tiene capitan, el primero que abra el
       link estando logueado se la puede quedar.

       Es `rival_id is null` y NO `rival_acepto_en is null`: si el
       desafio se le mando a alguien puntual, esta reservado para esa
       persona y un tercero con el link no se lo puede robar antes de
       que conteste. "El primero que entra" vale solo para el desafio
       abierto, que es el caso del que hablamos. */
    'busca_capitan', v_lado = 'b' and p.rival_id is null and p.abierto,
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

-- ver_partido_por_token es anon-facing A PROPÓSITO: es la puerta del
-- que abre el link sin cuenta. Acá NO va el revoke a anon de la 0022.
revoke execute on function public.ver_partido_por_token(text) from public;
grant  execute on function public.ver_partido_por_token(text) to anon, authenticated;
