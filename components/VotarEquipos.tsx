'use client';

import type { Equipos } from '@/lib/tipos';
import EquiposMirar from '@/components/Equipos';

/**
 * Las tres opciones de la votación (0026), una debajo de la otra.
 *
 * La usan las dos pantallas — la del anfitrión y la del link — porque
 * votar es lo mismo desde las dos: el anfitrión, si juega, vota como
 * uno más. Lo que cambia alrededor (quién falta, cerrar, cancelar) lo
 * pone cada pantalla.
 *
 * Sin `onVotar` es de solo mirar: el que entra al link sin estar
 * anotado ve qué se está votando, pero no tiene voto.
 */
export default function VotarEquipos({
  opciones,
  miVoto,
  votando,
  onVotar,
}: {
  opciones: Equipos[];
  miVoto: number | null;
  votando?: boolean;
  onVotar?: (i: number) => void;
}) {
  const yaVote = miVoto !== null;

  return (
    <div className="opcionesVoto">
      {opciones.map((eq, i) => (
        <div className={`opcionVoto${miVoto === i ? ' elegida' : ''}`} key={i}>
          <div className="ov-head">
            <b>Opción {i + 1}</b>
            {miVoto === i ? (
              <span className="chip puso">Tu voto</span>
            ) : onVotar && !yaVote ? (
              <button className="btn sm pri" onClick={() => onVotar(i)} disabled={votando}>
                {votando ? '…' : 'Votar esta'}
              </button>
            ) : null}
          </div>
          <EquiposMirar equipos={eq} />
        </div>
      ))}
    </div>
  );
}
