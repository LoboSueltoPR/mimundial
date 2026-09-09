-- Prueba funcional de los dos links, contra las funciones REALES.
-- Todo adentro de una transacción que termina en rollback: se ejerce
-- el camino de verdad y no queda una sola fila escrita.
--
-- El modo de falla que importa acá no es un error: es que los dos
-- links devuelvan el mismo lado, que se ve igual que "anduvo".
begin;

do $$
declare
  v_uid   uuid;
  v_pid   uuid;
  v_ta    text;
  v_tb    text;
  v_ja    json;
  v_jb    json;
  v_r     json;
  v_lado  text;
  v_n     int;
begin
  select id into v_uid from public.perfiles limit 1;

  insert into public.partidos (user_id, fecha, cupo, es_desafio, nombre_a, costo)
  values (v_uid, current_date, 10, true, 'PRUEBA A', 0)
  returning id, token, token_b into v_pid, v_ta, v_tb;

  if v_tb is null then
    raise exception 'FALLA 1: el trigger no le puso token_b al desafio';
  end if;
  if v_tb = v_ta then
    raise exception 'FALLA 2: los dos tokens son iguales';
  end if;

  -- ¿Cada link dice de qué lado es?
  v_ja := public.ver_partido_por_token(v_ta);
  v_jb := public.ver_partido_por_token(v_tb);
  if v_ja is null or v_jb is null then
    raise exception 'FALLA 3: algun link no resuelve';
  end if;
  if (v_ja->>'lado_link') <> 'a' then
    raise exception 'FALLA 4: el token principal dio lado %', v_ja->>'lado_link';
  end if;
  if (v_jb->>'lado_link') <> 'b' then
    raise exception 'FALLA 5: token_b dio lado %', v_jb->>'lado_link';
  end if;
  if (v_ja->>'cupo_lado')::int <> 5 then
    raise exception 'FALLA 6: cupo por lado dio % y no 5', v_ja->>'cupo_lado';
  end if;

  -- Anotarse por el link del rival tiene que caer en el lado 'b'.
  v_r := public.anotarse(v_tb, 'Rival Uno', 0, gen_random_uuid());
  if not (v_r->>'ok')::boolean then
    raise exception 'FALLA 7: no se pudo anotar por token_b: %', v_r->>'error';
  end if;
  select lado into v_lado from public.jugadores
  where partido_id = v_pid and nombre = 'Rival Uno';
  if v_lado is distinct from 'b' then
    raise exception 'FALLA 8: el que entro por token_b quedo en lado %', coalesce(v_lado,'NULL');
  end if;

  -- Y por el del anfitrión, en el 'a'.
  v_r := public.anotarse(v_ta, 'Local Uno', 0, gen_random_uuid());
  if not (v_r->>'ok')::boolean then
    raise exception 'FALLA 9: no se pudo anotar por el token principal: %', v_r->>'error';
  end if;
  select lado into v_lado from public.jugadores
  where partido_id = v_pid and nombre = 'Local Uno';
  if v_lado is distinct from 'a' then
    raise exception 'FALLA 10: el que entro por el token principal quedo en lado %', coalesce(v_lado,'NULL');
  end if;

  -- El jsonb equipos se tiene que haber rearmado solo.
  select jsonb_array_length(equipos->'b') into v_n from public.partidos where id = v_pid;
  if coalesce(v_n,0) <> 1 then
    raise exception 'FALLA 11: equipos.b tiene % cabezas y no 1', coalesce(v_n,-1);
  end if;

  -- El cupo se cuenta POR LADO: con 5 en el lado b, el sexto no entra
  -- pero el lado a tiene que seguir aceptando gente.
  for v_n in 2..5 loop
    v_r := public.anotarse(v_tb, 'Rival ' || v_n, 0, gen_random_uuid());
    if not (v_r->>'ok')::boolean then
      raise exception 'FALLA 12: el rival % no entro: %', v_n, v_r->>'error';
    end if;
  end loop;
  v_r := public.anotarse(v_tb, 'Rival Sexto', 0, gen_random_uuid());
  if (v_r->>'ok')::boolean then
    raise exception 'FALLA 13: entro un sexto en un lado de 5';
  end if;
  -- y el otro lado sigue con lugar
  v_r := public.anotarse(v_ta, 'Local Dos', 0, gen_random_uuid());
  if not (v_r->>'ok')::boolean then
    raise exception 'FALLA 14: el lado a se quedo sin lugar por culpa del b: %', v_r->>'error';
  end if;

  -- Un picadito no tiene que haber cambiado en nada.
  insert into public.partidos (user_id, fecha, cupo, costo)
  values (v_uid, current_date, 12, 0)
  returning id, token, token_b into v_pid, v_ta, v_tb;
  if v_tb is not null then
    raise exception 'FALLA 15: a un picadito le pusieron token_b';
  end if;
  v_r := public.anotarse(v_ta, 'Picadito Uno', 0, gen_random_uuid());
  if not (v_r->>'ok')::boolean then
    raise exception 'FALLA 16: se rompio el picadito: %', v_r->>'error';
  end if;
  select lado into v_lado from public.jugadores
  where partido_id = v_pid and nombre = 'Picadito Uno';
  if v_lado is not null then
    raise exception 'FALLA 17: un anotado de picadito quedo con lado %', v_lado;
  end if;

  raise notice 'PRUEBAS DE LOS DOS LINKS OK';
end $$;

-- ============================================================
--  Capitanía por link (0024)
--
--  `auth.uid()` se simula con `request.jwt.claims`, que es de donde lo
--  lee Supabase. Sin esto no hay forma de probar nada que dependa de
--  quién está logueado, que es justo lo que decide esta feature.
-- ============================================================
do $$
declare
  v_host  uuid;
  v_cap   uuid;
  v_otro  uuid;
  v_pid   uuid;
  v_tb    text;
  v_r     jsonb;
  v_j     json;
begin
  select id into v_host from public.perfiles order by id limit 1;
  select id into v_cap  from public.perfiles where id <> v_host order by id limit 1;
  select id into v_otro from public.perfiles where id not in (v_host, v_cap) order by id limit 1;
  if v_otro is null then
    raise exception 'FALLA 0: hacen falta 3 cuentas para probar esto';
  end if;

  -- La gracia es que el capitán llegue por link SIN ser amigo. Se
  -- rompe la amistad acá adentro para no depender de los datos reales
  -- (la transacción termina en rollback igual).
  delete from public.amigos
  where (user_id = v_cap and amigo_id = v_host) or (user_id = v_host and amigo_id = v_cap);

  insert into public.partidos (user_id, fecha, cupo, es_desafio, nombre_a, costo)
  values (v_host, current_date, 10, true, 'LOCAL', 0)
  returning id, token_b into v_pid, v_tb;

  -- Sin capitán, el link tiene que decir que busca uno.
  v_j := public.ver_partido_por_token(v_tb);
  if (v_j->>'busca_capitan')::boolean is not true then
    raise exception 'FALLA 20: el link del rival no dice que busca capitan';
  end if;

  -- Sin cuenta no se puede.
  perform set_config('request.jwt.claims', '', true);
  v_r := public.tomar_capitania(v_tb);
  if (v_r->>'ok')::boolean then
    raise exception 'FALLA 21: un anonimo se quedo con la capitania';
  end if;

  -- El anfitrión tampoco: ya es capitán del otro lado.
  perform set_config('request.jwt.claims', json_build_object('sub', v_host)::text, true);
  v_r := public.tomar_capitania(v_tb);
  if (v_r->>'ok')::boolean then
    raise exception 'FALLA 22: el anfitrion se quedo con los dos equipos';
  end if;

  -- El que tiene el link sí, aunque NO sea amigo del anfitrión.
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap)::text, true);
  v_r := public.tomar_capitania(v_tb);
  if not (v_r->>'ok')::boolean then
    raise exception 'FALLA 23: el del link no pudo ser capitan: %', v_r->>'error';
  end if;

  -- Y desde ahí maneja su lado. Esta es la aserción que prueba de
  -- punta a punta que la amistad dejó de hacer falta: si `mi_desafio`
  -- fallara, el capitán no tendría pantalla.
  v_r := public.mi_desafio(v_pid);
  if not (v_r->>'ok')::boolean then
    raise exception 'FALLA 24: mi_desafio le falla al capitan del link: %', v_r->>'error';
  end if;
  if (v_r->>'lado') <> 'b' then
    raise exception 'FALLA 25: el capitan del link quedo en lado %', v_r->>'lado';
  end if;
  if (v_r->>'mi_token') <> v_tb then
    raise exception 'FALLA 26: al capitan le dan el link equivocado';
  end if;

  -- Y lo ve en su lista aunque no sean amigos.
  if not exists (select 1 from public.desafios_para_mi() d where d.id = v_pid and d.rol = 'rival') then
    raise exception 'FALLA 27: el capitan del link no ve el desafio en su lista';
  end if;

  -- Ya tomada, el link deja de ofrecer la capitanía.
  v_j := public.ver_partido_por_token(v_tb);
  if (v_j->>'busca_capitan')::boolean is not false then
    raise exception 'FALLA 28: sigue ofreciendo capitania con capitan puesto';
  end if;

  -- Y un tercero no se la puede sacar.
  perform set_config('request.jwt.claims', json_build_object('sub', v_otro)::text, true);
  v_r := public.tomar_capitania(v_tb);
  if (v_r->>'ok')::boolean then
    raise exception 'FALLA 29: un tercero le robo la capitania al capitan';
  end if;

  -- Un desafío DIRIGIDO a alguien no se lo roba un tercero con el link.
  perform set_config('request.jwt.claims', json_build_object('sub', v_host)::text, true);
  insert into public.partidos (user_id, fecha, cupo, es_desafio, rival_id, costo)
  values (v_host, current_date, 10, true, v_cap, 0)
  returning id, token_b into v_pid, v_tb;
  v_j := public.ver_partido_por_token(v_tb);
  if (v_j->>'busca_capitan')::boolean is not false then
    raise exception 'FALLA 30: un desafio dirigido se ofrece como libre';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_otro)::text, true);
  v_r := public.tomar_capitania(v_tb);
  if (v_r->>'ok')::boolean then
    raise exception 'FALLA 31: un tercero tomo un desafio dirigido a otro';
  end if;
  -- pero el destinatario sí. Y no alcanza con que diga ok: hay que
  -- comprobar que quedó capitán DE VERDAD. La primera versión devolvía
  -- ok sin marcar la aceptación ni anotarlo, y esta aserción pasaba
  -- igual — un ok no es una capitanía.
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap)::text, true);
  v_r := public.tomar_capitania(v_tb);
  if not (v_r->>'ok')::boolean then
    raise exception 'FALLA 32: el destinatario no pudo tomar su propio desafio: %', v_r->>'error';
  end if;
  if not exists (
    select 1 from public.partidos
    where id = v_pid and rival_id = v_cap and rival_acepto_en is not null
  ) then
    raise exception 'FALLA 33: dijo ok pero no quedo aceptado';
  end if;
  if not exists (
    select 1 from public.jugadores
    where partido_id = v_pid and user_id = v_cap and lado = 'b'
  ) then
    raise exception 'FALLA 34: dijo ok pero no lo anoto de su lado';
  end if;
  v_r := public.mi_desafio(v_pid);
  if not (v_r->>'ok')::boolean or (v_r->>'lado') <> 'b' then
    raise exception 'FALLA 35: el destinatario no puede manejar su lado';
  end if;
  -- Y ahora sí, volver a tocarlo es idempotente.
  v_r := public.tomar_capitania(v_tb);
  if not (v_r->>'ok')::boolean or (v_r->>'ya_eras')::boolean is not true then
    raise exception 'FALLA 36: volver a tomar la capitania propia no es idempotente';
  end if;

  perform set_config('request.jwt.claims', '', true);
  raise notice 'PRUEBAS DE CAPITANIA OK';
end $$;

rollback;
