/**
 * La placa: la convocatoria dibujada como imagen para mandar al grupo
 * o subir a una historia.
 *
 * Es un canvas y no un screenshot del DOM porque tiene que salir
 * siempre igual, en 1080×1920, mire desde donde mire el que la genera.
 * 1080×1920 es el tamaño de una historia de Instagram; WhatsApp la
 * manda igual sin recortar.
 *
 * Ojo con esto: Instagram NO tiene forma de recibir un posteo desde una
 * web. Lo único que existe es pasarle un archivo al menú de compartir
 * del sistema, y de ahí el usuario elige Instagram a mano. Por eso todo
 * este archivo genera un PNG y nada más.
 */

const A = 1080;
const ALTO = 1920;

/* La paleta de la planilla, calcada de globals.css. Va a mano porque el
   canvas no lee variables CSS y porque la placa tiene que verse igual
   aunque algún día la app cambie de tema. */
const PAPEL = '#fcfcfa';
const MESA = '#e6e8e2';
const TINTA = '#151a24';
const TENUE = '#5a6472';
const BIROME = '#26418f';
const ORO = '#96690c';
const TIZA = 'rgba(21,26,36,.10)';
const REGLA = '#d2d5cd';

export type DatosPlaca = {
  anfitrion: string | null;
  lugar: string | null;
  fecha: string;
  hora: string | null;
  cabezas: number;
  cupo: number;
  faltan: number;
  link: string;
};

/**
 * Las familias reales que generó next/font. Vienen de las variables CSS
 * del <html> con nombres tipo `__Anton_e8ce9c`, así que hay que leerlas
 * en runtime: no se pueden escribir a mano.
 */
function familia(variable: string, respaldo: string): string {
  if (typeof window === 'undefined') return respaldo;
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v ? `${v}, ${respaldo}` : respaldo;
}

/** El primer nombre de la lista, que es lo único que acepta fonts.load(). */
function primeraFamilia(lista: string): string {
  return lista.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
}

/**
 * `document.fonts.ready` no alcanza: con `display: 'swap'` la fuente
 * puede no estar cargada si todavía nada en pantalla la usó, y el
 * canvas dibuja con el respaldo sin avisar. Hay que pedirla explícita.
 */
async function asegurarFuentes(caras: string[]): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all(
    caras.map((c) => document.fonts.load(c).catch(() => undefined)),
  );
  await document.fonts.ready;
}

/** Achica el cuerpo hasta que la línea entre en el ancho disponible. */
function cuerpoQueEntra(
  ctx: CanvasRenderingContext2D,
  texto: string,
  familia: string,
  peso: string,
  maximo: number,
  ancho: number,
  minimo = 28,
): number {
  let t = maximo;
  while (t > minimo) {
    ctx.font = `${peso} ${t}px ${familia}`;
    if (ctx.measureText(texto).width <= ancho) break;
    t -= 4;
  }
  return t;
}

/** Parte el texto en renglones que entren, sin cortar palabras. */
function renglones(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const palabras = texto.split(/\s+/);
  const out: string[] = [];
  let linea = '';
  for (const p of palabras) {
    const prueba = linea ? `${linea} ${p}` : p;
    if (ctx.measureText(prueba).width > ancho && linea) {
      out.push(linea);
      linea = p;
    } else {
      linea = prueba;
    }
  }
  if (linea) out.push(linea);
  return out;
}

/** Mayúsculas con tracking abierto, que es el rótulo de la planilla. */
function rotulo(
  ctx: CanvasRenderingContext2D,
  texto: string,
  x: number,
  y: number,
  espacio: number,
) {
  const letras = [...texto.toUpperCase()];
  const total =
    letras.reduce((a, l) => a + ctx.measureText(l).width, 0) + espacio * (letras.length - 1);
  let cx = x - total / 2;
  letras.forEach((l) => {
    ctx.fillText(l, cx, y);
    cx += ctx.measureText(l).width + espacio;
  });
}

/** La copa, calcada de los paths de components/Copa.tsx. */
function copa(ctx: CanvasRenderingContext2D, x: number, y: number, tam: number, color: string) {
  const p = new Path2D(
    'M28 18 H72 L68 52 C68 66 32 66 32 52 Z M46 64 H54 V80 H46 Z ' +
      'M38 80 H62 L66 92 H34 Z M28 92 H72 V104 H28 Z',
  );
  ctx.save();
  ctx.translate(x - tam / 2, y);
  ctx.scale(tam / 100, tam / 100);
  ctx.fillStyle = color;
  ctx.fill(p);
  ctx.restore();
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "viernes 29 de agosto" — la placa tiene lugar para el día entero. */
function fechaPlaca(iso: string): string {
  const [a, m, d] = (iso || '').split('-').map(Number);
  if (!a) return '';
  // Mediodía UTC para que el día no se corra por zona horaria.
  const dia = DIAS[new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay()];
  return `${dia} ${d} de ${MESES[m - 1]}`;
}

export async function generarPlaca(d: DatosPlaca): Promise<Blob> {
  const display = familia('--fuente-anton', '"Arial Narrow", sans-serif');
  const mono = familia('--fuente-mono', 'ui-monospace, monospace');

  await asegurarFuentes([
    `400 200px ${primeraFamilia(display)}`,
    `500 40px ${primeraFamilia(mono)}`,
  ]);

  const c = document.createElement('canvas');
  c.width = A;
  c.height = ALTO;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('No se pudo dibujar la placa.');

  ctx.textBaseline = 'alphabetic';

  /* ---- la mesa y la hoja ---- */
  ctx.fillStyle = MESA;
  ctx.fillRect(0, 0, A, ALTO);

  const M = 56;
  ctx.fillStyle = PAPEL;
  ctx.fillRect(M, M, A - M * 2, ALTO - M * 2);
  ctx.strokeStyle = TINTA;
  ctx.lineWidth = 4;
  ctx.strokeRect(M + 2, M + 2, A - M * 2 - 4, ALTO - M * 2 - 4);

  /* ---- las líneas de cal: media cancha vista desde arriba ---- */
  ctx.save();
  ctx.beginPath();
  ctx.rect(M, M, A - M * 2, ALTO - M * 2);
  ctx.clip();
  ctx.strokeStyle = TIZA;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(A / 2, 1180, 260, 0, Math.PI * 2);
  ctx.moveTo(M, 1180);
  ctx.lineTo(A - M, 1180);
  ctx.stroke();
  ctx.restore();

  const centro = A / 2;
  ctx.textAlign = 'center';

  /* ---- la marca ---- */
  copa(ctx, centro, 150, 108, ORO);
  ctx.fillStyle = TENUE;
  ctx.font = `500 30px ${mono}`;
  rotulo(ctx, 'MiMundial', centro, 330, 7);

  ctx.strokeStyle = REGLA;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centro - 130, 366);
  ctx.lineTo(centro + 130, 366);
  ctx.stroke();

  /* ---- quién invita ---- */
  ctx.fillStyle = BIROME;
  ctx.font = `500 32px ${mono}`;
  rotulo(ctx, `${d.anfitrion || 'Alguien'} te invita a jugar`, centro, 452, 4);

  /* ---- el lugar, que es el titular ---- */
  // Mayúsculas con tracking, igual que `.inv-lugar` en la app: Anton es
  // una condensada de cartel de estadio y en caja baja pierde el golpe.
  const lugar = (d.lugar || 'Picadito').toUpperCase();
  const ancho = A - 200;
  ctx.fillStyle = TINTA;
  let cuerpo = cuerpoQueEntra(ctx, lugar, display, '400', 132, ancho, 60);
  ctx.font = `400 ${cuerpo}px ${display}`;
  const lineas = renglones(ctx, lugar, ancho).slice(0, 2);
  if (lineas.length > 1) {
    cuerpo = Math.min(cuerpo, 104);
    ctx.font = `400 ${cuerpo}px ${display}`;
  }
  lineas.forEach((l, i) => ctx.fillText(l, centro, 590 + i * (cuerpo + 10)));

  const yFecha = 590 + lineas.length * (cuerpo + 10) + 20;

  /* ---- cuándo ---- */
  ctx.fillStyle = TENUE;
  ctx.font = `500 40px ${mono}`;
  ctx.fillText(fechaPlaca(d.fecha) + (d.hora ? ` · ${d.hora}` : ''), centro, yFecha);

  /* ---- el marcador de cupo, que es lo que se mira ---- */
  ctx.font = `400 300px ${display}`;
  const nCab = String(d.cabezas);
  const nCupo = String(d.cupo);
  ctx.font = `400 130px ${display}`;
  const anchoSep = ctx.measureText('/').width;
  ctx.font = `400 300px ${display}`;
  const anchoCab = ctx.measureText(nCab).width;
  const anchoCupo = ctx.measureText(nCupo).width;
  const total = anchoCab + anchoSep + anchoCupo + 48;
  const x0 = centro - total / 2;
  const yNum = 1270;

  ctx.textAlign = 'left';
  ctx.fillStyle = TINTA;
  ctx.fillText(nCab, x0, yNum);
  ctx.fillStyle = REGLA;
  ctx.font = `400 130px ${display}`;
  ctx.fillText('/', x0 + anchoCab + 24, yNum - 20);
  ctx.fillStyle = TENUE;
  ctx.font = `400 300px ${display}`;
  ctx.fillText(nCupo, x0 + anchoCab + anchoSep + 48, yNum);
  ctx.textAlign = 'center';

  /* ---- el sello: falta gente o ya está ---- */
  const lleno = d.faltan === 0;
  const sello = lleno ? 'COMPLETO' : d.faltan === 1 ? 'FALTA 1' : `FALTAN ${d.faltan}`;
  ctx.font = `500 44px ${mono}`;
  const anchoSello = [...sello].reduce((a, l) => a + ctx.measureText(l).width, 0) + 9 * (sello.length - 1);
  const padX = 40;
  const ySello = 1430;
  ctx.strokeStyle = lleno ? TENUE : BIROME;
  ctx.lineWidth = 4;
  ctx.strokeRect(centro - anchoSello / 2 - padX, ySello - 62, anchoSello + padX * 2, 96);
  ctx.fillStyle = lleno ? TENUE : BIROME;
  rotulo(ctx, sello, centro, ySello, 9);

  /* ---- dónde anotarse ---- */
  ctx.fillStyle = TENUE;
  ctx.font = `500 30px ${mono}`;
  rotulo(ctx, lleno ? 'El partido ya está armado' : 'Anotate acá', centro, 1660, 6);

  const link = d.link.replace(/^https?:\/\//, '');
  ctx.fillStyle = BIROME;
  const cuerpoLink = cuerpoQueEntra(ctx, link, mono, '600', 40, A - 200, 22);
  ctx.font = `600 ${cuerpoLink}px ${mono}`;
  ctx.fillText(link, centro, 1730);

  ctx.strokeStyle = BIROME;
  ctx.lineWidth = 3;
  const anchoLink = ctx.measureText(link).width;
  ctx.beginPath();
  ctx.moveTo(centro - anchoLink / 2, 1748);
  ctx.lineTo(centro + anchoLink / 2, 1748);
  ctx.stroke();

  return new Promise<Blob>((resolver, rechazar) =>
    c.toBlob((b) => (b ? resolver(b) : rechazar(new Error('No se pudo generar la imagen.'))), 'image/png'),
  );
}

/* ============================================================
   La placa de equipos

   La otra mitad: cuando ya está completo y sorteado, lo que hay
   que mandar al grupo no es "faltan 3" sino quién juega con quién.
   Misma hoja, misma copa, mismo pie — cambia el cuerpo.
   ============================================================ */

export type DatosPlacaEquipos = {
  lugar: string | null;
  fecha: string;
  hora: string | null;
  claros: string[];
  oscuros: string[];
  link: string;
};

export async function generarPlacaEquipos(d: DatosPlacaEquipos): Promise<Blob> {
  const display = familia('--fuente-anton', '"Arial Narrow", sans-serif');
  const mono = familia('--fuente-mono', 'ui-monospace, monospace');

  await asegurarFuentes([
    `400 200px ${primeraFamilia(display)}`,
    `500 40px ${primeraFamilia(mono)}`,
  ]);

  const c = document.createElement('canvas');
  c.width = A;
  c.height = ALTO;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('No se pudo dibujar la placa.');
  ctx.textBaseline = 'alphabetic';

  /* ---- la mesa y la hoja ---- */
  ctx.fillStyle = MESA;
  ctx.fillRect(0, 0, A, ALTO);
  const M = 56;
  ctx.fillStyle = PAPEL;
  ctx.fillRect(M, M, A - M * 2, ALTO - M * 2);
  ctx.strokeStyle = TINTA;
  ctx.lineWidth = 4;
  ctx.strokeRect(M + 2, M + 2, A - M * 2 - 4, ALTO - M * 2 - 4);

  const centro = A / 2;
  ctx.textAlign = 'center';

  /* ---- la marca ---- */
  copa(ctx, centro, 130, 92, ORO);
  ctx.fillStyle = TENUE;
  ctx.font = `500 28px ${mono}`;
  rotulo(ctx, 'MiMundial', centro, 292, 7);

  /* ---- dónde y cuándo ---- */
  const lugar = (d.lugar || 'Picadito').toUpperCase();
  ctx.fillStyle = TINTA;
  const cuerpoLugar = cuerpoQueEntra(ctx, lugar, display, '400', 86, A - 220, 48);
  ctx.font = `400 ${cuerpoLugar}px ${display}`;
  ctx.fillText(lugar, centro, 380);

  ctx.fillStyle = TENUE;
  ctx.font = `500 34px ${mono}`;
  ctx.fillText(fechaPlaca(d.fecha) + (d.hora ? ` · ${d.hora}` : ''), centro, 432);

  /* ---- las dos columnas ----
     Se dibujan a la par, no una debajo de la otra: el que mira quiere
     comparar los equipos, y en columnas eso se hace de un vistazo. */
  const ancho = (A - M * 2 - 60) / 2;
  const xIzq = M + 20;
  const xDer = M + 20 + ancho + 20;
  const yCab = 520;

  /* El bloque de nombres se estira y se centra en el espacio que queda
     entre las cabeceras y el pie. Con paso fijo, un 6 contra 6 —que es
     el caso normal— dejaba 400px muertos abajo, y un 11 contra 11 no
     entraba. Se calcula: el interlineado crece hasta 132 si sobra lugar
     y se achica hasta 70 si falta. */
  const filas = Math.max(d.claros.length, d.oscuros.length, 1);
  const desde = yCab + 70;
  const hasta = 1640;
  const espacio = hasta - desde;
  const paso = Math.max(70, Math.min(132, Math.floor(espacio / filas)));
  const cuerpoNombre = paso < 84 ? 40 : paso < 100 ? 46 : 52;
  // el primer renglón, ya centrado; el +paso*0.62 apoya la línea de base
  const yPrimero = desde + (espacio - filas * paso) / 2 + paso * 0.62;

  // `ctx` se pasa explicito: adentro de una funcion anidada TypeScript
  // pierde el narrowing del null-check de arriba.
  function columna(
    ctx: CanvasRenderingContext2D,
    x: number,
    titulo: string,
    oscuro: boolean,
    nombres: string[],
  ) {
    // cabecera con la pechera
    ctx.fillStyle = oscuro ? '#2b3648' : PAPEL;
    ctx.strokeStyle = oscuro ? '#2b3648' : TENUE;
    ctx.lineWidth = 3;
    ctx.fillRect(x, yCab - 44, ancho, 66);
    ctx.strokeRect(x, yCab - 44, ancho, 66);
    ctx.fillStyle = oscuro ? PAPEL : TINTA;
    ctx.font = `500 30px ${mono}`;
    ctx.textAlign = 'center';
    rotulo(ctx, titulo, x + ancho / 2, yCab, 6);

    // los nombres, con su renglón
    nombres.forEach((n, i) => {
      const y = yPrimero + i * paso;
      ctx.strokeStyle = REGLA;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + 22);
      ctx.lineTo(x + ancho, y + 22);
      ctx.stroke();

      ctx.fillStyle = TINTA;
      const t = cuerpoQueEntra(ctx, n, display, '400', cuerpoNombre, ancho - 24, 26);
      ctx.font = `400 ${t}px ${display}`;
      ctx.fillText(n, x + ancho / 2, y);
    });
  }

  columna(ctx, xIzq, 'Claros', false, d.claros);
  columna(ctx, xDer, 'Oscuros', true, d.oscuros);

  /* ---- el pie ---- */
  ctx.textAlign = 'center';
  ctx.fillStyle = TENUE;
  ctx.font = `500 28px ${mono}`;
  rotulo(ctx, 'El partido, en', centro, 1700, 6);

  const link = d.link.replace(/^https?:\/\//, '');
  ctx.fillStyle = BIROME;
  const cuerpoLink = cuerpoQueEntra(ctx, link, mono, '600', 38, A - 200, 22);
  ctx.font = `600 ${cuerpoLink}px ${mono}`;
  ctx.fillText(link, centro, 1764);

  return new Promise<Blob>((resolver, rechazar) =>
    c.toBlob((b) => (b ? resolver(b) : rechazar(new Error('No se pudo generar la imagen.'))), 'image/png'),
  );
}

/**
 * Manda la placa por donde se pueda.
 *
 * `canShare` hay que preguntarlo con el File de verdad: Safari devuelve
 * false para algunas combinaciones de tipo y tamaño, así que preguntar
 * con un archivo inventado miente. Si no se puede compartir el archivo,
 * se baja — que en compu es lo que uno quiere igual.
 */
export async function compartirPlaca(blob: Blob, texto: string): Promise<'compartida' | 'bajada'> {
  const archivo = new File([blob], 'mimundial.png', { type: 'image/png' });

  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], text: texto });
      return 'compartida';
    } catch (e) {
      // El usuario canceló el menú: no es un error que valga mostrar.
      if ((e as Error)?.name === 'AbortError') return 'compartida';
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mimundial.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'bajada';
}
