-- ============================================================
--  Verificación de 0013. Pegar en el SQL Editor DESPUÉS de correr
--  la migración y mirar las cuatro filas.
--
--  Existe porque aplicar a mano puede quedar a medias sin dar error:
--  la 0004 creó sus funciones pero no sus columnas, y la invitación
--  de logueados estuvo rota 12 días sin que se notara. "No tiró
--  error" no es verificación.
-- ============================================================

select 'tabla canchas' as que,
       (select count(*)::text from information_schema.tables
         where table_schema = 'public' and table_name = 'canchas') as valor,
       '1' as esperado

union all
select 'columnas de canchas',
       (select string_agg(attname, ',' order by attnum)
          from pg_attribute
         where attrelid = 'public.canchas'::regclass and attnum > 0 and not attisdropped),
       'id,nombre,direccion,lat,lng,notas,activa,creado_en'

union all
select 'canchas cargadas',
       (select count(*)::text from public.canchas),
       '8'

union all
select 'partidos.cancha_id',
       (select count(*)::text from pg_attribute
         where attrelid = 'public.partidos'::regclass and attname = 'cancha_id'
           and not attisdropped),
       '1'

union all
-- El ACL de la función que llama anon. create or replace lo resetea a los
-- defaults de Supabase, así que acá se comprueba que los revokes del final
-- de la migración corrieron: tiene que estar anon y NO estar PUBLIC (=).
select 'ACL ver_partido_por_token',
       (select array_to_string(proacl, ' ') from pg_proc
         where oid = 'public.ver_partido_por_token(text)'::regprocedure),
       'con anon= y authenticated=, SIN un "=X/" suelto (eso es PUBLIC)'

union all
select 'policies de canchas',
       (select coalesce(string_agg(cmd, ',' order by cmd), '(ninguna)')
          from pg_policies where schemaname = 'public' and tablename = 'canchas'),
       'SELECT y nada mas';
