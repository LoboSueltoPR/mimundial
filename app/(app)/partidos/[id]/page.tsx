'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { crearCliente } from '@/lib/supabase/client';
import type {
  Amigo,
  Equipos,
  Jugador,
  Lado,
  Partido,
  PartidoConCancha,
  Resultado,
  VotacionAdmin,
} from '@/lib/tipos';
import { comoLlegar } from '@/lib/mapa';
import {
  cabezas,
  cabezasLista,
  color,
  debeDe,
  fechaLarga,
  iniciales,
  intercambiar,
  ladoDeCuenta,
  pagadoDe,
  pagadoEfectivo,
  pasar,
  plata,
  porCabeza,
  resultadoPara,
  sortear,
  totalDebe,
  totalPagado,
  tresOpciones,
} from '@/lib/calculos';
import { useConfirmar } from '@/components/Confirmar';
import { Copita } from '@/components/Copa';
import { MarcaEmpate, MarcaPerdio } from '@/components/Marcas';
import Avatar from '@/components/Avatar';
import PerfilModal from '@/components/PerfilModal';
import { ColumnaEquipo, type Seleccion } from '@/components/Equipos';
import Cruce from '@/components/Cruce';
import ArmarEquipo from '@/components/ArmarEquipo';
import CompartirLink from '@/components/CompartirLink';
import VotarEquipos from '@/components/VotarEquipos';
import { cabezasDeLado, estadoDesafio, nombreDeLado, porLado } from '@/lib/calculos';

type Vista = 'anotados' | 'equipos' | 'desafio' | 'plata' | 'resultado';
type AvatarInfo = { avatar_url: string | null; username: string | null };

export default function DetallePartido() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirmar, ui: confirmarUI } = useConfirmar();

  const [p, setP] = useState<PartidoConCancha | null>(null);
  const [js, setJs] = useState<Jugador[]>([]);
  const [vista, setVista] = useState<Vista>('anotados');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [amigos, setAmigos] = useState<Amigo[]>([]);
  const [avatares, setAvatares] = useState<Record<string, AvatarInfo>>({});
  const [solicitudesEnviadas, setSolicitudesEnviadas] = useState<Set<string>>(new Set());
  const [enviandoSolicitud, setEnviandoSolicitud] = useState<string | null>(null);
  const [perfilAbierto, setPerfilAbierto] = useState<{ id: string; nombre: string } | null>(null);
  const [armando, setArmando] = useState(false);
  /** La votación de equipos (0026). Viene por RPC y no por la tabla:
   *  los votos son secretos y la tabla no se lee ni siendo el dueño. */
  const [votacion, setVotacion] = useState<VotacionAdmin | null>(null);

  const cargar = useCallback(async () => {
    const supabase = crearCliente();
    const [{ data, error }, { data: vot }] = await Promise.all([
      supabase
        .from('partidos')
        // `canchas` embebe por el único FK partidos.cancha_id, sin ambigüedad
        // (jugadores sí la tiene por el FK de `puso`, de ahí el nombre a dedo).
        .select('*, jugadores!jugadores_partido_id_fkey(*), canchas(*)')
        .eq('id', id)
        .single(),
      supabase.rpc('votacion_del_partido', { p_partido_id: id }),
    ]);

    setCargando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setVotacion((vot as VotacionAdmin | null) ?? null);
    const { jugadores, ...resto } = data as PartidoConCancha & { jugadores: Jugador[] };
    setP(resto as PartidoConCancha);
    setJs([...(jugadores ?? [])].sort((a, b) => a.orden - b.orden));
  }, [id]);

  useEffect(() => {
    cargar();
    crearCliente()
      .rpc('mis_amigos')
      .then(({ data }) => setAmigos((data ?? []) as Amigo[]));
    crearCliente()
      .rpc('avatares_de_partido', { p_partido_id: id })
      .then(({ data }) => {
        const mapa: Record<string, AvatarInfo> = {};
        ((data ?? []) as (AvatarInfo & { user_id: string })[]).forEach((a) => {
          mapa[a.user_id] = { avatar_url: a.avatar_url, username: a.username };
        });
        setAvatares(mapa);
      });
    crearCliente()
      .rpc('mis_solicitudes_enviadas')
      .then(({ data }) => {
        setSolicitudesEnviadas(new Set(((data ?? []) as { id_usuario: string }[]).map((s) => s.id_usuario)));
      });
  }, [cargar, id]);

  async function enviarSolicitud(uid: string) {
    setEnviandoSolicitud(uid);
    const supabase = crearCliente();
    const { data } = await supabase.rpc('enviar_solicitud', { p_para: uid });
    setEnviandoSolicitud(null);
    const r = data as { ok: boolean; estado?: 'pendiente' | 'aceptada' } | null;
    if (r?.estado === 'aceptada') {
      crearCliente()
        .rpc('mis_amigos')
        .then(({ data: mis }) => setAmigos((mis ?? []) as Amigo[]));
    } else if (r?.ok) {
      setSolicitudesEnviadas((prev) => new Set(prev).add(uid));
    }
  }

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

  const VISTAS: Vista[] = p.es_desafio
    ? (['desafio', 'plata', 'resultado'] as Vista[])
    : (['anotados', 'equipos', 'plata', 'resultado'] as Vista[]);
  /* Sin efecto: si la pestaña guardada no existe para este tipo de
     partido, se cae a la primera. Un `setVista` dentro de un efecto
     pintaría una vez la pestaña equivocada. */
  const vistaOk: Vista = VISTAS.includes(vista) ? vista : VISTAS[0];

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

  /**
   * `userId` llega cuando el que se suma es un amigo con cuenta: sin
   * eso la fila queda suelta y esa persona después no puede pedirte
   * amistad desde el partido ni recibir el resultado en su camino.
   */
  async function sumar(nombre: string, userId?: string | null) {
    const limpio = nombre.trim();
    if (!limpio) return;
    if (js.some((j) => j.nombre.toLowerCase() === limpio.toLowerCase())) {
      setError(`${limpio} ya está anotado.`);
      return;
    }
    if (userId && js.some((j) => j.user_id === userId)) {
      setError(`${limpio} ya está anotado con su cuenta.`);
      return;
    }
    setError(null);
    const supabase = crearCliente();
    const { data, error } = await supabase
      .from('jugadores')
      .insert({ partido_id: id, nombre: limpio, orden: js.length, user_id: userId ?? null })
      .select('*')
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setJs((prev) => [...prev, data as Jugador]);
  }

  /** Enganchar una fila cargada a mano con la cuenta de quien realmente es. */
  async function enganchar(jid: string, userId: string | null) {
    setError(null);
    const supabase = crearCliente();
    const { data, error } = await supabase.rpc('enganchar_anotado', {
      p_jugador_id: jid,
      p_user_id: userId,
    });
    const r = data as { ok: boolean; error?: string } | null;
    if (error || !r?.ok) {
      setError(r?.error || error?.message || 'No se pudo enganchar la cuenta.');
      return;
    }
    setJs((prev) => prev.map((j) => (j.id === jid ? { ...j, user_id: userId } : j)));
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

  /* ---------------- votar los equipos (0026) ----------------
     Todo pasa por RPC y después se recarga: abrir y cerrar reescriben
     `equipos` del lado del servidor, y adivinar el resultado acá sería
     tener dos verdades — el mismo criterio que `ArmarEquipo`. */

  async function rpcVotacion(fn: string, args: Record<string, unknown>, falla: string) {
    setError(null);
    const { data, error } = await crearCliente().rpc(fn, args);
    const r = data as { ok: boolean; error?: string } | null;
    if (error || !r?.ok) setError(r?.error || error?.message || falla);
    await cargar();
  }

  async function abrirVotacion() {
    const opciones = tresOpciones(js);
    if (!opciones) {
      setError('Con tan poca gente no salen tres repartos distintos.');
      return;
    }
    if (
      p?.equipos &&
      !(await confirmar('Se borran los equipos que hay ahora y votan entre tres nuevos. ¿Dale?', {
        boton: 'Que voten',
      }))
    )
      return;
    await rpcVotacion(
      'abrir_votacion_equipos',
      { p_partido_id: id, p_opciones: opciones },
      'No se pudo abrir la votación.',
    );
  }

  async function cerrarVotacion() {
    if (
      !(await confirmar('Se cierra ya y gana la opción más votada hasta ahora. ¿Cerrar?', {
        boton: 'Cerrar',
      }))
    )
      return;
    await rpcVotacion('cerrar_votacion_equipos', { p_partido_id: id }, 'No se pudo cerrar.');
  }

  async function cancelarVotacion() {
    if (
      !(await confirmar('Se borran las opciones y los votos. ¿Cancelar la votación?', {
        danger: true,
        boton: 'Cancelar votación',
      }))
    )
      return;
    await rpcVotacion('cancelar_votacion_equipos', { p_partido_id: id }, 'No se pudo cancelar.');
  }

  async function votar(opcion: number) {
    await rpcVotacion(
      'votar_equipos',
      { tok: p!.token, p_opcion: opcion, p_claim: null },
      'No se pudo votar.',
    );
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
            {p.canchas && (
              <a
                className="comoLlegar"
                href={comoLlegar(p.canchas.lat, p.canchas.lng)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ marginTop: 6 }}
              >
                Cómo llegar
              </a>
            )}
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

      {/* Un desafío no tiene sorteo ni lista suelta: los lados se
          declaran. Se le sacan las dos pestañas que no aplican en vez
          de dejarlas ahí sin hacer nada — sumar a alguien desde
          "anotados" lo dejaría sin lado y afuera de los dos equipos. */}
      <nav className="tabs" style={{ marginTop: 14, paddingBottom: 0 }}>
        {VISTAS.map((v) => (
          <a
            key={v}
            className={vistaOk === v ? 'on' : ''}
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

      {vistaOk === 'desafio' && (
        <DesafioVista
          p={p}
          js={js}
          amigos={amigos}
          onArmar={() => setArmando(true)}
          onCambio={actualizarPartido}
        />
      )}

      {vistaOk === 'anotados' && (
        <Anotados
          js={js}
          amigos={amigos}
          avatares={avatares}
          miId={p.user_id}
          solicitudesEnviadas={solicitudesEnviadas}
          onInv={actualizarJugador}
          onQuitar={quitar}
          onSumar={sumar}
          onEnganchar={enganchar}
          onAbrirPerfil={(uid, nombreJ) => setPerfilAbierto({ id: uid, nombre: nombreJ })}
        />
      )}
      {vistaOk === 'equipos' && (
        <EquiposVista
          js={js}
          equipos={p.equipos}
          votacion={votacion}
          onVotacion={abrirVotacion}
          onVotar={votar}
          onCerrarVotacion={cerrarVotacion}
          onCancelarVotacion={cancelarVotacion}
          onSortear={() => actualizarPartido({ equipos: sortear(js) })}
          onBorrar={() => actualizarPartido({ equipos: null, equipo_ganador: null })}
          onCambiar={(eq) => actualizarPartido({ equipos: eq })}
        />
      )}
      {vistaOk === 'plata' && (
        <PlataVista
          p={p}
          js={js}
          onPago={(jid, monto) => actualizarJugador(jid, { pagado: monto })}
          onPuso={(jid) => actualizarPartido({ puso: jid })}
          onCosto={(costo) => actualizarPartido({ costo })}
          onAlias={(alias_pago) => actualizarPartido({ alias_pago })}
        />
      )}
      {vistaOk === 'resultado' && <ResultadoVista p={p} onGuardar={actualizarPartido} />}

      {armando && (
        <ArmarEquipo
          partidoId={p.id}
          onCerrar={() => setArmando(false)}
          // `cargar` y no un merge local: la RPC reescribe `equipos`
          // entero del lado del servidor, y adivinarlo acá sería tener
          // dos verdades sobre la misma cosa.
          onListo={cargar}
        />
      )}

      {/* si todavía no hay nadie anotado, invitar es lo único que tiene sentido hacer.
          En un desafío no va: ahí hay DOS links, uno por equipo, y se
          comparten desde la pestaña del desafío. Este bloque manda el
          `token` a secas, que llenaría siempre el lado del anfitrión. */}
      {cab > 0 && !p.es_desafio && <Invitar p={p} onCambio={actualizarPartido} />}

      <div className="sec">Partido</div>
      <button className="btn danger wide sm" onClick={borrarPartido}>
        Borrar este partido
      </button>

      {confirmarUI}

      {perfilAbierto && (
        <PerfilModal
          userId={perfilAbierto.id}
          nombreFallback={perfilAbierto.nombre}
          estado={
            amigos.some((am) => am.id === perfilAbierto.id)
              ? 'amigo'
              : solicitudesEnviadas.has(perfilAbierto.id)
                ? 'pendiente'
                : 'ninguno'
          }
          procesando={enviandoSolicitud === perfilAbierto.id}
          onEnviarSolicitud={(uid) => enviarSolicitud(uid)}
          onCerrar={() => setPerfilAbierto(null)}
        />
      )}
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
  const cuando = `Se juega${p.lugar ? ' en ' + p.lugar : ''}${p.hora ? ' a las ' + p.hora : ''}.`;

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

      <CompartirLink token={p.token} texto={`${cuando} Anotate:`} />

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
  avatares,
  miId,
  solicitudesEnviadas,
  onInv,
  onQuitar,
  onSumar,
  onEnganchar,
  onAbrirPerfil,
}: {
  js: Jugador[];
  amigos: Amigo[];
  avatares: Record<string, AvatarInfo>;
  miId: string;
  solicitudesEnviadas: Set<string>;
  onInv: (id: string, campos: Partial<Jugador>) => void;
  onQuitar: (j: Jugador) => void;
  onSumar: (nombre: string, userId?: string | null) => Promise<void>;
  onEnganchar: (jid: string, userId: string | null) => Promise<void>;
  onAbrirPerfil: (uid: string, nombre: string) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [enviando, setEnviando] = useState(false);
  const anotados = new Set(js.map((j) => j.nombre.toLowerCase()));
  const conCuenta = new Set(js.map((j) => j.user_id).filter(Boolean) as string[]);
  const disponibles = amigos.filter(
    (a) => !anotados.has(a.nombre.toLowerCase()) && !conCuenta.has(a.id),
  );
  const sueltos = js.filter((j) => !j.user_id);
  let n = 0;

  async function agregar(unNombre: string, userId?: string | null) {
    if (!unNombre.trim() || enviando) return;
    setEnviando(true);
    await onSumar(unNombre, userId);
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
            const esOtroLogueado = !!(j.user_id && j.user_id !== miId);
            return (
              <div className="jug" key={j.id}>
                <span className="num">{etiqueta}</span>
                <span
                  className="jug-clic"
                  style={esOtroLogueado ? { cursor: 'pointer', display: 'contents' } : { display: 'contents' }}
                  onClick={() => esOtroLogueado && onAbrirPerfil(j.user_id!, j.nombre)}
                >
                  <Avatar nombre={j.nombre} url={j.user_id ? avatares[j.user_id]?.avatar_url : null} />
                  <span className="nom">
                    <b>{j.nombre}</b>
                    {inv > 0 ? (
                      <small>
                        +{inv} invitado{inv > 1 ? 's' : ''} · {1 + inv} lugares
                      </small>
                    ) : esOtroLogueado ? (
                      <small>
                        {solicitudesEnviadas.has(j.user_id!)
                          ? 'Solicitud pendiente'
                          : amigos.some((a) => a.id === j.user_id)
                            ? 'Tu amigo'
                            : 'Ver perfil'}
                      </small>
                    ) : null}
                  </span>
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
                onClick={() => agregar(a.nombre, a.id)}
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

      {sueltos.length > 0 && (
        <>
          <div className="sec">Quién es quién</div>
          <div className="card">
            {sueltos.map((j) => (
              <div className="quienEs" key={j.id}>
                <b>{j.nombre}</b>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) onEnganchar(j.id, e.target.value);
                  }}
                >
                  <option value="">— sin cuenta —</option>
                  <option value={miId}>Soy yo</option>
                  {amigos
                    .filter((a) => !conCuenta.has(a.id))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre}
                      </option>
                    ))}
                </select>
              </div>
            ))}
          </div>
          <div className="nota">
            Estos los cargaste a mano, así que la app no sabe de qué cuenta son. Marcalos y el
            resultado del partido les llega a <b>ellos</b> también: cada uno lo ve en su camino.
            Marcate a vos primero — sin eso no se sabe de qué lado del sorteo jugaste.
          </div>
        </>
      )}
    </>
  );
}

/* ================= DESAFÍO =================
   La pantalla del que armó el desafío. No hay bombo que apretar: los
   dos lados se declaran, así que lo único que se hace acá es juntar a
   los tuyos y conseguir rival.

   El lado del rival se muestra pero no se toca. Que el dueño del
   partido pueda desarmarle el equipo al otro sería raro, y además la
   RPC no se lo permite: `quitar_de_mi_lado` está acotada al lado
   propio. La UI no promete lo que la base va a rechazar.
   ========================================== */

function DesafioVista({
  p,
  js,
  amigos,
  onArmar,
  onCambio,
}: {
  p: PartidoConCancha;
  js: Jugador[];
  amigos: Amigo[];
  onArmar: () => void;
  onCambio: (campos: Partial<Partido>) => void;
}) {
  const [eligiendo, setEligiendo] = useState(false);

  const estado = estadoDesafio(p);
  const objetivo = porLado(p.cupo);
  const cabezasA = cabezasDeLado(js, 'a');
  const cabezasB = cabezasDeLado(js, 'b');

  /* Los nombres salen de las filas de `jugadores`: los dos capitanes
     tienen la suya, así que no hace falta ir a buscar perfiles. */
  const anfitrion = js.find((j) => j.user_id === p.user_id)?.nombre ?? null;
  const rivalNombre = p.rival_id ? (js.find((j) => j.user_id === p.rival_id)?.nombre ?? null) : null;
  const hayRival = estado === 'aceptado' || estado === 'jugado';

  // El que arma el desafío queda siempre del lado 'a' (lo escribe el
  // alta), así que `goles_favor` es el de los claros sin dar vuelta.
  const losDeB = js.filter((j) => j.lado === 'b');

  return (
    <>
      <div className="sec">El cruce</div>
      <Cruce
        nombreA={nombreDeLado(p.nombre_a, anfitrion)}
        nombreB={hayRival ? nombreDeLado(p.nombre_b, rivalNombre) : null}
        cabezasA={cabezasA}
        cabezasB={cabezasB}
        porLado={objetivo}
        estado={estado}
        golesA={p.goles_favor}
        golesB={p.goles_contra}
        ganador={p.equipo_ganador}
        onInvitar={hayRival ? undefined : () => setEligiendo((v) => !v)}
      />

      {!hayRival && eligiendo && (
        <>
          <div className="sec">A quién desafiás</div>
          <div className="canchaLista">
            <button
              type="button"
              className={`canchaChip${p.rival_id === null ? ' elegida' : ''}`}
              onClick={() => {
                onCambio({ rival_id: null });
                setEligiendo(false);
              }}
            >
              El que lo tome
            </button>
            {amigos.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`canchaChip${p.rival_id === a.id ? ' elegida' : ''}`}
                onClick={() => {
                  onCambio({ rival_id: a.id });
                  setEligiendo(false);
                }}
              >
                {a.nombre}
              </button>
            ))}
          </div>
          {amigos.length === 0 && (
            <div className="nota">
              Todavía no tenés amigos cargados. Dejalo abierto y sumá gente en <b>Amigos</b>.
            </div>
          )}
        </>
      )}

      <div className="sec">Tu equipo</div>
      <button className="btn pri wide" onClick={onArmar}>
        {cabezasA >= objetivo ? 'Ver tu equipo' : `Armar tu equipo · faltan ${objetivo - cabezasA}`}
      </button>

      {/* El link es SOLO del lado del anfitrión: el que lo abre cae en
          su equipo. El del rival lo tiene el otro capitán, en su propia
          pantalla — si los dos mandaran el mismo, se llenaría un solo
          lado y nadie se enteraría hasta el día del partido. */}
      <div className="sec">
        El link de tu equipo
        <button className="act" onClick={() => onCambio({ abierto: !p.abierto })}>
          {p.abierto ? 'cerrar anotaciones' : 'reabrir'}
        </button>
      </div>
      <CompartirLink
        token={p.token}
        id="linkLadoA"
        texto={`Jugamos${p.lugar ? ' en ' + p.lugar : ''}${p.hora ? ' a las ' + p.hora : ''}. Sumate a ${nombreDeLado(p.nombre_a, anfitrion)}:`}
      />
      <div className="nota">
        El que abre este link cae en <b>tu</b> equipo y <b>no necesita cuenta</b>. El equipo de
        enfrente tiene su propio link, que comparte su capitán.
      </div>

      {hayRival && (
        <>
          <div className="sec">Los de enfrente</div>
          <div className="card">
            {losDeB.length === 0 ? (
              <div className="vacio">
                {rivalNombre || 'El rival'} todavía no sumó a nadie.
              </div>
            ) : (
              losDeB.map((j, i) => (
                <div className="jug" key={j.id}>
                  <span className="num">{i + 1}</span>
                  <Avatar nombre={j.nombre} url={null} />
                  <span className="nom">
                    <b>{j.nombre}</b>
                    {(j.invitados || 0) > 0 && <small>+{j.invitados} invitado{j.invitados > 1 ? 's' : ''}</small>}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="nota">
            El equipo de enfrente lo arma su capitán. Vos no se lo podés tocar.
          </div>
        </>
      )}

      {/* El link para conseguir rival. Es el mismo `token_b` que después
          va a ser el link de ese equipo: el primero que lo abra con su
          cuenta se queda con la capitanía y de ahí en más lo usa para
          sumar a los suyos. Un solo link para las dos cosas. */}
      {!hayRival && !p.rival_id && p.token_b && (
        <>
          <div className="sec">El link para el otro equipo</div>
          <CompartirLink
            token={p.token_b}
            id="linkLadoB"
            texto={`Te desafío${p.lugar ? ' en ' + p.lugar : ''}${p.hora ? ' a las ' + p.hora : ''}. El primero que entre arma el equipo:`}
          />
          <div className="nota">
            Mandalo al grupo del otro equipo. <b>El primero que entre con su cuenta</b> queda de
            capitán y desde ahí suma a los suyos con este mismo link. No hace falta que sea amigo
            tuyo.
          </div>
        </>
      )}

      {!hayRival && (
        <div className="nota">
          {p.rival_id
            ? 'Le mandaste el desafío a alguien puntual y todavía no contestó. Mientras esté dirigido, nadie más se lo puede quedar por link. Tocá el renglón en blanco para cambiar de rival o dejarlo abierto.'
            : 'También le aparece a tus amigos en su pantalla de Partidos, y lo toma el primero que quiera. Tocá el renglón en blanco para desafiar a alguien puntual.'}
        </div>
      )}
    </>
  );
}

/* ================= EQUIPOS ================= */

function EquiposVista({
  js,
  equipos,
  votacion,
  onVotacion,
  onVotar,
  onCerrarVotacion,
  onCancelarVotacion,
  onSortear,
  onBorrar,
  onCambiar,
}: {
  js: Jugador[];
  equipos: Equipos | null;
  votacion: VotacionAdmin | null;
  onVotacion: () => Promise<void>;
  onVotar: (opcion: number) => Promise<void>;
  onCerrarVotacion: () => Promise<void>;
  onCancelarVotacion: () => Promise<void>;
  onSortear: () => void;
  onBorrar: () => void;
  onCambiar: (eq: Equipos) => void;
}) {
  const lista = cabezasLista(js);
  const [sel, setSel] = useState<Seleccion | null>(null);
  const [ocupado, setOcupado] = useState(false);

  /** Un solo toque a la vez: votar dos veces seguidas por nervios no
   *  pasa en la base (un voto por fila), pero el botón no lo promete. */
  async function con(accion: () => Promise<void>) {
    if (ocupado) return;
    setOcupado(true);
    await accion();
    setOcupado(false);
  }

  /* Con menos de 3 cabezas no hay tres repartos distintos (con 2 hay
     uno solo): el botón ni aparece en vez de fallar al tocarlo. */
  const sePuedeVotar = lista.length >= 3;
  const botonVotacion = sePuedeVotar && (
    <button
      className="btn wide"
      style={{ marginTop: 10 }}
      onClick={() => {
        setSel(null);
        con(onVotacion);
      }}
      disabled={ocupado}
    >
      Sortear 3 opciones y que voten
    </button>
  );

  if (votacion?.abierta)
    return (
      <VotacionAnfitrion
        v={votacion}
        cabezasAhora={lista.length}
        ocupado={ocupado}
        onVotar={(i) => con(() => onVotar(i))}
        onCerrar={() => con(onCerrarVotacion)}
        onCancelar={() => con(onCancelarVotacion)}
      />
    );

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
        {botonVotacion}
        <div className="nota">
          Los invitados entran al bombo como uno más — no van necesariamente con el que los trajo.
          {sePuedeVotar && (
            <>
              {' '}
              Si no querés decidir vos, sorteá <b>tres</b> repartos y que elijan los que juegan: les
              llega un aviso y cada uno vota uno.
            </>
          )}
        </div>
      </>
    );

  const cambio = equipos.n !== lista.length;
  const eq = equipos;

  /* Tocar es agarrar. Con alguien agarrado, tocar del otro lado los
     cambia de camiseta; tocar del mismo lado agarra a ese otro. La
     selección se suelta después de cada cambio: los índices que guarda
     ya no significan lo mismo. */
  function tocar(lado: Lado, i: number) {
    if (!sel) {
      setSel({ lado, i });
      return;
    }
    if (sel.lado === lado) {
      setSel(sel.i === i ? null : { lado, i });
      return;
    }
    onCambiar(intercambiar(eq, sel.lado, sel.i, i));
    setSel(null);
  }

  function pasarSel() {
    if (!sel) return;
    onCambiar(pasar(eq, sel.lado, sel.i));
    setSel(null);
  }

  const agarrado = sel ? eq[sel.lado][sel.i] : null;

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
        <ColumnaEquipo
          arr={eq.a}
          nombre="Claros"
          tono="claros"
          lado="a"
          sel={sel}
          onTocar={tocar}
        />
        <ColumnaEquipo
          arr={eq.b}
          nombre="Oscuros"
          tono="oscuros"
          lado="b"
          sel={sel}
          onTocar={tocar}
        />
      </div>

      {agarrado ? (
        <div className="agarre">
          <span className="ag-quien">
            <b>{agarrado.inv ? 'Inv. de ' + agarrado.de : agarrado.label}</b>
            <small>Tocá a uno del otro equipo para cambiarlos</small>
          </span>
          <button className="btn sm" onClick={pasarSel}>
            Pasar a {sel!.lado === 'a' ? 'oscuros' : 'claros'}
          </button>
          <button className="btn sm" onClick={() => setSel(null)}>
            Soltar
          </button>
        </div>
      ) : (
        <div className="nota" style={{ marginTop: 10 }}>
          Tocá un nombre para agarrarlo y emparejar los equipos a mano.
        </div>
      )}

      <div className="row2" style={{ marginTop: 14 }}>
        <button
          className="btn pri"
          onClick={() => {
            setSel(null);
            onSortear();
          }}
        >
          Sortear de nuevo
        </button>
        <button
          className="btn"
          onClick={() => {
            setSel(null);
            onBorrar();
          }}
        >
          Borrar
        </button>
      </div>
      {botonVotacion}
      <div className="nota">
        El sorteo queda guardado, con los cambios a mano y todo. Si sumás o sacás gente, te aviso
        para que vuelvas a sortear.
      </div>
    </>
  );
}

/* ================= VOTACIÓN (anfitrión) =================
   Lo que ve el que abrió la votación mientras está abierta: las tres
   opciones (y su voto, si juega), cuántos votaron y QUIÉN falta. Qué
   votó cada uno no lo ve nadie, ni él: la base no lo devuelve.
   ======================================================== */

function VotacionAnfitrion({
  v,
  cabezasAhora,
  ocupado,
  onVotar,
  onCerrar,
  onCancelar,
}: {
  v: VotacionAdmin;
  cabezasAhora: number;
  ocupado: boolean;
  onVotar: (i: number) => void;
  onCerrar: () => void;
  onCancelar: () => void;
}) {
  const mayoria = Math.floor(v.total / 2) + 1;
  const pueden = v.faltan.filter((f) => f.puede);
  const sinCuenta = v.faltan.filter((f) => !f.puede);
  /* Las opciones se armaron con la lista de ese momento: alguien que se
     sumó después no está en ninguna. Mismo aviso que el del sorteo. */
  const cambio = (v.opciones[0]?.n ?? cabezasAhora) !== cabezasAhora;

  return (
    <>
      <div className="sec">Votación de equipos</div>
      <div className="card" style={{ padding: '12px 13px' }}>
        <div className="votoAvance">
          <b>
            {v.votaron}/{v.total}
          </b>
          <span>votaron · se cierra sola cuando una opción llega a {mayoria}</span>
        </div>
      </div>

      {cambio && (
        <div className="aviso-cambio" style={{ marginTop: 10 }}>
          La lista cambió desde que abriste la votación (ahora son {cabezasAhora} y las opciones
          tienen {v.opciones[0]?.n}). Conviene cancelarla y abrir otra.
        </div>
      )}

      <div className="sec">Faltan votar · {pueden.length}</div>
      <div className="card">
        {pueden.length === 0 ? (
          <div className="vacio">Ya votaron todos los que pueden.</div>
        ) : (
          pueden.map((f, i) => (
            <div className="jug" key={i}>
              <Avatar nombre={f.nombre} url={null} />
              <span className="nom">
                <b>{f.nombre}</b>
              </span>
            </div>
          ))
        )}
      </div>
      {sinCuenta.length > 0 && (
        <div className="nota">
          <b>{sinCuenta.map((f) => f.nombre).join(', ')}</b>{' '}
          {sinCuenta.length === 1 ? 'no puede votar: lo cargaste' : 'no pueden votar: los cargaste'} a
          mano y la app no sabe quién {sinCuenta.length === 1 ? 'es' : 'son'}. Enganchalos en{' '}
          <b>Anotados → Quién es quién</b> y pasan a votar.
        </div>
      )}

      <div className="sec">Las opciones</div>
      <VotarEquipos
        opciones={v.opciones}
        miVoto={v.mi_voto}
        votando={ocupado}
        onVotar={v.puedo_votar ? onVotar : undefined}
      />
      <div className="nota">
        {v.puedo_votar
          ? v.mi_voto === null
            ? 'Vos también votás, como uno más.'
            : 'Ya votaste. El voto no se cambia.'
          : 'No estás anotado en este partido, así que no votás.'}{' '}
        Los votos son secretos: ves quién falta, no qué votó cada uno.
      </div>

      <div className="row2" style={{ marginTop: 14 }}>
        <button className="btn pri" onClick={onCerrar} disabled={ocupado || v.votaron === 0}>
          Cerrar ya
        </button>
        <button className="btn danger" onClick={onCancelar} disabled={ocupado}>
          Cancelar
        </button>
      </div>
      <div className="nota">
        <b>Cerrar ya</b> elige la más votada hasta ahora. Si votan todos y ninguna llega a la
        mayoría, gana la más votada; si empatan, decide el azar entre esas. La que gana queda como
        los equipos del partido y la podés retocar a mano como siempre.
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
  onAlias,
}: {
  p: Partido;
  js: Jugador[];
  onPago: (jid: string, monto: number) => void;
  onPuso: (jid: string | null) => void;
  onCosto: (costo: number) => void;
  onAlias: (alias: string | null) => void;
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

          /* Dijo que transfirió y todavía no lo confirmaste. No es lo
             mismo que haber pagado — por eso es un aviso y no un tilde
             puesto solo. Tocar el círculo es confirmarlo. */
          const aviso = !!j.aviso_pago_en && !listo;

          const detalle = esPagador
            ? `adelantó ${plata(p.costo)} · su parte está cubierta`
            : listo
              ? `pagó ${plata(d)}`
              : aviso
                ? `dice que te transfirió ${plata(d - pg)} · confirmá con el círculo`
                : pg > 0
                  ? `puso ${plata(pg)} de ${plata(d)}`
                  : `debe ${plata(d)}`;

          return (
            <div className={`pago${aviso ? ' avisado' : ''}`} key={j.id}>
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
                  {aviso && <span className="chip avisa">avisó</span>}
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

      <div className="sec">
        Tu alias para que te transfieran
        <button
          className="act"
          onClick={() => {
            const v = prompt('Alias o CVU donde te transfieren:', p.alias_pago ?? '');
            if (v === null) return;
            onAlias(v.trim() || null);
          }}
        >
          {p.alias_pago ? 'cambiar' : 'poner'}
        </button>
      </div>
      <div className="card">
        <div style={{ padding: '12px 13px' }}>
          {p.alias_pago ? (
            <code className="aliasCode">{p.alias_pago}</code>
          ) : (
            <span className="vacio" style={{ padding: 0 }}>
              Sin alias: los anotados no tienen a dónde transferirte.
            </span>
          )}
        </div>
      </div>
      <div className="nota">
        Lo ven los anotados junto a lo que le toca a cada uno. Cuando alguien te transfiere y toca
        <b> “ya te transferí”</b>, te llega un aviso y la fila queda marcada — vos confirmás con el
        círculo cuando lo veas en tu cuenta.
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

const OPCIONES: { v: Resultado; Ico: () => React.ReactElement; txt: string; cls: string }[] = [
  { v: 'ganamos', Ico: () => <Copita tam={19} />, txt: 'Ganamos', cls: 'gano' },
  { v: 'empate', Ico: () => <MarcaEmpate />, txt: 'Empate', cls: 'emp' },
  { v: 'perdimos', Ico: () => <MarcaPerdio />, txt: 'Perdimos', cls: 'perd' },
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
      // Sin rival no hay lado ganador que valga: escribirlo acá sería
      // colarle el resultado por la puerta del marcador justo después
      // de haberlo negado en el control de arriba.
      if (miLado && !faltaRival) campos.equipo_ganador = ganadorSegun(campos.resultado);
    }
    onGuardar(campos);
  }

  /* De qué lado del sorteo jugaste vos. Acá `p.user_id` sos vos sí o sí:
     esta pantalla lee `partidos` con su RLS, que solo devuelve los tuyos.
     El lado sale del `uid` que guarda cada cabeza; los sorteos viejos no
     lo tienen y los anotados que nunca se engancharon a una cuenta
     tampoco. Si no se sabe, el resultado sigue siendo tuyo y de nadie
     más. */
  const miLado = ladoDeCuenta(p.equipos, p.user_id);
  /* En un desafío puede haber `equipos` con un solo lado cargado: el
     que lo armó junta a los suyos y el rival nunca aparece. Marcar
     ganador ahí le repartiría un resultado a los de tu lado por un
     partido que tuvo un equipo solo — el mismo modo de falla que
     `cierra_mundial`: un control que escribe algo incoherente en vez
     de negarse. */
  const faltaRival = !!p.es_desafio && (p.equipos?.b.length ?? 0) === 0;
  const hayEquipos = !!p.equipos && !faltaRival;

  /** El lado que ganó, deducido de cómo te fue a vos. */
  function ganadorSegun(r: Resultado | null): Lado | null {
    if (!miLado || !r || r === 'empate') return null;
    return r === 'ganamos' ? miLado : miLado === 'a' ? 'b' : 'a';
  }

  function elegirResultado(r: Resultado | null) {
    const campos: Partial<Partido> = { resultado: r };
    // Sin saber de qué lado jugaste no hay nada que deducir: se deja
    // como está para no borrar un ganador ya cargado a mano.
    if (miLado || !r) campos.equipo_ganador = ganadorSegun(r);
    onGuardar(campos);
  }

  function elegirGanador(g: Lado | null) {
    const campos: Partial<Partido> = { equipo_ganador: g };
    // Sin saber de qué lado jugaste, `resultado` no se toca: inventarle
    // uno acá dejaría la fila diciendo dos cosas distintas.
    if (miLado) campos.resultado = resultadoPara(miLado, g);
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
            onClick={() => elegirResultado(p.resultado === o.v ? null : o.v)}
          >
            <span className="ico">
              <o.Ico />
            </span>
            {o.txt}
          </button>
        ))}
      </div>

      {faltaRival && (
        <div className="nota">
          Este desafío todavía no tiene rival, así que no hay a quién ganarle: cuando alguien lo
          tome y arme su equipo, acá vas a poder marcar qué lado ganó. Lo de arriba queda como
          resultado tuyo y no le llega a nadie más.
        </div>
      )}

      {hayEquipos && (
        <>
          <div className="sec">¿Qué equipo ganó?</div>
          <div className="ganador">
            {([
              { g: 'a' as Lado, txt: 'Claros', tono: 'claros' },
              { g: null, txt: 'Empate', tono: null },
              { g: 'b' as Lado, txt: 'Oscuros', tono: 'oscuros' },
            ] as const).map((o) => {
              const activo =
                o.g === null
                  ? p.resultado === 'empate' && !p.equipo_ganador
                  : p.equipo_ganador === o.g;
              return (
                <button
                  key={o.txt}
                  className={activo ? 'on' : ''}
                  onClick={() => elegirGanador(activo ? null : o.g)}
                >
                  {o.tono && <span className={`chaleco ${o.tono}`} />}
                  {o.txt}
                </button>
              );
            })}
          </div>
          <div className="nota">
            {miLado ? (
              <>
                Esto es lo que le llega al resto: cada uno que jugó y tiene cuenta lo ve en{' '}
                <b>su</b> camino, ganado o perdido según de qué lado estuvo. Vos jugaste con los{' '}
                <b>{miLado === 'a' ? 'claros' : 'oscuros'}</b>.
              </>
            ) : (
              <>
                No sé de qué lado jugaste vos, así que esto todavía no le llega a nadie. Andá a{' '}
                <b>Anotados → Quién es quién</b> y marcate.
              </>
            )}
          </div>
        </>
      )}

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
