'use client';

import type { Equipos, Lado } from '@/lib/tipos';
import { color, iniciales } from '@/lib/calculos';

/** Quién está agarrado, para moverlo o cambiarlo de equipo. */
export type Seleccion = { lado: Lado; i: number };

/**
 * Las dos columnas del sorteo. Vive acá y no adentro de la pantalla del
 * anfitrión porque la invitación pública muestra lo mismo — con la
 * diferencia de que ahí no se toca nada: sin `onTocar` las filas no son
 * clickeables y no hay selección posible.
 *
 * Va a nivel de módulo, no dentro del render de quien lo usa: un
 * componente definido en un render es uno nuevo en cada pasada, así que
 * React desmonta y remonta la lista entera cada vez que algo cambia.
 */
export function ColumnaEquipo({
  arr,
  nombre,
  tono,
  lado,
  sel,
  onTocar,
}: {
  arr: Equipos['a'];
  nombre: string;
  tono: 'claros' | 'oscuros';
  lado?: Lado;
  sel?: Seleccion | null;
  onTocar?: (lado: Lado, i: number) => void;
}) {
  /* El otro equipo está en juego cuando hay alguien agarrado del lado
     contrario: ahí cada fila es "cambialo por este". */
  const enJuego = !!sel && !!lado && sel.lado !== lado;
  const editable = !!onTocar && !!lado;

  return (
    <div className={`eq${enJuego ? ' enJuego' : ''}`}>
      <div className="eq-head">
        <span className={`chaleco ${tono}`} />
        <b>{nombre}</b>
        <span>{arr.length}</span>
      </div>
      <ul>
        {arr.map((x, i) => {
          const agarrado = !!sel && sel.lado === lado && sel.i === i;
          return (
            <li
              key={`${x.label}#${i}`}
              className={`${x.inv ? 'invitado' : ''}${agarrado ? ' agarrado' : ''}${
                editable ? '' : ' fijo'
              }`}
              onClick={editable ? () => onTocar!(lado!, i) : undefined}
            >
              <span className="mini" style={{ background: x.inv ? '#5a6472' : color(x.label) }}>
                {x.inv ? '+' : iniciales(x.label)}
              </span>
              <span>{x.inv ? 'Inv. de ' + x.de : x.label}</span>
            </li>
          );
        })}
        {arr.length === 0 && <li className="invitado vacioEq fijo">— nadie —</li>}
      </ul>
    </div>
  );
}

/** Las dos columnas juntas, de solo lectura. Es lo que ve el invitado. */
export default function EquiposMirar({ equipos }: { equipos: Equipos }) {
  return (
    <div className="equipos">
      <ColumnaEquipo arr={equipos.a} nombre="Claros" tono="claros" />
      <ColumnaEquipo arr={equipos.b} nombre="Oscuros" tono="oscuros" />
    </div>
  );
}
