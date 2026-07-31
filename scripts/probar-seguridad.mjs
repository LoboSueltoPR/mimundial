/**
 * Prueba de seguridad del acceso anonimo.
 *
 * Se conecta con la anon key (la misma que viaja al navegador de cualquiera)
 * y verifica que un invitado sin cuenta pueda hacer SOLO lo que corresponde.
 *
 *   node scripts/probar-seguridad.mjs <token-de-un-partido>
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const TOKEN = process.argv[2];

let fallos = 0;
function chequear(nombre, ok, detalle = '') {
  if (!ok) fallos++;
  console.log(`${ok ? '✓' : '✗'} ${nombre}${detalle ? '  → ' + detalle : ''}`);
}

console.log('--- lo que NO tiene que poder hacer un anónimo ---');

const sel = await sb.from('partidos').select('*');
chequear('no puede leer partidos', !!sel.error, sel.error?.message || `LEYÓ ${sel.data?.length} filas`);

const selJ = await sb.from('jugadores').select('*');
chequear('no puede leer jugadores', !!selJ.error, selJ.error?.message || `LEYÓ ${selJ.data?.length} filas`);

const selA = await sb.from('amigos').select('*');
chequear('no puede leer amigos', !!selA.error, selA.error?.message || `LEYÓ ${selA.data?.length} filas`);

const ins = await sb.from('jugadores').insert({ partido_id: randomUUID(), nombre: 'Colado' });
chequear('no puede insertar jugadores', !!ins.error, ins.error?.code || 'PASÓ');

const rpcAmigos = await sb.rpc('mis_amigos');
chequear('no puede llamar mis_amigos', !!rpcAmigos.error, rpcAmigos.error?.message?.slice(0, 60) || 'PASÓ');

const rpcBuscar = await sb.rpc('buscar_usuario', { p_email: 'alejolobos92@gmail.com' });
chequear('no puede buscar usuarios', !!rpcBuscar.error, rpcBuscar.error?.message?.slice(0, 60) || 'PASÓ');

const tokenFalso = await sb.rpc('ver_partido_por_token', { tok: 'tokeninventado' });
chequear('un token inventado no devuelve nada', !tokenFalso.error && tokenFalso.data === null);

const claimAjeno = await sb.rpc('actualizar_anotado', {
  p_claim: randomUUID(), p_nombre: 'Hackeado', p_invitados: 0,
});
chequear(
  'no puede editar con un claim ajeno',
  !claimAjeno.error && claimAjeno.data?.ok === false,
  claimAjeno.data?.error,
);

if (!TOKEN) {
  console.log('\n(Pasá un token real como argumento para probar el flujo del invitado.)');
  console.log(fallos === 0 ? '\nTodo OK' : `\n${fallos} fallo(s)`);
  process.exit(fallos === 0 ? 0 : 1);
}

console.log('\n--- lo que SÍ tiene que poder hacer ---');

const ver = await sb.rpc('ver_partido_por_token', { tok: TOKEN });
chequear('ve el partido por token', !ver.error && !!ver.data, ver.error?.message);

if (ver.data) {
  const campos = Object.keys(ver.data);
  chequear('no expone el costo', !campos.includes('costo'), campos.join(','));
  chequear('no expone quién puso la plata', !campos.includes('puso'));
  chequear('no expone el user_id del anfitrión', !campos.includes('user_id'));
  chequear('no expone ningún claim', !JSON.stringify(ver.data).includes('claim'));
  chequear('no expone lo que pagó cada uno', !JSON.stringify(ver.data).includes('pagado'));
}

const miClaim = randomUUID();
const nombrePrueba = 'Test ' + miClaim.slice(0, 6);

const anot = await sb.rpc('anotarse', {
  tok: TOKEN, p_nombre: nombrePrueba, p_invitados: 1, p_claim: miClaim,
});
chequear('se puede anotar', !anot.error && anot.data?.ok === true, anot.data?.error || anot.error?.message);

const repetido = await sb.rpc('anotarse', {
  tok: TOKEN, p_nombre: nombrePrueba + ' bis', p_invitados: 0, p_claim: miClaim,
});
chequear('no se puede anotar dos veces', repetido.data?.ok === false, repetido.data?.error);

const edit = await sb.rpc('actualizar_anotado', {
  p_claim: miClaim, p_nombre: nombrePrueba, p_invitados: 2,
});
chequear('puede editar lo suyo', edit.data?.ok === true, edit.data?.error);

const corto = await sb.rpc('actualizar_anotado', { p_claim: miClaim, p_nombre: 'x', p_invitados: 0 });
chequear('rechaza un nombre inválido', corto.data?.ok === false, corto.data?.error);

const baja = await sb.rpc('borrarse', { p_claim: miClaim });
chequear('puede bajarse', baja.data?.ok === true);

const bajaRepetida = await sb.rpc('borrarse', { p_claim: miClaim });
chequear('bajarse dos veces no rompe', bajaRepetida.data?.ok === false);

console.log(fallos === 0 ? '\nTodo OK' : `\n${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
