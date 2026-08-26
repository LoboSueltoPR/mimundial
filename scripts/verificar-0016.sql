-- ============================================================
--  Verificación de 0016 (notificaciones). Pegar en el SQL Editor
--  DESPUÉS de correr la migración Y de cargar los dos secretos.
--
--  Lo que más importa acá no es que las funciones existan sino:
--    · que `suscripciones_push` sea INALCANZABLE desde PostgREST —
--      es una tabla de endpoints de push, o sea el material con el
--      que se le manda una notificación a cualquiera;
--    · que los secretos del Vault estén, porque sin ellos
--      `mandar_push` se va en silencio y todo "anda" sin avisar nada.
-- ============================================================

select 'pg_net instalada' as que,
       (select count(*)::text from pg_extension where extname = 'pg_net') as valor,
       '1' as esperado

union all
select 'net.http_post existe',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'net' and p.proname = 'http_post'),
       '1 o mas (hay sobrecargas)'

union all
select 'tabla suscripciones_push',
       (select count(*)::text from information_schema.tables
         where table_schema = 'public' and table_name = 'suscripciones_push'),
       '1'

union all
-- RLS prendida y CERO políticas = nadie entra por PostgREST, ni logueado.
select 'RLS en suscripciones_push',
       (select case when relrowsecurity then 'si' else 'NO' end
          from pg_class where oid = 'public.suscripciones_push'::regclass),
       'si'

union all
select 'politicas de suscripciones_push',
       (select coalesce(string_agg(policyname, ','), '(ninguna)')
          from pg_policies where schemaname = 'public' and tablename = 'suscripciones_push'),
       '(ninguna)'

union all
-- El revoke explícito: ni anon ni authenticated tienen nada sobre la tabla.
select 'permisos de tabla para anon/authenticated',
       (select coalesce(string_agg(distinct grantee || ':' || privilege_type, ','), '(ninguno)')
          from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'suscripciones_push'
           and grantee in ('anon', 'authenticated')),
       '(ninguno)'

union all
select 'partidos.aviso_completo_en',
       (select count(*)::text from pg_attribute
         where attrelid = 'public.partidos'::regclass
           and attname = 'aviso_completo_en' and not attisdropped),
       '1'

union all
select 'el trigger esta puesto',
       (select coalesce(string_agg(tgname, ','), '(ninguno)') from pg_trigger
         where tgrelid = 'public.jugadores'::regclass and not tgisinternal),
       'jugadores_avisar'

union all
-- mandar_push arma el payload con endpoints adentro: NADIE la ejecuta
-- a mano. Solo la llama el trigger, que corre como owner.
select 'ACL mandar_push',
       (select coalesce(array_to_string(proacl, ' '), '(default = PUBLIC!)') from pg_proc
         where oid = 'public.mandar_push(uuid[],uuid[],text,text,text)'::regprocedure),
       'SIN anon y SIN authenticated'

union all
select 'ACL suscribirme_push',
       (select array_to_string(proacl, ' ') from pg_proc
         where oid = 'public.suscribirme_push(text,text,text,uuid)'::regprocedure),
       'anon= y authenticated=, SIN un "=X/" suelto'

union all
-- Sin estos dos, mandar_push devuelve sin hacer nada y no avisa a nadie
-- de que no avisó. Es el modo de falla silencioso de esta migración.
select 'secretos del Vault cargados',
       (select coalesce(string_agg(name, ',' order by name), '(NINGUNO)')
          from vault.decrypted_secrets where name in ('push_url', 'push_secreto')),
       'push_secreto,push_url'

union all
select 'push_url apunta a /api/push',
       (select case when decrypted_secret like 'https://%/api/push' then 'si' else 'NO: ' || decrypted_secret end
          from vault.decrypted_secrets where name = 'push_url'),
       'si';
