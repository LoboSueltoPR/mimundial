'use client';

import { useEffect, useState } from 'react';
import Copa from './Copa';

/**
 * La secuencia de arranque: la copa se traza en tiza sobre la noche,
 * se llena de oro y un destello la cruza.
 *
 * Se muestra una vez por sesion del navegador. Una animacion de 1,5s
 * es un regalo la primera vez y un peaje la quinta, asi que si ya la
 * viste en esta sesion no vuelve a aparecer.
 */
export default function Arranque() {
  const [estado, setEstado] = useState<'oculto' | 'corriendo' | 'saliendo'>('oculto');

  useEffect(() => {
    if (sessionStorage.getItem('mimundial.arranque') === '1') return;
    sessionStorage.setItem('mimundial.arranque', '1');

    // Si pidieron menos movimiento, un fundido corto y listo.
    const corto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setEstado('corriendo');

    const aSalir = setTimeout(() => setEstado('saliendo'), corto ? 400 : 1450);
    const aOcultar = setTimeout(() => setEstado('oculto'), corto ? 800 : 1950);
    return () => {
      clearTimeout(aSalir);
      clearTimeout(aOcultar);
    };
  }, []);

  if (estado === 'oculto') return null;

  return (
    <div className={`arranque ${estado === 'saliendo' ? 'saliendo' : ''}`}>
      <div className="arranque-cal" />
      <Copa tam={150} />
      <div className="arranque-marca">MiMundial</div>
    </div>
  );
}
