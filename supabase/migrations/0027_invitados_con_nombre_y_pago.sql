-- ============================================================
--  MiMundial 0027 — el invitado tiene nombre, y paga aparte
--
--  Hasta acá un invitado era un número: "+2". En la lista era
--  "Invitado de Juan" y en la plata se le cargaba a Juan entero. En la
--  cancha no es así: el invitado tiene nombre, y muchas veces el que
--  paga es él, no el que lo trajo.
--
--  ── El modelo ─────────────────────────────────────────────
--
--  `jugadores.invitados` (int) SIGUE siendo el conteo. Lo usan quince
--  funciones, el trigger del sorteo y los cálculos del front — no se
--  toca. Al lado va `invitados_det`, un array POSICIONAL:
--
--      [ { "nombre": "Tincho", "pagado": true }, { "nombre": null, "pagado": false } ]
--
--  El índice i describe al invitado i+1. Lo que no está en el array es
--  "sin nombre, sin pagar". El trigger de abajo lo recorta cada vez que
--  baja el conteo: si no, el "pagó" de un invitado que se fue reaparece
--  cuando el mismo jugador suma otro.
--
--  ── Quién toca qué ────────────────────────────────────────
--
--    · nombre: el que lo trae (por el link, con claim o con cuenta) y
--      el organizador (update directo, la RLS ya lo cubre).
--    · pagado: SOLO el organizador. Misma regla que `pagado` del
--      jugador desde 0020: el que cobra confirma. `nombrar_mis_invitados`
--      conserva el pagado que ya estaba y no deja escribirlo.
--
--  ── La plata ──────────────────────────────────────────────
--
--  El invitado sigue cargado a la cuenta de quien lo trae (debe = por
--  cabeza × (1 + invitados)). Un invitado que pagó aparte le cubre a
--  ese jugador una cabeza:
--
--      pagado efectivo = min(debe, pagado + round(por_cabeza × invitados que pagaron))
--
--  La misma cuenta está en `pagadoEfectivo` de lib/calculos.ts.
--
--  Aplicar envuelta en begin/commit: `db query -f` no abre transacción.
-- ============================================================

begin;

alter table public.jugadores
  add column if not exists invitados_det jsonb not null default '[]'::jsonb;

/* ------------------------------------------------------------
   1. El recorte. Corre con CUALQUIER escritor del conteo: el
      organizador, actualizar_anotado, actualizar_mi_anotacion,
      invitados_de_mi_lado. Arreglarlo en cada uno sería olvidarse de
      uno.
   ------------------------------------------------------------ */
create or replace function public.recortar_invitados_det()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if jsonb_typeof(new.invitados_det) is distinct from 'array' then
    new.invitados_det := '[]'::jsonb;
  end if;
  if jsonb_array_length(new.invitados_det) > coalesce(new.invitados, 0) then
    new.invitados_det := coalesce(
      (select jsonb_agg(e order by o)
         from jsonb_array_elements(new.invitados_det) with ordinality t(e, o)
        where o <= coalesce(new.invitados, 0)),
      '[]'::jsonb);
  end if;
  return new;
end;
$$;

revoke execute on function public.recortar_invitados_det() from public, anon, authenticated;

drop trigger if exists jugadores_recortar_invitados_det on public.jugadores;
create trigger jugadores_recortar_invitados_det
  before insert or update of invitados, invitados_det on public.jugadores
  for each row execute function public.recortar_invitados_det();

/* ------------------------------------------------------------
   2. Ponerle nombre a los míos, desde el link.

   Identifica igual que `mi_parte`: primero la cuenta, después el
   claim. Reescribe el array entero con exactamente `invitados`
   entradas y el `pagado` que ya tenía cada posición — el que llama no
   lo puede cambiar.

   Funciona con las anotaciones cerradas: nombrar no ocupa lugar.
   ------------------------------------------------------------ */
create or replace function public.nombrar_mis_invitados(
  tok       text,
  p_claim   uuid,
  p_nombres text[]
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p     public.partidos%rowtype;
  j     public.jugadores%rowtype;
  nuevo jsonb := '[]'::jsonb;
  nom   text;
  i     int;
begin
  select * into p from public.partidos where token = tok or token_b = tok;
  if not found then
    return json_build_object('ok', false, 'error', 'Link inválido.');
  end if;

  if auth.uid() is not null then
    select * into j from public.jugadores
    where partido_id = p.id and user_id = auth.uid();
  end if;

  if j.id is null and p_claim is not null then
    select * into j from public.jugadores
    where partido_id = p.id and claim = p_claim;
  end if;

  if j.id is null then
    return json_build_object('ok', false, 'error', 'No estás anotado en este partido.');
  end if;

  for i in 1 .. coalesce(j.invitados, 0) loop
    nom := nullif(btrim(left(coalesce(p_nombres[i], ''), 40)), '');
    nuevo := nuevo || jsonb_build_array(jsonb_build_object(
      'nombre', nom,
      'pagado', coalesce((j.invitados_det -> (i - 1) ->> 'pagado')::boolean, false)
    ));
  end loop;

  update public.jugadores set invitados_det = nuevo where id = j.id;

  -- en un desafío los nombres viven también en `equipos`
  perform public.rearmar_equipos_desafio(p.id);

  return json_build_object('ok', true);
end;
$$;

revoke execute on function public.nombrar_mis_invitados(text, uuid, text[]) from public, anon;
grant  execute on function public.nombrar_mis_invitados(text, uuid, text[]) to anon, authenticated;

/* ------------------------------------------------------------
   3. mi_parte: el pago de los invitados entra en lo mío, y me
      devuelve mis invitados para poder editarlos. Son MIS invitados:
      que vea si pagaron no le expone nada a nadie.

      Base: el cuerpo vivo (pg_get_functiondef), igual al de 0023.
   ------------------------------------------------------------ */
CREATE OR REPLACE FUNCTION public.mi_parte(tok text, p_claim uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p          public.partidos%rowtype;
  j          public.jugadores%rowtype;
  cabezas    int;
  por_cabeza numeric;
  debe       numeric;
  pago       numeric;
  inv_pagos  int;
  det        jsonb;
begin
  -- Dos links por desafío: el lado sale de QUÉ columna matcheó (ver 0023).
  select * into p from public.partidos where token = tok or token_b = tok;
  if not found then
    return json_build_object('anotado', false);
  end if;

  if auth.uid() is not null then
    select * into j from public.jugadores
    where partido_id = p.id and user_id = auth.uid();
  end if;

  if j.id is null and p_claim is not null then
    select * into j from public.jugadores
    where partido_id = p.id and claim = p_claim;
  end if;

  if j.id is null then
    return json_build_object('anotado', false);
  end if;

  select coalesce(sum(1 + invitados), 0) into cabezas
  from public.jugadores where partido_id = p.id;

  -- reconstruido campo por campo, y solo hasta el conteo
  select coalesce(jsonb_agg(jsonb_build_object(
           'nombre', e ->> 'nombre',
           'pagado', coalesce((e ->> 'pagado')::boolean, false)
         ) order by o), '[]'::jsonb),
         count(*) filter (where coalesce((e ->> 'pagado')::boolean, false))
    into det, inv_pagos
  from jsonb_array_elements(coalesce(j.invitados_det, '[]'::jsonb)) with ordinality t(e, o)
  where o <= coalesce(j.invitados, 0);

  por_cabeza := case when cabezas > 0 then p.costo / cabezas else 0 end;
  debe       := round(por_cabeza * (1 + coalesce(j.invitados, 0)));
  pago       := case
                  when p.puso = j.id then debe
                  when inv_pagos > 0 then least(debe, greatest(0, coalesce(j.pagado, 0)) + round(por_cabeza * inv_pagos))
                  else greatest(0, coalesce(j.pagado, 0))
                end;

  return json_build_object(
    'anotado',   true,
    'nombre',    j.nombre,
    'invitados', j.invitados,
    'invitados_det', det,
    'debe',      debe,
    'pagado',    pago,
    'saldo',     debe - pago,
    'adelante',  coalesce(p.puso = j.id, false),
    'aviso_pago_en', j.aviso_pago_en
  );
end;
$function$;

revoke execute on function public.mi_parte(text, uuid) from public, anon;
grant  execute on function public.mi_parte(text, uuid) to anon, authenticated;

/* ------------------------------------------------------------
   4. Los sorteos usan el nombre. Sin nombre sigue siendo
      "Invitado de X", que es lo que el front reconoce como anónimo.
   ------------------------------------------------------------ */
create or replace function public.sortear_equipos_auto(p_partido_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with todas as (
    -- el jugador
    select jsonb_build_object(
             'label', j.nombre,
             'inv',   false,
             'jid',   j.id,
             'uid',   j.user_id
           ) as c
    from public.jugadores j
    where j.partido_id = p_partido_id

    union all

    -- una entrada por cada invitado que trae
    select jsonb_build_object(
             'label', coalesce(nullif(btrim(j.invitados_det -> (g.i - 1) ->> 'nombre'), ''),
                               'Invitado de ' || j.nombre),
             'inv',   true,
             'de',    j.nombre,
             'jid',   j.id
           )
    from public.jugadores j,
         generate_series(1, j.invitados) g(i)
    where j.partido_id = p_partido_id and coalesce(j.invitados, 0) > 0
  ),
  mezcladas as (
    select c,
           row_number() over (order by random()) as r,
           count(*)     over ()                  as n,
           ceil(count(*) over () / 2.0)          as mitad
    from todas
  )
  select case when max(n) < 2 then null else jsonb_build_object(
           'a', coalesce(jsonb_agg(c order by r) filter (where r <= mitad), '[]'::jsonb),
           'b', coalesce(jsonb_agg(c order by r) filter (where r >  mitad), '[]'::jsonb),
           'n', max(n)
         ) end
  from mezcladas;
$$;

revoke execute on function public.sortear_equipos_auto(uuid) from public, anon, authenticated;

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
        'label', coalesce(nullif(btrim(j.invitados_det -> (g.i - 1) ->> 'nombre'), ''),
                          'Invitado de ' || j.nombre),
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

  -- `and es_desafio`: inofensiva aunque el ACL se vuelva a abrir (0022)
  update public.partidos
  set equipos = case
        when v_n = 0 then null
        else jsonb_build_object('a', v_a, 'b', v_b, 'n', v_n)
      end
  where id = p_partido_id and es_desafio;
end;
$$;

revoke execute on function public.rearmar_equipos_desafio(uuid) from public, anon, authenticated;

commit;
