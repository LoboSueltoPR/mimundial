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
  type Hito,
  type Visto,
  calcularCamino,
  faltanParaLaCopa,
  faltanParaPasar,
  frase,
  hito,
  vistoDe,
} from '@/lib/camino';
import { fechaLarga } from '@/lib/calculos';
import { Copita } from '@/components/Copa';
import { MarcaEmpate, MarcaPerdio, MarcaTilde } from '@/components/Marcas';
import Avatar from '@/components/Avatar';
import PerfilModal from '@/components/PerfilModal';
import { conApodo } from '@/lib/nombre';

/* Dónde estaba el camino la última vez que lo miraste desde este
   navegador. Es solo para saber cuándo avisar que avanzaste: si el dato
   no está o está roto, la app anda igual, simplemente no hay cartel. */
const VISTO = 'mimundial.camino-visto';

function leerVisto(): Visto | null {
  try {
    const crudo = localStorage.getItem(VISTO);
    return crudo ? (JSON.parse(crudo) as Visto) : null;
  } catch {
    return null;
  }
}

function guardarVisto(v: Visto) {
  try {
    localStorage.setItem(VISTO, JSON.stringify(v));
  } catch {
    /* modo incógnito o storage lleno: no pasa nada */
  }
}

export default function Camino() {
  const [partidos, setPartidos] = useState<Partido[] | null>(null);
  /** Cuáles del camino organizaste vos: son los únicos que podés cerrar. */
  const [mios, setMios] = useState<Set<string>>(new Set());
  const [cartel, setCartel] = useState<Hito | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amigos, setAmigos] = useState<AmigoCamino[]>([]);
  const [cerrando, setCerrando] = useState(false);
  const [perfilAbierto, setPerfilAbierto] = useState<{ id: string; nombre: string } | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = crearCliente();
      /* Dos fuentes: los partidos que organizaste vos (tabla, con su
         RLS) y los ajenos que jugaste, que llegan por RPC ya dados
         vuelta a tu punto de vista. Sin los segundos, ganar en el
         equipo de otro no te movía el camino. */
      const [{ data, error }, { data: ajenos }] = await Promise.all([
        supabase.from('partidos').select('*'),
        supabase.rpc('mis_resultados_ajenos'),
      ]);
      if (error) {
        setError(error.message);
        setPartidos([]);
        return;
      }
      setMios(new Set(((data ?? []) as Partido[]).map((x) => x.id)));
      const ps = [...((data ?? []) as Partido[]), ...((ajenos ?? []) as Partido[])];
      setPartidos(ps);

      // ¿Avanzaste desde la última vez? El cartel se guarda como visto
      // recién cuando lo cerrás, así un refresh no se lo lleva puesto.
      const e = calcularCamino(ps);
      const nuevo = hito(leerVisto(), e);
      setCartel(nuevo);
      if (!nuevo) guardarVisto(vistoDe(e));
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

  /* Los siete pasos, siempre los siete. Antes se plegaba lo que quedaba
     lejos con la idea de no mostrar relleno entre vos y la copa, pero el
     camino completo ES la pantalla: ver que faltan cuatro llaves después
     de grupos es la información, no el ruido. Se muestra entero. */
  const visibles = CAMINO;

  const cerrarCartel = () => {
    guardarVisto(vistoDe(e));
    setCartel(null);
  };

  return (
    <div style={{ paddingTop: 16 }}>
      {/* ---------- pasaste de fase ---------- */}
      {cartel && (
        <div className={`hito ${cartel.copa ? 'esCopa' : ''}`} role="status">
          <span className="hito-copa">
            <Copita tam={26} />
          </span>
          <span className="hito-txt">
            <b>{cartel.titulo}</b>
            <small>{cartel.bajada}</small>
          </span>
          <button className="hito-x" onClick={cerrarCartel} aria-label="Cerrar">
            ×
          </button>
        </div>
      )}

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
          {/* El cierre se marca sobre el último partido jugado, y eso solo
              se puede hacer en uno tuyo: el de otro no es tuyo para tocar. */}
          {mios.has(e.cerrarDesde) ? (
            <button className="btn wide" onClick={cerrarMundial} disabled={cerrando}>
              {cerrando ? 'Cerrando…' : 'Dar por terminado este mundial'}
            </button>
          ) : (
            <p>
              El último que jugaste lo organizó otro, así que no se puede cerrar desde acá. Cargá
              un partido tuyo y lo cerrás ahí.
            </p>
          )}
        </div>
      )}

      {/* ---------- el mapa de lo que viene ---------- */}
      <div className="sec">El camino</div>
      <div className="card">
        <ol className="ruta">
          {visibles.map((inst, i) => {
            const estado = i < e.etapa ? 'pasada' : i === e.etapa ? 'actual' : 'pendiente';
            // Una fecha de grupos perdida también está "pasada": el punto
            // lleva la marca del resultado, como los casilleros de arriba,
            // porque un tilde para todo diría que ganaste las tres.
            const res = estado === 'pasada' ? e.actual[i] : null;
            return (
              <li key={inst.id} className={`ruta-paso ${estado}`}>
                <span className={`ruta-punto ${res ? 'r-' + res : ''}`}>
                  {res === 'ganamos' ? (
                    <MarcaTilde tam={14} />
                  ) : res === 'empate' ? (
                    <MarcaEmpate tam={14} />
                  ) : res === 'perdimos' ? (
                    <MarcaPerdio tam={14} />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="ruta-txt">
                  <b>{inst.nombre}</b>
                  {/* Un solo renglón chico en toda la lista: el de dónde
                      estás parado. La cuenta para la copa ya la lleva la
                      cabecera; repetirla paso por paso era ruido. */}
                  {estado === 'actual' && <small>te toca ahora</small>}
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
                <div
                  className="item"
                  key={am.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setPerfilAbierto({ id: am.id, nombre: am.nombre })}
                >
                  <Avatar nombre={am.nombre} url={am.avatar_url} />
                  <span className="info">
                    <b>{conApodo(am.nombre, am.apodo)}</b>
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

      {perfilAbierto && (
        <PerfilModal
          userId={perfilAbierto.id}
          nombreFallback={perfilAbierto.nombre}
          estado="amigo"
          procesando={false}
          onEnviarSolicitud={() => {}}
          onCerrar={() => setPerfilAbierto(null)}
        />
      )}
    </div>
  );
}
