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
  apodo: string | null;
  club: string | null;
  avatar_url: string | null;
  username: string | null;
  posicion: Posicion | null;
  pie: Pie | null;
};

/** Una cancha del catálogo. Se carga por migración: la app no escribe acá. */
export type Cancha = {
  id: string;
  nombre: string;
  direccion: string | null;
  lat: number;
  lng: number;
  notas: string | null;
};

/**
 * Una cabeza del sorteo. `jid`/`uid` son opcionales a propósito: los
 * sorteos que ya están guardados en la base tienen solo `label`, `inv` y
 * `de`. Nada puede darlos por hecho.
 */
export type Cabeza = {
  label: string;
  inv: boolean;
  de?: string;
  /** fila de `jugadores` a la que pertenece esta cabeza (el invitado usa la de quien lo trae) */
  jid?: string;
  /** cuenta del jugador, si la tiene enganchada */
  uid?: string | null;
};

export type Lado = 'a' | 'b';

export type Equipos = {
  a: Cabeza[];
  b: Cabeza[];
  n: number;
};

/** Lo que ve alguien que entra por el link, sin cuenta. Nunca trae plata. */
export type PartidoPublico = {
  id: string;
  fecha: string;
  hora: string | null;
  lugar: string | null;
  cupo: number;
  abierto: boolean;
  cabezas: number;
  faltan: number;
  anfitrion: string | null;
  /** true si quien mira, logueado, ya tiene una fila en este partido — no depende del navegador. */
  soy_anotado: boolean;
  mi_nombre: string | null;
  mi_invitados: number | null;
  /** null si el partido no tiene cancha del catálogo (lugar a mano). */
  cancha_lat: number | null;
  cancha_lng: number | null;
  cancha_notas: string | null;
  /** El sorteo SIN los ids: las cabezas vienen solo con label/inv/de.
   *  null si todavía no se sorteó. Ver `equipos_publicos` en 0015. */
  equipos: Equipos | null;
  /** Plata del grupo, no de nadie en particular: lo que salió y cuánto
   *  toca por cabeza. Lo que pagó o debe cada uno NO se expone acá —
   *  lo tuyo sale de `mi_parte`. */
  costo: number;
  por_cabeza: number;
  /** Nombre del que adelantó la plata, no su id. null si nadie. */
  puso_nombre: string | null;
  anotados: AnotadoPublico[];
};

/** Lo que me toca a mí en un partido al que entré por el link. */
export type MiParte = {
  anotado: boolean;
  nombre?: string;
  invitados?: number;
  debe?: number;
  pagado?: number;
  saldo?: number;
  /** true si el que adelantó la plata soy yo */
  adelante?: boolean;
};

/** Un partido ajeno en el que el logueado está anotado como jugador. */
export type MiPartidoAnotado = {
  id: string;
  token: string;
  fecha: string;
  hora: string | null;
  lugar: string | null;
  cupo: number;
  abierto: boolean;
  anfitrion: string | null;
  cabezas: number;
  faltan: number;
  mi_invitados: number;
};

/** id/user_id/username/avatar_url solo vienen si quien mira está logueado. */
export type AnotadoPublico = {
  id: string | null;
  nombre: string;
  invitados: number;
  user_id: string | null;
  username: string | null;
  avatar_url: string | null;
  /** la fila la cargó el anfitrión a mano y no es de nadie: se puede reclamar */
  reclamable: boolean;
};

export type Amigo = {
  id: string;
  nombre: string;
  apodo?: string | null;
  username?: string | null;
  avatar_url?: string | null;
};
export type Sugerencia = Amigo & { via: string };

export type Solicitud = {
  id: string;
  id_usuario: string;
  nombre: string;
  apodo: string | null;
  avatar_url: string | null;
  username: string | null;
  creado_en: string;
};

/** Con quién ya sos amigo, a quién le mandaste solicitud (pendiente), o
 *  ninguna de las dos — lo que decide qué botón mostrar en un perfil. */
export type EstadoAmistad = 'amigo' | 'pendiente' | 'ninguno';

export type PartidoParaCamino = {
  id: string;
  fecha: string;
  creado_en: string;
  resultado: Resultado;
  lugar: string | null;
  cierra_mundial?: boolean;
};

export type AmigoCamino = {
  id: string;
  nombre: string;
  apodo: string | null;
  username: string | null;
  avatar_url: string | null;
  partidos: PartidoParaCamino[];
};

/** Lo que devuelve perfil_publico: como AmigoCamino pero de alguien con
 *  quien compartís un partido o ya son amigos, más los datos de jugador
 *  que en el resto de las listas no hace falta traer. */
export type PerfilPublico = AmigoCamino & {
  club: string | null;
  posicion: Posicion | null;
  pie: Pie | null;
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
  /** Nombre del lugar. Si se eligió una cancha del catálogo, es su nombre
   *  copiado — sigue siendo el campo que leen las RPCs de invitación. */
  lugar: string | null;
  cancha_id: string | null;
  cupo: number;
  costo: number;
  puso: string | null;
  resultado: Resultado | null;
  /** Qué lado ganó, cuando hubo sorteo. Es lo único que sirve para el resto:
   *  `resultado` está escrito desde el punto de vista del dueño del partido. */
  equipo_ganador: Lado | null;
  goles_favor: number | null;
  goles_contra: number | null;
  equipos: Equipos | null;
  notas: string | null;
  /** true si con este partido se dio por terminado el mundial (ver 0007) */
  cierra_mundial: boolean;
  creado_en: string;
};

export type PartidoConJugadores = Partido & { jugadores: Jugador[] };

/** Partido con la cancha del catálogo embebida (PostgREST `canchas(*)`).
 *  null si el lugar se escribió a mano. */
export type PartidoConCancha = Partido & { canchas: Cancha | null };
