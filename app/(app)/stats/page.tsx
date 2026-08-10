'use client';

import { useEffect, useState } from 'react';
import { crearCliente } from '@/lib/supabase/client';
import type { Jugador, Partido } from '@/lib/tipos';
import { calcularStats, plata, presencias } from '@/lib/calculos';
import { MarcaRacha } from '@/components/Marcas';

type Fila = Partido & { jugadores: Jugador[] };

export default function Stats() {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = crearCliente();
      const { data, error } = await supabase.from('partidos').select('*, jugadores!jugadores_partido_id_fkey(*)');
      if (error) {
        setError(error.message);
        setFilas([]);
        return;
      }
      setFilas((data ?? []) as Fila[]);
    })();
  }, []);

  if (error)
    return (
      <div style={{ paddingTop: 18 }}>
        <div className="msg err">{error}</div>
      </div>
    );
  if (!filas) return <div className="cargando">Cargando…</div>;

  const s = calcularStats(filas);
  const gente = presencias(filas);

  if (filas.length === 0)
    return (
      <div style={{ paddingTop: 18 }}>
        <div className="card">
          <div className="vacio">
            Cargá partidos y acá se arma tu historial: ganados, perdidos, racha y quién engancha
            siempre.
          </div>
        </div>
      </div>
    );

  const textoRacha =
    s.racha.largo === 0
      ? 'Todavía no cargaste resultados'
      : s.racha.tipo === 'ganamos'
        ? `${s.racha.largo} ganado${s.racha.largo > 1 ? 's' : ''} al hilo`
        : s.racha.tipo === 'perdimos'
          ? `${s.racha.largo} perdido${s.racha.largo > 1 ? 's' : ''} al hilo`
          : `${s.racha.largo} empate${s.racha.largo > 1 ? 's' : ''} al hilo`;

  return (
    <div style={{ paddingTop: 18 }}>
      <div className="tot">
        <div className="big">{s.efectividad}%</div>
        <div className="lbl">
          efectividad · {s.jugados} partido{s.jugados === 1 ? '' : 's'} con resultado
        </div>
      </div>

      <div className="sec">Cómo venís</div>
      <div className="grid">
        <div className="kpi">
          <div className="n g">{s.ganados}</div>
          <div className="c">Ganados</div>
        </div>
        <div className="kpi">
          <div className="n e">{s.empatados}</div>
          <div className="c">Empates</div>
        </div>
        <div className="kpi">
          <div className="n p">{s.perdidos}</div>
          <div className="c">Perdidos</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 9 }}>
        <div className="rachaBox">
          <span
            className={`emo ${
              s.racha.tipo === 'ganamos' ? 'g' : s.racha.tipo === 'perdimos' ? 'p' : 'e'
            }`}
          >
            <MarcaRacha tipo={s.racha.tipo} />
          </span>
          <span className="txt">
            <b>{textoRacha}</b>
            <small>
              {s.golesFavor > 0 || s.golesContra > 0
                ? `${s.golesFavor} a favor · ${s.golesContra} en contra`
                : 'Cargá el marcador y también te llevo los goles'}
            </small>
          </span>
        </div>
      </div>

      {s.sinCargar > 0 && (
        <div className="nota">
          Tenés <b>{s.sinCargar}</b> partido{s.sinCargar > 1 ? 's' : ''} sin resultado cargado. No
          cuentan para la efectividad.
        </div>
      )}

      <div className="sec">Lo que va saliendo</div>
      <div className="grid">
        <div className="kpi">
          <div className="n">{filas.length}</div>
          <div className="c">Partidos</div>
        </div>
        <div className="kpi">
          <div className="n">{gente.length}</div>
          <div className="c">Distintos</div>
        </div>
        <div className="kpi">
          <div className="n" style={{ fontSize: 17 }}>
            {plata(s.gastado)}
          </div>
          <div className="c">Tu parte</div>
        </div>
      </div>
      <div className="nota">
        &quot;Tu parte&quot; es la suma de lo que te tocó por cabeza en cada partido.
      </div>

      <div className="sec">Quiénes enganchan</div>
      <div className="card">
        {gente.slice(0, 12).map((g) => (
          <div className="saldo" key={g.nombre}>
            <span className="nom">
              <b>{g.nombre}</b>
              <small>
                {g.veces} de {filas.length} partidos
                {g.invitados > 0 ? ` · trajo ${g.invitados}` : ''}
              </small>
            </span>
            <span className="m ok">{Math.round((g.veces / filas.length) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
