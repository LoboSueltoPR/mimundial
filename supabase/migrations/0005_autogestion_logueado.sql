-- ============================================================
--  MiMundial 0005 — el logueado se maneja desde su cuenta, no solo
--  desde el link con el navegador que usó para anotarse.
--
--  Hasta acá, "sos vos" en un partido ajeno lo demostraba el `claim`
--  guardado en el localStorage de ESE navegador. Si el logueado entraba
--  desde otro dispositivo (o le borraban los datos del navegador), no
--  había forma de reconocerlo ni de bajarlo: `anotarse` fallaba porque
--  su nombre ya estaba tomado por su propia fila vieja, y no tenía cómo
--  editarla ni borrarla.
--
--  El claim sigue sin devolverse nunca (ver 0002). Para el logueado se
--  agrega un camino paralelo, autorizado por auth.uid() en vez de por
--  claim, que solo toca SU fila.
-- ============================================================

/* ------------------------------------------------------------
   1. ver_partido_por_token: si hay sesión, sumar mi propia
      anotación (si existe) para que el cliente sepa "ya estoy
      anotado" sin depender del localStorage.
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
    'anotados', coalesce((
      select json_agg(json_build_object(
               'nombre', j.nombre,
               'invitados', j.invitados,
               'user_id', case when logueado then j.user_id else null end,
               'username', case when logueado then pf.username else null end,
               'avatar_url', case when logueado then pf.avatar_url else null end
             ) order by j.orden, j.creado_en)
      from public.jugadores j
      left join public.perfiles pf on pf.id = j.user_id
      where j.partido_id = p.id
    ), '[]'::json)
  );
end;
$$;

/* ------------------------------------------------------------
   2. Editar y bajarme de MI anotación, autorizado por auth.uid()
      (nunca por claim: el claim no sale de la fila de invitado sin
      cuenta y no se le entrega al cliente logueado).
   ------------------------------------------------------------ */
create or replace function public.actualizar_mi_anotacion(
  p_partido_id uuid,
  p_nombre     text,
  p_invitados  int
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  j       public.jugadores%rowtype;
  p       public.partidos%rowtype;
  limpio  text;
  inv     int;
  otras   int;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'Tenés que estar logueado.');
  end if;

  select * into j from public.jugadores
  where partido_id = p_partido_id and user_id = auth.uid();
  if not found then
    return json_build_object('ok', false, 'error', 'No estás anotado en ese partido.');
  end if;

  select * into p from public.partidos where id = j.partido_id;
  if not p.abierto then
    return json_build_object('ok', false, 'error', 'El anfitrión cerró las anotaciones.');
  end if;

  limpio := btrim(coalesce(p_nombre, j.nombre));
  inv    := least(greatest(coalesce(p_invitados, j.invitados), 0), 5);

  if length(limpio) < 2 or length(limpio) > 40 then
    return json_build_object('ok', false, 'error', 'Nombre inválido.');
  end if;

  if exists (select 1 from public.jugadores
             where partido_id = j.partido_id and id <> j.id and lower(nombre) = lower(limpio)) then
    return json_build_object('ok', false, 'error', 'Ya hay alguien con ese nombre.');
  end if;

  select coalesce(sum(1 + invitados), 0) into otras
  from public.jugadores where partido_id = j.partido_id and id <> j.id;

  if otras + 1 + inv > p.cupo then
    return json_build_object('ok', false,
      'error', 'No entran tantos: quedan ' || greatest(0, p.cupo - otras - 1) || ' lugares para invitados.');
  end if;

  update public.jugadores
     set nombre = limpio, invitados = inv
   where id = j.id;

  return json_build_object('ok', true);
end;
$$;

create or replace function public.bajarme_de_partido(p_partido_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  borradas int;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'Tenés que estar logueado.');
  end if;

  delete from public.jugadores
  where partido_id = p_partido_id and user_id = auth.uid();
  get diagnostics borradas = row_count;

  return json_build_object('ok', borradas > 0);
end;
$$;

/* ------------------------------------------------------------
   3. Mis partidos como jugador (no como anfitrión: esos ya se ven
      en /partidos vía la tabla partidos con RLS propia). Sin plata:
      mismo criterio que ver_partido_por_token.
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
             'mi_invitados', j.invitados
           ) order by p.fecha desc, p.creado_en desc)
    from public.jugadores j
    join public.partidos p on p.id = j.partido_id
    left join public.perfiles pf on pf.id = p.user_id
    join lateral (
      select coalesce(sum(1 + invitados), 0) as cabezas
      from public.jugadores j2 where j2.partido_id = p.id
    ) cab on true
    where j.user_id = auth.uid()
      and p.user_id <> auth.uid()
  ), '[]'::json);
end;
$$;

/* ------------------------------------------------------------
   4. anotarse: un logueado no puede terminar con dos filas en el
      mismo partido (dos navegadores, dos nombres). Sin este freno,
      mis_partidos_anotado() repetiría el partido y bajarme_de_partido
      borraría las dos de un saque.
   ------------------------------------------------------------ */
create or replace function public.anotarse(
  tok       text,
  p_nombre  text,
  p_invitados int,
  p_claim   uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p       public.partidos%rowtype;
  limpio  text;
  inv     int;
  cabezas int;
  cuantos int;
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

  select * into p from public.partidos where token = tok;
  if not found then
    return json_build_object('ok', false, 'error', 'Ese link no existe.');
  end if;
  if not p.abierto then
    return json_build_object('ok', false, 'error', 'El anfitrión cerró las anotaciones.');
  end if;

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

  select coalesce(sum(1 + invitados), 0) into cabezas
  from public.jugadores where partido_id = p.id;

  if cabezas + 1 + inv > p.cupo then
    return json_build_object('ok', false,
      'error', 'No entran: quedan ' || greatest(0, p.cupo - cabezas) || ' lugares.');
  end if;

  insert into public.jugadores (partido_id, nombre, invitados, claim, se_anoto_solo, orden, user_id)
  values (p.id, limpio, inv, p_claim, true, cuantos, auth.uid());

  return json_build_object('ok', true);
end;
$$;

/* ------------------------------------------------------------
   5. Permisos: solo logueados, nunca anon.
   ------------------------------------------------------------ */
grant execute on function public.actualizar_mi_anotacion(uuid, text, int) to authenticated;
revoke execute on function public.actualizar_mi_anotacion(uuid, text, int) from anon;

grant execute on function public.bajarme_de_partido(uuid) to authenticated;
revoke execute on function public.bajarme_de_partido(uuid) from anon;

grant execute on function public.mis_partidos_anotado() to authenticated;
revoke execute on function public.mis_partidos_anotado() from anon;
