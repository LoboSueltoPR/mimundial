/**
 * Genera los PNG del ícono a partir de la marca (public/logo.svg).
 *
 *   node scripts/generar-iconos.mjs
 *
 * Antes esto dibujaba la copa píxel por píxel con zlib. Ya no: la marca
 * es un vector de verdad, así que se rasteriza con sharp y se termina el
 * asunto. Si cambia la marca, cambiás public/logo.svg y corrés esto.
 *
 * La marca va BLANCA sobre el azul birome — el mismo acento de la app.
 * En negro sobre blanco (que es como viene el archivo original) el ícono
 * desaparece en la grilla del teléfono: no tiene con qué distinguirse.
 *
 * OJO con el service worker: public/sw.js precachea /icons/icon-192.png.
 * Si regenerás los íconos, subí CACHE en el mismo commit o los que ya
 * tienen la app instalada se quedan sirviendo el PNG viejo.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'public', 'icons');

const AZUL = '#26418f'; // --acento, la birome
const TINTA = '#ffffff';

// la caja de la marca, tal cual viene el vector
const VB_ANCHO = 878;
const VB_ALTO = 406.7;
const RATIO = VB_ANCHO / VB_ALTO;

const PATHS = [...readFileSync(join(RAIZ, 'public', 'logo.svg'), 'utf8')
  .matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
if (PATHS.length === 0) throw new Error('public/logo.svg no tiene paths');

/**
 * Arma el SVG del ícono a un tamaño dado.
 *
 * @param tam    lado del cuadrado, en px
 * @param ancho  qué proporción del lado ocupa la marca (0-1)
 * @param radio  radio de las esquinas, en proporción del lado
 */
function icono(tam, ancho, radio) {
  return Buffer.from(iconoSvg(tam, ancho, radio));
}

/** El mismo ícono como texto SVG — sirve de favicon sin rasterizar. */
function iconoSvg(tam, ancho, radio) {
  const w = tam * ancho;
  const h = w / RATIO;
  const escala = w / VB_ANCHO;
  const x = (tam - w) / 2;
  const y = (tam - h) / 2;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}">` +
    `<rect width="${tam}" height="${tam}" rx="${tam * radio}" ry="${tam * radio}" fill="${AZUL}"/>` +
    `<g transform="translate(${x} ${y}) scale(${escala})" fill="${TINTA}">` +
    PATHS.map((d) => `<path d="${d}"/>`).join('') +
    `</g></svg>`
  );
}

mkdirSync(SALIDA, { recursive: true });

const archivos = [
  // [archivo, lado, ancho de la marca, radio de esquina]
  ['icon-192.png', 192, 0.74, 0.22],
  ['icon-512.png', 512, 0.74, 0.22],
  // iOS recorta el ícono él mismo: va cuadrado y opaco, sin esquinas propias
  ['apple-touch-icon.png', 180, 0.72, 0],
  // maskable: Android puede recortarlo hasta un círculo, así que la marca
  // tiene que entrar entera en el 80% central. Una marca de 2.16:1 dentro
  // de ese círculo no puede pasar de ~0.72 del lado; 0.60 deja aire.
  ['icon-maskable-512.png', 512, 0.6, 0],
];

for (const [nombre, tam, ancho, radio] of archivos) {
  const png = await sharp(icono(tam, ancho, radio), { density: 384 }).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(SALIDA, nombre), png);
  console.log('✓', nombre, tam + 'px');
}

// El favicon: el mismo cuadrado pero en vector, para que la pestaña no
// dependa de un bitmap. En 16px la marca entera es una mancha, así que
// va más grande dentro del cuadro que en los íconos de la app.
writeFileSync(join(SALIDA, 'icon.svg'), `${iconoSvg(64, 0.82, 0.22)}\n`);
console.log('✓', 'icon.svg', 'vector');
