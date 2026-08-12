'use client';

import { useEffect, useState } from 'react';
import { crearCliente } from '@/lib/supabase/client';
import type { EstadoAmistad, PerfilPublico } from '@/lib/tipos';
import { GRUPOS, LLAVES, calcularCamino } from '@/lib/camino';
import Avatar from './Avatar';

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

  const nombre = perfil?.nombre || nombreFallback;
  const e = perfil ? calcularCamino(perfil.partidos) : null;

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
          </div>
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
