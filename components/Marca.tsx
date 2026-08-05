/**
 * El wordmark de MIMUNDIAL.
 *
 * Cada letra es un trazo monolínea, recto y con esquinas cortadas —
 * como las líneas de cal de una cancha, nunca una curva. Eso es a
 * propósito: en el arranque, esas mismas líneas rectas terminan
 * cerrándose en las curvas de la copa (ver Copa.tsx). La palabra se
 * dibuja recta; el trofeo, redondo. Un cambio de forma que cuenta
 * la idea de la app: el partido se convierte en la copa.
 *
 * Mismo mecanismo de trazo que la copa: paths con pathLength="1" y
 * stroke-dashoffset animado (clase .marca-trazo, keyframe `trazar`
 * ya definido en globals.css).
 */

type Letra = { paths: string[]; ancho: number };

const ALTO_LETRA = 90;
const MARGEN_Y = 20;
const ALTO_TOTAL = ALTO_LETRA + MARGEN_Y * 2;
const GROSOR = 16; // gordas, como el resto de la marca (Anton pesada)

// I sin serifas: con este grosor una sola barra ya se ve solida.
const LETRAS: Record<string, Letra> = {
  M: { ancho: 50, paths: ['M0,90 L0,0 L25,45 L50,0 L50,90'] },
  I: { ancho: 26, paths: ['M13,0 L13,90'] },
  U: { ancho: 46, paths: ['M0,0 L0,64 L12,82 L34,82 L46,64 L46,0'] },
  N: { ancho: 50, paths: ['M0,90 L0,0 L50,90 L50,0'] },
  D: { ancho: 48, paths: ['M0,0 L0,90 L26,90 L48,66 L48,24 L26,0 Z'] },
  A: { ancho: 48, paths: ['M0,90 L24,0 L48,90', 'M11,54 L37,54'] },
  L: { ancho: 40, paths: ['M0,0 L0,90 L36,90'] },
};

const PALABRA = ['M', 'I', 'M', 'U', 'N', 'D', 'I', 'A', 'L'];
const GAP = 22; // mas separacion: con GROSOR=16 los trazos no se pisan
const MARGEN_X = 16;

function medidas() {
  let x = MARGEN_X;
  const posiciones = PALABRA.map((l) => {
    const pos = x;
    x += LETRAS[l].ancho + GAP;
    return pos;
  });
  return { posiciones, ancho: x - GAP + MARGEN_X };
}

const { posiciones, ancho: ANCHO_TOTAL } = medidas();

/** Cuántos trazos tiene la palabra en total, por si algo necesita saberlo. */
export const TRAZOS_MARCA = PALABRA.reduce((a, l) => a + LETRAS[l].paths.length, 0);

export function MarcaTrazo({
  ancho = 280,
  estatica = false,
}: {
  ancho?: number;
  estatica?: boolean;
}) {
  let k = -1;
  return (
    <svg
      className="marcaSvg"
      width={ancho}
      height={(ancho * ALTO_TOTAL) / ANCHO_TOTAL}
      viewBox={`0 0 ${ANCHO_TOTAL} ${ALTO_TOTAL}`}
      fill="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth={GROSOR} strokeLinecap="round" strokeLinejoin="round">
        {PALABRA.map((letra, li) => (
          <g key={li} transform={`translate(${posiciones[li]} ${MARGEN_Y})`}>
            {LETRAS[letra].paths.map((d, pi) => {
              k++;
              return estatica ? (
                <path key={pi} d={d} />
              ) : (
                <path
                  key={pi}
                  d={d}
                  pathLength={1}
                  className="marca-trazo"
                  style={{ animationDelay: `${k * 55}ms` }}
                />
              );
            })}
          </g>
        ))}
      </g>
    </svg>
  );
}
