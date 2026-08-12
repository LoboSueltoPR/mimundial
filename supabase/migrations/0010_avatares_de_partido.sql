-- ============================================================
--  MiMundial 0010 — fotos de perfil en el detalle de un partido.
--
--  "Los anotados" en /partidos/[id] se carga con un select directo a
--  jugadores, y la RLS de perfiles ("perfil propio: leer", 0001) solo
--  deja ver tu propia fila — nunca iba a poder traer el avatar_url de
--  otro anotado, aunque tenga cuenta. Mismo patrón que ya se usó para
--  Amigos/Camino/invitación: una función que sí puede leer perfiles
--  ajenos, pero acotada a "sos el dueño de este partido puntual".
-- ============================================================

create or replace function public.avatares_de_partido(p_partido_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return '[]'::json;
  end if;

  if not exists (
    select 1 from public.partidos
    where id = p_partido_id and user_id = auth.uid()
  ) then
    return '[]'::json;
  end if;

  return coalesce((
    select json_agg(json_build_object(
             'user_id', j.user_id,
             'avatar_url', p.avatar_url,
             'username', p.username
           ))
    from public.jugadores j
    join public.perfiles p on p.id = j.user_id
    where j.partido_id = p_partido_id and j.user_id is not null
  ), '[]'::json);
end;
$$;

revoke execute on function public.avatares_de_partido(uuid) from anon;
revoke execute on function public.avatares_de_partido(uuid) from public;
grant execute on function public.avatares_de_partido(uuid) to authenticated;
