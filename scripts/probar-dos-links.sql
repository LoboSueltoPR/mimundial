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

  raise notice 'TODAS LAS PRUEBAS OK';
end $$;

rollback;
