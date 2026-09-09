-- ============================================================
--  0022 — cerrar el ACL de los desafíos (arregla la 0021)
--
--  La 0021 revocó EXECUTE a PUBLIC y otorgó a `authenticated`, que es
--  lo que este proyecto venía haciendo. No alcanzó: el ACL real de las
--  9 funciones quedó
--
--      postgres=X/postgres | anon=X/postgres |
--      authenticated=X/postgres | service_role=X/postgres
--
--  o sea con `anon` otorgado **explícitamente**, no heredado de PUBLIC.
--  Sale de los DEFAULT PRIVILEGES que Supabase tiene puestos sobre el
--  esquema `public`: toda función nueva nace otorgada a anon,
--  authenticated y service_role. `revoke from public` no los toca.
--
--  Es un agujero distinto del de 0006/0012 (aquel sí era herencia de
--  PUBLIC) y por eso el patrón viejo no lo agarraba. La regla que queda:
--  **revocar a `public` Y a `anon`, siempre las dos.**
--
--  Lo que esto tenía de grave: `rearmar_equipos_desafio` es SECURITY
--  DEFINER, no mira `auth.uid()` (nació como interna) y reescribe
--  `equipos`. Con anon pudiendo llamarla, cualquiera con un id de
--  partido podía pisarle el sorteo a un picadito ajeno — sobre un
--  partido sin `lado` cargado el rearmado da cero cabezas y deja
--  `equipos` en null, que es borrar el sorteo.
--
--  Precedente: 0006 hizo exactamente esto para la 0005.
-- ============================================================

-- ---------- las 8 que sí usa un logueado ----------
revoke execute on function public.desafios_para_mi()                     from public, anon;
revoke execute on function public.aceptar_desafio(uuid)                  from public, anon;
revoke execute on function public.sumar_a_mi_lado(uuid, text, uuid)      from public, anon;
revoke execute on function public.quitar_de_mi_lado(uuid, uuid)          from public, anon;
revoke execute on function public.invitados_de_mi_lado(uuid, uuid, int)  from public, anon;
revoke execute on function public.mi_desafio(uuid)                       from public, anon;
revoke execute on function public.nombrar_mi_lado(uuid, text)            from public, anon;
revoke execute on function public.mi_lado_capitan(uuid)                  from public, anon;

-- ---------- la interna: no la llama nadie desde afuera ----------
revoke execute on function public.rearmar_equipos_desafio(uuid)
  from public, anon, authenticated;

-- El grant de la 0021 se repite acá: si algún día se corre esta
-- migración sola contra una base recién migrada, las 8 tienen que
-- quedar usables por un logueado igual.
grant execute on function public.desafios_para_mi()                    to authenticated;
grant execute on function public.aceptar_desafio(uuid)                 to authenticated;
grant execute on function public.sumar_a_mi_lado(uuid, text, uuid)     to authenticated;
grant execute on function public.quitar_de_mi_lado(uuid, uuid)         to authenticated;
grant execute on function public.invitados_de_mi_lado(uuid, uuid, int) to authenticated;
grant execute on function public.mi_desafio(uuid)                      to authenticated;
grant execute on function public.nombrar_mi_lado(uuid, text)           to authenticated;
grant execute on function public.mi_lado_capitan(uuid)                 to authenticated;

-- ============================================================
--  Y aparte del ACL, que la función no pueda hacer daño
--
--  Defensa en profundidad: el ACL de este proyecto ya se abrió solo
--  tres veces (0006, 0012, y ahora esta). Si vuelve a pasar, que lo
--  peor que se pueda hacer con `rearmar_equipos_desafio` sea recalcular
--  un desafío a partir de sus propias filas — idempotente e inofensivo
--  — y NO borrarle el sorteo a un picadito.
--
--  El `and es_desafio` del update es todo el arreglo: en un picadito
--  ningún `jugadores.lado` está cargado, así que el rearmado daría cero
--  cabezas y pondría `equipos` en null.
-- ============================================================
create or replace function public.rearmar_equipos_desafio(p_partido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a jsonb;
  v_b jsonb;
  v_n int;
begin
  -- Fuera de un desafío no hay nada que rearmar: los lados de un
  -- picadito los reparte el bombo y viven solo en el jsonb.
  if not exists (
    select 1 from public.partidos where id = p_partido_id and es_desafio
  ) then
    return;
  end if;

  with cabezas as (
    select
      j.lado,
      j.orden,
      0 as sub,
      jsonb_build_object(
        'label', j.nombre,
        'inv', false,
        'jid', j.id,
        'uid', j.user_id
      ) as c
    from public.jugadores j
    where j.partido_id = p_partido_id and j.lado is not null
    union all
    select
      j.lado,
      j.orden,
      g.i as sub,
      jsonb_build_object(
        'label', 'Invitado de ' || j.nombre,
        'inv', true,
        'de', j.nombre,
        'jid', j.id
      )
    from public.jugadores j
      cross join lateral generate_series(1, coalesce(j.invitados, 0)) as g(i)
    where j.partido_id = p_partido_id and j.lado is not null
  )
  select
    coalesce(jsonb_agg(c order by orden, sub) filter (where lado = 'a'), '[]'::jsonb),
    coalesce(jsonb_agg(c order by orden, sub) filter (where lado = 'b'), '[]'::jsonb),
    count(*)
  into v_a, v_b, v_n
  from cabezas;

  update public.partidos
  set equipos = case
        when v_n = 0 then null
        else jsonb_build_object('a', v_a, 'b', v_b, 'n', v_n)
      end
  where id = p_partido_id and es_desafio;
end;
$$;

-- `create or replace` resetea el ACL a los defaults de Supabase, así que
-- el revoke va DESPUÉS de recrearla. Este orden es el que faltó entender
-- las tres veces anteriores.
revoke execute on function public.rearmar_equipos_desafio(uuid)
  from public, anon, authenticated;
