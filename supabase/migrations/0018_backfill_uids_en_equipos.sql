-- ============================================================
--  MiMundial 0018 — enganchar los sorteos viejos con las cuentas
--
--  El problema, tal cual apareció: Rodri creó el partido del 25/8,
--  marcó que ganaron los claros, y el camino se le movió SOLO A ÉL.
--  Alejo, Tobi y Maxi estaban en ese mismo equipo y con cuenta de
--  Google, y no cobraron nada.
--
--  La causa no es 0014 ni 0017: es que ese sorteo se hizo ANTES, con
--  la versión del cliente que guardaba solo `{label, inv}`. Sin `uid`
--  adentro de cada cabeza, `lado_en_equipos` no puede decir de qué
--  lado jugó nadie, y `mis_resultados_ajenos` descarta el partido.
--
--  Se puede arreglar sin adivinar nada: dentro de un partido los
--  nombres son ÚNICOS (índice único sobre (partido_id, lower(nombre)),
--  ver 0001), así que cada `label` del sorteo corresponde a lo sumo a
--  una fila de `jugadores`. No hay ambigüedad posible.
--
--  Pero "a lo sumo una" no es "exactamente una": un sorteo puede tener
--  el nombre de alguien que después se sacó del partido o se renombró.
--  Esas cabezas se dejan como están, sin enganchar. Ver el comentario
--  del `coalesce` más abajo: no manejarlo las BORRABA.
--
--  Ojo con el efecto: los partidos que además tengan `equipo_ganador`
--  cargado van a EMPEZAR A CONTAR en el camino de los que jugaron. Eso
--  es justamente lo que se busca, pero significa que a alguna gente le
--  va a cambiar el mundial en curso de golpe. Al 26/8 son 2 partidos.
-- ============================================================

/* ------------------------------------------------------------
   1. Rellenar un lado.

      Solo toca las cabezas que NO tienen `uid` ni `jid`: una que ya
      esté enganchada se deja como está. El invitado lleva `jid` y no
      `uid`, igual que en `cabezasLista()` de calculos.ts — no es una
      cuenta, es un lugar que ocupa alguien sin nombre propio.

      OJO CON EL `coalesce(..., '{}')`: en jsonb, `algo || NULL` es
      NULL, no `algo`. Sin el coalesce, una cabeza cuyo nombre ya no
      existe entre los anotados (se lo sacó o se lo renombró después
      del sorteo) no queda "sin enganchar": **se borra entera** y el
      equipo pierde un jugador. Pasó de verdad en la primera corrida
      sobre los datos reales — dos cabezas de un partido quedaron en
      null y hubo que restaurar desde un respaldo.

      `with ordinality` mantiene el orden del sorteo: reordenar los
      equipos al pasar sería cambiarle el sorteo a alguien.
   ------------------------------------------------------------ */
create or replace function public.rellenar_lado(p_lado jsonb, p_partido uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(nueva order by ord), '[]'::jsonb)
  from (
    select
      case
        -- ya enganchada: no se toca
        when c ? 'uid' or c ? 'jid' then c
        -- invitado: se cuelga de la fila del que lo trae
        when coalesce((c->>'inv')::boolean, false) then
          c || coalesce((
            select jsonb_build_object('jid', j.id)
            from public.jugadores j
            where j.partido_id = p_partido
              and lower(j.nombre) = lower(c->>'de')
            limit 1), '{}'::jsonb)
        -- jugador: su fila y su cuenta, si tiene
        else
          c || coalesce((
            select jsonb_build_object('jid', j.id, 'uid', j.user_id)
            from public.jugadores j
            where j.partido_id = p_partido
              and lower(j.nombre) = lower(c->>'label')
            limit 1), '{}'::jsonb)
      end as nueva,
      ord
    from jsonb_array_elements(
      case when jsonb_typeof(p_lado) = 'array' then p_lado else '[]'::jsonb end
    ) with ordinality as t(c, ord)
  ) x;
$$;

create or replace function public.rellenar_equipos(p_equipos jsonb, p_partido uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select case when p_equipos is null then null else jsonb_build_object(
    'a', public.rellenar_lado(p_equipos->'a', p_partido),
    'b', public.rellenar_lado(p_equipos->'b', p_partido),
    'n', coalesce(p_equipos->'n', '0'::jsonb)
  ) end;
$$;

revoke execute on function public.rellenar_lado(jsonb, uuid) from public;
revoke execute on function public.rellenar_lado(jsonb, uuid) from anon, authenticated;
revoke execute on function public.rellenar_equipos(jsonb, uuid) from public;
revoke execute on function public.rellenar_equipos(jsonb, uuid) from anon, authenticated;

/* ------------------------------------------------------------
   2. El backfill.

      Corre una sola vez sobre lo que hay. Es idempotente: volver a
      correrlo no cambia nada, porque las cabezas ya enganchadas se
      devuelven tal cual.

      Si un jugador se borró del partido después del sorteo, su
      subconsulta da null y la cabeza queda sin `uid` — que es
      exactamente el estado de antes, no algo peor.
   ------------------------------------------------------------ */
update public.partidos
   set equipos = public.rellenar_equipos(equipos, id)
 where equipos is not null;
