/**
 * Los iconos de la barra de abajo.
 *
 * Trazo abierto de 1.7 y grilla de 24: se leen a 22px en un celular sin
 * convertirse en una mancha. Cada uno sale del mundo del picadito
 * (banderin, cancha) en vez del set generico de dashboard.
 */
type Props = { className?: string };

const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/** Camino: el banderin del corner, que marca hasta donde llegaste. */
export const IconoCamino = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M6 21V3" />
    <path d="M6 4h11l-2.5 3.5L17 11H6" />
  </svg>
);

/** Partidos: la cancha vista desde arriba. */
export const IconoPartidos = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="2" />
    <path d="M12 5v14" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M2.5 9h2.5v6H2.5M21.5 9H19v6h2.5" />
  </svg>
);

/** Stats: las barras del rendimiento. */
export const IconoStats = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M5 20V12M12 20V5M19 20v-5" />
  </svg>
);

/** Plata: el billete. */
export const IconoPlata = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6 10v4M18 10v4" />
  </svg>
);

/** Amigos: los que enganchan. */
export const IconoAmigos = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 19c0-3.1 2.7-5.2 6-5.2s6 2.1 6 5.2" />
    <path d="M16.5 6.4a3 3 0 0 1 0 5.5M17.5 14.2c2 .6 3.5 2.2 3.5 4.8" />
  </svg>
);

/** Perfil: vos. */
export const IconoPerfil = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="8.5" r="3.6" />
    <path d="M4.5 20c0-3.7 3.4-6.2 7.5-6.2s7.5 2.5 7.5 6.2" />
  </svg>
);
