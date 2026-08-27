-- ============================================================
--  MiMundial 0019 — el historial del amigo, y su camino completo
--
--  Pedido: entrar al perfil de un amigo y ver qué partidos jugó y
--  cómo le fue, sin tener que abrir cada partido.
--
--  Al ir a buscar el dato apareció algo más grande: `perfil_publico`
--  y `camino_de_amigos` arman el camino del otro con
--
--      where pt.user_id = p.id
--
--  o sea SOLO los partidos que esa persona organizó. Los que jugó en
--  la cancha de otro nunca contaron. Es el mismo agujero que 0014 le
--  arregló al camino propio, que quedó sin arreglar del lado de los
--  amigos: si Rodri organiza y Tobi juega, a Tobi le cuenta (desde
--  0014) pero en el perfil que ve Alejo seguía sin aparecer. Dos
--  pantallas mostrando caminos distintos de la misma persona.
--
--  Se centraliza en una función y la usan las dos.
-- ============================================================

/* ------------------------------------------------------------
   1. Todos los partidos jugados por alguien, desde SU punto de vista.

      Dos fuentes, igual que `mis_resultados_ajenos` (0014):

        · los que organizó — `resultado` ya está escrito desde su
          lugar, se usa tal cual;
        · los que jugó de invitado — hay que dar vuelta el resultado
          según de qué lado quedó en el sorteo.

      Reglas heredadas de 0014, por las mismas razones:

        · Si no se sabe de qué lado jugó, el partido NO entra. No se
          adivina.
        · `cierra_mundial` va en false para los ajenos: es una
          decisión del dueño sobre SU mundial, no sobre el de los
          demás. Si Rodri cierra el suyo, no le corta el mundial a
          Tobi.

      No devuelve quién más jugó ni un peso de plata: es el historial
      de una persona, no la ficha del partido.
   ------------------------------------------------------------ */
create or replace function public.partidos_jugados_por(p_user_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(x order by x.fecha, x.creado_en), '[]'::json)
  from (
    -- los que organizó
    select pt.id, pt.fecha, pt.creado_en, pt.lugar,
           pt.resultado::text as resultado,
           pt.cierra_mundial,
           true as anfitrion
    from public.partidos pt
    where pt.user_id = p_user_id
      and pt.resultado is not null

    union all

    -- los que jugó en un partido ajeno, con el resultado dado vuelta
    select pt.id, pt.fecha, pt.creado_en, pt.lugar,
           case
             when pt.resultado = 'empate' then 'empate'
             when pt.equipo_ganador = public.lado_en_equipos(pt.equipos, j.user_id) then 'ganamos'
             else 'perdimos'
           end,
           false,
           false
    from public.jugadores j
    join public.partidos pt on pt.id = j.partido_id
    where j.user_id = p_user_id
      and pt.user_id <> p_user_id
      and pt.resultado is not null
      and pt.equipos is not null
      and public.lado_en_equipos(pt.equipos, j.user_id) is not null
      and (pt.resultado = 'empate' or pt.equipo_ganador is not null)
  ) x;
$$;

revoke execute on function public.partidos_jugados_por(uuid) from public;
revoke execute on function public.partidos_jugados_por(uuid) from anon;
-- La llaman perfil_publico y camino_de_amigos, que ya hacen el chequeo
-- de "son amigos o comparten un partido". Se otorga a authenticated
-- porque son security definer y corren como owner igual, pero conviene
-- que no quede abierta de más: no expone nombres de otros anotados.
grant execute on function public.partidos_jugados_por(uuid) to authenticated;

/* ------------------------------------------------------------
   2. camino_de_amigos, ahora con los partidos completos.

      Copiada de 0012 con un solo cambio: la subconsulta de partidos
      se reemplaza por la función de arriba.
   ------------------------------------------------------------ */
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
             'partidos', public.partidos_jugados_por(p.id)
           ) order by p.nombre)
    from public.amigos am
    join public.perfiles p on p.id = am.amigo_id
    where am.user_id = auth.uid()
  ), '[]'::json);
end;
$$;

/* ------------------------------------------------------------
   3. perfil_publico, igual, y con el historial.

      El chequeo de acceso no se toca: sigue siendo "son amigos O
      comparten un partido", y nunca se muestra el perfil de uno
      mismo. Copiada entera de 0012 porque create or replace pisa
      todo.
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
      'apodo', p.apodo,
      'club', p.club,
      'posicion', p.posicion,
      'pie', p.pie,
      'username', p.username,
      'avatar_url', p.avatar_url,
      'partidos', public.partidos_jugados_por(p.id)
    )
    from public.perfiles p
    where p.id = p_user_id
  );
end;
$$;

-- create or replace resetea el ACL a los defaults de Supabase, así que
-- los revokes van de nuevo (ver 0012 y el agujero que reapareció el 12/8).
revoke execute on function public.camino_de_amigos() from anon;
revoke execute on function public.camino_de_amigos() from public;
revoke execute on function public.perfil_publico(uuid) from anon;
revoke execute on function public.perfil_publico(uuid) from public;
grant  execute on function public.camino_de_amigos() to authenticated;
grant  execute on function public.perfil_publico(uuid) to authenticated;
