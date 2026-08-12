-- ============================================================
--  MiMundial 0006 — cerrarle la puerta de atrás a anon en las tres
--  funciones que abrió 0005.
--
--  0005 hacía `revoke execute ... from anon` y no alcanzó: Postgres
--  le da EXECUTE a PUBLIC en toda función nueva, y `anon` es parte de
--  PUBLIC. Revocarle a `anon` su grant directo lo deja igual adentro,
--  porque hereda el de PUBLIC.
--
--  Se veía en el ACL: las funciones viejas (mis_amigos, buscar_usuario)
--  tienen `{postgres=X/...,authenticated=X/...}`, mientras que las de
--  0005 quedaron con un `=X/postgres` al principio — ese, sin rol
--  adelante, es PUBLIC.
--
--  Las funciones ya se defendían solas (chequean auth.uid() y devuelven
--  error), así que no hubo fuga de datos. Esto es el cinturón además
--  del tirante: si mañana alguien saca ese chequeo, anon no entra igual.
--
--  Ojo con ver_partido_por_token y anotarse: esas SÍ tienen que quedar
--  abiertas para el invitado sin cuenta. No se tocan.
-- ============================================================

revoke execute on function public.actualizar_mi_anotacion(uuid, text, int) from public;
revoke execute on function public.bajarme_de_partido(uuid) from public;
revoke execute on function public.mis_partidos_anotado() from public;

-- El revoke a PUBLIC también le saca el permiso al dueño implícito de
-- turno, así que reafirmamos quién sí tiene que poder ejecutarlas.
grant execute on function public.actualizar_mi_anotacion(uuid, text, int) to authenticated;
grant execute on function public.bajarme_de_partido(uuid) to authenticated;
grant execute on function public.mis_partidos_anotado() to authenticated;
