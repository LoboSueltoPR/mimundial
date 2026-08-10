import type { Cabeza, Equipos, Jugador, Partido, Resultado } from './tipos';

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
    out.push({ label: j.nombre, inv: false });
    for (let i = 0; i < (j.invitados || 0); i++) {
      out.push({ label: 'Invitado de ' + j.nombre, inv: true, de: j.nombre });
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
