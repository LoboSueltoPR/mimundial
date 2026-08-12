import type { Partido } from './tipos';

/* ============================================================
   El camino de MiMundial

   Es un mundial de verdad, no una racha: la fase de grupos son
   tres partidos que se juegan igual, ganes o pierdas. Ganar suma
   3, empatar 1, perder 0. Con 4 puntos o más pasás a octavos; con
   menos quedaste afuera y arranca un mundial nuevo.

   Cuatro y no tres: con cuatro, "podés perder uno" es cierto
   (ganás dos y perdés uno son 6) pero no alcanza con ganar uno
   solo y perder los otros dos.

   De octavos en adelante no hay red: ganás y avanzás, perdés y se
   terminó. El empate te deja donde estabas — se vuelve a jugar.

   Cuatro triunfos de llave después de los grupos y levantás la copa.
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

/** Partidos de la fase de grupos: se juegan los tres, siempre. */
export const GRUPOS = 3;

/** Puntos que hay que sacar en los tres de grupos para pasar de fase. */
export const PARA_PASAR = 4;

/** Instancias del camino, o sea casilleros a tildar. */
export const INSTANCIAS = CAMINO.length;

/** Triunfos de eliminación directa entre octavos y la copa. */
export const LLAVES = CAMINO.length - GRUPOS;

export type Resultado = 'ganamos' | 'empate' | 'perdimos';

/** Lo que suma cada resultado en la tabla de grupos. */
export const PUNTOS: Record<Resultado, number> = {
  ganamos: 3,
  empate: 1,
  perdimos: 0,
};

export type PasoHistorial = {
  partidoId: string;
  fecha: string;
  lugar: string | null;
  instancia: Instancia;
  resultado: Resultado;
  /** true si con este triunfo se levantó la copa */
  copa: boolean;
  /** true si con este partido te quedaste afuera (grupos flojos o derrota en llave) */
  eliminado: boolean;
};

export type EstadoCamino = {
  /**
   * Ganando todo lo que queda de grupos ya no llegás a PARA_PASAR: el
   * mundial está liquidado aunque falte jugar. Es el momento de ofrecer
   * bajarse sin jugar la última.
   */
  liquidado: boolean;
  /**
   * El último partido jugado del mundial en curso, que es donde se marca
   * `cierra_mundial` si decidís no jugar lo que queda. null si no jugaste
   * ninguno todavía.
   */
  cerrarDesde: string | null;
  /** en qué instancia estás parado ahora (0 … INSTANCIAS-1) */
  etapa: number;
  /** puntos de la fase de grupos del mundial en curso */
  puntos: number;
  /** partidos de grupos ya jugados en el mundial en curso (0 … GRUPOS) */
  jugadosGrupo: number;
  /** todavía estás en fase de grupos */
  enGrupos: boolean;
  /**
   * Resultado de cada instancia ya superada del mundial en curso, en orden.
   * Siempre tiene largo `etapa`: los tres de grupos van igual aunque se hayan
   * perdido, las llaves solo entran cuando se ganan.
   */
  actual: Resultado[];
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

type PartidoParaCamino = Pick<Partido, 'id' | 'fecha' | 'creado_en' | 'resultado' | 'lugar'> &
  Partial<Pick<Partido, 'cierra_mundial'>>;

export function calcularCamino(partidos: PartidoParaCamino[]): EstadoCamino {
  const conResultado = ordenar(partidos.filter((p) => p.resultado));

  let etapa = 0;
  let puntos = 0;
  let actual: Resultado[] = [];
  let copas = 0;
  let mejorInstancia = 0;
  let mundial = 1;
  let cerrarDesde: string | null = null;
  const historial: PasoHistorial[] = [];

  /** Se terminó el mundial: a cero y a empezar de nuevo. */
  let seCerro = false;
  const reiniciar = () => {
    etapa = 0;
    puntos = 0;
    actual = [];
    mundial++;
    cerrarDesde = null;
    seCerro = true;
  };

  for (const p of conResultado) {
    const resultado = p.resultado as Resultado;
    // la instancia que se jugaba en ese momento
    const instancia = CAMINO[etapa];
    let copa = false;
    let eliminado = false;
    seCerro = false;
    cerrarDesde = p.id;

    if (etapa < GRUPOS) {
      // Fase de grupos: el partido se juega igual, sume lo que sume.
      puntos += PUNTOS[resultado];
      actual.push(resultado);
      etapa++;
      if (etapa > mejorInstancia) mejorInstancia = etapa;

      // Recién con los tres jugados se sabe si pasaste.
      if (etapa === GRUPOS && puntos < PARA_PASAR) {
        eliminado = true;
        reiniciar();
      }
    } else if (resultado === 'ganamos') {
      actual.push(resultado);
      etapa++;
      if (etapa > mejorInstancia) mejorInstancia = etapa;
      if (etapa >= INSTANCIAS) {
        copas++;
        copa = true;
        reiniciar();
      }
    } else if (resultado === 'perdimos') {
      eliminado = true;
      reiniciar();
    }
    // empate en llave: se vuelve a jugar, no mueve nada

    // Te bajaste a mano: el mundial termina acá igual, salvo que este
    // partido ya lo haya terminado por su cuenta (copa o eliminación).
    if (p.cierra_mundial && !seCerro) {
      eliminado = true;
      reiniciar();
    }

    historial.push({
      partidoId: p.id,
      fecha: p.fecha,
      lugar: p.lugar,
      instancia,
      resultado,
      copa,
      eliminado,
    });
  }

  const jugadosGrupo = Math.min(etapa, GRUPOS);
  const enGrupos = etapa < GRUPOS;

  return {
    liquidado:
      enGrupos &&
      jugadosGrupo > 0 &&
      puntos + PUNTOS.ganamos * (GRUPOS - jugadosGrupo) < PARA_PASAR,
    cerrarDesde,
    etapa,
    puntos,
    jugadosGrupo,
    enGrupos,
    actual,
    proxima: CAMINO[Math.min(etapa, INSTANCIAS - 1)],
    copas,
    mejorInstancia,
    historial: historial.reverse(), // el más nuevo primero
    mundial,
  };
}

/** Cuántos pasos del camino te faltan para la copa. */
export const faltanParaLaCopa = (e: EstadoCamino) => INSTANCIAS - e.etapa;

/** Puntos que te faltan para asegurar el pase (0 si ya pasaste). */
export const faltanParaPasar = (e: EstadoCamino) => Math.max(0, PARA_PASAR - e.puntos);

/** Frase para el estado actual. */
export function frase(e: EstadoCamino): string {
  if (e.enGrupos) {
    if (e.jugadosGrupo === 0) return 'Arranca el mundial. Tres partidos de grupos por delante.';
    const p = `${e.puntos} punto${e.puntos === 1 ? '' : 's'}`;
    if (e.puntos >= PARA_PASAR)
      return `${p} en el bolsillo: el pase ya está. A jugar el resto sin drama.`;
    const faltan = faltanParaPasar(e);
    const quedan = GRUPOS - e.jugadosGrupo;
    // Ganar todo lo que queda ya no alcanza: el grupo está liquidado. Se
    // puede jugar igual o darlo por terminado a mano.
    if (e.liquidado) return `${p} y ya no dan los números. Este mundial está jugado.`;
    return `${p} en ${e.jugadosGrupo} fecha${e.jugadosGrupo === 1 ? '' : 's'}. Te ${
      faltan === 1 ? 'falta 1' : `faltan ${faltan}`
    } en ${quedan === 1 ? 'la última' : `las ${quedan} que quedan`}.`;
  }
  if (e.etapa === GRUPOS) return 'Pasaste de fase. Octavos: acá se acabó el margen.';
  if (e.etapa === GRUPOS + 1) return 'En cuartos. Empieza lo lindo.';
  if (e.etapa === GRUPOS + 2) return 'Semifinal. No aflojes ahora.';
  return 'La final. Ganás esto y sos campeón.';
}
