'use client';

import { useCallback, useState } from 'react';

type Opciones = {
  /** Texto del botón de acción. Por defecto "Sí" (o "Entendido" si soloOk). */
  boton?: string;
  /** Pinta el botón de acción en rojo, para bajas/borrados. */
  danger?: boolean;
  /** Un solo botón que cierra — para avisos, no para decisiones. */
  soloOk?: boolean;
};

type Pedido = Opciones & { texto: string; resolver: (v: boolean) => void };

/**
 * Reemplaza confirm()/alert() del navegador por el mismo modal .sheet
 * que ya usa el resto de la app, para que la confirmación se sienta
 * parte de MiMundial y no un cartel del sistema operativo.
 *
 * Uso:
 *   const { confirmar, ui } = useConfirmar();
 *   if (!(await confirmar('¿Borrar esto?', { danger: true, boton: 'Borrar' }))) return;
 *   ...
 *   return <>{resto}{ui}</>;
 */
export function useConfirmar() {
  const [pedido, setPedido] = useState<Pedido | null>(null);

  const confirmar = useCallback((texto: string, opciones?: Opciones) => {
    return new Promise<boolean>((resolver) => {
      setPedido({ texto, resolver, ...opciones });
    });
  }, []);

  function responder(v: boolean) {
    pedido?.resolver(v);
    setPedido(null);
  }

  if (!pedido) return { confirmar, ui: null };

  const ui = (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && responder(false)}>
      <div className="sheet sheetConfirmar">
        <p className="confirmarTexto">{pedido.texto}</p>
        {pedido.soloOk ? (
          <button className="btn pri wide" onClick={() => responder(true)}>
            {pedido.boton || 'Entendido'}
          </button>
        ) : (
          <div className="row2">
            <button
              className={`btn ${pedido.danger ? 'danger' : 'pri'}`}
              onClick={() => responder(true)}
            >
              {pedido.boton || 'Sí'}
            </button>
            <button className="btn" onClick={() => responder(false)}>
              No
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return { confirmar, ui };
}
