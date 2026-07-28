/**
 * Genera los PNG del icono sin dependencias externas.
 * Dibuja los pixeles a mano y arma el PNG con zlib (que ya trae Node).
 *
 *   node scripts/generar-iconos.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'public', 'icons');

const LIMA = [195, 245, 60];
const TINTA = [22, 32, 10];

/* ---------- CRC32 ---------- */
const TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLA[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

function armarPNG(ancho, alto, rgba) {
  const firma = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // cada scanline lleva adelante un byte de filtro (0 = ninguno)
  const crudo = Buffer.alloc(alto * (1 + ancho * 4));
  for (let y = 0; y < alto; y++) {
    const destino = y * (1 + ancho * 4);
    crudo[destino] = 0;
    rgba.copy(crudo, destino + 1, y * ancho * 4, (y + 1) * ancho * 4);
  }

  return Buffer.concat([
    firma,
    trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(crudo, { level: 9 })),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- dibujo ---------- */

const mezclar = (fondo, frente, a) => [
  Math.round(fondo[0] * (1 - a) + frente[0] * a),
  Math.round(fondo[1] * (1 - a) + frente[1] * a),
  Math.round(fondo[2] * (1 - a) + frente[2] * a),
];

/** Distancia con signo a un rectangulo redondeado (negativa adentro). */
function distRoundRect(x, y, cx, cy, mx, my, r) {
  const dx = Math.abs(x - cx) - (mx - r);
  const dy = Math.abs(y - cy) - (my - r);
  const fuera = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return fuera + Math.min(Math.max(dx, dy), 0) - r;
}

/** Antialias simple: 0 afuera, 1 adentro, con medio pixel de transicion. */
const cobertura = (d) => Math.min(1, Math.max(0, 0.5 - d));

function dibujar(tam, maskable) {
  const rgba = Buffer.alloc(tam * tam * 4);
  const c = tam / 2;

  // en maskable el contenido vive en el 80% central (safe zone)
  const escala = maskable ? 0.62 : 0.76;
  const radioBola = (tam / 2) * escala;
  const grosor = tam * 0.05;
  const radioPent = radioBola * 0.42;

  // pentagono central
  const puntas = [];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    puntas.push([c + radioPent * Math.cos(a), c + radioPent * Math.sin(a)]);
  }
  const dentroPent = (x, y) => {
    let signo = 0;
    for (let i = 0; i < 5; i++) {
      const [x1, y1] = puntas[i];
      const [x2, y2] = puntas[(i + 1) % 5];
      const cruz = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
      const s = Math.sign(cruz);
      if (signo === 0) signo = s;
      else if (s !== 0 && s !== signo) return false;
    }
    return true;
  };

  // costuras: 5 rayas del pentagono al borde
  const costuras = puntas.map(([px, py]) => {
    const ang = Math.atan2(py - c, px - c);
    return [px, py, c + radioBola * Math.cos(ang), c + radioBola * Math.sin(ang)];
  });

  const distSegmento = (x, y, x1, y1, x2, y2) => {
    const vx = x2 - x1,
      vy = y2 - y1;
    const largo2 = vx * vx + vy * vy;
    const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * vx + (y - y1) * vy) / largo2));
    return Math.hypot(x - (x1 + t * vx), y - (y1 + t * vy));
  };

  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const i = (y * tam + x) * 4;

      // fondo: cuadrado redondeado lima (maskable = cuadrado completo)
      const dFondo = maskable
        ? -1
        : distRoundRect(px, py, c, c, tam / 2, tam / 2, tam * 0.22);
      const aFondo = cobertura(dFondo);
      if (aFondo <= 0) {
        rgba[i + 3] = 0;
        continue;
      }

      let color = LIMA;

      // aro de la pelota
      const dCentro = Math.hypot(px - c, py - c);
      const aAro = cobertura(Math.abs(dCentro - radioBola) - grosor / 2);
      if (aAro > 0) color = mezclar(color, TINTA, aAro);

      // pentagono
      if (dentroPent(px, py)) color = TINTA;

      // costuras
      for (const [x1, y1, x2, y2] of costuras) {
        const a = cobertura(distSegmento(px, py, x1, y1, x2, y2) - grosor * 0.42);
        if (a > 0) color = mezclar(color, TINTA, a);
      }

      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = Math.round(aFondo * 255);
    }
  }

  return armarPNG(tam, tam, rgba);
}

mkdirSync(SALIDA, { recursive: true });

const archivos = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['apple-touch-icon.png', 180, true],
];

for (const [nombre, tam, maskable] of archivos) {
  writeFileSync(join(SALIDA, nombre), dibujar(tam, maskable));
  console.log('✓', nombre, tam + 'px');
}
