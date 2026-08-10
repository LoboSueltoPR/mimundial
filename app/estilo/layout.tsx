import type { Metadata } from 'next';

/**
 * El taller es una herramienta interna que quedó accesible sin sesión
 * para poder revisar el diseño desde el celular. Que sea alcanzable no
 * quiere decir que deba estar en Google.
 */
export const metadata: Metadata = {
  title: 'Taller de estilo · MiMundial',
  robots: { index: false, follow: false },
};

export default function LayoutEstilo({ children }: { children: React.ReactNode }) {
  return children;
}
