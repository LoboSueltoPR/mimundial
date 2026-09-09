'use client';

import type { EstadoDesafio } from '@/lib/calculos';
import type { Lado } from '@/lib/tipos';

/**
 * EL CRUCE — la cabecera de un desafío.
 *
 * En la planilla, un desafío no es una lista de doce que después se
 * parte al medio: es una ficha con dos columnas enfrentadas y el
 * marcador en la canaleta del medio. De ahí sale toda la forma.
 *
 * La decisión que manda: cuando todavía no hay rival, ese lado NO es
 * una tarjeta con un texto gris que dice "pendiente". Es un campo en
 * blanco del formulario — regla punteada y el sello encima. Un
 * formulario a medio llenar se lee distinto que un contenedor vacío:
 * el punteado pide que lo completes.
 *
 * Cuando el partido se jugó, la canaleta deja de decir "vs" y pasa a
 * llevar el marcador, en la condensada y con cifras tabulares. Es la
 * misma canaleta: el acta se completa, no cambia de forma.
 */

function LadoDelCruce({
  nombre,
  cabezas,
  porLado,
  tono,
  gano,
}: {
  nombre: string;
  cabezas: number;
  porLado: number;
  tono: 'claros' | 'oscuros';
  gano: boolean;
}) {
  const completo = cabezas >= porLado;
  return (
    <div className={`cruce-lado${gano ? ' gano' : ''}`}>
      <div className="cruce-quien">
        <span className={`chaleco ${tono}`} />
        <b>{nombre}</b>
      </div>
      <div className={`cruce-cuenta${completo ? ' completo' : ''}`}>
        {cabezas} de {porLado}
      </div>
    </div>
  );
}

/** El lado que todavía no existe: el renglón en blanco de la ficha. */
function BlancoDelRival({
  estado,
  onTocar,
}: {
  estado: EstadoDesafio;
  onTocar?: () => void;
}) {
  const sello = estado === 'esperando' ? 'Sin respuesta' : 'Busca rival';
  const bajada =
    estado === 'esperando' ? 'Todavía no contestó' : onTocar ? 'Tocá para invitar' : 'Libre';

  const contenido = (
    <>
      <span className="cruce-blanco-regla" aria-hidden="true" />
      <span className="estado-pill sin">{sello}</span>
      <small>{bajada}</small>
    </>
  );

  if (!onTocar) return <div className="cruce-lado cruce-blanco">{contenido}</div>;

  return (
    <button type="button" className="cruce-lado cruce-blanco tocable" onClick={onTocar}>
      {contenido}
    </button>
  );
}

export default function Cruce({
  nombreA,
  nombreB,
  cabezasA,
  cabezasB,
  porLado,
  estado,
  golesA,
  golesB,
  ganador,
  onInvitar,
}: {
  nombreA: string;
  /** null mientras no haya rival: ahí se dibuja el blanco. */
  nombreB: string | null;
  cabezasA: number;
  cabezasB: number;
  porLado: number;
  estado: EstadoDesafio;
  golesA?: number | null;
  golesB?: number | null;
  ganador?: Lado | null;
  /** Solo el dueño y solo mientras no haya rival. Sin esto el blanco
   *  no es clickeable: no se promete una interacción que no existe. */
  onInvitar?: () => void;
}) {
  const jugado = estado === 'jugado';
  const hayMarcador = jugado && typeof golesA === 'number' && typeof golesB === 'number';

  return (
    <div className="cruce">
      <LadoDelCruce
        nombre={nombreA}
        cabezas={cabezasA}
        porLado={porLado}
        tono="claros"
        gano={jugado && ganador === 'a'}
      />

      <div className="cruce-canal">
        {hayMarcador ? (
          <span className="cruce-marcador">
            {golesA}<i>–</i>{golesB}
          </span>
        ) : (
          <span className="cruce-vs">vs</span>
        )}
      </div>

      {nombreB === null ? (
        <BlancoDelRival estado={estado} onTocar={onInvitar} />
      ) : (
        <LadoDelCruce
          nombre={nombreB}
          cabezas={cabezasB}
          porLado={porLado}
          tono="oscuros"
          gano={jugado && ganador === 'b'}
        />
      )}
    </div>
  );
}
