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
  /** si el anotado es un usuario registrado, su id */
  user_id?: string | null;
};

export type Posicion = 'arquero' | 'defensor' | 'mediocampista' | 'delantero';
export type Pie = 'derecho' | 'zurdo' | 'ambos';

export type Perfil = {
  id: string;
  nombre: string;
  avatar_url: string | null;
  username: string | null;
  posicion: Posicion | null;
  pie: Pie | null;
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

/** Lo que ve alguien que entra por el link, sin cuenta. Nunca trae plata. */
export type PartidoPublico = {
  fecha: string;
  hora: string | null;
  lugar: string | null;
  cupo: number;
  abierto: boolean;
  cabezas: number;
  faltan: number;
  anfitrion: string | null;
  anotados: AnotadoPublico[];
};

/** user_id/username/avatar_url solo vienen si quien mira está logueado. */
export type AnotadoPublico = {
  nombre: string;
  invitados: number;
  user_id: string | null;
  username: string | null;
  avatar_url: string | null;
};

export type Amigo = { id: string; nombre: string; username?: string | null; avatar_url?: string | null };
export type Sugerencia = Amigo & { via: string };

export type AmigoCamino = {
  id: string;
  nombre: string;
  username: string | null;
  avatar_url: string | null;
  partidos: { id: string; fecha: string; creado_en: string; resultado: Resultado; lugar: string | null }[];
};

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
