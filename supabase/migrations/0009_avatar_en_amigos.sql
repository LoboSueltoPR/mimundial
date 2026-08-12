-- ============================================================
--  MiMundial 0009 — fotos de perfil visibles en Amigos.
--
--  perfiles.avatar_url existe desde 0001 (se autocompleta con la foto de
--  Google al crear la cuenta) y ya viaja en camino_de_amigos y
--  perfil_publico, pero buscar_usuario/sugerencias_amigos/mis_amigos
--  nunca lo devolvían — la página de Amigos solo tenía nombre. Ahora
--  además de subir una foto propia (perfil, base64 en el mismo campo),
--  hace falta que esas tres funciones también la traigan.
-- ============================================================

create or replace function public.buscar_usuario(p_email text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  u_id     uuid;
  u_nombre text;
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

  select nombre, avatar_url, username into u_nombre, u_avatar, u_user
  from public.perfiles where id = u_id;

  return json_build_object(
    'id', u_id,
    'nombre', coalesce(u_nombre, split_part(p_email, '@', 1)),
    'avatar_url', u_avatar,
    'username', u_user
  );
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
             'avatar_url', p.avatar_url,
             'username', p.username
           ) order by p.nombre)
    from public.amigos a
    left join public.perfiles p on p.id = a.amigo_id
    where a.user_id = auth.uid()
  ), '[]'::json);
end;
$$;

-- create or replace resetea el ACL a los defaults de Supabase (PUBLIC +
-- anon explícito): hay que repetir el lockdown de 0002 para las tres.
revoke execute on function public.buscar_usuario(text) from anon;
revoke execute on function public.buscar_usuario(text) from public;
revoke execute on function public.sugerencias_amigos() from anon;
revoke execute on function public.sugerencias_amigos() from public;
revoke execute on function public.mis_amigos() from anon;
revoke execute on function public.mis_amigos() from public;
grant execute on function public.buscar_usuario(text) to authenticated;
grant execute on function public.sugerencias_amigos() to authenticated;
grant execute on function public.mis_amigos() to authenticated;
