'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearCliente } from '@/lib/supabase/client';
import type { AmigoCamino, Partido } from '@/lib/tipos';
import {
  CAMINO,
  PARA_LA_COPA,
  calcularCamino,
  faltanParaLaCopa,
  frase,
} from '@/lib/camino';
import { color, fechaLarga, iniciales } from '@/lib/calculos';
import { Copita } from '@/components/Copa';
import { MarcaTilde } from '@/components/Marcas';

export default function Camino() {
  const [partidos, setPartidos] = useState<Partido[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amigos, setAmigos] = useState<AmigoCamino[]>([]);

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
  const enFinal = e.triunfos === CAMINO.length - 1;
  const faltan = faltanParaLaCopa(e);

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

        {/* Los siete casilleros: la firma. Uno por triunfo, el último
            es la copa. Tildás siete al hilo y la levantás. */}
        <div className="casilleros" role="img" aria-label={`${e.triunfos} de ${PARA_LA_COPA} triunfos`}>
          {CAMINO.map((inst, i) => {
            const ganada = i < e.triunfos;
            const premio = i === CAMINO.length - 1;
            return (
              <span
                key={inst.id}
                className={`casillero ${ganada ? 'ganada' : ''} ${
                  i === e.triunfos ? 'actual' : ''
                } ${premio ? 'premio' : ''}`}
                title={inst.nombre}
              >
                {ganada ? <MarcaTilde tam={15} /> : premio ? <Copita tam={13} /> : null}
              </span>
            );
          })}
        </div>

        <div className="copaBox-pie">
          <b>{e.triunfos}</b> al hilo
          <span className="sep">·</span>
          faltan <b>{faltan}</b> para la copa
        </div>
      </div>

      {/* ---------- el mapa de lo que viene ---------- */}
      <div className="sec">El camino</div>
      <div className="card">
        <ol className="ruta">
          {CAMINO.map((inst, i) => {
            const estado =
              i < e.triunfos ? 'pasada' : i === e.triunfos ? 'actual' : 'pendiente';
            return (
              <li key={inst.id} className={`ruta-paso ${estado}`}>
                <span className="ruta-punto">
                  {estado === 'pasada' ? <MarcaTilde tam={14} /> : i + 1}
                </span>
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
            <span className="ruta-punto">
              <Copita tam={13} />
            </span>
            <span className="ruta-txt">
              <b>Campeón del mundo</b>
              <small>
                {faltan} triunfo{faltan > 1 ? 's' : ''} y la levantás
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
            {PARA_LA_COPA} triunfos seguidos.
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
                      {ea.triunfos} al hilo
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
