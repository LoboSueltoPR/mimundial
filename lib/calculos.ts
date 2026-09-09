import type { Cabeza, Equipos, Jugador, Lado, Partido, Resultado } from './tipos';

/* ============================================================
   Cabezas y plata
   Portado tal cual de la app local Se Juega — esta logica ya
   estaba probada, no se rehizo.
   ============================================================ */

/** Cada jugador cuenta 1 + sus invitados. */
export function cabezas(jugadores: Jugador[]): number {
  return jugadores.reduce((a, j) => a + 1 + (j.invitados || 0), 0);
}

export function porCabeza(costo: number, jugadores: Jugador[]): number {
  const c = cabezas(jugadores);
  return c > 0 ? (costo || 0) / c : 0;
}

export function debeDe(costo: number, jugadores: Jugador[], j: Jugador): number {
  return Math.round(porCabeza(costo, jugadores) * (1 + (j.invitados || 0)));
}

export function pagadoDe(j: Jugador): number {
  return Math.max(0, j.pagado || 0);
}

/** El que puso la plata adelanto todo: su parte ya esta cubierta. */
export function pagadoEfectivo(p: Pick<Partido, 'costo' | 'puso'>, jugadores: Jugador[], j: Jugador): number {
  return p.puso === j.id ? debeDe(p.costo, jugadores, j) : pagadoDe(j);
}

export function saldado(p: Pick<Partido, 'costo' | 'puso'>, jugadores: Jugador[], j: Jugador): boolean {
  return pagadoEfectivo(p, jugadores, j) >= debeDe(p.costo, jugadores, j);
}

export function totalPagado(p: Pick<Partido, 'costo' | 'puso'>, jugadores: Jugador[]): number {
  return jugadores.reduce((a, j) => a + pagadoEfectivo(p, jugadores, j), 0);
}

export function totalDebe(p: Pick<Partido, 'costo' | 'puso'>, jugadores: Jugador[]): number {
  return jugadores.reduce(
    (a, j) => a + Math.max(0, debeDe(p.costo, jugadores, j) - pagadoEfectivo(p, jugadores, j)),
    0,
  );
}

/* ============================================================
   Equipos
   ============================================================ */

/** Una entrada por cabeza: el jugador y cada uno de sus invitados. */
export function cabezasLista(jugadores: Jugador[]): Cabeza[] {
  const out: Cabeza[] = [];
  jugadores.forEach((j) => {
    out.push({ label: j.nombre, inv: false, jid: j.id, uid: j.user_id ?? null });
    for (let i = 0; i < (j.invitados || 0); i++) {
      out.push({ label: 'Invitado de ' + j.nombre, inv: true, de: j.nombre, jid: j.id });
    }
  });
  return out;
}

/** Fisher-Yates. Reparte en dos equipos; con impar, el primero lleva uno mas. */
export function sortear(jugadores: Jugador[]): Equipos {
  const lista = cabezasLista(jugadores);
  for (let i = lista.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [lista[i], lista[k]] = [lista[k], lista[i]];
  }
  const mitad = Math.ceil(lista.length / 2);
  return { a: lista.slice(0, mitad), b: lista.slice(mitad), n: lista.length };
}

/* ------------------------------------------------------------
   Retocar el sorteo a mano

   El sorteo lo reparte el bombo, pero después siempre hay que
   emparejar: pasar uno de un lado al otro o cambiar dos entre sí.
   Las dos funciones devuelven un objeto nuevo — el estado nunca se
   muta — y NO tocan `n`: ese número sigue siendo cuántas cabezas
   había anotadas cuando se sorteó, que es lo que compara el aviso de
   "la lista cambió". Mover gente no cambia la lista.
   ------------------------------------------------------------ */

export const otroLado = (l: Lado): Lado => (l === 'a' ? 'b' : 'a');

/** Pasa la cabeza `i` del lado `lado` al otro equipo (queda al final). */
export function pasar(eq: Equipos, lado: Lado, i: number): Equipos {
  const quien = eq[lado][i];
  if (!quien) return eq;
  const otro = otroLado(lado);
  return {
    ...eq,
    [lado]: eq[lado].filter((_, k) => k !== i),
    [otro]: [...eq[otro], quien],
  };
}

/** Cambia de camiseta a dos, uno de cada lado. */
export function intercambiar(eq: Equipos, lado: Lado, i: number, j: number): Equipos {
  const otro = otroLado(lado);
  const uno = eq[lado][i];
  const dos = eq[otro][j];
  if (!uno || !dos) return eq;
  return {
    ...eq,
    [lado]: eq[lado].map((x, k) => (k === i ? dos : x)),
    [otro]: eq[otro].map((x, k) => (k === j ? uno : x)),
  };
}

/**
 * En qué equipo quedó una cuenta, o null si no se puede saber: el
 * sorteo es viejo y no guarda `uid`, o esa persona no jugó.
 */
export function ladoDeCuenta(eq: Equipos | null, uid: string | null | undefined): Lado | null {
  if (!eq || !uid) return null;
  if (eq.a.some((c) => !c.inv && c.uid === uid)) return 'a';
  if (eq.b.some((c) => !c.inv && c.uid === uid)) return 'b';
  return null;
}

/**
 * Cómo le fue a quien jugó en `lado`. `ganador` en null es empate: no hay
 * lado ganador. Que el partido esté sin cargar se sabe por `resultado`,
 * no por acá.
 */
export function resultadoPara(lado: Lado, ganador: Lado | null): Resultado {
  if (!ganador) return 'empate';
  return ganador === lado ? 'ganamos' : 'perdimos';
}

/* ============================================================
   Desafíos — equipo contra equipo (0021)

   Un desafío no tiene sorteo: cada capitán declara su lado. `cupo`
   sigue siendo el total de cabezas del partido, igual que en un
   picadito, así que "cuántos por lado" es la mitad. Se reusa la
   columna en vez de agregar una: 10 es 5 contra 5.
   ============================================================ */

/** Cuántos van por lado. `cupo` es el total, como en cualquier partido. */
export function porLado(cupo: number): number {
  return Math.max(1, Math.floor((cupo || 0) / 2));
}

/** Las cabezas de un lado: cada jugador cuenta 1 más los que trae. */
export function cabezasDeLado(jugadores: Jugador[], lado: Lado): number {
  return cabezas(jugadores.filter((j) => j.lado === lado));
}

/** Cuántos le faltan a un lado para estar completo. Nunca negativo. */
export function faltanEnLado(cupo: number, cabezasDelLado: number): number {
  return Math.max(0, porLado(cupo) - cabezasDelLado);
}

/**
 * En qué momento está un desafío.
 *
 * · buscando  — publicado, sin rival: cualquier amigo lo puede tomar
 * · esperando — se desafió a alguien puntual y todavía no contestó
 * · aceptado  — hay rival y los dos están armando
 * · jugado    — ya tiene resultado cargado
 *
 * `jugado` se chequea primero a propósito: un desafío que se jugó ya no
 * está esperando nada, aunque los otros campos digan lo contrario.
 */
export type EstadoDesafio = 'buscando' | 'esperando' | 'aceptado' | 'jugado';

export function estadoDesafio(
  p: Pick<Partido, 'resultado' | 'rival_id' | 'rival_acepto_en'>,
): EstadoDesafio {
  if (p.resultado) return 'jugado';
  if (p.rival_acepto_en) return 'aceptado';
  if (p.rival_id) return 'esperando';
  return 'buscando';
}

/**
 * Cómo se llama un lado en pantalla. Si el capitán no le puso nombre al
 * equipo, se lo nombra por él — "Los de Alejo" — que es como se nombran
 * de verdad los equipos de picadito. Solo la primera palabra: el
 * apellido no entra en una columna de 160px.
 */
export function nombreDeLado(nombreEquipo: string | null, capitan: string | null): string {
  const propio = (nombreEquipo || '').trim();
  if (propio) return propio;
  const pila = (capitan || '').trim().split(/\s+/)[0];
  return pila ? `Los de ${pila}` : 'Sin nombre';
}

/* ============================================================
   Estadisticas
   ============================================================ */

export type Racha = { tipo: Resultado | null; largo: number };

export type Stats = {
  jugados: number;
  ganados: number;
  empatados: number;
  perdidos: number;
  sinCargar: number;
  efectividad: number; // % sobre puntos posibles (3 por partido)
  golesFavor: number;
  golesContra: number;
  racha: Racha;
  gastado: number;
};

export function calcularStats(partidos: (Partido & { jugadores?: Jugador[] })[]): Stats {
  const conResultado = partidos.filter((p) => p.resultado);

  const ganados = conResultado.filter((p) => p.resultado === 'ganamos').length;
  const empatados = conResultado.filter((p) => p.resultado === 'empate').length;
  const perdidos = conResultado.filter((p) => p.resultado === 'perdimos').length;

  const puntos = ganados * 3 + empatados;
  const posibles = conResultado.length * 3;

  // los mas nuevos primero, para la racha
  const orden = [...conResultado].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  let racha: Racha = { tipo: null, largo: 0 };
  if (orden.length) {
    const tipo = orden[0].resultado!;
    let largo = 0;
    for (const p of orden) {
      if (p.resultado !== tipo) break;
      largo++;
    }
    racha = { tipo, largo };
  }

  const suma = (k: 'goles_favor' | 'goles_contra') =>
    conResultado.reduce((a, p) => a + (p[k] ?? 0), 0);

  // lo que te toco poner a vos en cada partido
  const gastado = partidos.reduce((a, p) => {
    const js = p.jugadores || [];
    return a + (js.length ? porCabeza(p.costo, js) : 0);
  }, 0);

  return {
    jugados: conResultado.length,
    ganados,
    empatados,
    perdidos,
    sinCargar: partidos.length - conResultado.length,
    efectividad: posibles > 0 ? Math.round((puntos / posibles) * 100) : 0,
    golesFavor: suma('goles_favor'),
    golesContra: suma('goles_contra'),
    racha,
    gastado: Math.round(gastado),
  };
}

/* ============================================================
   Cuentas por persona (historico)
   ============================================================ */

export type Cuenta = {
  nombre: string;
  debe: number;
  pago: number;
  saldo: number;
  partidos: number;
};

export function calcularCuentas(partidos: (Partido & { jugadores: Jugador[] })[]): Cuenta[] {
  const acc: Record<string, Cuenta> = {};

  partidos.forEach((p) => {
    p.jugadores.forEach((j) => {
      const k = j.nombre.toLowerCase();
      if (!acc[k]) acc[k] = { nombre: j.nombre, debe: 0, pago: 0, saldo: 0, partidos: 0 };
      acc[k].debe += debeDe(p.costo, p.jugadores, j);
      acc[k].pago += pagadoEfectivo(p, p.jugadores, j);
      acc[k].partidos++;
    });
  });

  return Object.values(acc)
    .map((x) => ({ ...x, saldo: x.debe - x.pago }))
    .sort((a, b) => b.saldo - a.saldo);
}

/* ============================================================
   Socios en la cancha
   ============================================================ */

export type Socio = { nombre: string; juntos: number; ganados: number; efectividad: number };

/**
 * Con quién compartiste equipo y qué tan bien te fue. Necesita saber cuál
 * de los nombres de la lista sos vos — eso lo guarda quien llama (un
 * apodo elegido a mano, no hay forma de deducirlo: los jugadores son
 * texto libre, no cuentas). Solo cuenta partidos con equipos sorteados y
 * resultado cargado; los invitados no entran porque no tienen nombre
 * propio ("Invitado de X").
 */
export function calcularSocios(
  partidos: (Partido & { jugadores?: Jugador[] })[],
  apodo: string,
): Socio[] {
  const yo = apodo.trim().toLowerCase();
  if (!yo) return [];

  const acc: Record<string, { nombre: string; juntos: number; ganados: number }> = {};

  partidos.forEach((p) => {
    if (!p.equipos || !p.resultado) return;
    const lados = [p.equipos.a, p.equipos.b];
    const miLado = lados.find((lado) => lado.some((c) => !c.inv && c.label.toLowerCase() === yo));
    if (!miLado) return;

    miLado.forEach((c) => {
      if (c.inv || c.label.toLowerCase() === yo) return;
      const k = c.label.toLowerCase();
      if (!acc[k]) acc[k] = { nombre: c.label, juntos: 0, ganados: 0 };
      acc[k].juntos++;
      if (p.resultado === 'ganamos') acc[k].ganados++;
    });
  });

  return Object.values(acc)
    .map((x) => ({ ...x, efectividad: Math.round((x.ganados / x.juntos) * 100) }))
    .sort((a, b) => b.juntos - a.juntos);
}

/** Cuantas veces jugo cada uno — para ver quien engancha siempre. */
export function presencias(partidos: (Partido & { jugadores: Jugador[] })[]) {
  const acc: Record<string, { nombre: string; veces: number; invitados: number }> = {};
  partidos.forEach((p) =>
    p.jugadores.forEach((j) => {
      const k = j.nombre.toLowerCase();
      if (!acc[k]) acc[k] = { nombre: j.nombre, veces: 0, invitados: 0 };
      acc[k].veces++;
      acc[k].invitados += j.invitados || 0;
    }),
  );
  return Object.values(acc).sort((a, b) => b.veces - a.veces);
}

/* ============================================================
   Formato
   ============================================================ */

export const plata = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-AR');

/**
 * Colores de avatar: tintas de sello. Son profundos a proposito porque
 * van sobre papel claro y llevan las iniciales en blanco — un pastel no
 * contrastaria. Ninguno es dorado: el oro esta reservado a la copa.
 */
const COLORES = [
  '#26418f', '#1c6b3f', '#a8430d', '#6c3a96', '#b03028', '#0e6a70',
  '#3d5a2a', '#8c2f63', '#1f5a8a', '#7a4418', '#2f6b52', '#5b3f8c',
];

export function color(nombre: string): string {
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  return COLORES[h % COLORES.length];
}

export function iniciales(nombre: string): string {
  const ps = nombre.trim().split(/\s+/);
  return (ps.length > 1 ? ps[0][0] + ps[1][0] : nombre.slice(0, 2)).toUpperCase();
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function fechaCorta(iso: string | null | undefined) {
  const [a, m, d] = (iso || '').split('-').map(Number);
  if (!a) return { d: '--', m: '' };
  return { d: String(d), m: MESES[m - 1] || '' };
}

export function fechaLarga(iso: string | null | undefined) {
  const f = fechaCorta(iso);
  return f.d + ' ' + f.m;
}

/* ============================================================
   Próximo o jugado, y qué decir de cada uno
   ============================================================ */

/** El día de hoy en ISO local (no UTC: a la noche `toISOString` ya es mañana). */
export function hoyISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** El partido de hoy todavía es próximo: se juega esta noche. */
export const esProximo = (fecha: string, hoy: string): boolean => (fecha || '') >= hoy;

export type PillPartido = { cls: string; txt: string };

/**
 * Qué dice la etiqueta de un partido en la lista.
 *
 * El error que esto viene a arreglar: la etiqueta miraba SOLO cuánta
 * gente hay anotada ahora mismo, sin fijarse en la fecha. Un partido de
 * hace tres semanas que se jugó entero seguía diciendo "Falta gente",
 * como si todavía se pudiera sumar alguien.
 *
 * El orden de prioridad importa:
 *
 *  1. **El resultado manda sobre todo.** Si el partido se jugó y quedó
 *     cargado, eso es lo que pasó — aunque la lista haya terminado en
 *     13 de 14 porque alguien se bajó después. Cuánta gente quedó
 *     anotada al final no dice si se jugó.
 *  2. **Si todavía no llegó**, lo único que importa es si está completo.
 *  3. **Si ya pasó y no hay resultado**, se distingue el que nunca
 *     juntó gente —"pinchó"— del que se llenó y quedó sin cerrar.
 *
 * El único caso que puede quedar mal etiquetado es un partido tuyo que
 * se jugó incompleto y del que nunca cargaste el resultado: va a decir
 * que pinchó. Se arregla cargando el resultado, que es lo que faltaba
 * de todos modos.
 */
export function estadoPartido(
  p: {
    fecha: string;
    cupo: number;
    cabezas: number;
    resultado?: Resultado | null;
    /** El dueño lo cerró. En un partido ajeno se sabe que se jugó incluso
     *  cuando no se puede saber cómo salió para vos: sin sorteo guardado
     *  no hay de dónde deducir de qué lado jugaste. */
    jugado?: boolean;
    /** Solo para los partidos propios: plata sin cobrar. */
    debe?: number;
    /** Un desafío al que todavía no le apareció rival. Lo que le falta a
     *  ese partido no es gente ni plata: es el otro equipo. */
    esperandoRival?: boolean;
    /** Ya hay un rival invitado, pero no contestó. */
    rivalInvitado?: boolean;
  },
  hoy: string,
): PillPartido {
  if (p.resultado === 'ganamos') return { cls: 'ok', txt: 'Ganamos' };
  if (p.resultado === 'perdimos') return { cls: 'perd', txt: 'Perdimos' };
  if (p.resultado === 'empate') return { cls: 'emp', txt: 'Empate' };

  // Se jugó, pero no se puede decir cómo salió para vos.
  if (p.jugado) return { cls: 'emp', txt: 'Se jugó' };

  const completo = p.cabezas >= p.cupo;

  if (esProximo(p.fecha, hoy)) {
    if (p.esperandoRival) {
      return { cls: 'sin', txt: p.rivalInvitado ? 'Sin respuesta' : 'Busca rival' };
    }
    return completo ? { cls: 'ok', txt: 'Se juega' } : { cls: 'sin', txt: 'Falta gente' };
  }

  if (!completo) return { cls: 'sin', txt: 'Pinchó' };
  if ((p.debe ?? 0) > 0) return { cls: 'debe', txt: 'falta ' + plata(p.debe ?? 0) };
  return { cls: 'sin', txt: 'sin cargar' };
}

/**
 * El orden de la lista, sin importar quién armó el partido.
 *
 * Antes eran dos listas separadas —los tuyos y aquellos en los que te
 * anotaron— cada una ordenada por su lado, así que el partido del
 * viernes podía quedar abajo de uno de hace un mes solamente porque lo
 * armó otro.
 *
 * Los que faltan jugar van del más cercano al más lejano: arriba de
 * todo queda el próximo, que es el único sobre el que todavía se puede
 * hacer algo. Los jugados van del más reciente al más viejo.
 */
export function compararPartidos(
  a: { fecha: string; hora?: string | null },
  b: { fecha: string; hora?: string | null },
  hoy: string,
): number {
  const pa = esProximo(a.fecha, hoy);
  const pb = esProximo(b.fecha, hoy);
  if (pa !== pb) return pa ? -1 : 1;

  const dir = pa ? 1 : -1;
  const porFecha = (a.fecha || '').localeCompare(b.fecha || '');
  if (porFecha !== 0) return porFecha * dir;
  return ((a.hora || '').localeCompare(b.hora || '')) * dir;
}
