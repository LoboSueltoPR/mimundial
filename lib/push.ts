'use client';

import { crearCliente } from '@/lib/supabase/client';

/**
 * Prender y apagar las notificaciones desde el navegador.
 *
 * Lo que hay que saber antes de tocar esto:
 *
 * · En iPhone NO existe push si la app no está agregada a la pantalla de
 *   inicio. No es una limitación nuestra: Safari no expone la API hasta
 *   que la PWA corre en modo standalone. Por eso `sePuede()` distingue
 *   "este navegador no puede" de "todavía no la instalaste".
 * · El permiso hay que pedirlo con un gesto del usuario. Pedirlo al
 *   cargar la página hace que el navegador lo niegue para siempre.
 * · Una vez denegado no se puede volver a pedir por código: el usuario
 *   tiene que ir a los ajustes del sitio. De ahí el estado 'negado'.
 */

export type EstadoPush =
  | 'no-soportado'   // el navegador no tiene push
  | 'falta-instalar' // iOS sin agregar a la pantalla de inicio
  | 'negado'         // el usuario dijo que no; solo se revierte a mano
  | 'apagado'
  | 'prendido';

function esIOS(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function esStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export async function estadoPush(): Promise<EstadoPush> {
  if (typeof window === 'undefined') return 'no-soportado';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    // En iOS la API aparece recién en modo standalone, así que la ausencia
    // ahí significa "instalala", no "tu teléfono no puede".
    return esIOS() && !esStandalone() ? 'falta-instalar' : 'no-soportado';
  }
  if (Notification.permission === 'denied') return 'negado';

  const reg = await navigator.serviceWorker.getRegistration();
  const sus = await reg?.pushManager.getSubscription();
  return sus ? 'prendido' : 'apagado';
}

/** base64url → Uint8Array, que es lo único que acepta applicationServerKey. */
function claveAplicacion(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const limpio = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const crudo = atob(limpio);
  const salida = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i++) salida[i] = crudo.charCodeAt(i);
  return salida;
}

/** Las claves que viajan a la base, sacadas de la suscripción del navegador. */
function claves(sus: PushSubscription): { p256dh: string; auth: string } | null {
  const json = sus.toJSON();
  const k = json.keys;
  if (!k?.p256dh || !k?.auth) return null;
  return { p256dh: k.p256dh, auth: k.auth };
}

/**
 * Pide permiso, se suscribe y lo guarda. Tiene que llamarse desde un
 * click: si no, el navegador niega el permiso sin preguntar.
 *
 * `claim` es para el que no tiene cuenta — es cómo lo reconoce la base
 * (ver 0002). Sin cuenta y sin claim no hay a quién avisarle.
 */
export async function prenderPush(claim?: string | null): Promise<{ ok: boolean; error?: string }> {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLICA;
  if (!publica) return { ok: false, error: 'Faltan las claves de notificación.' };

  const estado = await estadoPush();
  if (estado === 'falta-instalar')
    return { ok: false, error: 'En iPhone primero agregá la app a tu pantalla de inicio.' };
  if (estado === 'no-soportado')
    return { ok: false, error: 'Este navegador no maneja notificaciones.' };

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted')
    return { ok: false, error: 'No diste permiso. Se cambia en los ajustes del sitio.' };

  const reg = await navigator.serviceWorker.ready;
  const sus =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: claveAplicacion(publica) as BufferSource,
    }));

  const k = claves(sus);
  if (!k) return { ok: false, error: 'El navegador no devolvió las claves.' };

  const { data, error } = await crearCliente().rpc('suscribirme_push', {
    p_endpoint: sus.endpoint,
    p_p256dh: k.p256dh,
    p_auth: k.auth,
    p_claim: claim ?? null,
  });
  const r = data as { ok: boolean; error?: string } | null;
  if (error || !r?.ok) {
    // Si no se pudo guardar, no dejamos una suscripción huérfana viva.
    await sus.unsubscribe().catch(() => {});
    return { ok: false, error: r?.error || error?.message || 'No se pudo guardar.' };
  }
  return { ok: true };
}

export async function apagarPush(): Promise<{ ok: boolean }> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sus = await reg?.pushManager.getSubscription();
  if (!sus) return { ok: true };
  await crearCliente().rpc('desuscribirme_push', { p_endpoint: sus.endpoint });
  await sus.unsubscribe().catch(() => {});
  return { ok: true };
}
