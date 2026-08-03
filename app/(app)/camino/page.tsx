'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearCliente } from '@/lib/supabase/client';
import type { Partido } from '@/lib/tipos';
import {
  CAMINO,
  PARA_LA_COPA,
  calcularCamino,
  faltanParaLaCopa,
  frase,
} from '@/lib/camino';
import { fechaLarga } from '@/lib/calculos';

export default function Camino() {
  const [partidos, setPartidos] = useState<Partido[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

  if (error)
    return (
      <div style={{ paddingTop: 18 }}>
        <div className="msg err">{error}</div>
      </div>
    );
  if (!partidos) return <div className="cargando">Cargando…</div>;

  const e = calcularCamino(partidos);
  const enFinal = e.triunfos === CAMINO.length - 1;

  return (
    <div style={{ paddingTop: 18 }}>
      {/* ---------- cabecera ---------- */}
      <div className={`copaBox ${enFinal ? 'ardiendo' : ''}`}>
        <div className="copaBox-glow" />
        <div className="copaBox-ico">{e.proxima.icono}</div>
        <div className="copaBox-fase">{e.proxima.nombre}</div>
        <div className="copaBox-frase">{frase(e)}</div>

        <div className="copaBox-pie">
          <div>
            <b>{e.triunfos}</b>
            <span>al hilo</span>
          </div>
          <div>
            <b>{faltanParaLaCopa(e)}</b>
            <span>para la copa</span>
          </div>
          <div>
            <b>{e.copas} 🏆</b>
            <span>{e.copas === 1 ? 'copa' : 'copas'}</span>
          </div>
        </div>
      </div>

      {/* ---------- el camino ---------- */}
      <div className="sec">Mundial #{e.mundial}</div>
      <div className="card">
        <ol className="ruta">
          {CAMINO.map((inst, i) => {
            const estado =
              i < e.triunfos ? 'pasada' : i === e.triunfos ? 'actual' : 'pendiente';
            return (
              <li key={inst.id} className={`ruta-paso ${estado}`}>
                <span className="ruta-linea" />
                <span className="ruta-punto">{estado === 'pasada' ? '✓' : ''}</span>
                <span className="ruta-txt">
                  <b>{inst.nombre}</b>
                  <small>
                    {estado === 'pasada'
                      ? 'superada'
                      : estado === 'actual'
                        ? 'te toca ahora'
                        : `a ${i - e.triunfos} triunfo${i - e.triunfos > 1 ? 's' : ''}`}
                  </small>
                </span>
              </li>
            );
          })}
          <li className={`ruta-paso copa ${e.triunfos >= PARA_LA_COPA ? 'pasada' : 'pendiente'}`}>
            <span className="ruta-linea" />
            <span className="ruta-punto">🏆</span>
            <span className="ruta-txt">
              <b>Campeón del mundo</b>
              <small>
                {faltanParaLaCopa(e)} triunfo{faltanParaLaCopa(e) > 1 ? 's' : ''} y la levantás
              </small>
            </span>
          </li>
        </ol>
      </div>

      {e.copas > 0 && (
        <>
          <div className="sec">La vitrina</div>
          <div className="vitrina">
            {Array.from({ length: e.copas }).map((_, i) => (
              <span key={i} className="trofeo" title={`Mundial ${i + 1}`}>
                🏆
              </span>
            ))}
          </div>
          <div className="nota">
            {e.copas === 1 ? 'Una copa' : `${e.copas} copas`} desde que arrancaste. Cada una son{' '}
            {PARA_LA_COPA} triunfos seguidos.
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
            <Link href="/partidos" style={{ color: 'var(--acento)' }}>
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
                  {h.copa && <span className="chip copaChip">🏆 campeón</span>}
                </b>
                <small>
                  {fechaLarga(h.fecha)}
                  {h.lugar ? ' · ' + h.lugar : ''}
                </small>
              </span>
              <span className="paso-flecha">
                {h.resultado === 'ganamos' ? '↑' : h.resultado === 'perdimos' ? '↺' : '→'}
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="nota">
        Ganás y avanzás. Empatás y te quedás donde estabas. <b>Perdés y volvés a cero</b>, con
        mundial nuevo.
      </div>
    </div>
  );
}
