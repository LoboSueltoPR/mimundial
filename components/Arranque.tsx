'use client';

import { useEffect, useState } from 'react';
import Copa from './Copa';
import { MarcaTrazo } from './Marca';

type Fase = 'oculto' | 'letras' | 'copa' | 'saliendo';

/**
 * El arranque: "MIMUNDIAL" se traza letra por letra, en líneas rectas
 * como las de cal de la cancha, y esas mismas líneas se cierran en la
 * copa — que se traza, se llena de oro y brilla tal como ya estaba
 * (ver Copa.tsx, sin tocar). Palabra y copa ocupan el mismo lugar en
 * pantalla: una se desvanece justo donde aparece la otra, para que
 * lea como una transformación y no como dos animaciones pegadas.
 *
 * Se ve una vez por sesión del navegador.
 */
export default function Arranque() {
  const [fase, setFase] = useState<Fase>('oculto');
  const [reducido, setReducido] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('mimundial.arranque') === '1') return;
    sessionStorage.setItem('mimundial.arranque', '1');

    const corto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReducido(corto);
    setFase('letras');

    const marcas = corto
      ? [
          [() => setFase('copa'), 80],
          [() => setFase('saliendo'), 420],
          [() => setFase('oculto'), 820],
        ]
      : [
          // la palabra tarda ~950ms en trazarse entera; a los 1050ms
          // ya está completa y arranca el pase a la copa
          [() => setFase('copa'), 1050],
          [() => setFase('saliendo'), 2500],
          [() => setFase('oculto'), 3000],
        ];

    const ids = (marcas as [() => void, number][]).map(([fn, ms]) => setTimeout(fn, ms));
    return () => ids.forEach(clearTimeout);
  }, []);

  if (fase === 'oculto') return null;

  return (
    <div className={`arranque ${fase === 'saliendo' ? 'saliendo' : ''}`}>
      <div className="arranque-cal" />

      <div className="arranque-escena">
        <div className={`arranque-palabra ${fase !== 'letras' ? 'colapsa' : ''}`}>
          <MarcaTrazo ancho={reducido ? 260 : 280} estatica={reducido} />
        </div>

        {(fase === 'copa' || fase === 'saliendo') && (
          <div className="arranque-copa">
            <Copa tam={120} />
          </div>
        )}
      </div>
    </div>
  );
}
