'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearCliente } from '@/lib/supabase/client';
import type { AmigoCamino, Partido } from '@/lib/tipos';
import {
  CAMINO,
  GRUPOS,
  INSTANCIAS,
  LLAVES,
  PARA_PASAR,
  calcularCamino,
  faltanParaLaCopa,
  faltanParaPasar,
  frase,
} from '@/lib/camino';
import { color, fechaLarga, iniciales } from '@/lib/calculos';
import { Copita } from '@/components/Copa';
import { MarcaEmpate, MarcaPerdio, MarcaTilde } from '@/components/Marcas';

export default function Camino() {
  const [partidos, setPartidos] = useState<Partido[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amigos, setAmigos] = useState<AmigoCamino[]>([]);
  const [cerrando, setCerrando] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = crearCliente();
      const { data, error } = await supabase.from('partidos').select('*');
      if (error) {
        setError(error.message);
        setPartidos([]);
        return;
      }
      setPartidos((data ?? []) as Partido[]);
    })();
    (async () => {
      const supabase = crearCliente();
      const { data } = await supabase.rpc('camino_de_amigos');
      setAmigos((data ?? []) as AmigoCamino[]);
    })();
  }, []);

  if (error)
    return (
      <div style={{ paddingTop: 18 }}>
        <div className="msg err">{error}</div>
      </div>
    );
  if (!partidos) return <div className="cargando">Cargando…</div>;

  const e = calcularCamino(partidos);
  const enFinal = e.etapa === INSTANCIAS - 1;
  const faltan = faltanParaLaCopa(e);
  const paraPasar = faltanParaPasar(e);

  /* Marcar el último jugado como el cierre: el próximo resultado que cargues
     ya cuenta como la 1ª fecha de un mundial nuevo. */
  const cerrarMundial = async () => {
    const id = e.cerrarDesde;
    if (!id) return;
    setCerrando(true);
    const supabase = crearCliente();
    const { error } = await supabase
      .from('partidos')
      .update({ cierra_mundial: true })
      .eq('id', id);
    setCerrando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setPartidos((ps) =>
      (ps ?? []).map((p) => (p.id === id ? { ...p, cierra_mundial: true } : p)),
    );
  };

  return (
    <div style={{ paddingTop: 16 }}>
      {/* ---------- la cabecera: dónde estás y cuánto falta ---------- */}
      <div className={`copaBox ${enFinal ? 'ardiendo' : ''}`}>
        <div className="copaBox-eyebrow">
          <span>Mundial #{e.mundial}</span>
          <span>
            {e.copas === 0 ? 'Sin copas' : `${e.copas} copa${e.copas > 1 ? 's' : ''}`}
          </span>
        </div>

        <div className="copaBox-fase">{e.proxima.nombre}</div>
        <div className="copaBox-frase">{frase(e)}</div>

        {/* Los siete casilleros: la firma. Los tres primeros son los de
            grupos y se marcan con lo que haya salido; de octavos para
            arriba solo se tildan ganando. El último es la copa. */}
        <div
          className="casilleros"
          role="img"
          aria-label={`${e.etapa} de ${INSTANCIAS} instancias superadas`}
        >
          {CAMINO.map((inst, i) => {
            const res = e.actual[i];
            const premio = i === INSTANCIAS - 1;
            const clase =
              res === 'ganamos'
                ? 'ganada'
                : res === 'empate'
                  ? 'empatada'
                  : res === 'perdimos'
                    ? 'perdida'
                    : '';
            return (
              <span
                key={inst.id}
                className={`casillero ${clase} ${i === e.etapa ? 'actual' : ''} ${
                  premio ? 'premio' : ''
                }`}
                title={inst.nombre}
              >
                {res === 'ganamos' ? (
                  <MarcaTilde tam={15} />
                ) : res === 'empate' ? (
                  <MarcaEmpate tam={15} />
                ) : res === 'perdimos' ? (
                  <MarcaPerdio tam={15} />
                ) : premio ? (
                  <Copita tam={13} />
                ) : null}
              </span>
            );
          })}
        </div>

        <div className="copaBox-pie">
          {e.enGrupos ? (
            <>
              <b>{e.puntos}</b> punto{e.puntos === 1 ? '' : 's'}
              <span className="sep">·</span>
              {paraPasar === 0 ? (
                <>pase asegurado</>
              ) : (
                <>
                  faltan <b>{paraPasar}</b> para pasar
                </>
              )}
            </>
          ) : (
            <>
              <b>{e.etapa - GRUPOS}</b> de {LLAVES} llaves
              <span className="sep">·</span>
              faltan <b>{faltan}</b> para la copa
            </>
          )}
        </div>
      </div>

      {/* ---------- bajarse cuando ya no dan los números ---------- */}
      {e.liquidado && e.cerrarDesde && (
        <div className="card cerrarBox">
          <b>Ya no llegás a {PARA_PASAR} puntos.</b>
          <p>
            Podés jugar {GRUPOS - e.jugadosGrupo === 1 ? 'la última' : 'las que quedan'} igual, o
            dar el mundial por terminado acá y que el próximo partido arranque uno nuevo.
          </p>
          <button className="btn wide" onClick={cerrarMundial} disabled={cerrando}>
            {cerrando ? 'Cerrando…' : 'Dar por terminado este mundial'}
          </button>
        </div>
      )}

      {/* ---------- el mapa de lo que viene ---------- */}
      <div className="sec">El camino</div>
      <div className="card">
        <ol className="ruta">
          {CAMINO.map((inst, i) => {
            const estado = i < e.etapa ? 'pasada' : i === e.etapa ? 'actual' : 'pendiente';
            const esGrupo = i < GRUPOS;
            return (
              <li key={inst.id} className={`ruta-paso ${estado}`}>
                <span className="ruta-punto">
                  {estado === 'pasada' ? <MarcaTilde tam={14} /> : i + 1}
                </span>
                <span className="ruta-txt">
                  <b>{inst.nombre}</b>
                  <small>
                    {estado === 'pasada'
                      ? esGrupo
                        ? 'jugada'
                        : 'superada'
                      : estado === 'actual'
                        ? 'te toca ahora'
                        : esGrupo
                          ? 'se juega igual'
                          : `a ${i - e.etapa} triunfo${i - e.etapa > 1 ? 's' : ''}`}
                  </small>
                </span>
              </li>
            );
          })}
          <li className="ruta-paso copa pendiente">
            <span className="ruta-punto">
              <Copita tam={13} />
            </span>
            <span className="ruta-txt">
              <b>Campeón del mundo</b>
              <small>
                {e.enGrupos
                  ? `primero hay que pasar de fase`
                  : `${faltan} triunfo${faltan > 1 ? 's' : ''} y la levantás`}
              </small>
            </span>
          </li>
        </ol>
      </div>

      {/* ---------- la vitrina ---------- */}
      {e.copas > 0 && (
        <>
          <div className="sec">La vitrina</div>
          <div className="vitrina">
            {Array.from({ length: e.copas }).map((_, i) => (
              <span key={i} className="trofeo" title={`Mundial ${i + 1}`}>
                <Copita tam={24} />
              </span>
            ))}
          </div>
          <div className="nota">
            {e.copas === 1 ? 'Una copa' : `${e.copas} copas`} desde que arrancaste. Cada una son{' '}
            {GRUPOS} fechas de grupos y {LLAVES} triunfos de llave.
          </div>
        </>
      )}

      {/* ---------- en qué anda el resto ---------- */}
      {amigos.length > 0 && (
        <>
          <div className="sec">Tus amigos</div>
          <div className="card">
            {amigos.map((am) => {
              const ea = calcularCamino(am.partidos);
              return (
                <div className="item" key={am.id} style={{ cursor: 'default' }}>
                  <span className="av" style={{ background: color(am.nombre) }}>
                    {iniciales(am.nombre)}
                  </span>
                  <span className="info">
                    <b>{am.nombre}</b>
                    <small>
                      {ea.copas > 0 ? `${ea.copas} copa${ea.copas > 1 ? 's' : ''} · ` : ''}
                      {ea.enGrupos
                        ? `${ea.puntos} pt${ea.puntos === 1 ? '' : 's'} en grupos`
                        : `${ea.etapa - GRUPOS} de ${LLAVES} llaves`}
                    </small>
                  </span>
                  <span className="estado-pill emp">{ea.proxima.corto}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ---------- historial ---------- */}
      <div className="sec">Cómo llegaste hasta acá</div>
      {e.historial.length === 0 ? (
        <div className="card">
          <div className="vacio">
            Cargá el resultado de un partido y empieza el camino.
            <br />
            <Link href="/partidos" style={{ color: 'var(--acento)', fontWeight: 600 }}>
              Ir a tus partidos
            </Link>
          </div>
        </div>
      ) : (
        <div className="card">
          {e.historial.slice(0, 20).map((h) => (
            <Link href={`/partidos/${h.partidoId}`} key={h.partidoId} className="paso">
              <span className={`paso-res ${h.resultado}`}>
                {h.resultado === 'ganamos' ? 'G' : h.resultado === 'empate' ? 'E' : 'P'}
              </span>
              <span className="paso-info">
                <b>
                  {h.instancia.nombre}
                  {h.copa && <span className="chip copaChip">campeón</span>}
                  {h.eliminado && <span className="chip afueraChip">afuera</span>}
                </b>
                <small>
                  {fechaLarga(h.fecha)}
                  {h.lugar ? ' · ' + h.lugar : ''}
                </small>
              </span>
              <span className="paso-flecha">
                {h.eliminado ? '↺' : h.resultado === 'ganamos' ? '↑' : '→'}
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="nota">
        Los {GRUPOS} de grupos se juegan igual: ganar suma 3, empatar 1, perder 0. Con{' '}
        <b>{PARA_PASAR} puntos o más pasás</b> a octavos — ahí sí, perdés y volvés a cero con
        mundial nuevo. El empate en llave te deja donde estabas.
      </div>
    </div>
  );
}
