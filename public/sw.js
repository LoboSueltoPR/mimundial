/* MiMundial — service worker
 *
 * Hoy hace poco a proposito: cachea el shell para que la app abra aunque no
 * haya senal, y deja el terreno listo para notificaciones push (el handler
 * 'push' ya esta, falta el backend que las mande).
 */

const CACHE = 'mimundial-v1';
const SHELL = ['/', '/partidos', '/manifest.json', '/icons/icon.svg'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evento) => {
  const req = evento.request;

  // Nunca cachear datos ni auth: siempre a la red.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/auth')) return;

  // Red primero, cache como respaldo.
  evento.respondWith(
    fetch(req)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('/partidos'))),
  );
});

/* ---- notificaciones (para cuando exista el backend que las dispare) ---- */
self.addEventListener('push', (evento) => {
  let datos = { titulo: 'MiMundial', cuerpo: 'Novedades del picadito' };
  try {
    if (evento.data) datos = { ...datos, ...evento.data.json() };
  } catch {}

  evento.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: datos.url || '/partidos' },
    }),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = evento.notification.data?.url || '/partidos';
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      const abierta = lista.find((c) => c.url.includes(destino));
      if (abierta) return abierta.focus();
      return self.clients.openWindow(destino);
    }),
  );
});
