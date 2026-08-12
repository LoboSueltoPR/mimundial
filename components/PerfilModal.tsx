'use client';

import { useEffect, useState } from 'react';
import { crearCliente } from '@/lib/supabase/client';
import type { PerfilPublico } from '@/lib/tipos';
import { GRUPOS, LLAVES, calcularCamino } from '@/lib/camino';
import Avatar from './Avatar';

/**
 * El perfil de otro jugador logueado, visto desde un partido compartido.
 * perfil_publico() en la base ya filtra que compartan un partido, así que
 * acá no hay que volver a chequear nada: si vino vacío es que no comparten
 * ninguno (o se cortó la sesión).
 */
export default function PerfilModal({
  userId,
  nombreFallback,
  esAmigo,
  agregando,
  onAgregarAmigo,
  onCerrar,
}: {
  userId: string;
  nombreFallback: string;
  esAmigo: boolean;
  agregando: boolean;
  onAgregarAmigo: (id: string, nombre: string) => void;
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
            No pudimos traer su camino — puede que ya no compartan ningún partido.
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
          {esAmigo ? (
            <button className="btn wide" disabled>
              Ya es tu amigo
            </button>
          ) : (
            <button
              className="btn pri wide"
              onClick={() => onAgregarAmigo(userId, nombre)}
              disabled={agregando}
            >
              {agregando ? 'Agregando…' : '+ Agregar amigo'}
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
