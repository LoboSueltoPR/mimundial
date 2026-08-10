/**
 * Las marcas de la planilla.
 *
 * Reemplazan a los emoji: un emoji lo dibuja el sistema operativo, así
 * que la app se ve distinta en cada teléfono y —peor— se ve como
 * cualquier otra. Estas son trazo abierto sobre la misma grilla de 24
 * que Iconos.tsx, heredan el color del texto y se leen a 16px.
 *
 * La racha sube, baja o queda plana según cómo venís: la forma del
 * trazo ES el dato, no una decoración al lado del dato.
 */
type Props = { tam?: number; className?: string };

const base = (tam: number) => ({
  width: tam,
  height: tam,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

/** Tilde: la instancia superada. */
export const MarcaTilde = ({ tam = 16, className }: Props) => (
  <svg {...base(tam)} className={className}>
    <path d="M4.5 12.5l5 5 10-11" />
  </svg>
);

/** Empate: no te movés del lugar. */
export const MarcaEmpate = ({ tam = 20, className }: Props) => (
  <svg {...base(tam)} className={className}>
    <path d="M5 9.5h14M5 14.5h14" />
  </svg>
);

/** Derrota: volvés a cero. Por eso es una flecha que rebobina. */
export const MarcaPerdio = ({ tam = 20, className }: Props) => (
  <svg {...base(tam)} className={className}>
    <path d="M4.5 9.5V4.8" />
    <path d="M4.5 9.5h4.7" />
    <path d="M6.4 6.9a7.6 7.6 0 1 1-1.9 6.5" />
  </svg>
);

/** La racha, dibujada como va: para arriba, plana o para abajo. */
export const MarcaRacha = ({
  tipo,
  tam = 22,
  className,
}: Props & { tipo: 'ganamos' | 'empate' | 'perdimos' | null }) => {
  const d =
    tipo === 'ganamos'
      ? 'M3 18l5-5 4 3 8-9'
      : tipo === 'perdimos'
        ? 'M3 6l5 5 4-3 8 9'
        : 'M3 12h18';
  const punta =
    tipo === 'ganamos' ? 'M15 7h5v5' : tipo === 'perdimos' ? 'M15 17h5v-5' : null;
  return (
    <svg {...base(tam)} className={className}>
      <path d={d} />
      {punta && <path d={punta} />}
    </svg>
  );
};
