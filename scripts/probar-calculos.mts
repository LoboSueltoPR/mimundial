/**
 * Chequeo de la logica de plata, equipos y stats.
 *   node scripts/probar-calculos.mts
 */
import {
  cabezas,
  cabezasLista,
  calcularCuentas,
  calcularStats,
  debeDe,
  pagadoEfectivo,
  porCabeza,
  saldado,
  sortear,
  totalDebe,
  totalPagado,
} from '../lib/calculos.ts';
import type { Jugador, Partido } from '../lib/tipos.ts';

let fallos = 0;
function chequear(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? '✓' : '✗'} ${nombre}${ok ? '' : `  → esperaba ${JSON.stringify(esperado)}, dio ${JSON.stringify(real)}`}`);
}

const jug = (nombre: string, invitados = 0, pagado = 0, id = nombre): Jugador => ({
  id,
  partido_id: 'p1',
  nombre,
  invitados,
  pagado,
  orden: 0,
});

/* ---------- plata ---------- */
const js = [
  jug('Lobo'), jug('Tobi'), jug('Bonomi'), jug('Maxi'), jug('Rami'),
  jug('Brunito', 2), jug('Ruso'), jug('Facku'), jug('Logar'), jug('Molina'),
];
const p = { costo: 60000, puso: null } as Pick<Partido, 'costo' | 'puso'>;

chequear('12 cabezas con Brunito +2', cabezas(js), 12);
chequear('por cabeza = 5000', porCabeza(60000, js), 5000);
chequear('Lobo debe 5000', debeDe(60000, js, js[0]), 5000);
chequear('Brunito (+2) debe 15000', debeDe(60000, js, js[5]), 15000);
chequear('la suma de las partes da el total', js.reduce((a, j) => a + debeDe(60000, js, j), 0), 60000);

/* el que puso la plata queda saldado */
const conPagador = { costo: 60000, puso: 'Molina' } as Pick<Partido, 'costo' | 'puso'>;
chequear('el pagador queda saldado', saldado(conPagador, js, js[9]), true);
chequear('el pagador cubre su parte', pagadoEfectivo(conPagador, js, js[9]), 5000);
chequear('sin pagador nadie esta saldado', saldado(p, js, js[9]), false);
chequear('le deben al pagador 55000', totalDebe(conPagador, js), 55000);

/* pagos parciales */
const jsPagos = js.map((j, i) => (i < 2 ? { ...j, pagado: 5000 } : j));
chequear('dos pagaron -> 10000 juntados', totalPagado(p, jsPagos), 10000);
chequear('faltan 50000', totalDebe(p, jsPagos), 50000);

/* ---------- equipos ---------- */
chequear('la lista de cabezas incluye invitados', cabezasLista(js).length, 12);
const eq = sortear(js);
chequear('reparte 6 y 6', [eq.a.length, eq.b.length], [6, 6]);
chequear('no se pierde nadie', eq.a.length + eq.b.length, cabezasLista(js).length);
chequear(
  'estan todos los mismos nombres',
  [...eq.a, ...eq.b].map((x) => x.label).sort(),
  cabezasLista(js).map((x) => x.label).sort(),
);
const impar = sortear(js.slice(0, 5));
chequear('con impar queda 3 y 2', [impar.a.length, impar.b.length], [3, 2]);

/* el sorteo tiene que variar entre corridas */
const firmas = new Set(Array.from({ length: 30 }, () => sortear(js).a.map((x) => x.label).join()));
chequear('el sorteo no siempre da lo mismo', firmas.size > 1, true);

/* ---------- stats ---------- */
const partido = (fecha: string, resultado: Partido['resultado'], gf?: number, gc?: number) =>
  ({
    id: fecha, user_id: 'u', grupo_id: null, fecha, hora: null, lugar: null,
    cupo: 12, costo: 0, puso: null, resultado,
    goles_favor: gf ?? null, goles_contra: gc ?? null,
    equipos: null, notas: null, creado_en: fecha, jugadores: [],
  }) as Partido & { jugadores: Jugador[] };

const historial = [
  partido('2026-07-01', 'ganamos', 5, 3),
  partido('2026-07-08', 'perdimos', 2, 4),
  partido('2026-07-15', 'ganamos', 6, 1),
  partido('2026-07-22', 'ganamos', 3, 2),
  partido('2026-07-27', null),
];
const s = calcularStats(historial);
chequear('3 ganados', s.ganados, 3);
chequear('1 perdido', s.perdidos, 1);
chequear('1 sin cargar', s.sinCargar, 1);
chequear('4 con resultado', s.jugados, 4);
chequear('efectividad 75%', s.efectividad, 75); // 9 de 12 puntos
chequear('racha: 2 ganados al hilo', s.racha, { tipo: 'ganamos', largo: 2 });
chequear('goles a favor', s.golesFavor, 16);

/* ---------- cuentas historicas ---------- */
const cuentas = calcularCuentas([
  { ...partido('2026-07-01', null), costo: 60000, jugadores: js },
  { ...partido('2026-07-08', null), costo: 60000, jugadores: jsPagos },
]);
const brunito = cuentas.find((c) => c.nombre === 'Brunito')!;
chequear('Brunito debe 30000 en dos partidos', brunito.saldo, 30000);
const lobo = cuentas.find((c) => c.nombre === 'Lobo')!;
chequear('Lobo pago una de las dos veces', [lobo.debe, lobo.pago], [10000, 5000]);

console.log(fallos === 0 ? '\nTodo OK' : `\n${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
