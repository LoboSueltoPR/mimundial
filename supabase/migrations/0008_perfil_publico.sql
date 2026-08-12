-- ============================================================
--  MiMundial 0008 — ver el camino de otro jugador logueado del
--  mismo partido, y sumarlo de amigo desde ahí.
--
--  perfil_publico(uid) devuelve nombre/username/avatar y el
--  historial de resultados de OTRO usuario (para que el cliente
--  corra calcularCamino() igual que hace con camino_de_amigos), pero
--  solo si quien pregunta comparte al menos un partido con esa
--  persona — como dueño o como jugador anotado, de cualquiera de
--  los dos lados. No hace falta ser amigo todavía: la idea es
--  poder ver el camino de alguien que se anotó en tu partido (o vos
--  en el suyo) antes de decidir agregarlo.
--
--  Nunca expone plata, jugadores de sus partidos ni nada que no sea
--  lo mismo que ya se ve en camino_de_amigos.
-- ============================================================

create or replace function public.perfil_publico(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  comparten boolean;
begin
  if auth.uid() is null or auth.uid() = p_user_id then
    return null;
  end if;

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

-- Esta vez el default no es "hereda de PUBLIC" como en 0006: Supabase le
-- da a las funciones nuevas un grant EXPLÍCITO a anon y authenticated en
-- el momento de crearlas (se ve en pg_proc.proacl: "anon=X/postgres"),
-- así que "revoke ... from public" no alcanza. Hay que sacárselo a anon
-- a mano. La función ya se cuida sola (auth.uid() null devuelve null),
-- pero cinturón y tirante.
revoke execute on function public.perfil_publico(uuid) from anon;
revoke execute on function public.perfil_publico(uuid) from public;
grant execute on function public.perfil_publico(uuid) to authenticated;

-- ------------------------------------------------------------
-- camino_de_amigos se había quedado sin `cierra_mundial`: el camino
-- de un amigo que cerró su mundial a mano (0007) se calculaba mal
-- en la lista de "Tus amigos". Mismo select, un campo más.
-- ------------------------------------------------------------

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

-- create or replace resetea el ACL a los defaults de Supabase (PUBLIC +
-- anon), así que el revoke original de 0004 hay que repetirlo acá.
revoke execute on function public.camino_de_amigos() from anon;
revoke execute on function public.camino_de_amigos() from public;
grant execute on function public.camino_de_amigos() to authenticated;
