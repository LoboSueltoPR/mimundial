-- Verificación de la 0021 (desafíos), para correr contra la base real:
--   npx supabase db query --linked -f scripts/verificar-0021.sql
--
-- Todas las filas tienen que decir OK. Son puras lecturas, así que el
-- `union all` es seguro acá — la trampa documentada es mezclar una rama
-- que escribe con otra que lee.

with c as (
  select count(*) n from information_schema.columns
  where table_schema = 'public' and table_name = 'partidos'
    and column_name in ('es_desafio','rival_id','rival_acepto_en','nombre_a','nombre_b')
),
l as (
  select count(*) n from information_schema.columns
  where table_schema = 'public' and table_name = 'jugadores' and column_name = 'lado'
),
k as (
  select count(*) n from pg_constraint where conname = 'jugadores_lado_check'
),
i as (
  select count(*) n from pg_indexes
  where schemaname = 'public' and indexname = 'partidos_desafios_abiertos_idx'
),
f as (
  select p.oid, p.proname
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname in (
    'desafios_para_mi','aceptar_desafio','sumar_a_mi_lado','quitar_de_mi_lado',
    'invitados_de_mi_lado','mi_desafio','nombrar_mi_lado',
    'rearmar_equipos_desafio','mi_lado_capitan'
  )
),
-- El agujero que ya apareció tres veces en este proyecto: las funciones
-- nacen con EXECUTE para PUBLIC y `anon` lo hereda. Revocarle a anon no
-- alcanza, hay que revocarle a PUBLIC.
acl_anon as (
  select count(*) n from f where has_function_privilege('anon', f.oid, 'EXECUTE')
),
acl_pub as (
  select count(*) n from f
  where exists (
    select 1 from aclexplode(coalesce(
      (select proacl from pg_proc where oid = f.oid),
      acldefault('f', (select proowner from pg_proc where oid = f.oid))
    )) a
    where a.grantee = 0 and a.privilege_type = 'EXECUTE'   -- grantee 0 = PUBLIC
  )
),
-- Las dos internas no las ejecuta ni un logueado.
acl_internas as (
  select count(*) n from f
  where f.proname in ('rearmar_equipos_desafio')
    and has_function_privilege('authenticated', f.oid, 'EXECUTE')
),
-- Las públicas de la feature sí las tiene que poder llamar un logueado.
acl_auth as (
  select count(*) n from f
  where f.proname in ('desafios_para_mi','aceptar_desafio','sumar_a_mi_lado',
                      'quitar_de_mi_lado','invitados_de_mi_lado','mi_desafio',
                      'nombrar_mi_lado','mi_lado_capitan')
    and has_function_privilege('authenticated', f.oid, 'EXECUTE')
)
select '1. columnas nuevas en partidos (5)' chequeo,
       n::text valor, case when n = 5 then 'OK' else 'MAL' end estado from c
union all select '2. jugadores.lado (1)', n::text, case when n = 1 then 'OK' else 'MAL' end from l
union all select '3. check de lado (1)', n::text, case when n = 1 then 'OK' else 'MAL' end from k
union all select '4. indice parcial (1)', n::text, case when n = 1 then 'OK' else 'MAL' end from i
union all select '5. funciones creadas (9)', count(*)::text,
       case when count(*) = 9 then 'OK' else 'MAL' end from f
union all select '6. ejecutables por anon (0)', n::text,
       case when n = 0 then 'OK' else 'MAL' end from acl_anon
union all select '7. ejecutables por PUBLIC (0)', n::text,
       case when n = 0 then 'OK' else 'MAL' end from acl_pub
union all select '8. internas abiertas a logueado (0)', n::text,
       case when n = 0 then 'OK' else 'MAL' end from acl_internas
union all select '9. publicas usables por logueado (8)', n::text,
       case when n = 8 then 'OK' else 'MAL' end from acl_auth;
