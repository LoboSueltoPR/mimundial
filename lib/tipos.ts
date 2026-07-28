export type Resultado = 'ganamos' | 'empate' | 'perdimos';

export type Jugador = {
  id: string;
  partido_id: string;
  nombre: string;
  invitados: number;
  pagado: number;
  orden: number;
};

export type Cabeza = {
  label: string;
  inv: boolean;
  de?: string;
};

export type Equipos = {
  a: Cabeza[];
  b: Cabeza[];
  n: number;
};

export type Partido = {
  id: string;
  user_id: string;
  grupo_id: string | null;
  fecha: string;
  hora: string | null;
  lugar: string | null;
  cupo: number;
  costo: number;
  puso: string | null;
  resultado: Resultado | null;
  goles_favor: number | null;
  goles_contra: number | null;
  equipos: Equipos | null;
  notas: string | null;
  creado_en: string;
};

export type PartidoConJugadores = Partido & { jugadores: Jugador[] };

/** Lo que exporta la app local Se Juega, para poder importarlo. */
export type ExportLocal = {
  partidos: {
    id: string;
    fecha?: string;
    hora?: string;
    lugar?: string;
    cupo?: number;
    costo?: number;
    puso?: string | null;
    equipos?: Equipos | null;
    jugadores: { id: string; nombre: string; invitados?: number; pagado?: number }[];
  }[];
  activo?: string | null;
};
