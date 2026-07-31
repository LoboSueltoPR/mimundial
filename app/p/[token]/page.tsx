'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { crearCliente } from '@/lib/supabase/client';
import type { PartidoPublico, RespuestaRPC } from '@/lib/tipos';
import { color, fechaLarga, iniciales } from '@/lib/calculos';

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

  const [p, setP] = useState<PartidoPublico | null>(null);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [invitados, setInvitados] = useState(0);
  const [mio, setMio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const supabase = crearCliente();
    const { data, error } = await supabase.rpc('ver_partido_por_token', { tok: token });
    setCargando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setP(data as PartidoPublico | null);
  }, [token]);

  useEffect(() => {
    cargar();
    setMio(yaAnotado(token));
    const guardadoNombre = localStorage.getItem('mimundial.nombre') || '';
    setNombre(guardadoNombre);
  }, [cargar, token]);

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
    const { data, error } = await supabase.rpc('actualizar_anotado', {
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
    if (!confirm('¿Te bajás del partido?')) return;
    setGuardando(true);
    const supabase = crearCliente();
    await supabase.rpc('borrarse', { p_claim: claimGuardado(token) });
    setGuardando(false);
    marcarAnotado(token, false);
    setMio(false);
    setInvitados(0);
    cargar();
  }

  if (cargando) return <div className="cargando">Cargando…</div>;

  if (!p)
    return (
      <div className="login">
        <div className="logo">⚽</div>
        <h1>Link inválido</h1>
        <p className="sub">Este partido no existe o el anfitrión lo borró.</p>
      </div>
    );

  const completo = p.faltan === 0;

  return (
    <div className="wrap invitacion">
      <div className="inv-marca">
        <span className="dot">MM</span> MiMundial
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
          <div className="sec">{mio ? 'Tu anotación' : 'Anotate'}</div>
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
                {completo ? 'Ya está completo' : guardando ? 'Anotando…' : 'Anotate'}
              </button>
            )}
          </div>

          {error && <div className="msg err">{error}</div>}

          <div className="nota">
            No hace falta que te crees una cuenta. Solo podés manejar <b>tu</b> lugar y los que
            llevás vos.
          </div>
        </>
      )}

      <div className="sec">Quiénes van · {p.cabezas}</div>
      <div className="card">
        {p.anotados.length === 0 ? (
          <div className="vacio">Nadie todavía. Sé el primero.</div>
        ) : (
          p.anotados.map((a, i) => (
            <div className="jug" key={i}>
              <span className="av" style={{ background: color(a.nombre) }}>
                {iniciales(a.nombre)}
              </span>
              <span className="nom">
                <b>{a.nombre}</b>
                {a.invitados > 0 && (
                  <small>
                    +{a.invitados} invitado{a.invitados > 1 ? 's' : ''}
                  </small>
                )}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="inv-pie">
        Armado con <b>MiMundial</b>
      </div>
    </div>
  );
}
