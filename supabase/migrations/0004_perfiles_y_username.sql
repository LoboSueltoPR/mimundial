-- ============================================================
--  MiMundial 0004 — perfiles con username, posición y pierna,
--  buscar amigos por username, agregar amigo desde el partido
--  al que te invitaron, y ver en qué instancia está cada amigo.
-- ============================================================

/* ------------------------------------------------------------
   1. Perfiles: username público + datos de jugador
   ------------------------------------------------------------ */

alter table public.perfiles add column if not exists username text;
alter table public.perfiles add column if not exists posicion text
  check (posicion is null or posicion in ('arquero', 'defensor', 'mediocampista', 'delantero'));
alter table public.perfiles add column if not exists pie text
  check (pie is null or pie in ('derecho', 'zurdo', 'ambos'));

create unique index if not exists perfiles_username_idx
  on public.perfiles (lower(username)) where username is not null;

/* ------------------------------------------------------------
   2. Jugadores: qué anotado es un usuario registrado
   ------------------------------------------------------------ */

alter table public.jugadores add column if not exists user_id uuid
  references auth.users(id) on delete set null;

create index if not exists jugadores_user_idx
  on public.jugadores (user_id) where user_id is not null;

/* ------------------------------------------------------------
   3. Elegir/cambiar username
   ------------------------------------------------------------ */

create or replace function public.fijar_username(p_username text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  limpio text;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'Tenés que estar logueado.');
  end if;

  limpio := lower(btrim(coalesce(p_username, '')));

  if limpio !~ '^[a-z0-9_]{3,20}$' then
    return json_build_object('ok', false,
      'error', 'Entre 3 y 20 caracteres: letras, números y guión bajo, sin espacios.');
  end if;

  update public.perfiles set username = limpio where id = auth.uid();

  return json_build_object('ok', true);
exception
  when unique_violation then
    return json_build_object('ok', false, 'error', 'Ese username ya está tomado.');
end;
$$;

/* ------------------------------------------------------------
   4. Buscar gente por username (para sumar de amigo)
   ------------------------------------------------------------ */

create or replace function public.buscar_por_username(p_query text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  q text;
begin
  if auth.uid() is null then
    return '[]'::json;
  end if;

  q := lower(btrim(coalesce(p_query, '')));
  if length(q) < 3 then
    return '[]'::json;
  end if;

  return coalesce((
    select json_agg(json_build_object(
             'id', p.id, 'nombre', p.nombre,
             'username', p.username, 'avatar_url', p.avatar_url
           ) order by p.username)
    from public.perfiles p
    where p.username like q || '%'
      and p.id <> auth.uid()
      and not exists (
        select 1 from public.amigos a
        where a.user_id = auth.uid() and a.amigo_id = p.id
      )
    limit 8
  ), '[]'::json);
end;
$$;

/* ------------------------------------------------------------
   5. En qué instancia del camino está cada amigo
   ------------------------------------------------------------ */

-- Devuelve, por cada amigo, sus datos de perfil y sus partidos con
-- resultado (fecha + resultado, nada de plata ni jugadores). El cálculo
-- del camino (triunfos al hilo, instancia actual) se hace en el cliente
-- con la misma lib/camino.ts que usa el dueño para el suyo — así no se
-- duplica esa lógica en SQL.
create or replace function public.camino_de_amigos()
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
             'nombre', p.nombre,
             'username', p.username,
             'avatar_url', p.avatar_url,
             'partidos', coalesce((
               select json_agg(json_build_object(
                        'id', pt.id, 'fecha', pt.fecha, 'lugar', pt.lugar,
                        'creado_en', pt.creado_en, 'resultado', pt.resultado
                      ) order by pt.fecha, pt.creado_en)
               from public.partidos pt
               where pt.user_id = p.id and pt.resultado is not null
             ), '[]'::json)
           ) order by p.nombre)
    from public.amigos am
    join public.perfiles p on p.id = am.amigo_id
    where am.user_id = auth.uid()
  ), '[]'::json);
end;
$$;

/* ------------------------------------------------------------
   6. anotarse: guardar el user_id si quien se anota está logueado
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
   7. ver_partido_por_token: sumar username/avatar solo si hay sesión
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
begin
  select * into p from public.partidos where token = tok;
  if not found then
    return null;
  end if;

  logueado := auth.uid() is not null;

  select coalesce(sum(1 + invitados), 0) into cabezas
  from public.jugadores where partido_id = p.id;

  return json_build_object(
    'fecha',    p.fecha,
    'hora',     p.hora,
    'lugar',    p.lugar,
    'cupo',     p.cupo,
    'abierto',  p.abierto,
    'cabezas',  cabezas,
    'faltan',   greatest(0, p.cupo - cabezas),
    'anfitrion', (select nombre from public.perfiles where id = p.user_id),
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
   8. Permisos
   ------------------------------------------------------------ */

grant execute on function public.fijar_username(text) to authenticated;
revoke execute on function public.fijar_username(text) from anon;

grant execute on function public.buscar_por_username(text) to authenticated;
revoke execute on function public.buscar_por_username(text) from anon;

grant execute on function public.camino_de_amigos() to authenticated;
revoke execute on function public.camino_de_amigos() from anon;
