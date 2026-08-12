-- ============================================================
--  MiMundial 0011 — amistad por solicitud, no por agregado unilateral.
--
--  Hasta acá "sumar amigo" era un insert directo en `amigos`: vos
--  agregabas a alguien y ya, sin que esa persona hiciera nada — y si
--  ella nunca te agregaba de vuelta, la relación quedaba asimétrica
--  (vos la ves como amiga, ella a vos no). Ahora hace falta que la
--  otra persona acepte, y al aceptar la amistad queda mutua de una:
--  se insertan las dos filas de `amigos` (user_id,amigo_id) y
--  (amigo_id,user_id) juntas.
--
--  `solicitudes_amistad` no tiene policies de insert/update/delete:
--  toda la lógica pasa por las funciones de abajo, porque aceptar
--  necesita crear una fila de `amigos` para el OTRO usuario, algo que
--  la RLS de "cada uno lo suyo" nunca dejaría hacer desde el lado del
--  que acepta si fuera un insert directo.
-- ============================================================

create table if not exists public.solicitudes_amistad (
  id         uuid primary key default gen_random_uuid(),
  de         uuid not null references auth.users(id) on delete cascade,
  para       uuid not null references auth.users(id) on delete cascade,
  creado_en  timestamptz not null default now(),
  constraint solicitud_no_uno_mismo check (de <> para),
  constraint solicitud_unica unique (de, para)
);

create index if not exists solicitudes_para_idx on public.solicitudes_amistad (para);
create index if not exists solicitudes_de_idx on public.solicitudes_amistad (de);

alter table public.solicitudes_amistad enable row level security;
revoke all on public.solicitudes_amistad from anon, authenticated;

/* ------------------------------------------------------------
   Enviar solicitud. Si la otra persona ya te había mandado una a
   vos, no tiene sentido dejarla esperando: se acepta sola y quedan
   amigos de una.
   ------------------------------------------------------------ */
create or replace function public.enviar_solicitud(p_para uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  recibida uuid;
begin
  if yo is null then
    return json_build_object('ok', false, 'error', 'Tenés que estar logueado.');
  end if;
  if yo = p_para then
    return json_build_object('ok', false, 'error', 'No podés agregarte a vos mismo.');
  end if;
  if exists (select 1 from public.amigos where user_id = yo and amigo_id = p_para) then
    return json_build_object('ok', false, 'error', 'Ya son amigos.');
  end if;
  if exists (select 1 from public.solicitudes_amistad where de = yo and para = p_para) then
    return json_build_object('ok', true, 'estado', 'pendiente');
  end if;

  select id into recibida from public.solicitudes_amistad where de = p_para and para = yo;
  if recibida is not null then
    insert into public.amigos (user_id, amigo_id) values (yo, p_para) on conflict do nothing;
    insert into public.amigos (user_id, amigo_id) values (p_para, yo) on conflict do nothing;
    delete from public.solicitudes_amistad where id = recibida;
    return json_build_object('ok', true, 'estado', 'aceptada');
  end if;

  insert into public.solicitudes_amistad (de, para) values (yo, p_para);
  return json_build_object('ok', true, 'estado', 'pendiente');
end;
$$;

/** Aceptar o rechazar una solicitud recibida. */
create or replace function public.responder_solicitud(p_id uuid, p_aceptar boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  s public.solicitudes_amistad%rowtype;
begin
  select * into s from public.solicitudes_amistad where id = p_id;
  if not found or s.para <> yo then
    return json_build_object('ok', false, 'error', 'No encontramos esa solicitud.');
  end if;

  if p_aceptar then
    insert into public.amigos (user_id, amigo_id) values (s.de, s.para) on conflict do nothing;
    insert into public.amigos (user_id, amigo_id) values (s.para, s.de) on conflict do nothing;
  end if;
  delete from public.solicitudes_amistad where id = p_id;
  return json_build_object('ok', true);
end;
$$;

/** El que la mandó se arrepiente antes de que la respondan. */
create or replace function public.cancelar_solicitud(p_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.solicitudes_amistad where id = p_id and de = auth.uid();
  return json_build_object('ok', true);
end;
$$;

/** Sacar a alguien de amigos borra las DOS filas, no solo la tuya. */
create or replace function public.sacar_amigo(p_amigo_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare yo uuid := auth.uid();
begin
  if yo is null then
    return json_build_object('ok', false, 'error', 'Tenés que estar logueado.');
  end if;
  delete from public.amigos
  where (user_id = yo and amigo_id = p_amigo_id)
     or (user_id = p_amigo_id and amigo_id = yo);
  return json_build_object('ok', true);
end;
$$;

create or replace function public.mis_solicitudes_recibidas()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return '[]'::json; end if;
  return coalesce((
    select json_agg(json_build_object(
             'id', s.id, 'id_usuario', s.de, 'nombre', coalesce(p.nombre, 'Alguien'),
             'avatar_url', p.avatar_url, 'username', p.username, 'creado_en', s.creado_en
           ) order by s.creado_en)
    from public.solicitudes_amistad s
    left join public.perfiles p on p.id = s.de
    where s.para = auth.uid()
  ), '[]'::json);
end;
$$;

create or replace function public.mis_solicitudes_enviadas()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return '[]'::json; end if;
  return coalesce((
    select json_agg(json_build_object(
             'id', s.id, 'id_usuario', s.para, 'nombre', coalesce(p.nombre, 'Alguien'),
             'avatar_url', p.avatar_url, 'username', p.username, 'creado_en', s.creado_en
           ) order by s.creado_en)
    from public.solicitudes_amistad s
    left join public.perfiles p on p.id = s.para
    where s.de = auth.uid()
  ), '[]'::json);
end;
$$;

/* ------------------------------------------------------------
   perfil_publico: además de "comparten un partido", ahora también
   se puede ver el camino de alguien que ya es tu amigo aunque nunca
   hayan compartido un partido (se sumó por mail sin jugar todavía).
   ------------------------------------------------------------ */
create or replace function public.perfil_publico(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  comparten boolean;
  son_amigos boolean;
begin
  if auth.uid() is null or auth.uid() = p_user_id then
    return null;
  end if;

  select exists (
    select 1 from public.amigos where user_id = auth.uid() and amigo_id = p_user_id
  ) into son_amigos;

  if not son_amigos then
    select exists (
      select 1
      from public.partidos mio
      where (mio.user_id = auth.uid()
             or exists (select 1 from public.jugadores j where j.partido_id = mio.id and j.user_id = auth.uid()))
        and (mio.user_id = p_user_id
             or exists (select 1 from public.jugadores j where j.partido_id = mio.id and j.user_id = p_user_id))
    ) into comparten;
    if not comparten then
      return null;
    end if;
  end if;

  return (
    select json_build_object(
      'id', p.id,
      'nombre', p.nombre,
      'username', p.username,
      'avatar_url', p.avatar_url,
      'partidos', coalesce((
        select json_agg(json_build_object(
                 'id', pt.id, 'fecha', pt.fecha, 'lugar', pt.lugar,
                 'creado_en', pt.creado_en, 'resultado', pt.resultado,
                 'cierra_mundial', pt.cierra_mundial
               ) order by pt.fecha, pt.creado_en)
        from public.partidos pt
        where pt.user_id = p.id and pt.resultado is not null
      ), '[]'::json)
    )
    from public.perfiles p
    where p.id = p_user_id
  );
end;
$$;

revoke execute on function public.enviar_solicitud(uuid) from anon;
revoke execute on function public.enviar_solicitud(uuid) from public;
revoke execute on function public.responder_solicitud(uuid, boolean) from anon;
revoke execute on function public.responder_solicitud(uuid, boolean) from public;
revoke execute on function public.cancelar_solicitud(uuid) from anon;
revoke execute on function public.cancelar_solicitud(uuid) from public;
revoke execute on function public.sacar_amigo(uuid) from anon;
revoke execute on function public.sacar_amigo(uuid) from public;
revoke execute on function public.mis_solicitudes_recibidas() from anon;
revoke execute on function public.mis_solicitudes_recibidas() from public;
revoke execute on function public.mis_solicitudes_enviadas() from anon;
revoke execute on function public.mis_solicitudes_enviadas() from public;
revoke execute on function public.perfil_publico(uuid) from anon;
revoke execute on function public.perfil_publico(uuid) from public;

grant execute on function public.enviar_solicitud(uuid) to authenticated;
grant execute on function public.responder_solicitud(uuid, boolean) to authenticated;
grant execute on function public.cancelar_solicitud(uuid) to authenticated;
grant execute on function public.sacar_amigo(uuid) to authenticated;
grant execute on function public.mis_solicitudes_recibidas() to authenticated;
grant execute on function public.mis_solicitudes_enviadas() to authenticated;
grant execute on function public.perfil_publico(uuid) to authenticated;
