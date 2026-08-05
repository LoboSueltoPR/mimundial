-- ============================================================
--  MiMundial 0002 — amigos, link de invitación y anotados sin cuenta
--
--  Regla de oro: el rol `anon` NO toca las tablas. Su unica puerta de
--  entrada son las funciones SECURITY DEFINER del final del archivo,
--  que devuelven solo lo que un invitado necesita ver y dejan escribir
--  unicamente la fila que le pertenece.
-- ============================================================

/* ------------------------------------------------------------
   1. Token del partido (el link para compartir)
   ------------------------------------------------------------ */

-- Alfabeto sin caracteres ambiguos (ni 0/O ni 1/l), asi se puede dictar por telefono.
create or replace function public.nuevo_token()
returns text
language sql
volatile
set search_path = public
as $$
  select string_agg(
           substr('abcdefghijkmnpqrstuvwxyz23456789', (floor(random() * 32)::int) + 1, 1),
           ''
         )
  from generate_series(1, 12);
$$;

alter table public.partidos add column if not exists token text;
alter table public.partidos add column if not exists abierto boolean not null default true;

update public.partidos set token = public.nuevo_token() where token is null;

alter table public.partidos alter column token set default public.nuevo_token();
alter table public.partidos alter column token set not null;

create unique index if not exists partidos_token_idx on public.partidos (token);

/* ------------------------------------------------------------
   2. Anotados sin cuenta
   ------------------------------------------------------------ */

-- claim: capability que se guarda en el localStorage del invitado.
-- Es lo unico que lo autoriza a editar SU fila. Nunca se devuelve en las lecturas.
alter table public.jugadores add column if not exists claim uuid;
alter table public.jugadores add column if not exists se_anoto_solo boolean not null default false;

create index if not exists jugadores_claim_idx on public.jugadores (claim) where claim is not null;

/* ------------------------------------------------------------
   3. Amigos
   ------------------------------------------------------------ */

create table if not exists public.amigos (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  amigo_id  uuid not null references auth.users(id) on delete cascade,
  estado    text not null default 'aceptado' check (estado in ('pendiente', 'aceptado')),
  creado_en timestamptz not null default now(),
  constraint amigos_no_uno_mismo check (user_id <> amigo_id),
  constraint amigos_unicos unique (user_id, amigo_id)
);

create index if not exists amigos_user_idx on public.amigos (user_id);

alter table public.amigos enable row level security;

drop policy if exists "amigos propios: leer"   on public.amigos;
drop policy if exists "amigos propios: crear"  on public.amigos;
drop policy if exists "amigos propios: borrar" on public.amigos;

create policy "amigos propios: leer"   on public.amigos for select using (auth.uid() = user_id);
create policy "amigos propios: crear"  on public.amigos for insert with check (auth.uid() = user_id);
create policy "amigos propios: borrar" on public.amigos for delete using (auth.uid() = user_id);

/* ------------------------------------------------------------
   4. Cerrarle la puerta a `anon`
   ------------------------------------------------------------ */

revoke all on public.partidos  from anon;
revoke all on public.jugadores from anon;
revoke all on public.perfiles  from anon;
revoke all on public.amigos    from anon;

/* ============================================================
   5. La unica superficie publica: RPCs SECURITY DEFINER
   ============================================================ */

-- ---------- ver el partido por token ----------
-- Devuelve SOLO lo que un invitado necesita. Nada de costo, puso,
-- pagado, user_id ni claim.
create or replace function public.ver_partido_por_token(tok text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p        public.partidos%rowtype;
  cabezas  int;
begin
  select * into p from public.partidos where token = tok;
  if not found then
    return null;
  end if;

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
      select json_agg(json_build_object('nombre', j.nombre, 'invitados', j.invitados)
                      order by j.orden, j.creado_en)
      from public.jugadores j where j.partido_id = p.id
    ), '[]'::json)
  );
end;
$$;

-- ---------- anotarse ----------
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

  -- freno para que un link filtrado no llene la tabla
  select count(*) into cuantos from public.jugadores where partido_id = p.id;
  if cuantos >= 60 then
    return json_build_object('ok', false, 'error', 'Este partido ya tiene demasiada gente anotada.');
  end if;

  -- una sola fila por navegador
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

  insert into public.jugadores (partido_id, nombre, invitados, claim, se_anoto_solo, orden)
  values (p.id, limpio, inv, p_claim, true, cuantos);

  return json_build_object('ok', true);
end;
$$;

-- ---------- editar lo tuyo ----------
-- El claim es lo UNICO que autoriza. Si no coincide, no pasa nada.
create or replace function public.actualizar_anotado(
  p_claim     uuid,
  p_nombre    text,
  p_invitados int
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
  if p_claim is null then
    return json_build_object('ok', false, 'error', 'Falta el identificador.');
  end if;

  select * into j from public.jugadores where claim = p_claim;
  if not found then
    return json_build_object('ok', false, 'error', 'No encontramos tu anotación.');
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

  -- cabezas de los demas, para no pasarse del cupo
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

-- ---------- bajarse ----------
create or replace function public.borrarse(p_claim uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  borradas int;
begin
  if p_claim is null then
    return json_build_object('ok', false, 'error', 'Falta el identificador.');
  end if;
  delete from public.jugadores where claim = p_claim;
  get diagnostics borradas = row_count;
  return json_build_object('ok', borradas > 0);
end;
$$;

/* ------------------------------------------------------------
   6. Amigos: buscar y sugerir (solo para usuarios logueados)
   ------------------------------------------------------------ */

-- Match exacto por mail: no expone el padrón de usuarios.
create or replace function public.buscar_usuario(p_email text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  u_id     uuid;
  u_nombre text;
begin
  if auth.uid() is null then
    return null;
  end if;

  select id into u_id from auth.users where lower(email) = lower(btrim(p_email));
  if u_id is null or u_id = auth.uid() then
    return null;
  end if;

  select nombre into u_nombre from public.perfiles where id = u_id;
  return json_build_object('id', u_id, 'nombre', coalesce(u_nombre, split_part(p_email, '@', 1)));
end;
$$;

-- Amigos de mis amigos que todavia no son mis amigos.
create or replace function public.sugerencias_amigos()
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
    select json_agg(x order by x->>'nombre')
    from (
      select distinct on (a2.amigo_id)
        json_build_object(
          'id', a2.amigo_id,
          'nombre', coalesce(pf.nombre, 'Alguien'),
          'via', coalesce(pv.nombre, 'un amigo')
        ) as x
      from public.amigos a1
      join public.amigos a2 on a2.user_id = a1.amigo_id
      left join public.perfiles pf on pf.id = a2.amigo_id
      left join public.perfiles pv on pv.id = a1.amigo_id
      where a1.user_id = auth.uid()
        and a2.amigo_id <> auth.uid()
        and not exists (
          select 1 from public.amigos ya
          where ya.user_id = auth.uid() and ya.amigo_id = a2.amigo_id
        )
    ) s
  ), '[]'::json);
end;
$$;

-- Nombres de mis amigos, para precargar al crear un partido.
create or replace function public.mis_amigos()
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
    select json_agg(json_build_object('id', a.amigo_id, 'nombre', coalesce(p.nombre, 'Alguien'))
                    order by p.nombre)
    from public.amigos a
    left join public.perfiles p on p.id = a.amigo_id
    where a.user_id = auth.uid()
  ), '[]'::json);
end;
$$;

/* ------------------------------------------------------------
   7. Permisos: quien puede ejecutar que
   ------------------------------------------------------------ */

-- Publicas (el invitado sin cuenta)
grant execute on function public.ver_partido_por_token(text) to anon, authenticated;
grant execute on function public.anotarse(text, text, int, uuid) to anon, authenticated;
grant execute on function public.actualizar_anotado(uuid, text, int) to anon, authenticated;
grant execute on function public.borrarse(uuid) to anon, authenticated;

-- Solo logueados
revoke execute on function public.buscar_usuario(text) from anon;
revoke execute on function public.sugerencias_amigos() from anon;
revoke execute on function public.mis_amigos() from anon;
grant execute on function public.buscar_usuario(text) to authenticated;
grant execute on function public.sugerencias_amigos() to authenticated;
grant execute on function public.mis_amigos() to authenticated;

-- nuevo_token es el default de partidos.token: lo necesita quien crea un
-- partido (authenticated). Solo anon no debe poder invocarla directo.
revoke execute on function public.nuevo_token() from anon;
grant execute on function public.nuevo_token() to authenticated;
