'use client';

import { useEffect, useState } from 'react';
import { crearCliente } from '@/lib/supabase/client';
import type { EstadoAmistad, PerfilPublico } from '@/lib/tipos';
import { GRUPOS, LLAVES, calcularCamino } from '@/lib/camino';
import { calcularStats, fechaCorta } from '@/lib/calculos';
import { MarcaEmpate, MarcaPerdio, MarcaTilde } from './Marcas';
import { conApodo } from '@/lib/nombre';
import Avatar from './Avatar';

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * El perfil de otro jugador logueado: quiénes son amigos o comparten un
 * partido pueden abrirlo desde cualquier lista de la app (Partidos,
 * Amigos, Camino, o el link de invitación), no solo desde uno de esos
 * lugares. perfil_publico() en la base filtra eso mismo del lado del
 * servidor, así que acá no hay que volver a chequear nada: si vino
 * vacío es que ninguna de las dos condiciones se cumple.
 */
export default function PerfilModal({
  userId,
  nombreFallback,
  estado,
  procesando,
  onEnviarSolicitud,
  onCerrar,
}: {
  userId: string;
  nombreFallback: string;
  estado: EstadoAmistad;
  procesando: boolean;
  onEnviarSolicitud: (id: string, nombre: string) => void;
  onCerrar: () => void;
}) {
  const [perfil, setPerfil] = useState<PerfilPublico | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    crearCliente()
      .rpc('perfil_publico', { p_user_id: userId })
      .then(({ data }) => {
        if (vivo) {
          setPerfil(data as PerfilPublico | null);
          setCargando(false);
        }
      });
    return () => {
      vivo = false;
    };
  }, [userId]);

  const nombre = perfil ? conApodo(perfil.nombre, perfil.apodo) : nombreFallback;
  const e = perfil ? calcularCamino(perfil.partidos) : null;
  /* `calcularStats` pide Partido[] pero solo lee resultado y goles, y
     `gastado` sale 0 sin jugadores. Alcanza con lo que trae el perfil. */
  const st = perfil
    ? calcularStats(perfil.partidos as unknown as Parameters<typeof calcularStats>[0])
    : null;
  const datosJugador = perfil
    ? [
        perfil.club ? `hincha de ${perfil.club}` : null,
        perfil.posicion ? capitalizar(perfil.posicion) : null,
        perfil.pie ? capitalizar(perfil.pie) : null,
      ].filter(Boolean)
    : [];

  return (
    <div className="modal" onClick={(ev) => ev.target === ev.currentTarget && onCerrar()}>
      <div className="sheet">
        <div className="perfilModal-head">
          <Avatar nombre={nombre} url={perfil?.avatar_url} tam={44} className="perfilModal-av" />
          <div>
            <h2 style={{ marginBottom: 0 }}>{nombre}</h2>
            {perfil?.username && <div className="nota" style={{ margin: 0 }}>@{perfil.username}</div>}
          </div>
        </div>

        {cargando ? (
          <div className="cargando" style={{ padding: '20px 0' }}>
            Cargando…
          </div>
        ) : !perfil ? (
          <p className="nota" style={{ marginTop: 14 }}>
            No pudimos traer su camino — puede que ya no sean amigos ni compartan ningún partido.
          </p>
        ) : (
          <div className="perfilModal-camino">
            <div className="perfilModal-fase">{e!.proxima.nombre}</div>
            <div className="nota" style={{ margin: '2px 0 10px' }}>
              {e!.copas > 0 ? `${e!.copas} copa${e!.copas > 1 ? 's' : ''} · ` : ''}
              {e!.enGrupos
                ? `${e!.puntos} punto${e!.puntos === 1 ? '' : 's'} en grupos`
                : `${e!.etapa - GRUPOS} de ${LLAVES} llaves`}
            </div>
            {datosJugador.length > 0 && (
              <div className="nota" style={{ margin: 0 }}>
                {datosJugador.join(' · ')}
              </div>
            )}
          </div>
        )}

        {/* El historial. Es lo primero que uno quiere saber de otro
            jugador y hasta ahora habia que entrar partido por partido.
            No se listan los demas anotados a proposito: esto es la ficha
            de una persona, no la del partido. */}
        {perfil && perfil.partidos.length > 0 && (
          <>
            <div className="sec" style={{ marginTop: 16 }}>
              Jugo {perfil.partidos.length}
              <span className="perfilModal-record">
                {st!.ganados}G · {st!.empatados}E · {st!.perdidos}P
                {st!.jugados > 0 ? ` · ${st!.efectividad}%` : ''}
              </span>
            </div>
            <div className="card perfilModal-historial">
              {[...perfil.partidos].reverse().map((pt) => {
                const f = fechaCorta(pt.fecha);
                return (
                  <div className="item" key={pt.id}>
                    <span className="fec">
                      <span className="d">{f.d}</span>
                      <span className="m">{f.m}</span>
                    </span>
                    <span className="info">
                      <b>{pt.lugar || 'Partido'}</b>
                      <small>{pt.anfitrion === false ? 'jugo de invitado' : 'lo organizo'}</small>
                    </span>
                    <span className={`marcaRes ${pt.resultado}`}>
                      {pt.resultado === 'ganamos' ? (
                        <MarcaTilde tam={14} />
                      ) : pt.resultado === 'empate' ? (
                        <MarcaEmpate tam={14} />
                      ) : (
                        <MarcaPerdio tam={14} />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="row2" style={{ marginTop: 16 }}>
          {estado === 'amigo' ? (
            <button className="btn wide" disabled>
              Ya es tu amigo
            </button>
          ) : estado === 'pendiente' ? (
            <button className="btn wide" disabled>
              Solicitud enviada
            </button>
          ) : (
            <button
              className="btn pri wide"
              onClick={() => onEnviarSolicitud(userId, nombre)}
              disabled={procesando}
            >
              {procesando ? 'Enviando…' : 'Enviar solicitud de amistad'}
            </button>
          )}
        </div>
        <button className="btn wide sm" style={{ marginTop: 8 }} onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
