'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { crearCliente } from '@/lib/supabase/client';
import type { Jugador, MiPartidoAnotado, Partido } from '@/lib/tipos';
import { cabezas, calcularStats, fechaCorta, plata, totalDebe } from '@/lib/calculos';

type Fila = Partido & { jugadores: Jugador[] };

const HOY = () => new Date().toISOString().slice(0, 10);

export default function Partidos() {
  const router = useRouter();
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(false);

  // Partidos ajenos en los que sos jugador: sección aparte, RPC aparte.
  // Si la migración 0005 todavía no corrió en Supabase, esto falla solo
  // a ella — "Tus partidos" tiene que seguir andando igual.
  const [anotados, setAnotados] = useState<MiPartidoAnotado[] | null>(null);

  const cargar = useCallback(async () => {
    const supabase = crearCliente();
    const { data, error } = await supabase
      .from('partidos')
      .select('*, jugadores!jugadores_partido_id_fkey(*)')
      .order('fecha', { ascending: false })
      .order('creado_en', { ascending: false });

    if (error) {
      setError(error.message);
      setFilas([]);
      return;
    }
    setFilas((data ?? []) as Fila[]);
  }, []);

  const cargarAnotados = useCallback(async () => {
    const supabase = crearCliente();
    const { data, error } = await supabase.rpc('mis_partidos_anotado');
    setAnotados(error ? [] : ((data ?? []) as MiPartidoAnotado[]));
  }, []);

  useEffect(() => {
    cargar();
    cargarAnotados();
  }, [cargar, cargarAnotados]);

  if (error) {
    return (
      <div style={{ paddingTop: 18 }}>
        <div className="msg err">
          <b>No se pudieron traer los partidos.</b>
          <br />
          {error}
          <br />
          <br />
          Si dice algo de <code>relation does not exist</code>, falta correr la migración SQL en
          Supabase (está en <code>supabase/migrations/0001_init.sql</code>).
        </div>
      </div>
    );
  }

  if (!filas) return <div className="cargando">Cargando…</div>;

  const stats = calcularStats(filas);

  return (
    <div style={{ paddingTop: 18 }}>
      {filas.length > 0 && (
        <div className="grid">
          <div className="kpi">
            <div className="n g">{stats.ganados}</div>
            <div className="c">Ganados</div>
          </div>
          <div className="kpi">
            <div className="n e">{stats.empatados}</div>
            <div className="c">Empates</div>
          </div>
          <div className="kpi">
            <div className="n p">{stats.perdidos}</div>
            <div className="c">Perdidos</div>
          </div>
        </div>
      )}

      {anotados !== null && anotados.length > 0 && (
        <>
          <div className="sec">Anotado en</div>
          <div className="card">
            {anotados.map((a) => {
              const f = fechaCorta(a.fecha);
              const completo = a.faltan === 0;
              return (
                <div
                  key={a.id}
                  className="item"
                  onClick={() => router.push(`/p/${a.token}`)}
                >
                  <span className="fec">
                    <span className="d">{f.d}</span>
                    <span className="m">{f.m}</span>
                  </span>
                  <span className="info">
                    <b>{a.lugar || 'Partido'}</b>
                    <small>
                      {a.anfitrion ? 'de ' + a.anfitrion + ' · ' : ''}
                      {a.cabezas}/{a.cupo}
                      {a.hora ? ' · ' + a.hora : ''}
                      {a.mi_invitados > 0 ? ` · llevás +${a.mi_invitados}` : ''}
                    </small>
                  </span>
                  <span className={`estado-pill ${completo ? 'ok' : 'sin'}`}>
                    {completo ? 'Se juega' : 'Falta gente'}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="sec">
        Tus partidos
        <button className="act" onClick={() => setForm(true)}>
          + nuevo
        </button>
      </div>

      <div className="card">
        {filas.length === 0 ? (
          <div className="vacio">
            Todavía no cargaste ningún partido.
            <br />
            Tocá <b>+ nuevo</b> y arrancá.
          </div>
        ) : (
          filas.map((p) => {
            const f = fechaCorta(p.fecha);
            const debe = totalDebe(p, p.jugadores);
            const pill =
              p.resultado === 'ganamos'
                ? { cls: 'ok', txt: 'Ganamos' }
                : p.resultado === 'perdimos'
                  ? { cls: 'perd', txt: 'Perdimos' }
                  : p.resultado === 'empate'
                    ? { cls: 'emp', txt: 'Empate' }
                    : debe > 0
                      ? { cls: 'debe', txt: 'falta ' + plata(debe) }
                      : { cls: 'sin', txt: 'sin cargar' };

            return (
              <div key={p.id} className="item" onClick={() => router.push(`/partidos/${p.id}`)}>
                <span className="fec">
                  <span className="d">{f.d}</span>
                  <span className="m">{f.m}</span>
                </span>
                <span className="info">
                  <b>{p.lugar || 'Partido'}</b>
                  <small>
                    {cabezas(p.jugadores)}/{p.cupo} · {plata(p.costo)}
                    {p.hora ? ' · ' + p.hora : ''}
                    {p.goles_favor !== null && p.goles_contra !== null
                      ? ` · ${p.goles_favor}-${p.goles_contra}`
                      : ''}
                  </small>
                </span>
                <span className={`estado-pill ${pill.cls}`}>{pill.txt}</span>
              </div>
            );
          })
        )}
      </div>

      {form && <FormPartido onCerrar={() => setForm(false)} onListo={cargar} />}
    </div>
  );
}

function FormPartido({ onCerrar, onListo }: { onCerrar: () => void; onListo: () => void }) {
  const router = useRouter();
  const [fecha, setFecha] = useState(HOY());
  const [hora, setHora] = useState('20:00');
  const [lugar, setLugar] = useState('');
  const [cupo, setCupo] = useState(12);
  const [costo, setCosto] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setGuardando(true);
    setError(null);
    const supabase = crearCliente();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('Se cortó la sesión. Volvé a entrar.');
      setGuardando(false);
      return;
    }

    const { data, error } = await supabase
      .from('partidos')
      .insert({
        user_id: user.id,
        fecha,
        hora,
        lugar: lugar.trim() || null,
        cupo: Math.max(2, Math.min(40, cupo || 12)),
        costo: Math.max(0, costo || 0),
      })
      .select('id')
      .single();

    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    onListo();
    onCerrar();
    if (data?.id) router.push(`/partidos/${data.id}`);
  }

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="sheet">
        <h2>Nuevo partido</h2>
        <div className="campos">
          <div className="campo">
            <label>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="campo">
            <label>Hora</label>
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
        </div>
        <div className="campo">
          <label>Dónde</label>
          <input
            placeholder="ITLP, La Piedad, el parque…"
            value={lugar}
            onChange={(e) => setLugar(e.target.value)}
          />
        </div>
        <div className="campos">
          <div className="campo">
            <label>Cuántos van</label>
            <input
              type="number"
              min={2}
              max={40}
              value={cupo}
              onChange={(e) => setCupo(Number(e.target.value))}
            />
          </div>
          <div className="campo">
            <label>Cuánto sale</label>
            <input
              type="number"
              min={0}
              step={500}
              value={costo}
              onChange={(e) => setCosto(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="row2" style={{ marginTop: 6 }}>
          <button className="btn pri" onClick={crear} disabled={guardando}>
            {guardando ? 'Creando…' : 'Crear'}
          </button>
          <button className="btn" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
        </div>
        {error && <div className="msg err">{error}</div>}
      </div>
    </div>
  );
}
