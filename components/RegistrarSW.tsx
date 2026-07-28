'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker. Hoy solo cachea el shell para que abra offline;
 * ademas es el requisito previo para poder mandar notificaciones push.
 */
export default function RegistrarSW() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.warn('No se pudo registrar el service worker', e);
    });
  }, []);

  return null;
}
