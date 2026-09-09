'use client';

import { useCallback, useEffect, useState } from 'react';
import { crearCliente } from '@/lib/supabase/client';
import type { Amigo, MiDesafio, RespuestaRPC } from '@/lib/tipos';
import { color, fechaCorta, iniciales, nombreDeLado, porLado } from '@/lib/calculos';
import Avatar from '@/components/Avatar';
import Cruce from '@/components/Cruce';

/**
 * ARMAR MI LADO — la hoja donde un capitán junta a los suyos.
 *
 * La misma pantalla para los dos capitanes. El lado no se elige acá:
 * lo deduce el servidor de quién llama (`mi_lado_capitan`). Un solo
 * camino de código para los dos lados es lo que evita que se arregle
 * una mitad y quede la otra contando distinto, que en este proyecto
 * ya pasó tres veces con el camino.
 *
 * Va como hoja y no como pantalla propia porque el trabajo del rival
 * es corto y de una sola cosa: elegir cinco nombres. Una ruta nueva
 * con pestañas de plata y resultado sería prometerle un tablero que
 * no le corresponde — el partido lo administra el que lo armó.
 */
export default function ArmarEquipo({
  partidoId,
  onCerrar,
  onListo,
}: {
  partidoId: string;
  onCerrar: () => void;
  /** Se llama al cerrar si hubo algún cambio, para refrescar la lista. */
  onListo: () => void;
}) {
  const [d, setD] = useState<MiDesafio | null>(null);
  const [amigos, setAmigos] = useState<Amigo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [equipo, setEquipo] = useState('');
  const [hubo, setHubo] = useState(false);

  const cargar = useCallback(async () => {
    const supabase = crearCliente();
    const { data, error: e } = await supabase.rpc('mi_desafio', { p_partido_id: partidoId });
    setCargando(false);
    if (e) {
      setError(e.message);
      return;
    }
    const r = data as (MiDesafio & { error?: string }) | null;
    if (!r?.ok) {
      setError(r?.error || 'No se pudo abrir el desafío.');
      return;
    }
    setD(r);
    setEquipo(r.mi_nombre_equipo || '');
  }, [partidoId]);

  useEffect(() => {
    cargar();
    crearCliente()
      .rpc('mis_amigos')
      .then(({ data }) => setAmigos((data ?? []) as Amigo[]));
  }, [cargar]);

  /** Toda mutación pasa por acá: una sola forma de leer el `{ok,error}`. */
  async function llamar(fn: string, args: Record<string, unknown>) {
    setEnviando(true);
    setError(null);
    const { data, error: e } = await crearCliente().rpc(fn, args);
    setEnviando(false);
    const r = data as RespuestaRPC | null;
    if (e || !r?.ok) {
      setError(e?.message || r?.error || 'No se pudo guardar.');
      return false;
    }
    setHubo(true);
    await cargar();
    return true;
  }

  async function sumar(quien: string, userId?: string | null) {
    const limpio = quien.trim();
    if (!limpio) return;
    const ok = await llamar('sumar_a_mi_lado', {
      p_partido_id: partidoId,
      p_nombre: limpio,
      p_user_id: userId ?? null,
    });
    if (ok) setNombre('');
  }

  function cerrar() {
    if (hubo) onListo();
    onCerrar();
  }

  /* El nombre del equipo se guarda al salir del campo, no en cada
     tecla: es un update por letra que además no aporta nada. */
  async function guardarNombreEquipo() {
    if (!d || (equipo.trim() || null) === (d.mi_nombre_equipo || null)) return;
    await llamar('nombrar_mi_lado', { p_partido_id: partidoId, p_nombre: equipo });
  }

  const mios = d?.los_mios ?? [];
  const misCabezas = mios.reduce((a, j) => a + 1 + (j.invitados || 0), 0);
  const objetivo = d ? porLado(d.cupo) : 0;
  const faltan = Math.max(0, objetivo - misCabezas);
  const yaEstan = new Set(mios.map((j) => j.user_id).filter(Boolean));
  const disponibles = amigos.filter((a) => !yaEstan.has(a.id));
  const f = d ? fechaCorta(d.fecha) : null;

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <div className="sheet">
        <h2>Tu equipo</h2>

        {cargando && <div className="cargando">Cargando…</div>}

        {d && (
          <>
            <div className="nota" style={{ marginTop: 0, marginBottom: 11 }}>
              {f?.d} {f?.m}
              {d.hora ? ` · ${d.hora}` : ''}
              {d.lugar ? ` · ${d.lugar}` : ''}
            </div>

            {/* Tu lado siempre a la izquierda: la hoja es tuya. */}
            <Cruce
              nombreA={nombreDeLado(
                equipo || d.mi_nombre_equipo,
                d.lado === 'a' ? d.anfitrion : d.rival,
              )}
              nombreB={nombreDeLado(
                d.rival_nombre_equipo,
                d.lado === 'a' ? d.rival : d.anfitrion,
              )}
              cabezasA={misCabezas}
              cabezasB={d.cabezas_rival}
              porLado={objetivo}
              estado="aceptado"
            />

            <div className="sec">Cómo se llama tu equipo</div>
            <input
              value={equipo}
              onChange={(e) => setEquipo(e.target.value)}
              onBlur={guardarNombreEquipo}
              placeholder="Opcional"
              maxLength={28}
              disabled={enviando || d.jugado}
            />

            <div className="sec">
              Los tuyos
              <span className="act" style={{ cursor: 'default', color: 'var(--faint)' }}>
                {misCabezas} de {objetivo}
              </span>
            </div>
            <div className="card">
              {mios.length === 0 ? (
                <div className="vacio">
                  Todavía no sumaste a nadie.
                  <br />
                  Empezá por tus amigos, acá abajo.
                </div>
              ) : (
                (() => {
                  let n = 0;
                  return mios.map((j) => {
                    const inv = j.invitados || 0;
                    n++;
                    const etiqueta = inv > 0 ? `${n}–${n + inv}` : String(n);
                    n += inv;
                    return (
                      <div className="jug" key={j.id}>
                        <span className="num">{etiqueta}</span>
                        <Avatar nombre={j.nombre} url={j.avatar_url} />
                        <span className="nom">
                          <b>{j.nombre}</b>
                          {inv > 0 && (
                            <small>
                              +{inv} invitado{inv > 1 ? 's' : ''} · {1 + inv} lugares
                            </small>
                          )}
                        </span>
                        <span className="inv">
                          <button
                            onClick={() =>
                              llamar('invitados_de_mi_lado', {
                                p_partido_id: partidoId,
                                p_jugador_id: j.id,
                                p_invitados: Math.max(0, inv - 1),
                              })
                            }
                            disabled={inv === 0 || enviando || d.jugado}
                            aria-label={`Un invitado menos de ${j.nombre}`}
                          >
                            −
                          </button>
                          <span>+{inv}</span>
                          <button
                            onClick={() =>
                              llamar('invitados_de_mi_lado', {
                                p_partido_id: partidoId,
                                p_jugador_id: j.id,
                                p_invitados: inv + 1,
                              })
                            }
                            disabled={enviando || d.jugado}
                            aria-label={`Un invitado más de ${j.nombre}`}
                          >
                            +
                          </button>
                        </span>
                        <button
                          className="quitar"
                          onClick={() =>
                            llamar('quitar_de_mi_lado', {
                              p_partido_id: partidoId,
                              p_jugador_id: j.id,
                            })
                          }
                          disabled={enviando || d.jugado}
                          title={`Sacar a ${j.nombre}`}
                          aria-label={`Sacar a ${j.nombre}`}
                        >
                          ×
                        </button>
                      </div>
                    );
                  });
                })()
              )}
            </div>

            {faltan === 0 && mios.length > 0 && <div className="ladoListo">Equipo completo</div>}

            {!d.jugado && (
              <>
                {disponibles.length > 0 && (
                  <>
                    <div className="sec">Tus amigos</div>
                    <div className="chips">
                      {disponibles.map((a) => (
                        <button
                          key={a.id}
                          className="chipAmigo"
                          onClick={() => sumar(a.nombre, a.id)}
                          disabled={enviando}
                        >
                          <span className="mini" style={{ background: color(a.nombre) }}>
                            {iniciales(a.nombre)}
                          </span>
                          {a.nombre}
                          <b>+</b>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <div className="sec">Sumar a mano</div>
                <div className="row2">
                  <input
                    placeholder="Nombre"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    disabled={enviando}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') sumar(nombre);
                    }}
                  />
                  <button
                    className="btn pri"
                    style={{ flex: 'none', padding: '12px 20px' }}
                    onClick={() => sumar(nombre)}
                    disabled={enviando || !nombre.trim()}
                  >
                    {enviando ? '…' : 'Sumar'}
                  </button>
                </div>
                <div className="nota">
                  No hace falta que tengan cuenta. A los que sí la tienen, sumalos desde los chips:
                  así el resultado les cuenta en <b>su</b> camino.
                </div>
              </>
            )}
          </>
        )}

        {error && <div className="msg err">{error}</div>}

        <button className="btn wide" style={{ marginTop: 14 }} onClick={cerrar}>
          Listo
        </button>
      </div>
    </div>
  );
}
