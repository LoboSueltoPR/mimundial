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
  intercambiar,
  ladoDeCuenta,
  pagadoEfectivo,
  pasar,
  porCabeza,
  resultadoPara,
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
  // todos con cuenta: es lo que hace falta para saber de qué lado jugó cada uno
  user_id: 'u-' + nombre,
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

/* ---------- retocar los equipos a mano ---------- */
const base = { a: cabezasLista(js).slice(0, 6), b: cabezasLista(js).slice(6), n: 12 };

const pasado = pasar(base, 'a', 0);
chequear('pasar deja 5 y 7', [pasado.a.length, pasado.b.length], [5, 7]);
chequear('el que pasa cae al final del otro', pasado.b[pasado.b.length - 1].label, base.a[0].label);
chequear('pasar no cambia n', pasado.n, 12);
chequear('pasar no muta el original', [base.a.length, base.b.length], [6, 6]);
chequear(
  'pasar no pierde a nadie',
  [...pasado.a, ...pasado.b].map((x) => x.label).sort(),
  [...base.a, ...base.b].map((x) => x.label).sort(),
);

const cambiado = intercambiar(base, 'a', 0, 2);
chequear('intercambiar no cambia los tamaños', [cambiado.a.length, cambiado.b.length], [6, 6]);
chequear('el de a se fue a b', cambiado.b[2].label, base.a[0].label);
chequear('el de b se vino a a', cambiado.a[0].label, base.b[2].label);
chequear(
  'intercambiar no pierde a nadie',
  [...cambiado.a, ...cambiado.b].map((x) => x.label).sort(),
  [...base.a, ...base.b].map((x) => x.label).sort(),
);

/* sacar al único de un lado deja el equipo vacío, no rompe */
const unoSolo = { a: [base.a[0]], b: base.b, n: 12 };
chequear('vaciar un equipo no rompe', pasar(unoSolo, 'a', 0).a.length, 0);
/* un índice que no existe no hace nada */
chequear('pasar un índice inexistente no toca nada', pasar(base, 'a', 99), base);

/* ---------- de qué lado jugó cada uno ---------- */
chequear('encuentra la cuenta en claros', ladoDeCuenta(base, 'u-Lobo'), 'a');
chequear('encuentra la cuenta en oscuros', ladoDeCuenta(base, 'u-Ruso'), 'b');
chequear('sin cuenta no hay lado', ladoDeCuenta(base, null), null);
chequear('una cuenta que no jugó no tiene lado', ladoDeCuenta(base, 'u-Nadie'), null);
/* un sorteo viejo, sin uid guardado, no le asigna lado a nadie */
const viejo = {
  a: base.a.map(({ label, inv }) => ({ label, inv })),
  b: base.b.map(({ label, inv }) => ({ label, inv })),
  n: 12,
};
chequear('un sorteo viejo no tiene lados', ladoDeCuenta(viejo, 'u-Lobo'), null);

chequear('el de claros gana si ganan los claros', resultadoPara('a', 'a'), 'ganamos');
chequear('el de claros pierde si ganan los oscuros', resultadoPara('a', 'b'), 'perdimos');
chequear('sin ganador es empate para los dos', [resultadoPara('a', null), resultadoPara('b', null)], ['empate', 'empate']);

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

/* ---------- el camino del mundial ---------- */
const { calcularCamino, frase, hito, vistoDe, INSTANCIAS, GRUPOS } =
  await import('../lib/camino.ts');

const pt = (fecha: string, resultado: Partido['resultado']) =>
  ({
    id: 'p' + fecha, user_id: 'u', grupo_id: null, fecha, hora: null, lugar: null,
    cupo: 12, costo: 0, puso: null, resultado, goles_favor: null, goles_contra: null,
    equipos: null, notas: null, creado_en: fecha + 'T20:00:00Z',
  }) as Partido;

const d = (n: number) => `2026-08-${String(n).padStart(2, '0')}`;

chequear('sin partidos arranca en grupos', calcularCamino([]).proxima.id, 'g1');
chequear('sin partidos, cero copas', calcularCamino([]).copas, 0);

/* --- fase de grupos: los tres se juegan igual, pasás con 3 puntos --- */
const grupo = (...rs: Partido['resultado'][]) => calcularCamino(rs.map((r, i) => pt(d(i + 1), r)));

const unaDerrota = grupo('ganamos', 'perdimos', 'ganamos');
chequear('perder uno de grupos no elimina', unaDerrota.proxima.id, 'oc');
chequear('y suma 6 puntos', unaDerrota.puntos, 6);
chequear('sigue el mismo mundial', unaDerrota.mundial, 1);

chequear('un triunfo y un empate alcanzan (4 pts)', grupo('ganamos', 'empate', 'perdimos').proxima.id, 'oc');

/* el umbral es 4: 3 puntos ya no alcanzan */
chequear('un triunfo y dos derrotas no alcanza (3 pts)', grupo('ganamos', 'perdimos', 'perdimos').proxima.id, 'g1');
chequear('tres empates no alcanzan (3 pts)', grupo('empate', 'empate', 'empate').proxima.id, 'g1');
chequear('2 puntos no alcanzan', grupo('perdimos', 'empate', 'empate').proxima.id, 'g1');

const afuera = grupo('perdimos', 'perdimos', 'perdimos');
chequear('tres derrotas: afuera', afuera.proxima.id, 'g1');
chequear('y arranca un mundial nuevo', afuera.mundial, 2);
chequear('la 3a fecha queda marcada como eliminacion', afuera.historial[0].eliminado, true);

/* se juegan las tres aunque los numeros ya no den */
chequear('no se elimina antes de jugar las tres', grupo('perdimos', 'perdimos').proxima.id, 'g3');
chequear('con dos jugados sigue el mundial 1', grupo('perdimos', 'perdimos').mundial, 1);
chequear(
  'avisa cuando ya no dan los numeros',
  frase(grupo('perdimos', 'perdimos')).includes('ya no dan los números'),
  true,
);

/* --- bajarse sin jugar la ultima (0007) --- */
const liquidado = grupo('perdimos', 'perdimos');
chequear('dos derrotas dejan el grupo liquidado', liquidado.liquidado, true);
chequear('y ofrece cerrar desde el ultimo jugado', liquidado.cerrarDesde, 'p' + d(2));
chequear('una sola derrota todavia no liquida', grupo('perdimos').liquidado, false);
chequear('sin jugar nada no hay nada que liquidar', calcularCamino([]).liquidado, false);
chequear('con 3 puntos y una fecha por jugar no esta liquidado', grupo('ganamos').liquidado, false);

const cerrado = calcularCamino([
  pt(d(1), 'perdimos'),
  { ...pt(d(2), 'perdimos'), cierra_mundial: true },
  pt(d(3), 'ganamos'),
]);
chequear('cerrado a mano: el siguiente arranca mundial nuevo', cerrado.mundial, 2);
chequear('y ese triunfo es la 1a fecha del nuevo', cerrado.jugadosGrupo, 1);
chequear('con sus 3 puntos limpios', cerrado.puntos, 3);
chequear('el partido del cierre queda marcado', cerrado.historial[1].eliminado, true);

/* el flag en un partido que ya cerraba el mundial solo no cuenta dos veces */
const cierreDoble = calcularCamino([
  pt(d(1), 'perdimos'),
  pt(d(2), 'perdimos'),
  { ...pt(d(3), 'perdimos'), cierra_mundial: true },
]);
chequear('no abre dos mundiales de un saque', cierreDoble.mundial, 2);

/* --- de octavos en adelante no hay red --- */
const enOctavos: Partido['resultado'][] = ['ganamos', 'ganamos', 'ganamos'];

const empateEnLlave = grupo(...enOctavos, 'empate');
chequear('el empate en llave te deja donde estabas', empateEnLlave.proxima.id, 'oc');

const derrotaEnLlave = grupo(...enOctavos, 'perdimos');
chequear('la derrota en llave manda a cero', derrotaEnLlave.proxima.id, 'g1');
chequear('la derrota en llave abre mundial nuevo', derrotaEnLlave.mundial, 2);
chequear('pero queda registrada la mejor instancia', derrotaEnLlave.mejorInstancia, 3);

const campeon = calcularCamino(
  Array.from({ length: INSTANCIAS }, (_, i) => pt(d(i + 1), 'ganamos')),
);
chequear('3 de grupos + 4 de llave -> una copa', campeon.copas, 1);
chequear('despues de la copa vuelve a cero', campeon.etapa, 0);
chequear('y arranca el mundial 2', campeon.mundial, 2);
chequear('el ultimo paso marca la copa', campeon.historial[0].copa, true);
chequear('el ultimo triunfo fue la final', campeon.historial[0].instancia.id, 'fi');

/* campeón perdiendo uno en grupos: 8 partidos, no 7 */
const campeonSufrido = grupo('perdimos', 'ganamos', 'ganamos', 'ganamos', 'ganamos', 'ganamos', 'ganamos');
chequear('se puede salir campeon habiendo perdido en grupos', campeonSufrido.copas, 1);

const dosCopas = calcularCamino(
  Array.from({ length: INSTANCIAS * 2 }, (_, i) => pt(d(i + 1), 'ganamos')),
);
chequear('14 al hilo -> dos copas', dosCopas.copas, 2);

/* el estado del mundial en curso, que es lo que dibuja los casilleros */
const enCuartos = grupo('ganamos', 'empate', 'perdimos', 'ganamos');
chequear('actual tiene un casillero por instancia superada', enCuartos.actual.length, 4);
chequear('y guarda el resultado de cada fecha de grupos', enCuartos.actual.slice(0, GRUPOS), [
  'ganamos', 'empate', 'perdimos',
]);
chequear('largo de actual = etapa', enCuartos.actual.length, enCuartos.etapa);

/* el orden cronologico manda, no el orden en que vienen */
const desordenado = calcularCamino([
  pt(d(3), 'perdimos'), pt(d(1), 'perdimos'), pt(d(2), 'perdimos'),
]);
chequear('ordena por fecha antes de contar', desordenado.mundial, 2);

/* los partidos sin resultado no cuentan */
const conPendientes = calcularCamino([pt(d(1), 'ganamos'), pt(d(2), null), pt(d(3), 'ganamos')]);
chequear('los partidos sin cargar se ignoran', conPendientes.puntos, 6);
chequear('el historial solo trae los jugados', conPendientes.historial.length, 2);

/* ---------- el cartelito de "pasaste de fase" ---------- */
const hGrupos1 = grupo('ganamos');
const hOctavos = grupo('ganamos', 'ganamos', 'ganamos');
const hCuartos = grupo('ganamos', 'ganamos', 'ganamos', 'ganamos');
const hFinal = grupo('ganamos', 'ganamos', 'ganamos', 'ganamos', 'ganamos', 'ganamos');

chequear('sin nada visto antes no hay cartel', hito(null, hOctavos), null);
chequear('avanzar dentro de grupos no es pasar de fase',
  hito(vistoDe(calcularCamino([])), hGrupos1), null);
chequear('mirar dos veces lo mismo no repite el cartel',
  hito(vistoDe(hOctavos), hOctavos), null);
chequear('pasar de grupos a octavos: 4 partidos para la copa',
  hito(vistoDe(hGrupos1), hOctavos)?.titulo, 'A 4 partidos del sueño');
chequear('y dice que pasaste la fase de grupos',
  hito(vistoDe(hGrupos1), hOctavos)?.bajada.startsWith('Pasaste la fase de grupos'), true);
chequear('ganar octavos avisa cuartos',
  hito(vistoDe(hOctavos), hCuartos)?.titulo, 'A 3 partidos del sueño');
chequear('y nombra la llave que ganaste',
  hito(vistoDe(hOctavos), hCuartos)?.bajada, 'Ganaste octavos de final.');
chequear('en la final falta uno solo, en singular',
  hito(vistoDe(grupo('ganamos', 'ganamos', 'ganamos', 'ganamos', 'ganamos')), hFinal)?.titulo,
  'A 1 partido del sueño');
chequear('levantar la copa tiene su propio cartel',
  hito(vistoDe(hFinal), grupo(...Array(INSTANCIAS).fill('ganamos')))?.copa, true);
chequear('quedar eliminado no muestra cartel',
  hito(vistoDe(hOctavos), grupo('ganamos', 'ganamos', 'ganamos', 'perdimos')), null);

/* ---------- la ruta plegada ---------- */
const { CAMINO, listaBreve } = await import('../lib/camino.ts');
const plegado = (etapa: number) => listaBreve(CAMINO.slice(etapa + 2));

chequear('en la 2a de grupos se pliegan cinco pasos',
  plegado(1), 'octavos, cuartos, la semi y la final');
chequear('en octavos se ven cuartos y se pliega el resto',
  plegado(GRUPOS), 'la semi y la final');
chequear('en semis se pliega uno solo, sin coma ni "y"',
  plegado(INSTANCIAS - 3), 'la final');
chequear('en la final ya no queda nada plegado', plegado(INSTANCIAS - 1), '');

console.log(fallos === 0 ? '\nTodo OK' : `\n${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
