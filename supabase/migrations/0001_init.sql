-- ============================================================
--  MiMundial — esquema inicial
--  Pegá TODO este archivo en el SQL Editor de Supabase y ejecutá.
-- ============================================================

-- ---------- perfiles ----------
create table if not exists public.perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text,
  avatar_url  text,
  creado_en   timestamptz not null default now()
);

-- se crea solo cuando alguien se registra
create or replace function public.manejar_usuario_nuevo()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.manejar_usuario_nuevo();

-- ---------- partidos ----------
create table if not exists public.partidos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  grupo_id      uuid,                       -- reservado para compartir con un grupo mas adelante
  fecha         date not null default current_date,
  hora          text,
  lugar         text,
  cupo          int  not null default 12 check (cupo between 2 and 40),
  costo         numeric(12,2) not null default 0 check (costo >= 0),
  puso          uuid,                       -- jugador que adelanto la plata
  resultado     text check (resultado in ('ganamos','empate','perdimos')),
  goles_favor   int check (goles_favor >= 0),
  goles_contra  int check (goles_contra >= 0),
  equipos       jsonb,                      -- { a: [...], b: [...], n: int }
  notas         text,
  creado_en     timestamptz not null default now()
);

create index if not exists partidos_user_fecha_idx on public.partidos (user_id, fecha desc);

-- ---------- jugadores ----------
create table if not exists public.jugadores (
  id          uuid primary key default gen_random_uuid(),
  partido_id  uuid not null references public.partidos(id) on delete cascade,
  nombre      text not null,
  invitados   int  not null default 0 check (invitados >= 0 and invitados <= 10),
  pagado      numeric(12,2) not null default 0 check (pagado >= 0),
  orden       int  not null default 0,
  creado_en   timestamptz not null default now()
);

create index if not exists jugadores_partido_idx on public.jugadores (partido_id, orden);
create unique index if not exists jugadores_partido_nombre_idx
  on public.jugadores (partido_id, lower(nombre));

-- el que puso la plata tiene que ser un jugador de ese partido
alter table public.partidos
  drop constraint if exists partidos_puso_fkey;
alter table public.partidos
  add constraint partidos_puso_fkey
  foreign key (puso) references public.jugadores(id) on delete set null;

-- ============================================================
--  RLS — cada uno ve y toca solo lo suyo
-- ============================================================
alter table public.perfiles  enable row level security;
alter table public.partidos  enable row level security;
alter table public.jugadores enable row level security;

-- perfiles
drop policy if exists "perfil propio: leer"     on public.perfiles;
drop policy if exists "perfil propio: escribir" on public.perfiles;
create policy "perfil propio: leer"     on public.perfiles for select using (auth.uid() = id);
create policy "perfil propio: escribir" on public.perfiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- partidos
drop policy if exists "partidos propios: leer"    on public.partidos;
drop policy if exists "partidos propios: crear"   on public.partidos;
drop policy if exists "partidos propios: editar"  on public.partidos;
drop policy if exists "partidos propios: borrar"  on public.partidos;
create policy "partidos propios: leer"   on public.partidos for select using (auth.uid() = user_id);
create policy "partidos propios: crear"  on public.partidos for insert with check (auth.uid() = user_id);
create policy "partidos propios: editar" on public.partidos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "partidos propios: borrar" on public.partidos for delete using (auth.uid() = user_id);

-- jugadores: se permiten si el partido es tuyo
drop policy if exists "jugadores: leer"   on public.jugadores;
drop policy if exists "jugadores: crear"  on public.jugadores;
drop policy if exists "jugadores: editar" on public.jugadores;
drop policy if exists "jugadores: borrar" on public.jugadores;

create policy "jugadores: leer" on public.jugadores for select
  using (exists (select 1 from public.partidos p where p.id = partido_id and p.user_id = auth.uid()));
create policy "jugadores: crear" on public.jugadores for insert
  with check (exists (select 1 from public.partidos p where p.id = partido_id and p.user_id = auth.uid()));
create policy "jugadores: editar" on public.jugadores for update
  using (exists (select 1 from public.partidos p where p.id = partido_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.partidos p where p.id = partido_id and p.user_id = auth.uid()));
create policy "jugadores: borrar" on public.jugadores for delete
  using (exists (select 1 from public.partidos p where p.id = partido_id and p.user_id = auth.uid()));
