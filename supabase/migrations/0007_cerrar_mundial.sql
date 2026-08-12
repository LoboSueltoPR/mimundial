-- ============================================================
--  MiMundial 0007 — bajarse del mundial antes de tiempo.
--
--  Si perdiste las dos primeras de grupos, la tercera ya no sirve
--  para nada: ganándola llegás a 3 puntos y el pase pide 4. Hasta
--  ahora el mundial quedaba colgado hasta que jugaras esa tercera
--  fecha sí o sí. Con esto podés darlo por terminado y que el
--  próximo partido arranque un mundial nuevo.
--
--  Es una decisión del dueño del partido sobre su propio historial,
--  así que va como columna de `partidos` y la RLS que ya existe
--  (dueño y nadie más) alcanza. El resultado se guarda con un update
--  directo desde el cliente, así que este campo viaja por el mismo
--  camino, sin RPC nueva.
-- ============================================================

alter table public.partidos
  add column if not exists cierra_mundial boolean not null default false;

comment on column public.partidos.cierra_mundial is
  'Si es true, el mundial se da por terminado despues de este partido: el siguiente resultado arranca uno nuevo.';
