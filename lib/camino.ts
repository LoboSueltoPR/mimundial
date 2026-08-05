import type { Partido } from './tipos';

/* ============================================================
   El camino de MiMundial

   Cada triunfo te hace avanzar una instancia. El empate te deja
   donde estabas. La derrota te manda a cero: mundial nuevo.
   Siete triunfos al hilo y levantás la copa.
   ============================================================ */

export type Instancia = {
  id: string;
  nombre: string;
  corto: string;
  icono: string;
};

export const CAMINO: Instancia[] = [
  { id: 'g1', nombre: 'Grupos · 1ª fecha', corto: 'G1', icono: '⚽' },
  { id: 'g2', nombre: 'Grupos · 2ª fecha', corto: 'G2', icono: '⚽' },
  { id: 'g3', nombre: 'Grupos · 3ª fecha', corto: 'G3', icono: '⚽' },
  { id: 'oc', nombre: 'Octavos de final', corto: '8vos', icono: '🔥' },
  { id: 'cu', nombre: 'Cuartos de final', corto: '4tos', icono: '💪' },
  { id: 'se', nombre: 'Semifinal', corto: 'Semi', icono: '😰' },
  { id: 'fi', nombre: 'Final', corto: 'Final', icono: '👑' },
];

/** Triunfos necesarios para levantar la copa. */
export const PARA_LA_COPA = CAMINO.length;

export type PasoHistorial = {
  partidoId: string;
  fecha: string;
  lugar: string | null;
  instancia: Instancia;
  resultado: 'ganamos' | 'empate' | 'perdimos';
  /** true si con este triunfo se levantó la copa */
  copa: boolean;
};

export type EstadoCamino = {
  /** triunfos encadenados en el mundial en curso (0 … PARA_LA_COPA-1) */
  triunfos: number;
  /** la instancia que te toca jugar ahora */
  proxima: Instancia;
  /** copas levantadas en total */
  copas: number;
  /** la instancia más lejos que llegaste alguna vez (índice) */
  mejorInstancia: number;
  /** partidos con resultado, en orden, con la instancia que fueron */
  historial: PasoHistorial[];
  /** cuántos mundiales arrancaste (el actual incluido) */
  mundial: number;
};

function ordenar<T extends Pick<Partido, 'fecha' | 'creado_en'>>(ps: T[]): T[] {
  return [...ps].sort((a, b) => {
    const f = (a.fecha || '').localeCompare(b.fecha || '');
    if (f !== 0) return f;
    return (a.creado_en || '').localeCompare(b.creado_en || '');
  });
}

type PartidoParaCamino = Pick<Partido, 'id' | 'fecha' | 'creado_en' | 'resultado' | 'lugar'>;

export function calcularCamino(partidos: PartidoParaCamino[]): EstadoCamino {
  const conResultado = ordenar(partidos.filter((p) => p.resultado));

  let triunfos = 0;
  let copas = 0;
  let mejorInstancia = 0;
  let mundial = 1;
  const historial: PasoHistorial[] = [];

  for (const p of conResultado) {
    // la instancia que se jugaba en ese momento
    const instancia = CAMINO[Math.min(triunfos, CAMINO.length - 1)];
    let copa = false;

    if (p.resultado === 'ganamos') {
      triunfos++;
      if (triunfos > mejorInstancia) mejorInstancia = Math.min(triunfos, CAMINO.length);
      if (triunfos >= PARA_LA_COPA) {
        copas++;
        triunfos = 0;
        mundial++;
        copa = true;
      }
    } else if (p.resultado === 'perdimos') {
      if (triunfos > 0) mundial++;
      triunfos = 0;
    }
    // empate: no mueve nada

    historial.push({
      partidoId: p.id,
      fecha: p.fecha,
      lugar: p.lugar,
      instancia,
      resultado: p.resultado!,
      copa,
    });
  }

  return {
    triunfos,
    proxima: CAMINO[Math.min(triunfos, CAMINO.length - 1)],
    copas,
    mejorInstancia,
    historial: historial.reverse(), // el más nuevo primero
    mundial,
  };
}

/** Frase para el estado actual. */
export function frase(e: EstadoCamino): string {
  if (e.triunfos === 0) return 'Arrancás de cero. Ganá y entrás en carrera.';
  if (e.triunfos < 3) return `${e.triunfos} al hilo. Todavía en fase de grupos.`;
  if (e.triunfos === 3) return 'Pasaste de fase. Te esperan los octavos.';
  if (e.triunfos === 4) return 'En cuartos. Empieza lo lindo.';
  if (e.triunfos === 5) return 'Semifinal. No aflojes ahora.';
  return 'La final. Ganás esto y sos campeón.';
}

/** Cuántos triunfos te faltan para la copa. */
export const faltanParaLaCopa = (e: EstadoCamino) => PARA_LA_COPA - e.triunfos;
