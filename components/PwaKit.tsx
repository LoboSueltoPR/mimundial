'use client';

import { useEffect } from 'react';
import '@/lib/pwa-kit.js';
import type { OpcionesPwaKit } from '@/lib/pwa-kit';

/**
 * Envoltorio de pwa-kit para Next.js (App Router).
 *
 * Se monta una sola vez en app/layout.tsx, dentro de <body>:
 *
 *   <PwaKit nombre="MiApp" sw="/sw.js" />
 *
 * No pinta nada por sí mismo: las franjas las crea el kit directo en el DOM,
 * fuera del árbol de React, para que sobrevivan a cualquier navegación.
 */
export default function PwaKit(props: OpcionesPwaKit & { soloEnProd?: boolean }) {
  const { soloEnProd = true, ...opciones } = props;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // En dev el service worker cachea los módulos de Next y cada cambio
    // tarda un reload de más en verse.
    if (soloEnProd && process.env.NODE_ENV !== 'production') return;
    window.initPwaKit(opciones);
    // Sin deps: el kit es idempotente y tiene que arrancar una sola vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
