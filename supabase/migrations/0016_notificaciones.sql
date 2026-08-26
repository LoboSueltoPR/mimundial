-- ============================================================
--  MiMundial 0016 — notificaciones push
--
--  Dos avisos, que son los que pidió Alejo:
--    · al ANFITRIÓN, cada vez que alguien se anota;
--    · a TODOS los anotados, cuando el partido se completa.
--
--  ── Por qué la base dispara sola ──────────────────────────
--
--  El que se anota por el link puede no tener cuenta, así que no hay JWT
--  con el cual autorizar nada, y una RPC ejecutable por `anon` que
--  devuelva endpoints de push sería un surtidor: cualquiera con la anon
--  key se lleva las suscripciones de todos. Y hacer que el navegador
--  avise después de anotarse es confiar en el cliente para algo que
--  tiene que pasar sí o sí.
--
--  Entonces: un trigger sobre `jugadores` arma el aviso y lo manda por
--  `pg_net` a una ruta de la app. Las tres consecuencias buenas:
--
--    1. La app NO necesita la service_role key. La base le manda todo
--       masticado y la ruta solo firma y despacha. Ver el `.env.example`:
--       "NUNCA pongas acá la service_role key" — sigue valiendo.
--    2. El "ya avisé que está completo" se marca DENTRO de la misma
--       transacción que lee el cupo, así que no hay carrera: si se llena,
--       se vacía y se vuelve a llenar, avisa una sola vez.
--    3. Ningún endpoint de push sale nunca hacia un navegador.
--
--  ── Lo que hay que cargar a mano (no va en el repo) ───────
--
--  Dos secretos en Supabase Vault, con estos nombres exactos:
--    · `push_url`     — https://<la-app>/api/push
--    · `push_secreto` — el mismo valor que PUSH_SECRETO en Vercel
-- ============================================================

-- pg_net se instala donde quiera, pero sus funciones viven siempre en
-- el esquema `net`. De ahi el `net.http_post` calificado mas abajo.
create extension if not exists pg_net;

/* ------------------------------------------------------------
   1. Las suscripciones.

      `user_id` para el que tiene cuenta, `claim` para el que se
      anotó por el link sin registrarse: son las dos identidades
      que ya maneja la app (ver 0002 y 0005).

      El endpoint es la clave natural — el navegador devuelve
      siempre el mismo mientras no se revoque la suscripción — así
      que reinstalar la app no duplica filas.

      RLS prendida y CERO políticas: nadie llega por PostgREST.
      Solo entran y salen datos por las funciones de abajo.
   ------------------------------------------------------------ */
create table if not exists public.suscripciones_push (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid references auth.users(id) on delete cascade,
  claim     uuid,
  endpoint  text not null unique,
  p256dh    text not null,
  auth      text not null,
  creado_en timestamptz not null default now()
);

create index if not exists suscripciones_user_idx
  on public.suscripciones_push (user_id) where user_id is not null;
create index if not exists suscripciones_claim_idx
  on public.suscripciones_push (claim) where claim is not null;

alter table public.suscripciones_push enable row level security;
revoke all on public.suscripciones_push from anon, authenticated;

/* Para no volver a avisar que el partido se completó. */
alter table public.partidos
  add column if not exists aviso_completo_en timestamptz;

/* ------------------------------------------------------------
   2. Prender y apagar las notificaciones.

      Se guarda lo que devuelve el navegador tal cual. `p_claim`
      es para el que no tiene cuenta: sin eso no habría forma de
      saber a qué anotado corresponde esa suscripción.
   ------------------------------------------------------------ */
create or replace function public.suscribirme_push(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text,
  p_claim    uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(btrim(p_endpoint), '') = '' or coalesce(btrim(p_p256dh), '') = ''
     or coalesce(btrim(p_auth), '') = '' then
    return json_build_object('ok', false, 'error', 'Suscripción incompleta.');
  end if;

  -- Sin cuenta y sin claim no hay a quién avisarle: no se guarda basura.
  if auth.uid() is null and p_claim is null then
    return json_build_object('ok', false, 'error', 'No se sabe quién sos.');
  end if;

  insert into public.suscripciones_push (user_id, claim, endpoint, p256dh, auth)
  values (auth.uid(), p_claim, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = coalesce(excluded.user_id, public.suscripciones_push.user_id),
        claim   = coalesce(excluded.claim,   public.suscripciones_push.claim),
        p256dh  = excluded.p256dh,
        auth    = excluded.auth;

  return json_build_object('ok', true);
end;
$$;

create or replace function public.desuscribirme_push(p_endpoint text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.suscripciones_push where endpoint = p_endpoint;
  return json_build_object('ok', true);
end;
$$;

revoke execute on function public.suscribirme_push(text, text, text, uuid) from public;
revoke execute on function public.desuscribirme_push(text) from public;
grant  execute on function public.suscribirme_push(text, text, text, uuid) to anon, authenticated;
grant  execute on function public.desuscribirme_push(text) to anon, authenticated;

/* ------------------------------------------------------------
   3. El despachador: junta destinatarios y se los manda a la ruta.

      Nunca devuelve nada al cliente — es interna, la llama el
      trigger. Si no hay secretos cargados en el Vault, no hace
      nada y no rompe: la app tiene que seguir andando sin push.
   ------------------------------------------------------------ */
create or replace function public.mandar_push(
  p_destinos uuid[],      -- cuentas
  p_claims   uuid[],      -- navegadores sin cuenta
  p_titulo   text,
  p_cuerpo   text,
  p_url      text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  url     text;
  secreto text;
  avisos  jsonb;
begin
  select decrypted_secret into url     from vault.decrypted_secrets where name = 'push_url';
  select decrypted_secret into secreto from vault.decrypted_secrets where name = 'push_secreto';
  if url is null or secreto is null then
    return;   -- todavía no configurado: la app anda igual, sin avisos
  end if;

  select jsonb_agg(jsonb_build_object(
           'endpoint', s.endpoint,
           'p256dh',   s.p256dh,
           'auth',     s.auth,
           'titulo',   p_titulo,
           'cuerpo',   p_cuerpo,
           'url',      p_url
         ))
    into avisos
  from public.suscripciones_push s
  where (s.user_id = any(p_destinos)) or (s.claim = any(p_claims));

  if avisos is null then
    return;   -- nadie prendió las notificaciones todavía
  end if;

  perform net.http_post(
    url     := url,
    body    := jsonb_build_object('avisos', avisos),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-push-secreto', secreto
               )
  );
end;
$$;

revoke execute on function public.mandar_push(uuid[], uuid[], text, text, text) from public;
revoke execute on function public.mandar_push(uuid[], uuid[], text, text, text) from anon, authenticated;

/* ------------------------------------------------------------
   4. El trigger: alguien se anotó.

      Dos avisos posibles en el mismo disparo:
        · al anfitrión, siempre;
        · a todos, si con esta anotación se completó el cupo.

      El segundo se marca con `aviso_completo_en` en la misma
      transacción, con un update condicional: si dos se anotan a la
      vez, uno solo se lleva la fila y el otro no manda nada.
   ------------------------------------------------------------ */
create or replace function public.avisar_anotado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p         public.partidos%rowtype;
  cabezas   int;
  cuantos   int;
  destinos  uuid[];
  claims    uuid[];
  marcado   boolean := false;
begin
  select * into p from public.partidos where id = new.partido_id;
  if not found then
    return new;
  end if;

  select coalesce(sum(1 + invitados), 0), count(*)
    into cabezas, cuantos
  from public.jugadores where partido_id = p.id;

  -- ── al anfitrión ──
  -- Solo cuando alguien SE ANOTA SOLO por el link. Cuando el anfitrión
  -- carga gente a mano desde su pantalla ya sabe lo que hizo: avisarle de
  -- su propio toque seria ruido. `se_anoto_solo` es justo esa distincion
  -- y existe desde 0002.
  if new.se_anoto_solo and new.user_id is distinct from p.user_id then
    perform public.mandar_push(
      array[p.user_id],
      array[]::uuid[],
      'Se anotó ' || new.nombre,
      case
        when cabezas >= p.cupo then 'Ya son ' || cabezas || '. Está completo.'
        else 'Van ' || cabezas || ' de ' || p.cupo || ' · faltan ' || (p.cupo - cabezas)
      end,
      '/partidos/' || p.id
    );
  end if;

  -- ── a todos, una sola vez ──
  if cabezas >= p.cupo and p.aviso_completo_en is null then
    update public.partidos
       set aviso_completo_en = now()
     where id = p.id and aviso_completo_en is null;
    get diagnostics cuantos = row_count;
    marcado := cuantos > 0;
  end if;

  if marcado then
    select coalesce(array_agg(distinct j.user_id) filter (where j.user_id is not null), array[]::uuid[]),
           coalesce(array_agg(distinct j.claim)   filter (where j.claim   is not null), array[]::uuid[])
      into destinos, claims
    from public.jugadores j where j.partido_id = p.id;

    -- el anfitrión entra aunque no esté anotado como jugador
    destinos := destinos || p.user_id;

    perform public.mandar_push(
      destinos,
      claims,
      'Se juega',
      coalesce(p.lugar, 'El partido') ||
        case when p.hora is not null then ' · ' || p.hora else '' end ||
        ' — somos ' || cabezas || '. Está confirmado.',
      '/p/' || p.token
    );
  end if;

  return new;
end;
$$;

drop trigger if exists jugadores_avisar on public.jugadores;
create trigger jugadores_avisar
  after insert on public.jugadores
  for each row execute function public.avisar_anotado();

revoke execute on function public.avisar_anotado() from public;
revoke execute on function public.avisar_anotado() from anon, authenticated;
