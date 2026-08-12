'use client';

import { Copita } from '@/components/Copa';

/**
 * template.tsx se vuelve a montar en cada navegacion (a diferencia de
 * layout.tsx), asi que es el lugar natural para la transicion.
 *
 * La copa cruza el borde de arriba montada en una linea de oro: es el
 * mismo motivo del arranque, en la dosis que aguanta repetirse veinte
 * veces por dia. Una copa grande en cada toque de pestaña sumaria medio
 * segundo a cada navegacion y cansaria al tercer uso.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="barrido" aria-hidden="true">
        <span className="barrido-linea" />
        <span className="barrido-copa">
          <Copita tam={22} />
        </span>
      </div>
      <div className="transicion">{children}</div>
    </>
  );
}
