-- ============================================================
--  MiMundial 0003 — fix: nuevo_token() sin permiso para authenticated
--
--  0002 le revocó el execute a authenticated ademas de a anon, pero
--  nuevo_token() es el default de partidos.token, y ese default se
--  evalua con el rol de quien inserta (authenticated al crear un
--  partido). Sin el grant, "Crear partido" tira
--  "permission denied for function nuevo_token".
-- ============================================================

grant execute on function public.nuevo_token() to authenticated;
