'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { crearCliente } from '@/lib/supabase/client';
import type { Amigo, MiParte, PartidoPublico, RespuestaRPC } from '@/lib/tipos';
import { fechaLarga, plata } from '@/lib/calculos';
import { comoLlegar } from '@/lib/mapa';
import { Copita } from '@/components/Copa';
import { useConfirmar } from '@/components/Confirmar';
import BotonGoogle from '@/components/BotonGoogle';
import Shell from '@/components/Shell';
import PerfilModal from '@/components/PerfilModal';
import Avatar from '@/components/Avatar';
import EquiposMirar from '@/components/Equipos';
import BotonPlaca from '@/components/BotonPlaca';

/** El claim vive solo en este navegador: es lo único que te deja editar lo tuyo. */
function claimGuardado(token: string): string {
  const clave = 'mimundial.claim.' + token;
  let c = localStorage.getItem(clave);
  if (!c) {
    c = crypto.randomUUID();
    localStorage.setItem(clave, c);
  }
  return c;
}
/** Lee el claim SIN crear uno: para preguntar "¿cuánto me toca?" no hace
 *  falta reservarle identidad a alguien que quizá solo está mirando. */
const claimLeido = (token: string) => localStorage.getItem('mimundial.claim.' + token);

const yaAnotado = (token: string) => localStorage.getItem('mimundial.anotado.' + token) === '1';
const marcarAnotado = (token: string, v: boolean) =>
  v
    ? localStorage.setItem('mimundial.anotado.' + token, '1')
    : localStorage.removeItem('mimundial.anotado.' + token);

export default function Invitacion() {
  const { token } = useParams<{ token: string }>();
  const { confirmar, ui: confirmarUI } = useConfirmar();

  const [p, setP] = useState<PartidoPublico | null>(null);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [invitados, setInvitados] = useState(0);
  const [mio, setMio] = useState(false);
  /** true si mi anotación quedó identificada por la cuenta (auth.uid), no
   *  por el claim del navegador: ahí las acciones van por las RPC nuevas,
   *  que no dependen de localStorage y funcionan desde cualquier dispositivo. */
  const [viaCuenta, setViaCuenta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [miId, setMiId] = useState<string | null>(null);
  const [miNombreCuenta, setMiNombreCuenta] = useState('vos');
  const [miUsername, setMiUsername] = useState<string | null>(null);
  const [miAvatarUrl, setMiAvatarUrl] = useState<string | null>(null);
  const [amigos, setAmigos] = useState<Amigo[]>([]);
  const [agregando, setAgregando] = useState<string | null>(null);
  const [solicitudesEnviadas, setSolicitudesEnviadas] = useState<Set<string>>(new Set());
  /** true en cuanto se supo si hay sesión o no — evita el parpadeo de
   *  mostrar la pantalla pública un instante antes de meter el Shell. */
  const [sesionLista, setSesionLista] = useState(false);
  const [perfilAbierto, setPerfilAbierto] = useState<{ id: string; nombre: string } | null>(null);
  /** Lo que me toca a mi de la plata. Viene aparte de ver_partido_por_token
   *  porque es lo unico que depende de quien pregunta (ver 0015). */
  const [miParte, setMiParte] = useState<MiParte | null>(null);
  /** cargar() y el fetch del perfil corren en paralelo y ninguno espera al
   *  otro: esta ref evita que el nombre de perfil pise el de la anotación
   *  ya existente, gane quien gane la carrera. */
  const tengoFilaPropia = useRef(false);

  const cargar = useCallback(async () => {
    const supabase = crearCliente();
    /* Dos llamadas: el partido (igual para todos) y lo mio (depende de
       quien pregunta). El claim se LEE, no se crea: al que solo mira no
       hace falta reservarle identidad. */
    const [{ data, error }, { data: parte }] = await Promise.all([
      supabase.rpc('ver_partido_por_token', { tok: token }),
      supabase.rpc('mi_parte', { tok: token, p_claim: claimLeido(token) }),
    ]);
    setCargando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMiParte((parte as MiParte | null) ?? null);
    const partido = data as PartidoPublico | null;
    setP(partido);
    // El logueado que ya tiene fila acá se reconoce por la cuenta, sin
    // depender de que este sea el mismo navegador donde se anotó.
    if (partido?.soy_anotado) {
      tengoFilaPropia.current = true;
      setMio(true);
      setViaCuenta(true);
      setNombre(partido.mi_nombre ?? '');
      setInvitados(partido.mi_invitados ?? 0);
    }
  }, [token]);

  useEffect(() => {
    cargar();
    setMio(yaAnotado(token));
    const guardadoNombre = localStorage.getItem('mimundial.nombre') || '';
    setNombre(guardadoNombre);

    // Si el que abre el link tiene cuenta: se anota con su nombre real,
    // queda enlazado al partido y puede sumar de amigo a los demás
    // anotados que también tengan cuenta.
    (async () => {
      const supabase = crearCliente();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setSesionLista(true);
        return;
      }
      setMiId(user.id);

      const [{ data: perfil }, { data: mis }, { data: env }] = await Promise.all([
        supabase.from('perfiles').select('nombre, username, avatar_url').eq('id', user.id).single(),
        supabase.rpc('mis_amigos'),
        supabase.rpc('mis_solicitudes_enviadas'),
      ]);
      setAmigos((mis ?? []) as Amigo[]);
      setSolicitudesEnviadas(new Set(((env ?? []) as { id_usuario: string }[]).map((s) => s.id_usuario)));

      const suNombre =
        perfil?.nombre ||
        (user.user_metadata?.full_name as string) ||
        user.email?.split('@')[0] ||
        '';
      setMiUsername(perfil?.username ?? null);
      setMiAvatarUrl(perfil?.avatar_url ?? null);
      if (suNombre) setMiNombreCuenta(suNombre);
      // el nombre de la cuenta manda sobre lo que quedó guardado en el
      // navegador, pero nunca sobre el nombre con el que ya está anotado
      if (suNombre && !tengoFilaPropia.current) setNombre(suNombre);
      setSesionLista(true);
    })();
  }, [cargar, token]);

  async function enviarSolicitud(id: string) {
    setAgregando(id);
    const supabase = crearCliente();
    const { data, error } = await supabase.rpc('enviar_solicitud', { p_para: id });
    setAgregando(null);
    const r = data as (RespuestaRPC & { estado?: 'pendiente' | 'aceptada' }) | null;
    if (error || !r?.ok) {
      setError(r?.error || error?.message || 'No se pudo enviar la solicitud.');
      return;
    }
    if (r.estado === 'aceptada') {
      setAmigos((prev) => [...prev, { id, nombre: p?.anotados.find((a) => a.user_id === id)?.nombre || '' }]);
    } else {
      setSolicitudesEnviadas((prev) => new Set(prev).add(id));
    }
  }

  /**
   * El anfitrión te cargó a mano: esa fila existe pero no está atada a
   * ninguna cuenta. Reclamarla es lo único que hace que el partido
   * cuente para tu camino — y evita quedar anotado dos veces.
   */
  async function reclamar(jugadorId: string, nombreFila: string) {
    if (!(await confirmar(`¿"${nombreFila}" sos vos? Esa anotación pasa a tu cuenta.`, { boton: 'Sí, soy yo' })))
      return;
    setGuardando(true);
    const supabase = crearCliente();
    const { data, error } = await supabase.rpc('reclamar_anotacion', {
      tok: token,
      p_jugador_id: jugadorId,
    });
    setGuardando(false);
    const r = data as RespuestaRPC | null;
    if (error || !r?.ok) {
      setError(r?.error || error?.message || 'No se pudo.');
      return;
    }
    marcarAnotado(token, true);
    cargar();
  }

  async function anotarse() {
    setError(null);
    setGuardando(true);
    const supabase = crearCliente();
    const { data, error } = await supabase.rpc('anotarse', {
      tok: token,
      p_nombre: nombre,
      p_invitados: invitados,
      p_claim: claimGuardado(token),
    });
    setGuardando(false);
    const r = data as RespuestaRPC | null;
    if (error || !r?.ok) {
      setError(r?.error || error?.message || 'No se pudo anotar.');
      return;
    }
    localStorage.setItem('mimundial.nombre', nombre.trim());
    marcarAnotado(token, true);
    setMio(true);
    cargar();
  }

  async function actualizar() {
    setError(null);
    setGuardando(true);
    const supabase = crearCliente();
    const { data, error } = viaCuenta
      ? await supabase.rpc('actualizar_mi_anotacion', {
          p_partido_id: p!.id,
          p_nombre: nombre,
          p_invitados: invitados,
        })
      : await supabase.rpc('actualizar_anotado', {
          p_claim: claimGuardado(token),
          p_nombre: nombre,
          p_invitados: invitados,
        });
    setGuardando(false);
    const r = data as RespuestaRPC | null;
    if (error || !r?.ok) {
      setError(r?.error || error?.message || 'No se pudo actualizar.');
      return;
    }
    cargar();
  }

  async function bajarse() {
    if (!(await confirmar('¿Te bajás del partido?', { danger: true, boton: 'Bajarme' }))) return;
    setGuardando(true);
    const supabase = crearCliente();
    if (viaCuenta) {
      await supabase.rpc('bajarme_de_partido', { p_partido_id: p!.id });
    } else {
      await supabase.rpc('borrarse', { p_claim: claimGuardado(token) });
    }
    setGuardando(false);
    marcarAnotado(token, false);
    setMio(false);
    setViaCuenta(false);
    setInvitados(0);
    cargar();
  }

  if (cargando || !sesionLista) return <div className="cargando">Cargando…</div>;

  if (!p)
    return (
      <div className="login">
        <div className="logo">
          <Copita tam={28} />
        </div>
        <h1>Link inválido</h1>
        <p className="sub">Este partido no existe o el anfitrión lo borró.</p>
      </div>
    );

  const completo = p.faltan === 0;

  /* Logueado: se ve como el resto de la app, con la misma barra de
     navegación — no como una pantalla pública suelta. Sin cuenta sigue
     siendo la landing sola, que es lo que necesita el invitado sin
     fricción.

     El contenido va en una variable y la envoltura se elige abajo con
     un ternario. NO definir acá un componente `Envoltorio`: sería una
     función nueva en cada render, React la vería como otro tipo de
     componente y desmontaría todo el subárbol en cada tecla. Eso
     destruía el <input> de "Tu nombre" letra por letra y en el celular
     cerraba el teclado — había que tocar el campo para cada letra. */
  const contenido = (
    <>
      <div className="invitacion">
      <div className="inv-marca">
        <span className="dot">
          <Copita tam={11} />
        </span>{' '}
        MiMundial
      </div>

      <div className={`cancha ${completo ? 'completa' : ''}`}>
        <div className="cancha-lineas" />
        <div className="cancha-contenido">
          <div className="inv-invita">
            {p.anfitrion ? <b>{p.anfitrion}</b> : 'Alguien'} te invita a jugar
          </div>
          <div className="inv-lugar">{p.lugar || 'Partido'}</div>
          <div className="inv-cuando">
            {fechaLarga(p.fecha)}
            {p.hora ? ' · ' + p.hora : ''}
          </div>

          {/* El que abre este link es justo el que no sabe dónde queda.
              No embebemos mapa acá: un botón que abre el Maps del
              celular es lo que se usa en la mano, y no carga tiles
              para alguien sin cuenta. */}
          {p.cancha_lat != null && p.cancha_lng != null && (
            <a
              className="comoLlegar"
              href={comoLlegar(p.cancha_lat, p.cancha_lng)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginTop: 10 }}
            >
              Cómo llegar
            </a>
          )}
          {p.cancha_notas && <div className="inv-notas">{p.cancha_notas}</div>}

          <div className="marcador-cupo">
            <span className="mc-n">{p.cabezas}</span>
            <span className="mc-sep">/</span>
            <span className="mc-t">{p.cupo}</span>
          </div>
          <div className="inv-faltan">
            {completo ? '¡Está completo!' : p.faltan === 1 ? 'Falta 1' : `Faltan ${p.faltan}`}
          </div>
        </div>
      </div>

      {!p.abierto && (
        <div className="msg info" style={{ marginTop: 14 }}>
          El anfitrión cerró las anotaciones.
        </div>
      )}

      {p.abierto && (
        <>
          {/* El que llega sin cuenta: primero el camino que le deja algo
              después del partido, y recién abajo el atajo de invitado. */}
          {!miId && !mio && (
            <>
              <div className="sec">Anotate con tu cuenta</div>
              <div className="card" style={{ padding: 14 }}>
                <BotonGoogle destino={`/p/${token}`} texto="Entrar con Google" />
                <div className="nota" style={{ marginTop: 12 }}>
                  Te anotás con tu nombre y arrancás <b>tu propio Mundial</b>: cada partido que
                  ganás te hace avanzar una instancia. Siete al hilo y levantás la copa.
                </div>
              </div>
            </>
          )}

          <div className="sec">
            {mio ? 'Tu anotación' : miId ? 'Anotate' : 'O anotate sin cuenta'}
          </div>

          {miId && !mio && (
            <div className="comoEntras">
              <Avatar nombre={nombre || '?'} url={miAvatarUrl} />
              <span>
                Entrás como <b>{nombre}</b>
                {miUsername ? ` · @${miUsername}` : ''}
              </span>
            </div>
          )}

          <div className="card" style={{ padding: 14 }}>
            <div className="campo">
              <label>Tu nombre</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Cómo te conocen"
                maxLength={40}
              />
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label>¿Llevás a alguien?</label>
              <div className="contador">
                <button onClick={() => setInvitados(Math.max(0, invitados - 1))} disabled={invitados === 0}>
                  −
                </button>
                <span>
                  {invitados === 0 ? 'Voy solo' : `+${invitados} invitado${invitados > 1 ? 's' : ''}`}
                </span>
                <button onClick={() => setInvitados(Math.min(5, invitados + 1))}>+</button>
              </div>
            </div>
          </div>

          <div className="row2" style={{ marginTop: 12 }}>
            {mio ? (
              <>
                <button className="btn pri" onClick={actualizar} disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Guardar cambios'}
                </button>
                <button className="btn danger" onClick={bajarse} disabled={guardando}>
                  Me bajo
                </button>
              </>
            ) : (
              <button className="btn pri wide" onClick={anotarse} disabled={guardando || completo}>
                {completo
                  ? 'Ya está completo'
                  : guardando
                    ? 'Anotando…'
                    : miId
                      ? 'Anotarme'
                      : 'Anotarme sin cuenta'}
              </button>
            )}
          </div>

          {error && <div className="msg err">{error}</div>}

          {!miId && (
            <div className="nota">
              Sin cuenta solo podés manejar <b>tu</b> lugar y los que llevás vos, y desde este
              teléfono. {mio ? 'Si entrás con Google se te guarda el historial.' : ''}
            </div>
          )}
        </>
      )}

      {/* Ya se anotó como invitado: recién ahí se le ofrece la cuenta,
          cuando el trámite que vino a hacer ya está resuelto. */}
      {mio && !miId && (
        <>
          <div className="sec">Llevá tu propio Mundial</div>
          <div className="card" style={{ padding: 14 }}>
            <BotonGoogle destino={`/p/${token}`} texto="Entrar con Google" />
            <div className="nota" style={{ marginTop: 12 }}>
              Cada partido que ganás te hace avanzar una instancia: grupos, octavos, cuartos,
              semi y final. Siete al hilo y levantás la copa.
            </div>
          </div>
        </>
      )}

      <div className="sec">Quiénes van · {p.cabezas}</div>
      <div className="card">
        {p.anotados.length === 0 ? (
          <div className="vacio">Nadie todavía. Sé el primero.</div>
        ) : (
          p.anotados.map((a, i) => {
            const yaEsAmigo = a.user_id ? amigos.some((am) => am.id === a.user_id) : false;
            const pendiente = a.user_id ? solicitudesEnviadas.has(a.user_id) : false;
            const esOtroLogueado = !!(miId && a.user_id && a.user_id !== miId);
            /* Fila sin dueño y yo todavía sin lugar acá: puedo decir que
               soy yo. `mio` además de `soy_anotado` porque el que se anotó
               sin cuenta desde este mismo navegador y después entró con
               Google no tiene user_id en su fila — sin ese chequeo termina
               anotado dos veces. */
            const puedoReclamar = !!(miId && a.reclamable && a.id && !p.soy_anotado && !mio);
            return (
              <div
                className="jug"
                key={i}
                style={esOtroLogueado ? { cursor: 'pointer' } : undefined}
                onClick={() =>
                  esOtroLogueado && setPerfilAbierto({ id: a.user_id!, nombre: a.nombre })
                }
              >
                <Avatar nombre={a.nombre} url={a.avatar_url} />
                <span className="nom">
                  <b>{a.nombre}</b>
                  <small>
                    {a.username ? '@' + a.username : ''}
                    {a.username && a.invitados > 0 ? ' · ' : ''}
                    {a.invitados > 0 ? `+${a.invitados} invitado${a.invitados > 1 ? 's' : ''}` : ''}
                  </small>
                </span>
                {esOtroLogueado && !yaEsAmigo && !pendiente && (
                  <button
                    className="btn sm"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      enviarSolicitud(a.user_id!);
                    }}
                    disabled={agregando === a.user_id}
                  >
                    {agregando === a.user_id ? '…' : '+ Solicitud'}
                  </button>
                )}
                {puedoReclamar && (
                  <button
                    className="btn sm"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      reclamar(a.id!, a.nombre);
                    }}
                    disabled={guardando}
                  >
                    Ese soy yo
                  </button>
                )}
                {pendiente && !yaEsAmigo && <span className="chip">Pendiente</span>}
                {yaEsAmigo && <span className="chip">Amigo</span>}
              </div>
            );
          })
        )}
      </div>

      {/* Como salio. Lo carga el anfitrion y hasta ahora no lo veia nadie
          mas. No se muestra "ganamos": eso es el punto de vista del dueno.
          Lo que sirve para el que mira es QUE LADO gano. */}
      {p.jugado && (
        <>
          <div className="sec">Como salio</div>
          <div className={`comoSalio ${p.empate ? 'emp' : ''}`}>
            {p.goles_claros != null && p.goles_oscuros != null ? (
              <div className="cs-marcador">
                <span className={p.equipo_ganador === 'a' ? 'gano' : ''}>
                  <span className="chaleco claros" />
                  <b>{p.goles_claros}</b>
                </span>
                <i>—</i>
                <span className={p.equipo_ganador === 'b' ? 'gano' : ''}>
                  <b>{p.goles_oscuros}</b>
                  <span className="chaleco oscuros" />
                </span>
              </div>
            ) : null}
            <div className="cs-quien">
              {p.empate ? (
                'Empataron'
              ) : p.equipo_ganador ? (
                <>
                  Ganaron los <b>{p.equipo_ganador === 'a' ? 'claros' : 'oscuros'}</b>
                </>
              ) : (
                'Ya se jugo'
              )}
            </div>
          </div>
        </>
      )}

      {/* Los equipos: hasta ahora habia que preguntarlos por WhatsApp
          aunque estuvieran sorteados hace una hora. Solo de mirar —
          moverlos es del anfitrion. */}
      {p.equipos && (
        <>
          <div className="sec">Los equipos</div>
          <EquiposMirar equipos={p.equipos} />
          <div className="nota">Los armo el anfitrion. Si cambian, se actualiza aca solo.</div>
        </>
      )}

      {/* La plata: lo del grupo (cuanto salio, cuanto por cabeza, a quien
          se le paga) y lo tuyo. Lo que debe CADA UNO no se muestra: no
          es dato para colgar de un link que circula por el grupo. */}
      {p.costo > 0 && (
        <>
          <div className="sec">La plata</div>
          <div className="tot">
            <div className="big">{plata(p.por_cabeza)}</div>
            <div className="lbl">por cabeza</div>
            <div className="split">
              <div>
                <div className="n">{plata(p.costo)}</div>
                <div className="c">la cancha</div>
              </div>
              <div>
                <div className="n">{p.cabezas}</div>
                <div className="c">cabezas</div>
              </div>
              {p.puso_nombre && (
                <div>
                  <div className="n">{p.puso_nombre.split(' ')[0]}</div>
                  <div className="c">adelanto</div>
                </div>
              )}
            </div>
          </div>

          {miParte?.anotado && (
            <div className={`miParte ${miParte.saldo! <= 0 ? 'ok' : 'debe'}`}>
              <span className="mp-txt">
                <b>Lo tuyo</b>
                <small>
                  {miParte.adelante
                    ? `Adelantaste ${plata(p.costo)} — tu parte esta cubierta`
                    : miParte.invitados
                      ? `Vos + ${miParte.invitados} invitado${miParte.invitados > 1 ? 's' : ''} = ${
                          1 + miParte.invitados
                        } partes`
                      : 'Una parte'}
                </small>
              </span>
              <span className="mp-monto">
                {miParte.saldo! <= 0 ? plata(miParte.debe!) : plata(miParte.saldo!)}
                <small>{miParte.saldo! <= 0 ? 'saldado' : 'debes'}</small>
              </span>
            </div>
          )}

          <div className="nota">
            {p.puso_nombre ? (
              <>
                La cancha la adelanto <b>{p.puso_nombre}</b>: a el le pagas lo tuyo.
              </>
            ) : (
              <>Todavia nadie adelanto la plata.</>
            )}{' '}
            El total se divide por <b>cabeza</b>: el que lleva invitados paga por cada uno.
          </div>
        </>
      )}

      {/* Pasarle el partido a alguien mas. La placa es una imagen: es la
          unica forma de que esto llegue a una historia de Instagram. */}
      <div className="sec">Pasalo</div>
      <BotonPlaca p={p} />

      <div className="inv-pie">
        Armado con <b>MiMundial</b>
      </div>

      {confirmarUI}
      </div>

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
          procesando={agregando === perfilAbierto.id}
          onEnviarSolicitud={(id) => enviarSolicitud(id)}
          onCerrar={() => setPerfilAbierto(null)}
        />
      )}
    </>
  );

  return miId ? (
    <Shell nombre={miNombreCuenta}>{contenido}</Shell>
  ) : (
    <div className="wrap">{contenido}</div>
  );
}
