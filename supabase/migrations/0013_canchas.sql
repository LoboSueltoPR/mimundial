-- ============================================================
--  MiMundial 0013 — el catálogo de canchas.
--
--  Hasta ahora `partidos.lugar` era texto libre, así que "ITLP",
--  "itlp" y "el itlp" eran tres lugares distintos y cualquier stat
--  por cancha era ruido. Ahora hay un catálogo con coordenadas.
--
--  El catálogo es NUESTRO, no del usuario: se carga por migración y
--  la app es de solo lectura. Por eso `canchas` tiene policy de
--  select y ninguna de insert/update/delete — desde el cliente no se
--  puede escribir ni con la sesión de un logueado. Para cargar una
--  cancha nueva: otra migración, o el SQL Editor.
--
--  `partidos.lugar` NO se deprecia. Cuando elegís una cancha se le
--  copia el nombre, y sigue siendo el campo que leen las ~8 RPCs que
--  embeben 'lugar' (0002, 0004, 0005, 0008, 0011, 0012). Así esto es
--  puramente aditivo: historial, lista de partidos y el texto de
--  WhatsApp no se tocan. Y si jugás en un lugar que no está en el
--  catálogo, escribís texto libre como siempre.
-- ============================================================

create table if not exists public.canchas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  direccion  text,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  notas      text,                  -- "portón azul, timbre 2"
  activa     boolean not null default true,
  creado_en  timestamptz not null default now()
);

-- El seed se aplica por nombre, así re-correr la migración no duplica.
create unique index if not exists canchas_nombre_idx on public.canchas (nombre);

alter table public.partidos
  add column if not exists cancha_id uuid references public.canchas(id) on delete set null;

create index if not exists partidos_cancha_idx on public.partidos (cancha_id);

/* ------------------------------------------------------------
   RLS: cualquiera logueado LEE las canchas activas. Nadie
   escribe. No hay policy de insert/update/delete a propósito —
   con RLS activo y sin policy, la operación se niega.
   ------------------------------------------------------------ */

alter table public.canchas enable row level security;

drop policy if exists "canchas: leer" on public.canchas;
create policy "canchas: leer" on public.canchas for select
  using (activa and auth.uid() is not null);

revoke all on public.canchas from anon;
revoke all on public.canchas from public;
grant select on public.canchas to authenticated;

/* ------------------------------------------------------------
   El seed: relevamiento propio de los sintéticos de Bahía Blanca
   (My Maps "Sinteticos Bahia", exportado a KML).

   Dos nombres quedaron como venían del relevamiento y son
   genéricos ("Cancha", "Futbol Club"): en el selector no dicen
   nada, hay que renombrarlos cuando sepamos cómo se llaman.
   ------------------------------------------------------------ */

insert into public.canchas (nombre, lat, lng) values
  ('ITLP Sintético',          -38.7266010, -62.2853122),
  ('Sintético Club Libertad', -38.7524781, -62.2650653),
  ('Sintético Villa Mitre',   -38.7399931, -62.2524940),
  ('Mundial FC',              -38.7215709, -62.2843832),
  ('La Cantera',              -38.6889190, -62.2742890),
  ('Futbol Club',             -38.6827059, -62.2234736),
  ('Cancha',                  -38.7185707, -62.2899589),
  ('Sintético MyM',           -38.8692704, -62.0844479)
on conflict (nombre) do nothing;

/* ------------------------------------------------------------
   ver_partido_por_token: sumar las coordenadas de la cancha para
   que el invitado sin cuenta tenga "Cómo llegar".

   Es la función más sensible de la app — la única que `anon` llama
   de verdad. Y `create or replace` RESETEA el ACL a los defaults de
   Supabase (grant a PUBLIC y a anon), aunque ya tuviera sus revokes
   de una migración anterior. Los revokes van repetidos al final,
   sí o sí. Ver el revoke de 0006 y el agujero que reapareció el
   12/8 en fijar_username/buscar_por_username/camino_de_amigos.

   Ojo: acá anon SÍ tiene que poder ejecutarla. Lo que se saca es
   PUBLIC, y se otorga a dedo a anon y authenticated.

   Se agregan lat/lng/notas y NADA más. Sigue sin exponer costo,
   puso, pagado ni el claim de los anotados.
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

-- Los revokes, repetidos porque el create or replace de arriba los borró.
revoke execute on function public.ver_partido_por_token(text) from public;
grant  execute on function public.ver_partido_por_token(text) to anon, authenticated;
