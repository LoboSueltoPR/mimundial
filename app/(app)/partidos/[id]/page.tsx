'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { crearCliente } from '@/lib/supabase/client';
import type { Amigo, Equipos, Jugador, Partido, Resultado } from '@/lib/tipos';
import {
  cabezas,
  cabezasLista,
  color,
  debeDe,
  fechaLarga,
  iniciales,
  pagadoDe,
  pagadoEfectivo,
  plata,
  porCabeza,
  sortear,
  totalDebe,
  totalPagado,
} from '@/lib/calculos';
import { useConfirmar } from '@/components/Confirmar';

type Vista = 'anotados' | 'equipos' | 'plata' | 'resultado';

export default function DetallePartido() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirmar, ui: confirmarUI } = useConfirmar();

  const [p, setP] = useState<Partido | null>(null);
  const [js, setJs] = useState<Jugador[]>([]);
  const [vista, setVista] = useState<Vista>('anotados');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [amigos, setAmigos] = useState<Amigo[]>([]);

  const cargar = useCallback(async () => {
    const supabase = crearCliente();
    const { data, error } = await supabase
      .from('partidos')
      .select('*, jugadores!jugadores_partido_id_fkey(*)')
      .eq('id', id)
      .single();

    setCargando(false);
    if (error) {
      setError(error.message);
      return;
    }
    const { jugadores, ...resto } = data as Partido & { jugadores: Jugador[] };
    setP(resto as Partido);
    setJs([...(jugadores ?? [])].sort((a, b) => a.orden - b.orden));
  }, [id]);

  useEffect(() => {
    cargar();
    crearCliente()
      .rpc('mis_amigos')
      .then(({ data }) => setAmigos((data ?? []) as Amigo[]));
  }, [cargar]);

  if (cargando) return <div className="cargando">Cargando…</div>;
  if (error || !p)
    return (
      <div style={{ paddingTop: 18 }}>
        <div className="msg err">{error || 'No se encontró el partido.'}</div>
      </div>
    );

  const cab = cabezas(js);
  const faltan = Math.max(0, p.cupo - cab);
  const completo = faltan === 0 && cab > 0;

  /* ---------------- mutaciones ---------------- */

  async function actualizarPartido(campos: Partial<Partido>) {
    setP((prev) => (prev ? { ...prev, ...campos } : prev));
    const supabase = crearCliente();
    const { error } = await supabase.from('partidos').update(campos).eq('id', id);
    if (error) {
      setError(error.message);
      cargar();
    }
  }

  async function actualizarJugador(jid: string, campos: Partial<Jugador>) {
    setJs((prev) => prev.map((j) => (j.id === jid ? { ...j, ...campos } : j)));
    const supabase = crearCliente();
    const { error } = await supabase.from('jugadores').update(campos).eq('id', jid);
    if (error) {
      setError(error.message);
      cargar();
    }
  }

  async function sumar(nombre: string) {
    const limpio = nombre.trim();
    if (!limpio) return;
    if (js.some((j) => j.nombre.toLowerCase() === limpio.toLowerCase())) {
      setError(`${limpio} ya está anotado.`);
      return;
    }
    setError(null);
    const supabase = crearCliente();
    const { data, error } = await supabase
      .from('jugadores')
      .insert({ partido_id: id, nombre: limpio, orden: js.length })
      .select('*')
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setJs((prev) => [...prev, data as Jugador]);
  }

  async function quitar(j: Jugador) {
    if (
      pagadoDe(j) > 0 &&
      !(await confirmar(`${j.nombre} tiene ${plata(pagadoDe(j))} cargados. ¿Sacarlo igual?`, {
        danger: true,
        boton: 'Sacarlo',
      }))
    )
      return;
    setJs((prev) => prev.filter((x) => x.id !== j.id));
    const supabase = crearCliente();
    const { error } = await supabase.from('jugadores').delete().eq('id', j.id);
    if (error) {
      setError(error.message);
      cargar();
    }
  }

  async function borrarPartido() {
    if (!(await confirmar('¿Borrar el partido con todo lo cargado?', { danger: true, boton: 'Borrar' })))
      return;
    const supabase = crearCliente();
    const { error } = await supabase.from('partidos').delete().eq('id', id);
    if (error) {
      setError(error.message);
      return;
    }
    router.push('/partidos');
  }

  /* ---------------- vista ---------------- */

  return (
    <div style={{ paddingTop: 18 }}>
      <div className={`resumen ${completo ? 'completo' : 'falta'}`}>
        <div className="rs-top">
          <span className="pulso" />
          <span className="rs-estado">
            {completo ? 'Se juega' : faltan === 1 ? 'Falta 1' : `Faltan ${faltan}`}
          </span>
        </div>
        <div className="rs-sub">
          {completo ? `Somos ${cab}. Ya está.` : `Somos ${cab} de ${p.cupo}.`}
        </div>
        <div className="rs-meta">
          <div>
            <div className="k">Cuándo</div>
            <div className="v">
              {fechaLarga(p.fecha)}
              {p.hora ? ' · ' + p.hora : ''}
            </div>
          </div>
          <div>
            <div className="k">Dónde</div>
            <div className="v">{p.lugar || '—'}</div>
          </div>
          <div>
            <div className="k">Anotados</div>
            <div className="v">
              {cab}/{p.cupo}
            </div>
          </div>
        </div>
        <div className="barra">
          <i style={{ width: `${p.cupo > 0 ? Math.min(100, (cab / p.cupo) * 100) : 0}%` }} />
        </div>
      </div>

      {/* recién creado y sin nadie anotado: lo único que tiene sentido es invitar */}
      {cab === 0 && <Invitar p={p} onCambio={actualizarPartido} destacado />}

      <nav className="tabs" style={{ marginTop: 14, paddingBottom: 0 }}>
        {(['anotados', 'equipos', 'plata', 'resultado'] as Vista[]).map((v) => (
          <a
            key={v}
            className={vista === v ? 'on' : ''}
            onClick={() => setVista(v)}
            style={{ cursor: 'pointer', textTransform: 'capitalize' }}
          >
            {v}
          </a>
        ))}
      </nav>

      {error && (
        <div className="msg err" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      {vista === 'anotados' && (
        <Anotados js={js} amigos={amigos} onInv={actualizarJugador} onQuitar={quitar} onSumar={sumar} />
      )}
      {vista === 'equipos' && (
        <EquiposVista
          js={js}
          equipos={p.equipos}
          onSortear={() => actualizarPartido({ equipos: sortear(js) })}
          onBorrar={() => actualizarPartido({ equipos: null })}
        />
      )}
      {vista === 'plata' && (
        <PlataVista
          p={p}
          js={js}
          onPago={(jid, monto) => actualizarJugador(jid, { pagado: monto })}
          onPuso={(jid) => actualizarPartido({ puso: jid })}
          onCosto={(costo) => actualizarPartido({ costo })}
        />
      )}
      {vista === 'resultado' && <ResultadoVista p={p} onGuardar={actualizarPartido} />}

      {/* si todavía no hay nadie anotado, invitar es lo único que tiene sentido hacer */}
      {cab > 0 && <Invitar p={p} onCambio={actualizarPartido} />}

      <div className="sec">Partido</div>
      <button className="btn danger wide sm" onClick={borrarPartido}>
        Borrar este partido
      </button>

      {confirmarUI}
    </div>
  );
}

/* ================= INVITAR ================= */

function Invitar({
  p,
  onCambio,
  destacado = false,
}: {
  p: Partido;
  onCambio: (campos: Partial<Partido>) => void;
  destacado?: boolean;
}) {
  const [copiado, setCopiado] = useState(false);
  const [link, setLink] = useState('');

  useEffect(() => {
    setLink(`${window.location.origin}/p/${p.token}`);
  }, [p.token]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Safari/iOS sin permiso: al menos lo dejamos seleccionable
      const i = document.getElementById('linkInv') as HTMLInputElement | null;
      i?.select();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  function compartir() {
    const texto = `Se juega${p.lugar ? ' en ' + p.lugar : ''}${p.hora ? ' a las ' + p.hora : ''}. Anotate: ${link}`;
    if (navigator.share) {
      navigator.share({ title: 'MiMundial', text: texto, url: link }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
    }
  }

  return (
    <>
      <div className="sec">
        {destacado ? 'Partido creado — invitá gente' : 'Invitar'}
        <button className="act" onClick={() => onCambio({ abierto: !p.abierto })}>
          {p.abierto ? 'cerrar anotaciones' : 'reabrir'}
        </button>
      </div>
      {destacado && (
        <div className="nota" style={{ marginTop: 0, marginBottom: 10 }}>
          Mandale este link a los pibes para que se anoten solos.
        </div>
      )}

      <div className="card" style={{ padding: 14 }}>
        <input id="linkInv" readOnly value={link} onFocus={(e) => e.target.select()} />
        <div className="row2" style={{ marginTop: 10 }}>
          <button className="btn pri" onClick={compartir}>
            Compartir
          </button>
          <button className="btn" onClick={copiar}>
            {copiado ? '¡Copiado!' : 'Copiar link'}
          </button>
        </div>
      </div>

      <div className="nota">
        {p.abierto ? (
          <>
            El que abre el link <b>no necesita cuenta</b>: pone su nombre y se anota. Solo puede
            manejar su lugar y sus invitados.
          </>
        ) : (
          <>Las anotaciones están cerradas: el link se puede ver pero nadie más puede sumarse.</>
        )}
      </div>
    </>
  );
}

/* ================= ANOTADOS ================= */

function Anotados({
  js,
  amigos,
  onInv,
  onQuitar,
  onSumar,
}: {
  js: Jugador[];
  amigos: Amigo[];
  onInv: (id: string, campos: Partial<Jugador>) => void;
  onQuitar: (j: Jugador) => void;
  onSumar: (nombre: string) => Promise<void>;
}) {
  const [nombre, setNombre] = useState('');
  const [enviando, setEnviando] = useState(false);
  const anotados = new Set(js.map((j) => j.nombre.toLowerCase()));
  const disponibles = amigos.filter((a) => !anotados.has(a.nombre.toLowerCase()));
  let n = 0;

  async function agregar(unNombre: string) {
    if (!unNombre.trim() || enviando) return;
    setEnviando(true);
    await onSumar(unNombre);
    setEnviando(false);
    setNombre('');
  }

  return (
    <>
      <div className="sec">Los anotados</div>
      <div className="card">
        {js.length === 0 ? (
          <div className="vacio">Nadie anotado todavía.</div>
        ) : (
          js.map((j) => {
            const inv = j.invitados || 0;
            n++;
            const etiqueta = inv > 0 ? `${n}–${n + inv}` : String(n);
            n += inv;
            return (
              <div className="jug" key={j.id}>
                <span className="num">{etiqueta}</span>
                <span className="av" style={{ background: color(j.nombre) }}>
                  {iniciales(j.nombre)}
                </span>
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
                    onClick={() => onInv(j.id, { invitados: Math.max(0, inv - 1) })}
                    disabled={inv === 0}
                  >
                    −
                  </button>
                  <span>+{inv}</span>
                  <button onClick={() => onInv(j.id, { invitados: inv + 1 })}>+</button>
                </span>
                <button className="quitar" onClick={() => onQuitar(j)} title="Sacar">
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>

      {disponibles.length > 0 && (
        <>
          <div className="sec">Tus amigos</div>
          <div className="chips">
            {disponibles.map((a) => (
              <button
                key={a.id}
                className="chipAmigo"
                onClick={() => agregar(a.nombre)}
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
            if (e.key === 'Enter') agregar(nombre);
          }}
        />
        <button
          className="btn pri"
          style={{ flex: 'none', padding: '12px 20px' }}
          onClick={() => agregar(nombre)}
          disabled={enviando || !nombre.trim()}
        >
          {enviando ? '…' : 'Sumar'}
        </button>
      </div>
      <div className="nota">
        Sumás a alguien y después le ponés <b>+</b> por cada invitado que lleva. Cada invitado ocupa
        un lugar y se le suma a la cuenta del que lo trae.
      </div>
    </>
  );
}

/* ================= EQUIPOS ================= */

function EquiposVista({
  js,
  equipos,
  onSortear,
  onBorrar,
}: {
  js: Jugador[];
  equipos: Equipos | null;
  onSortear: () => void;
  onBorrar: () => void;
}) {
  const lista = cabezasLista(js);

  if (lista.length < 2)
    return (
      <>
        <div className="sec">Equipos</div>
        <div className="card">
          <div className="vacio">Anotá gente y después sorteás los equipos acá.</div>
        </div>
      </>
    );

  if (!equipos)
    return (
      <>
        <div className="sec">Equipos</div>
        <div className="card">
          <div className="vacio">
            Hay {lista.length} cabezas anotadas.
            <br />
            Sorteá y se reparten solos en dos equipos.
          </div>
        </div>
        <button className="btn pri wide" style={{ marginTop: 14 }} onClick={onSortear}>
          Sortear equipos
        </button>
        <div className="nota">
          Los invitados entran al bombo como uno más — no van necesariamente con el que los trajo.
        </div>
      </>
    );

  const cambio = equipos.n !== lista.length;

  const Columna = ({ arr, nombre, chaleco, borde }: { arr: Equipos['a']; nombre: string; chaleco: string; borde?: string }) => (
    <div className="eq">
      <div className="eq-head">
        <span className="chaleco" style={{ background: chaleco, border: borde }} />
        <b>{nombre}</b>
        <span>{arr.length}</span>
      </div>
      <ul>
        {arr.map((x, i) => (
          <li key={i} className={x.inv ? 'invitado' : ''}>
            <span className="mini" style={{ background: x.inv ? '#5b6675' : color(x.label) }}>
              {x.inv ? '+' : iniciales(x.label)}
            </span>
            <span>{x.inv ? 'Inv. de ' + x.de : x.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <>
      <div className="sec">Equipos</div>
      {cambio && (
        <div className="aviso-cambio">
          La lista cambió desde el sorteo (ahora son {lista.length} y sorteaste con {equipos.n}).
          Volvé a sortear.
        </div>
      )}
      <div className="equipos">
        <Columna arr={equipos.a} nombre="Claros" chaleco="#ffffff" borde="1px solid #d2dae4" />
        <Columna arr={equipos.b} nombre="Oscuros" chaleco="#2b3a4d" borde="1px solid #1b2836" />
      </div>
      <div className="row2" style={{ marginTop: 14 }}>
        <button className="btn pri" onClick={onSortear}>
          Sortear de nuevo
        </button>
        <button className="btn" onClick={onBorrar}>
          Borrar
        </button>
      </div>
      <div className="nota">
        El sorteo queda guardado. Si sumás o sacás gente, te aviso para que vuelvas a sortear.
      </div>
    </>
  );
}

/* ================= PLATA ================= */

function PlataVista({
  p,
  js,
  onPago,
  onPuso,
  onCosto,
}: {
  p: Partido;
  js: Jugador[];
  onPago: (jid: string, monto: number) => void;
  onPuso: (jid: string | null) => void;
  onCosto: (costo: number) => void;
}) {
  const { confirmar, ui: confirmarUI } = useConfirmar();

  if (js.length === 0)
    return (
      <>
        <div className="sec">Plata</div>
        <div className="card">
          <div className="vacio">Anotá gente primero y acá se reparte la plata sola.</div>
        </div>
      </>
    );

  const pagado = totalPagado(p, js);
  const debe = totalDebe(p, js);
  const quienPuso = js.find((j) => j.id === p.puso);
  const cuantos = js.filter((j) => pagadoEfectivo(p, js, j) >= debeDe(p.costo, js, j)).length;

  async function editarPago(j: Jugador) {
    if (p.puso === j.id) {
      await confirmar(`${j.nombre} adelantó ${plata(p.costo)}. Su parte ya está cubierta.`, {
        soloOk: true,
      });
      return;
    }
    const v = prompt(`¿Cuánto puso ${j.nombre}? (debe ${plata(debeDe(p.costo, js, j))})`, String(pagadoDe(j)));
    if (v === null) return;
    const num = Number(String(v).replace(/[^\d.-]/g, ''));
    onPago(j.id, isNaN(num) ? 0 : Math.max(0, num));
  }

  return (
    <>
      <div className="sec">Plata</div>
      <div className="tot">
        <div className="big">{plata(p.costo)}</div>
        <div className="lbl">
          {p.lugar || 'partido'} · {fechaLarga(p.fecha)}
        </div>
        <div className="split">
          <div>
            <div className="n">{plata(porCabeza(p.costo, js))}</div>
            <div className="c">por cabeza</div>
          </div>
          <div>
            <div className="n ok">{plata(pagado)}</div>
            <div className="c">cubierto</div>
          </div>
          <div>
            <div className="n debe">{plata(debe)}</div>
            <div className="c">
              {quienPuso ? 'le deben a ' + quienPuso.nombre.split(' ')[0] : 'falta'}
            </div>
          </div>
        </div>
      </div>

      <div className="sec">
        Quién pagó · {cuantos} de {js.length}
        <button
          className="act"
          onClick={() => {
            const v = prompt('Total del partido:', String(p.costo));
            if (v === null) return;
            const num = Number(String(v).replace(/[^\d.-]/g, ''));
            onCosto(isNaN(num) ? 0 : Math.max(0, num));
          }}
        >
          cambiar total
        </button>
      </div>

      <div className="card">
        {js.map((j) => {
          const d = debeDe(p.costo, js, j);
          const esPagador = p.puso === j.id;
          const pg = pagadoEfectivo(p, js, j);
          const saldo = d - pg;
          const listo = saldo <= 0;
          const inv = j.invitados || 0;

          const detalle = esPagador
            ? `adelantó ${plata(p.costo)} · su parte está cubierta`
            : listo
              ? `pagó ${plata(d)}`
              : pg > 0
                ? `puso ${plata(pg)} de ${plata(d)}`
                : `debe ${plata(d)}`;

          return (
            <div className="pago" key={j.id}>
              <button
                className={`tick ${listo ? 'ok' : ''}`}
                disabled={esPagador}
                onClick={() => onPago(j.id, pagadoDe(j) >= d ? 0 : d)}
              >
                {listo ? '✓' : '·'}
              </button>
              <span className="nom" onClick={() => editarPago(j)}>
                <b>
                  {j.nombre}
                  {esPagador && <span className="chip puso">puso</span>}
                  {inv > 0 && <span className="chip">+{inv}</span>}
                </b>
                <small>{detalle}</small>
              </span>
              <span className={`monto ${listo ? 'ok' : 'debe'}`}>
                {listo ? plata(d) : plata(saldo)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="sec">Quién puso la plata</div>
      <div className="card">
        <div style={{ padding: '12px 13px' }}>
          <select value={p.puso ?? ''} onChange={(e) => onPuso(e.target.value || null)}>
            <option value="">— nadie marcado —</option>
            {js.map((j) => (
              <option key={j.id} value={j.id}>
                {j.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="nota">
        El total se divide por <b>cabeza</b>, no por persona: el que lleva 2 invitados paga 3 partes.
        Tocá el círculo para marcar pagado, o el nombre para cargar un pago parcial.
      </div>

      {confirmarUI}
    </>
  );
}

/* ================= RESULTADO ================= */

const OPCIONES: { v: Resultado; ico: string; txt: string; cls: string }[] = [
  { v: 'ganamos', ico: '🏆', txt: 'Ganamos', cls: 'gano' },
  { v: 'empate', ico: '🤝', txt: 'Empate', cls: 'emp' },
  { v: 'perdimos', ico: '💀', txt: 'Perdimos', cls: 'perd' },
];

function ResultadoVista({
  p,
  onGuardar,
}: {
  p: Partido;
  onGuardar: (campos: Partial<Partido>) => void;
}) {
  const [gf, setGf] = useState(p.goles_favor ?? '');
  const [gc, setGc] = useState(p.goles_contra ?? '');

  function guardarMarcador() {
    const favor = gf === '' ? null : Math.max(0, Number(gf));
    const contra = gc === '' ? null : Math.max(0, Number(gc));
    const campos: Partial<Partido> = { goles_favor: favor, goles_contra: contra };
    // si cargó marcador y todavía no eligió resultado, lo deduce
    if (favor !== null && contra !== null && !p.resultado) {
      campos.resultado = favor > contra ? 'ganamos' : favor < contra ? 'perdimos' : 'empate';
    }
    onGuardar(campos);
  }

  return (
    <>
      <div className="sec">¿Cómo salió?</div>
      <div className="resultado">
        {OPCIONES.map((o) => (
          <button
            key={o.v}
            className={`${p.resultado === o.v ? 'on ' + o.cls : ''}`}
            onClick={() => onGuardar({ resultado: p.resultado === o.v ? null : o.v })}
          >
            <span className="ico">{o.ico}</span>
            {o.txt}
          </button>
        ))}
      </div>

      <div className="sec">Marcador (opcional)</div>
      <div className="card">
        <div className="marcador" style={{ padding: '16px 0' }}>
          <input
            type="number"
            min={0}
            placeholder="—"
            value={gf}
            onChange={(e) => setGf(e.target.value === '' ? '' : Number(e.target.value))}
          />
          <span>a</span>
          <input
            type="number"
            min={0}
            placeholder="—"
            value={gc}
            onChange={(e) => setGc(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </div>
      </div>
      <button className="btn wide" style={{ marginTop: 12 }} onClick={guardarMarcador}>
        Guardar marcador
      </button>
      <div className="nota">
        Si cargás el marcador y todavía no elegiste arriba, el resultado se deduce solo.
      </div>
    </>
  );
}
