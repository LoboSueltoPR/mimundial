'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { crearCliente } from '@/lib/supabase/client';
import type { Amigo, PartidoPublico, RespuestaRPC } from '@/lib/tipos';
import { fechaLarga } from '@/lib/calculos';
import { comoLlegar } from '@/lib/mapa';
import { Copita } from '@/components/Copa';
import { useConfirmar } from '@/components/Confirmar';
import BotonGoogle from '@/components/BotonGoogle';
import Shell from '@/components/Shell';
import PerfilModal from '@/components/PerfilModal';
import Avatar from '@/components/Avatar';

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
  /** cargar() y el fetch del perfil corren en paralelo y ninguno espera al
   *  otro: esta ref evita que el nombre de perfil pise el de la anotación
   *  ya existente, gane quien gane la carrera. */
  const tengoFilaPropia = useRef(false);

  const cargar = useCallback(async () => {
    const supabase = crearCliente();
    const { data, error } = await supabase.rpc('ver_partido_por_token', { tok: token });
    setCargando(false);
    if (error) {
      setError(error.message);
      return;
    }
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

  // Logueado: se ve como el resto de la app, con la misma barra de
  // navegación — no como una pantalla pública suelta. Sin cuenta sigue
  // siendo la landing sola, que es lo que necesita el invitado sin fricción.
  const Envoltorio = miId
    ? ({ children }: { children: React.ReactNode }) => (
        <Shell nombre={miNombreCuenta}>{children}</Shell>
      )
    : ({ children }: { children: React.ReactNode }) => <div className="wrap">{children}</div>;

  return (
    <Envoltorio>
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
                {pendiente && !yaEsAmigo && <span className="chip">Pendiente</span>}
                {yaEsAmigo && <span className="chip">Amigo</span>}
              </div>
            );
          })
        )}
      </div>

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
    </Envoltorio>
  );
}
