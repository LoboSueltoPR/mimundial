-- ============================================================
--  MiMundial 0012 — apodo (se muestra entre nombre y apellido) y de
--  qué club sos hincha.
--
--  El nombre de cuenta viene de Google tal cual ("Alejo Lobos") y no
--  hay forma de tocarlo — pero se puede mostrar "Alejo 'Lobo' Lobos"
--  si cargás un apodo. La composición se hace en el cliente
--  (lib/nombre.ts), acá solo se guarda y se devuelve el campo.
-- ============================================================

alter table public.perfiles add column if not exists apodo text;
alter table public.perfiles add column if not exists club text;

/* ------------------------------------------------------------
   Todo lo que ya devolvía `nombre` de otro usuario ahora suma
   `apodo` — la composición queda del lado del cliente para no
   duplicar esa lógica en SQL. perfil_publico además suma club,
   posición y pierna: es la única pantalla donde se ve el perfil
   completo de otra persona.
   ------------------------------------------------------------ */

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
    select json_agg(json_build_object(
             'id', a.amigo_id,
             'nombre', coalesce(p.nombre, 'Alguien'),
             'apodo', p.apodo,
             'avatar_url', p.avatar_url,
             'username', p.username
           ) order by p.nombre)
    from public.amigos a
    left join public.perfiles p on p.id = a.amigo_id
    where a.user_id = auth.uid()
  ), '[]'::json);
end;
$$;

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
          'apodo', pf.apodo,
          'avatar_url', pf.avatar_url,
          'username', pf.username,
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

create or replace function public.buscar_usuario(p_email text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  u_id     uuid;
  u_nombre text;
  u_apodo  text;
  u_avatar text;
  u_user   text;
begin
  if auth.uid() is null then
    return null;
  end if;

  select id into u_id from auth.users where lower(email) = lower(btrim(p_email));
  if u_id is null or u_id = auth.uid() then
    return null;
  end if;

  select nombre, apodo, avatar_url, username into u_nombre, u_apodo, u_avatar, u_user
  from public.perfiles where id = u_id;

  return json_build_object(
    'id', u_id,
    'nombre', coalesce(u_nombre, split_part(p_email, '@', 1)),
    'apodo', u_apodo,
    'avatar_url', u_avatar,
    'username', u_user
  );
end;
$$;

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
             'id', p.id, 'nombre', p.nombre, 'apodo', p.apodo,
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
             'apodo', p.apodo,
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
           ) order by p.nombre)
    from public.amigos am
    join public.perfiles p on p.id = am.amigo_id
    where am.user_id = auth.uid()
  ), '[]'::json);
end;
$$;

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
      'apodo', p.apodo,
      'club', p.club,
      'posicion', p.posicion,
      'pie', p.pie,
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

-- create or replace resetea el ACL a los defaults de Supabase (PUBLIC +
-- anon explícito) en cada una de estas seis funciones.
revoke execute on function public.mis_amigos() from anon;
revoke execute on function public.mis_amigos() from public;
revoke execute on function public.sugerencias_amigos() from anon;
revoke execute on function public.sugerencias_amigos() from public;
revoke execute on function public.buscar_usuario(text) from anon;
revoke execute on function public.buscar_usuario(text) from public;
revoke execute on function public.buscar_por_username(text) from anon;
revoke execute on function public.buscar_por_username(text) from public;
revoke execute on function public.camino_de_amigos() from anon;
revoke execute on function public.camino_de_amigos() from public;
revoke execute on function public.perfil_publico(uuid) from anon;
revoke execute on function public.perfil_publico(uuid) from public;

grant execute on function public.mis_amigos() to authenticated;
grant execute on function public.sugerencias_amigos() to authenticated;
grant execute on function public.buscar_usuario(text) to authenticated;
grant execute on function public.buscar_por_username(text) to authenticated;
grant execute on function public.camino_de_amigos() to authenticated;
grant execute on function public.perfil_publico(uuid) to authenticated;
