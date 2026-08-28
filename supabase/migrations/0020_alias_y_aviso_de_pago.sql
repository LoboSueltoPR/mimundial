-- ============================================================
--  MiMundial 0020 — el alias del que cobra, y "ya te transferí"
--
--  El circuito que reemplaza esto es el de WhatsApp: "pasame el alias",
--  captura de la transferencia, "listo ya te mandé", y el organizador
--  llevando la cuenta de memoria.
--
--  Cómo queda:
--    1. El que crea el partido pone su alias.
--    2. El jugador lo ve junto a lo que le toca, lo copia y transfiere
--       desde donde quiera.
--    3. Toca "ya te transferí" → al organizador le llega un push.
--    4. El organizador confirma con un toque y recién ahí queda pagado.
--
--  ── Por qué NO se marca solo ──────────────────────────────
--
--  Se investigó: Mercado Pago no tiene ningún tópico de webhook para
--  transferencias entrantes por alias/CVU. Sus tópicos (payment, orders,
--  merchant_order, etc.) son todos del carril de COBRO, que es el que
--  tiene comisión. O sea que "gratis y automático" no existe: son el
--  mismo producto. Por eso el aviso lo da el que paga y lo confirma el
--  que cobra.
--
--  ── Por qué `aviso_pago_en` y no tocar `pagado` ───────────
--
--  Decir que pagaste no es haber pagado. Si el aviso escribiera
--  directamente en `pagado`, cualquiera con el link saldaría su deuda
--  solo, y el organizador perdería el único dato que le importa. Son
--  dos hechos distintos y se guardan por separado: `aviso_pago_en` lo
--  pone el que paga, `pagado` sigue siendo del organizador.
-- ============================================================

/* ------------------------------------------------------------
   1. Las dos columnas.

      El alias va en el PARTIDO y no en el perfil: puede cambiar entre
      partidos (a veces cobra otro, a veces es la cuenta del club). El
      formulario lo va a pre-cargar con el último que usaste, así no hay
      que reescribirlo todas las semanas.
   ------------------------------------------------------------ */
alter table public.partidos
  add column if not exists alias_pago text;

alter table public.jugadores
  add column if not exists aviso_pago_en timestamptz;

/* ------------------------------------------------------------
   2. "Ya te transferí".

      Lo puede tocar cualquiera que tenga una fila en el partido, con
      cuenta o sin ella: la identidad se resuelve igual que en
      `mi_parte` (0015) — primero auth.uid(), después el claim del
      navegador.

      Idempotente: tocarlo dos veces no manda dos avisos. Sin ese
      freno, un doble toque nervioso le tira dos notificaciones al
      organizador.
   ------------------------------------------------------------ */
create or replace function public.avisar_que_pague(
  tok     text,
  p_claim uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p          public.partidos%rowtype;
  j          public.jugadores%rowtype;
  cabezas    int;
  debe       numeric;
  anfitrion  text;
begin
  select * into p from public.partidos where token = tok;
  if not found then
    return json_build_object('ok', false, 'error', 'Ese link no existe.');
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

  -- Ya avisó: no se vuelve a molestar al organizador.
  if j.aviso_pago_en is not null then
    return json_build_object('ok', true, 'repetido', true);
  end if;

  update public.jugadores set aviso_pago_en = now() where id = j.id;

  select coalesce(sum(1 + invitados), 0) into cabezas
  from public.jugadores where partido_id = p.id;
  debe := case when cabezas > 0
               then round((p.costo / cabezas) * (1 + coalesce(j.invitados, 0)))
               else 0 end;

  perform public.mandar_push(
    array[p.user_id],
    array[]::uuid[],
    j.nombre || ' dice que te transfirió',
    '$' || debe::bigint || ' · ' || coalesce(p.lugar, 'el partido') ||
      '. Entrá y confirmá si te llegó.',
    '/partidos/' || p.id
  );

  return json_build_object('ok', true);
end;
$$;

revoke execute on function public.avisar_que_pague(text, uuid) from public;
grant  execute on function public.avisar_que_pague(text, uuid) to anon, authenticated;

/* ------------------------------------------------------------
   3. mi_parte: sumar si ya avisé.

      Copiada de 0015 con un campo más. Sin esto el botón no sabría si
      mostrarse como "ya te transferí" o como "avisado, esperando".
   ------------------------------------------------------------ */
create or replace function public.mi_parte(tok text, p_claim uuid default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p          public.partidos%rowtype;
  j          public.jugadores%rowtype;
  cabezas    int;
  por_cabeza numeric;
  debe       numeric;
  pago       numeric;
begin
  select * into p from public.partidos where token = tok;
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

  por_cabeza := case when cabezas > 0 then p.costo / cabezas else 0 end;
  debe       := round(por_cabeza * (1 + coalesce(j.invitados, 0)));
  pago       := case when p.puso = j.id then debe else greatest(0, coalesce(j.pagado, 0)) end;

  return json_build_object(
    'anotado',   true,
    'nombre',    j.nombre,
    'invitados', j.invitados,
    'debe',      debe,
    'pagado',    pago,
    'saldo',     debe - pago,
    'adelante',  coalesce(p.puso = j.id, false),
    'aviso_pago_en', j.aviso_pago_en
  );
end;
$$;

revoke execute on function public.mi_parte(text, uuid) from public;
grant  execute on function public.mi_parte(text, uuid) to anon, authenticated;

/* ------------------------------------------------------------
   4. ver_partido_por_token: sumar el alias.

      Copiada entera de 0017 (create or replace pisa todo) con un campo
      más. El alias es dato de cobro del organizador y va a cualquiera
      que tenga el link — que es justamente para lo que existe.
   ------------------------------------------------------------ */
create or replace function public.ver_partido_por_token(tok text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p          public.partidos%rowtype;
  cabezas    int;
  logueado   boolean;
  mi         public.jugadores%rowtype;
  ca         public.canchas%rowtype;
  lado_dueno text;
  gol_a      int;
  gol_b      int;
begin
  select * into p from public.partidos where token = tok;
  if not found then
    return null;
  end if;

  logueado := auth.uid() is not null;

  select coalesce(sum(1 + invitados), 0) into cabezas
  from public.jugadores where partido_id = p.id;

  if logueado then
    select * into mi from public.jugadores
    where partido_id = p.id and user_id = auth.uid();
  end if;

  if p.cancha_id is not null then
    select * into ca from public.canchas where id = p.cancha_id;
  end if;

  lado_dueno := public.lado_en_equipos(p.equipos, p.user_id);
  if lado_dueno = 'a' then
    gol_a := p.goles_favor;  gol_b := p.goles_contra;
  elsif lado_dueno = 'b' then
    gol_a := p.goles_contra; gol_b := p.goles_favor;
  end if;

  return json_build_object(
    'id',       p.id,
    'fecha',    p.fecha,
    'hora',     p.hora,
    'lugar',    p.lugar,
    'cupo',     p.cupo,
    'abierto',  p.abierto,
    'cabezas',  cabezas,
    'faltan',   greatest(0, p.cupo - cabezas),
    'anfitrion', (select nombre from public.perfiles where id = p.user_id),
    'soy_anotado', mi.id is not null,
    'mi_nombre', mi.nombre,
    'mi_invitados', mi.invitados,
    'cancha_lat',    ca.lat,
    'cancha_lng',    ca.lng,
    'cancha_notas',  ca.notas,
    'equipos',    public.equipos_publicos(p.equipos),
    'costo',      p.costo,
    'por_cabeza', case when cabezas > 0 then round(p.costo / cabezas) else 0 end,
    'puso_nombre', (select nombre from public.jugadores where id = p.puso),
    'alias_pago', p.alias_pago,
    'jugado',        p.resultado is not null,
    'empate',        p.resultado = 'empate',
    'equipo_ganador', p.equipo_ganador,
    'goles_claros',  gol_a,
    'goles_oscuros', gol_b,
    'anotados', coalesce((
      select json_agg(json_build_object(
               'id', case when logueado then j.id else null end,
               'nombre', j.nombre,
               'invitados', j.invitados,
               'user_id', case when logueado then j.user_id else null end,
               'username', case when logueado then pf.username else null end,
               'avatar_url', case when logueado then pf.avatar_url else null end,
               'reclamable', logueado and j.user_id is null and j.claim is null
             ) order by j.orden, j.creado_en)
      from public.jugadores j
      left join public.perfiles pf on pf.id = j.user_id
      where j.partido_id = p.id
    ), '[]'::json)
  );
end;
$$;

revoke execute on function public.ver_partido_por_token(text) from public;
grant  execute on function public.ver_partido_por_token(text) to anon, authenticated;
