'use client';

import { useEffect, useState } from 'react';
import { apagarPush, estadoPush, prenderPush, type EstadoPush } from '@/lib/push';

/**
 * El interruptor de las notificaciones.
 *
 * El permiso se pide con el click, nunca al cargar: un navegador al que
 * le pedís permiso sin que el usuario haya hecho nada lo niega de una y
 * después no se puede volver a preguntar por código.
 *
 * Los cuatro estados que no son "prendido/apagado" existen porque cada
 * uno se arregla de una manera distinta, y decir "no se pudo" para todos
 * deja al usuario sin saber qué hacer.
 */
export default function Notificaciones({ claim }: { claim?: string | null }) {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    estadoPush().then((e) => {
      if (vivo) setEstado(e);
    });
    return () => {
      vivo = false;
    };
  }, []);

  async function alternar() {
    setError(null);
    setOcupado(true);
    if (estado === 'prendido') {
      await apagarPush();
      setEstado('apagado');
    } else {
      const r = await prenderPush(claim);
      if (!r.ok) setError(r.error ?? 'No se pudo.');
      setEstado(await estadoPush());
    }
    setOcupado(false);
  }

  if (estado === null) return null;

  const explicacion: Record<EstadoPush, string> = {
    'no-soportado': 'Este navegador no maneja notificaciones. Probá desde el celular.',
    'falta-instalar':
      'En iPhone las notificaciones solo andan con la app agregada a la pantalla de inicio. Agregala y volvé acá.',
    negado:
      'Dijiste que no en su momento. Para revertirlo hay que habilitarlo en los ajustes del sitio, en el navegador — desde acá ya no se puede volver a preguntar.',
    apagado:
      'Te aviso cuando alguien se anota a un partido tuyo, y cuando un partido en el que estás se completa.',
    prendido:
      'Vas a recibir aviso cuando alguien se anote a un partido tuyo y cuando se confirme uno en el que estás.',
  };

  const puedeTocar = estado === 'apagado' || estado === 'prendido';

  return (
    <>
      <div className="sec">
        Notificaciones
        {estado === 'prendido' && <span className="chip">Prendidas</span>}
      </div>
      <div className="card">
        <div className="vacio" style={{ textAlign: 'left' }}>
          {explicacion[estado]}
        </div>
      </div>
      {puedeTocar && (
        <button
          className={`btn wide ${estado === 'prendido' ? '' : 'pri'}`}
          style={{ marginTop: 10 }}
          onClick={alternar}
          disabled={ocupado}
        >
          {ocupado ? '…' : estado === 'prendido' ? 'Apagar las notificaciones' : 'Prender las notificaciones'}
        </button>
      )}
      {error && <div className="msg err">{error}</div>}
    </>
  );
}
