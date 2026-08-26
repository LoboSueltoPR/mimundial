-- ============================================================
--  Verificación de 0014. Pegar en el SQL Editor DESPUÉS de correr
--  la migración y mirar las filas.
--
--  Igual que la de 0013: "no tiró error" no es verificación. Acá
--  además hay un modo de fallar peor que un error — que
--  mis_resultados_ajenos devuelva [] para siempre, que se ve
--  exactamente igual que "todavía no jugaste ningún partido de
--  otro". Por eso las dos últimas filas prueban la comparación de
--  jsonb con datos inventados, sin tocar nada tuyo.
-- ============================================================

select 'partidos.equipo_ganador' as que,
       (select count(*)::text from pg_attribute
         where attrelid = 'public.partidos'::regclass
           and attname = 'equipo_ganador' and not attisdropped) as valor,
       '1' as esperado

union all
select 'check de equipo_ganador',
       (select count(*)::text from pg_constraint
         where conrelid = 'public.partidos'::regclass
           and conname = 'partidos_equipo_ganador_check'),
       '1'

union all
select 'funciones nuevas',
       (select coalesce(string_agg(proname, ',' order by proname), '(ninguna)')
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and proname in ('lado_en_equipos', 'reclamar_anotacion',
                           'enganchar_anotado', 'mis_resultados_ajenos')),
       'enganchar_anotado,lado_en_equipos,mis_resultados_ajenos,reclamar_anotacion'

union all
-- create or replace resetea el ACL a los defaults de Supabase: esto
-- comprueba que los revoke del final de la migración corrieron.
select 'ACL ver_partido_por_token',
       (select array_to_string(proacl, ' ') from pg_proc
         where oid = 'public.ver_partido_por_token(text)'::regprocedure),
       'con anon= y authenticated=, SIN un "=X/" suelto (eso es PUBLIC)'

union all
select 'ver_partido_por_token trae reclamable',
       (select case when prosrc like '%reclamable%' then 'si' else 'NO' end
          from pg_proc where oid = 'public.ver_partido_por_token(text)'::regprocedure),
       'si'

union all
-- LA PRUEBA QUE IMPORTA: un sorteo de mentira con la forma exacta que
-- escribe el navegador, y la cuenta que está en oscuros.
select 'encuentra la cuenta en el sorteo',
       coalesce(public.lado_en_equipos(
         '{"a":[{"label":"Lobo","inv":false,"jid":"j1","uid":"11111111-1111-1111-1111-111111111111"}],
           "b":[{"label":"Rodri","inv":false,"jid":"j2","uid":"22222222-2222-2222-2222-222222222222"},
                {"label":"Invitado de Rodri","inv":true,"jid":"j2"}],
           "n":3}'::jsonb,
         '22222222-2222-2222-2222-222222222222'::uuid), '(null)'),
       'b'

union all
-- Un sorteo viejo, sin uid: tiene que dar null y no romper.
select 'un sorteo viejo no le da lado a nadie',
       coalesce(public.lado_en_equipos(
         '{"a":[{"label":"Lobo","inv":false}],"b":[{"label":"Rodri","inv":false}],"n":2}'::jsonb,
         '22222222-2222-2222-2222-222222222222'::uuid), '(null)'),
       '(null)'

union all
select 'equipos en null no rompe',
       coalesce(public.lado_en_equipos(
         null, '22222222-2222-2222-2222-222222222222'::uuid), '(null)'),
       '(null)';
