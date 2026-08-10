'use client';

import { useEffect, useState } from 'react';
import Copa from './Copa';
import { MarcaTexto } from './Marca';

type Fase = 'oculto' | 'letras' | 'copa' | 'saliendo';

/**
 * El arranque: "MIMUNDIAL" se escribe letra por letra y la palabra se
 * cierra en la copa, que se traza en tiza, se llena de oro y brilla.
 * Palabra y copa ocupan el mismo lugar en pantalla: una se desvanece
 * justo donde aparece la otra, para que lea como una transformación y no
 * como dos animaciones pegadas.
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

    let vivo = true;
    const relojes: ReturnType<typeof setTimeout>[] = [];

    function arrancar() {
      if (!vivo) return;
      setFase('letras');
      const marcas: [() => void, number][] = corto
        ? [
            [() => setFase('copa'), 80],
            [() => setFase('saliendo'), 420],
            [() => setFase('oculto'), 820],
          ]
        : [
            // la palabra termina de escribirse cerca de los 700ms
            [() => setFase('copa'), 1150],
            [() => setFase('saliendo'), 2600],
            [() => setFase('oculto'), 3100],
          ];
      marcas.forEach(([fn, ms]) => relojes.push(setTimeout(fn, ms)));
    }

    // Sin esperar a Anton, la primera pasada se dibuja con la tipografía
    // de reemplazo y las letras saltan de ancho al llegar la buena. El
    // tope evita que una fuente que nunca carga se coma el arranque.
    const fuenteLista: Promise<unknown> = document.fonts
      ? document.fonts.ready
      : Promise.resolve();
    const tope = new Promise((listo) => relojes.push(setTimeout(listo, 700)));
    Promise.race([fuenteLista, tope]).then(arrancar);

    return () => {
      vivo = false;
      relojes.forEach(clearTimeout);
    };
  }, []);

  if (fase === 'oculto') return null;

  return (
    <div className={`arranque ${fase === 'saliendo' ? 'saliendo' : ''}`}>
      <div className="arranque-cal" />

      <div className="arranque-escena">
        <div className={`arranque-palabra ${fase !== 'letras' ? 'colapsa' : ''}`}>
          <MarcaTexto estatica={reducido} />
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
