/**
 * La copa. Es el elemento firma de la app, asi que vive en un solo lugar.
 *
 * Se dibuja con trazos abiertos para poder animarla como si la trazaran
 * con tiza sobre la cancha (stroke-dashoffset). Los paths llevan
 * pathLength="1" para que el largo del trazo no dependa de su geometria.
 */
export default function Copa({
  tam = 120,
  clase = '',
}: {
  tam?: number;
  clase?: string;
}) {
  return (
    <svg
      className={`copaSvg ${clase}`}
      width={tam}
      height={tam * 1.2}
      viewBox="0 0 100 120"
      fill="none"
      aria-hidden="true"
    >
      {/* relleno de oro, aparece despues del trazo */}
      <g className="copaSvg-relleno">
        <path d="M28 18 H72 L68 52 C68 66 32 66 32 52 Z" />
        <path d="M46 64 H54 V80 H46 Z" />
        <path d="M38 80 H62 L66 92 H34 Z" />
        <path d="M28 92 H72 V104 H28 Z" />
      </g>

      {/* el trazo de tiza */}
      <g
        className="copaSvg-trazo"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path pathLength={1} d="M28 18 H72 L68 52 C68 66 32 66 32 52 Z" />
        <path pathLength={1} d="M28 24 C12 26 10 46 30 52" />
        <path pathLength={1} d="M72 24 C88 26 90 46 70 52" />
        <path pathLength={1} d="M50 64 V80" />
        <path pathLength={1} d="M38 80 H62 L66 92 H34 Z" />
        <path pathLength={1} d="M28 92 H72 V104 H28 Z" />
      </g>

      {/* el destello que cruza la copa cuando ya esta de oro */}
      <g className="copaSvg-brillo">
        <path d="M28 18 H72 L68 52 C68 66 32 66 32 52 Z" />
      </g>
    </svg>
  );
}

/** Versión mínima, para el barrido de las transiciones. */
export function Copita({ tam = 16 }: { tam?: number }) {
  return (
    <svg width={tam} height={tam * 1.2} viewBox="0 0 100 120" aria-hidden="true">
      <g fill="currentColor">
        <path d="M28 18 H72 L68 52 C68 66 32 66 32 52 Z" />
        <path d="M46 64 H54 V80 H46 Z" />
        <path d="M38 80 H62 L66 92 H34 Z" />
        <path d="M28 92 H72 V104 H28 Z" />
      </g>
    </svg>
  );
}
