'use client';

import { useEffect, useState } from 'react';
import { crearCliente } from '@/lib/supabase/client';
import type { Jugador, Partido } from '@/lib/tipos';
import { calcularSocios, calcularStats, presencias } from '@/lib/calculos';
import { MarcaRacha } from '@/components/Marcas';
import Avatar from '@/components/Avatar';

type Fila = Partido & { jugadores: Jugador[] };

const CLAVE_APODO = 'mimundial.apodoCancha';
/** Menos de esto y el % de efectividad no dice nada — un solo partido
 *  ganado juntos ya te da "100%", que es ruido, no una racha. */
const MIN_JUNTOS_PARA_TOP = 2;

export default function Stats() {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [apodo, setApodo] = useState('');
  const [editandoApodo, setEditandoApodo] = useState(false);
  const [apodoInput, setApodoInput] = useState('');

  useEffect(() => {
    setApodo(localStorage.getItem(CLAVE_APODO) || '');

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

  function guardarApodo(e: React.FormEvent) {
    e.preventDefault();
    const limpio = apodoInput.trim();
    if (!limpio) return;
    localStorage.setItem(CLAVE_APODO, limpio);
    setApodo(limpio);
    setEditandoApodo(false);
  }

  if (error)
    return (
      <div style={{ paddingTop: 18 }}>
        <div className="msg err">{error}</div>
      </div>
    );
  if (!filas) return <div className="cargando">Cargando…</div>;

  const s = calcularStats(filas);
  const gente = presencias(filas);
  const socios = calcularSocios(filas, apodo);
  const top3 = socios.filter((x) => x.juntos >= MIN_JUNTOS_PARA_TOP).slice(0, 3);
  const hayEquipos = filas.some((f) => f.equipos);

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

      <div className="sec">Tus socios en la cancha</div>

      {!apodo || editandoApodo ? (
        <div className="card" style={{ padding: 14 }}>
          <form onSubmit={guardarApodo}>
            <div className="row2">
              <input
                value={apodoInput}
                onChange={(e) => setApodoInput(e.target.value)}
                placeholder={apodo || 'Cómo te anotás en la lista'}
                maxLength={40}
                autoFocus={editandoApodo}
              />
              <button
                className="btn pri"
                type="submit"
                style={{ flex: 'none', padding: '12px 20px' }}
                disabled={!apodoInput.trim()}
              >
                Guardar
              </button>
            </div>
          </form>
          <div className="nota">
            Para saber con quién ganás más necesito saber cuál sos vos en la lista de anotados —
            no hay forma de deducirlo solo.
          </div>
        </div>
      ) : !hayEquipos ? (
        <div className="card">
          <div className="vacio">
            Sorteá equipos en tus partidos y acá vas a ver con quién más ganás.
          </div>
        </div>
      ) : socios.length === 0 ? (
        <div className="card">
          <div className="vacio">
            No encontramos a &quot;{apodo}&quot; en ningún equipo sorteado.{' '}
            <a onClick={() => setEditandoApodo(true)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
              Revisar apodo
            </a>
          </div>
        </div>
      ) : (
        <>
          {top3.length > 0 && (
            <>
              <div className="card" style={{ marginBottom: 10 }}>
                {top3.map((soc, i) => (
                  <div className="jug" key={soc.nombre}>
                    <span className="num">{i + 1}</span>
                    <Avatar nombre={soc.nombre} />
                    <span className="nom">
                      <b>{soc.nombre}</b>
                      <small>
                        {soc.ganados} de {soc.juntos} juntos
                      </small>
                    </span>
                    <span className="m ok">{soc.efectividad}%</span>
                  </div>
                ))}
              </div>
              <div className="nota" style={{ marginTop: -4 }}>
                Top {top3.length} por efectividad jugando en tu equipo (mínimo {MIN_JUNTOS_PARA_TOP}{' '}
                partidos juntos).
              </div>
            </>
          )}

          <div className="sec" style={{ marginTop: 14 }}>
            Todos
            <button className="act" onClick={() => setEditandoApodo(true)}>
              cambiar apodo
            </button>
          </div>
          <div className="card">
            {socios.map((soc) => (
              <div className="saldo" key={soc.nombre}>
                <Avatar nombre={soc.nombre} />
                <span className="nom">
                  <b>{soc.nombre}</b>
                  <small>{soc.juntos} partidos juntos</small>
                </span>
                <span className="m ok">{soc.efectividad}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
