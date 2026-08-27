'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { crearCliente } from '@/lib/supabase/client';
import type { Jugador, MiPartidoAnotado, Partido } from '@/lib/tipos';
import { cabezas, calcularStats, fechaCorta, plata, totalDebe } from '@/lib/calculos';
import ElegirCancha, { type LugarElegido } from '@/components/ElegirCancha';

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

  // Los ajenos ya jugados, con el resultado dado vuelta a tu punto de vista.
  // Van SOLO al G/E/P de arriba: la lista de abajo es la de los que
  // organizaste vos, y la plata de un partido de otro no es tuya.
  const [ajenos, setAjenos] = useState<Partido[]>([]);

  const cargar = useCallback(async () => {
    const supabase = crearCliente();
    // Las dos juntas: si los ajenos llegaran después, el contador pintaría
    // primero el número sin ellos y se corregiría solo — justo el número
    // equivocado que este arreglo viene a sacar.
    const [{ data, error }, { data: deOtros }] = await Promise.all([
      supabase
        .from('partidos')
        .select('*, jugadores!jugadores_partido_id_fkey(*)')
        .order('fecha', { ascending: false })
        .order('creado_en', { ascending: false }),
      supabase.rpc('mis_resultados_ajenos'),
    ]);

    if (error) {
      setError(error.message);
      setFilas([]);
      return;
    }
    setAjenos((deOtros ?? []) as Partido[]);
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

  /* Ganar en el equipo de otro cuenta igual que ganar en el tuyo: es el mismo
     criterio que el camino y la pantalla de Stats. Sin costo ni jugadores, que
     son datos del dueño del partido. */
  const stats = calcularStats([
    ...filas,
    ...ajenos.map((a) => ({ ...a, costo: 0, equipos: null, jugadores: [] })),
  ]);

  return (
    <div style={{ paddingTop: 18 }}>
      {filas.length + ajenos.length > 0 && (
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
  const [donde, setDonde] = useState<LugarElegido>({ cancha_id: null, lugar: '' });
  const [cupo, setCupo] = useState(12);
  const [costo, setCosto] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** id del partido si quedó creado a medias: ya no se puede volver a crear. */
  const [creado, setCreado] = useState<string | null>(null);

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
        // Con cancha del catálogo, `lugar` guarda su nombre igual: es el
        // campo que siguen leyendo las RPCs de invitación e historial.
        lugar: donde.lugar.trim() || null,
        cancha_id: donde.cancha_id,
        cupo: Math.max(2, Math.min(40, cupo || 12)),
        costo: Math.max(0, costo || 0),
      })
      .select('id')
      .single();

    if (error) {
      setGuardando(false);
      setError(error.message);
      return;
    }

    // El que arma el partido juega: la lista arranca con él anotado, no
    // vacía. Con `user_id` para que sea la misma persona que la cuenta
    // (avatar, perfil), igual que cuando alguien se anota por el link.
    if (data?.id) {
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('nombre')
        .eq('id', user.id)
        .single();
      const miNombre = (
        perfil?.nombre ||
        (user.user_metadata?.full_name as string) ||
        user.email?.split('@')[0] ||
        ''
      ).trim();
      if (miNombre) {
        const { error: errAnotarme } = await supabase
          .from('jugadores')
          .insert({ partido_id: data.id, nombre: miNombre, orden: 0, user_id: user.id });
        // El partido ya existe: no se puede volver a apretar Crear. Se avisa
        // y se ofrece entrar igual, en vez de tragarse el error en silencio.
        if (errAnotarme) {
          setGuardando(false);
          setCreado(data.id);
          setError(`El partido se creó, pero no te pudo anotar: ${errAnotarme.message}`);
          onListo();
          return;
        }
      }
    }

    setGuardando(false);
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
        <ElegirCancha valor={donde} onCambiar={setDonde} />
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
          {creado ? (
            <button className="btn pri" onClick={() => router.push(`/partidos/${creado}`)}>
              Ver el partido
            </button>
          ) : (
            <button className="btn pri" onClick={crear} disabled={guardando}>
              {guardando ? 'Creando…' : 'Crear'}
            </button>
          )}
          <button className="btn" onClick={onCerrar} disabled={guardando}>
            {creado ? 'Cerrar' : 'Cancelar'}
          </button>
        </div>
        {error && <div className="msg err">{error}</div>}
      </div>
    </div>
  );
}
