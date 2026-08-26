import webpush from 'web-push';

/**
 * El despachador de notificaciones.
 *
 * Lo llama la BASE, no el navegador: el trigger de 0016 arma los avisos
 * con destinatarios y todo, y los manda acá por pg_net con un secreto
 * compartido en la cabecera.
 *
 * Esta ruta no toca Supabase. A propósito: si tuviera que leer las
 * suscripciones necesitaría la service_role key, y el `.env.example` del
 * proyecto dice "NUNCA pongas acá la service_role key". Recibe todo
 * masticado, firma con VAPID y despacha. Nada más.
 *
 * Las suscripciones muertas (410/404) se podrían limpiar, pero eso
 * necesitaría escribir en la base — o sea la key que no queremos. Se
 * cuentan y se reportan en la respuesta, que queda en el log de pg_net.
 */

/* Node y no Edge: web-push firma con crypto de Node. */
export const runtime = 'nodejs';
/* Un POST nunca se cachea, pero que quede dicho. */
export const dynamic = 'force-dynamic';

type Aviso = {
  endpoint: string;
  p256dh: string;
  auth: string;
  titulo: string;
  cuerpo: string;
  url?: string;
};

/**
 * Comparación en tiempo constante. Un `===` sobre un secreto se puede
 * medir: corta en el primer byte distinto.
 */
function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

export async function POST(request: Request) {
  const secreto = process.env.PUSH_SECRETO;
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLICA;
  const privada = process.env.VAPID_PRIVADA;
  const contacto = process.env.VAPID_CONTACTO || 'mailto:hola@mimundial.app';

  if (!secreto || !publica || !privada) {
    // Sin configurar no es un error del que llama: es que falta el setup.
    return Response.json({ ok: false, error: 'push sin configurar' }, { status: 503 });
  }

  const enviado = request.headers.get('x-push-secreto');
  if (!enviado || !igual(enviado, secreto)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  let avisos: Aviso[];
  try {
    const cuerpo = (await request.json()) as { avisos?: Aviso[] };
    avisos = Array.isArray(cuerpo?.avisos) ? cuerpo.avisos : [];
  } catch {
    return Response.json({ ok: false, error: 'json inválido' }, { status: 400 });
  }

  if (avisos.length === 0) return Response.json({ ok: true, mandados: 0 });

  webpush.setVapidDetails(contacto, publica, privada);

  const resultados = await Promise.allSettled(
    avisos.map((a) =>
      webpush.sendNotification(
        { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
        JSON.stringify({ titulo: a.titulo, cuerpo: a.cuerpo, url: a.url || '/camino' }),
        { TTL: 60 * 60 * 6 },
      ),
    ),
  );

  let mandados = 0;
  let muertas = 0;
  let fallados = 0;
  resultados.forEach((r) => {
    if (r.status === 'fulfilled') {
      mandados++;
      return;
    }
    const code = (r.reason as { statusCode?: number })?.statusCode;
    // 404/410 = el navegador revocó la suscripción. No es un error nuestro.
    if (code === 404 || code === 410) muertas++;
    else fallados++;
  });

  return Response.json({ ok: true, mandados, muertas, fallados });
}
