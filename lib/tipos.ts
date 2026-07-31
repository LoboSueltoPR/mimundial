export type Resultado = 'ganamos' | 'empate' | 'perdimos';

export type Jugador = {
  id: string;
  partido_id: string;
  nombre: string;
  invitados: number;
  pagado: number;
  orden: number;
  /** true si se anotó solo por el link de invitación */
  se_anoto_solo?: boolean;
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

/** Lo que ve alguien que entra por el link, sin cuenta. Nunca trae plata ni ids. */
export type PartidoPublico = {
  fecha: string;
  hora: string | null;
  lugar: string | null;
  cupo: number;
  abierto: boolean;
  cabezas: number;
  faltan: number;
  anfitrion: string | null;
  anotados: { nombre: string; invitados: number }[];
};

export type Amigo = { id: string; nombre: string };
export type Sugerencia = Amigo & { via: string };

export type RespuestaRPC = { ok: boolean; error?: string };

export type Partido = {
  id: string;
  user_id: string;
  grupo_id: string | null;
  token: string;
  abierto: boolean;
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
