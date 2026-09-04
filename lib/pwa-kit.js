/* ============================================================
   PWA KIT v1.0 — franjas estándar para todas las apps
   ------------------------------------------------------------
   Un solo archivo, sin dependencias, sin build. Se copia tal cual
   a cada proyecto y se inicializa con initPwaKit({...}).

   Resuelve tres cosas que toda PWA necesita y siempre se rehacen:

     1) INSTALAR  — si la app corre en el navegador (no instalada),
                    ofrece agregarla a la pantalla de inicio.
                    Android/Escritorio: botón real (beforeinstallprompt).
                    iPhone/iPad: instrucciones (Compartir → Agregar a inicio),
                    porque Safari no expone ningún API de instalación.

     2) NOTIFICACIONES — si la app YA está instalada y usa push, ofrece
                    activarlas. Solo con permiso 'default' (si el usuario
                    dijo que no, el navegador no vuelve a preguntar nunca)
                    y siempre disparado por un gesto del usuario.
                    OJO iOS: el push web solo funciona con la app instalada;
                    por eso la franja se muestra únicamente en modo standalone.

     3) VERSIÓN NUEVA — cuando el service worker se actualiza, avisa que hay
                    una versión nueva y ofrece recargar.

   ------------------------------------------------------------
   USO MÍNIMO (app sin notificaciones):

     <script src="/pwa-kit.js"></script>
     <script>
       initPwaKit({ nombre: 'CFO Agéntico', sw: '/sw.js' });
     </script>

   USO CON NOTIFICACIONES (el kit NO sabe de Firebase a propósito:
   pide el permiso y te avisa; el token lo sacás vos):

     initPwaKit({
       nombre: 'Flyers PEC',
       sw: '/service-worker.js',
       notificaciones: {
         motivo: 'para avisarte cuando salga un flyer nuevo',
         puedeOfrecerse: () => !!auth.currentUser,   // opcional
         alActivar: async () => { await guardarTokenFCM(); }
       }
     });

   ------------------------------------------------------------
   OPCIONES

     nombre           string  — cómo se llama la app en los textos. Obligatorio.
     sw               string  — ruta del service worker a registrar.
                                Poné false si la app ya lo registra por su cuenta.
     instalar         bool    — franja de instalación (default true).
     actualizaciones  true | 'auto' | false
                                true  = franja "hay una versión nueva" (default)
                                'auto'= recarga sola, sin preguntar
     notificaciones   false | { motivo, alActivar, puedeOfrecerse } (default false)
     idioma           no se usa todavía; todo está en español.

   ------------------------------------------------------------
   API que queda expuesta (window.pwaKit):

     pwaKit.instalada()            → true si corre como app instalada
     pwaKit.pedirNotificaciones()  → dispara el pedido de permiso a mano
                                     (para un botón en Configuración)
     pwaKit.buscarActualizacion()  → fuerza un chequeo de versión
   ============================================================ */

(function (global) {
  'use strict';

  // En Next.js este archivo tambien se evalua en el servidor (SSR), donde no
  // hay window ni document. Salir en silencio: el componente cliente lo vuelve
  // a cargar en el navegador.
  if (!global || !global.document) return;
  if (global.initPwaKit) return; // ya cargado

  var PREFIJO_LS = 'pwakit.';
  var DIAS_REAPARECER_INSTALAR = 7;
  var DIAS_REAPARECER_NOTIF = 14;
  var MIN_ENTRE_CHEQUEOS = 60 * 1000;       // no chequear versión más de 1 vez por minuto
  var INTERVALO_CHEQUEO = 30 * 60 * 1000;   // una PWA abierta puede pasar días sin navegar

  var cfg = null;
  var promptDiferido = null;
  var avisarPrompt = null;   // lo setea iniciarInstalar() cuando ya sabe qué mostrar

  // El listener va acá, al evaluarse el archivo — NO adentro de initPwaKit().
  // Chrome dispara 'beforeinstallprompt' apenas baja el manifest y se cumplen
  // los criterios, y eso puede pasar antes de que la app llame al kit (sobre
  // todo si el init cuelga de window.onload). Si el evento pasa sin listener,
  // no vuelve: la franja de instalar no aparecería nunca.
  global.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();        // sin esto Chrome muestra su propio mini-infobar
    promptDiferido = e;
    if (avisarPrompt) avisarPrompt();
  });

  global.addEventListener('appinstalled', function () {
    promptDiferido = null;
    ocultarPorDias('instalar', 3650);
    var f = document.querySelector('.pwakit-franja');
    if (f) cerrar(f);
  });

  /* ---------- detección ---------- */

  function esIOS() {
    var ua = navigator.userAgent || '';
    // iPadOS 13+ se hace pasar por Mac: se lo delata el touch.
    return /iPad|iPhone|iPod/.test(ua) ||
           (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }

  function instalada() {
    try {
      return window.matchMedia('(display-mode: standalone)').matches ||
             window.matchMedia('(display-mode: minimal-ui)').matches ||
             window.navigator.standalone === true;
    } catch (e) {
      return window.navigator.standalone === true;
    }
  }

  // Instagram, Facebook, WhatsApp, TikTok y demás abren los links en un webview
  // propio donde NO se puede instalar nada. Ofrecerlo ahí es ruido puro.
  function enWebviewDeApp() {
    var ua = navigator.userAgent || '';
    return /FBAN|FBAV|Instagram|Line\/|TikTok|WhatsApp|GSA\//.test(ua);
  }

  // Chrome/Firefox/Edge en iOS tampoco pueden instalar: solo Safari.
  function navegadorSinInstalacionEnIOS() {
    var ua = navigator.userAgent || '';
    return esIOS() && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  }

  /* ---------- "no ahora" con vencimiento ---------- */

  function ocultarPorDias(clave, dias) {
    try {
      localStorage.setItem(PREFIJO_LS + clave, String(Date.now() + dias * 86400000));
    } catch (e) { /* modo privado */ }
  }

  function estaOculto(clave) {
    try {
      var hasta = parseInt(localStorage.getItem(PREFIJO_LS + clave) || '0', 10);
      return hasta > Date.now();
    } catch (e) {
      return false;
    }
  }

  /* ---------- estilos ---------- */

  var CSS = [
    '.pwakit-franja{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;',
    'display:flex;flex-wrap:wrap;align-items:center;gap:10px;',
    'padding:12px 14px calc(12px + env(safe-area-inset-bottom,0px));',
    'background:#12161d;color:#f2f5f9;font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
    'box-shadow:0 -6px 24px rgba(0,0,0,.28);',
    'transform:translateY(110%);transition:transform .28s ease}',
    '.pwakit-franja.pwakit-visible{transform:translateY(0)}',
    '.pwakit-txt{flex:1 1 220px;min-width:0}',
    '.pwakit-txt b{color:#fff}',
    '.pwakit-franja button{flex:0 0 auto;font:inherit;font-weight:600;cursor:pointer;',
    'border-radius:9px;padding:9px 14px;border:0}',
    '.pwakit-si{background:#3b82f6;color:#fff}',
    '.pwakit-si:hover{background:#2f6fd8}',
    '.pwakit-no{background:transparent;color:#9aa6b8;border:1px solid #2c3444 !important}',
    '.pwakit-no:hover{color:#f2f5f9}',
    '.pwakit-x{background:transparent;color:#9aa6b8;font-size:20px;line-height:1;padding:4px 8px}',
    '@media (prefers-reduced-motion:reduce){.pwakit-franja{transition:none}}'
  ].join('');

  function inyectarEstilos() {
    if (document.getElementById('pwakit-css')) return;
    var s = document.createElement('style');
    s.id = 'pwakit-css';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------- franja genérica ---------- */

  // Una sola franja a la vez: si ya hay una, la nueva espera al próximo arranque.
  function hayFranja() {
    return !!document.querySelector('.pwakit-franja');
  }

  function cerrar(el) {
    el.classList.remove('pwakit-visible');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
  }

  /**
   * opciones = {
   *   html:      contenido del texto (se permite <b>),
   *   aceptar:   { texto, onClick } | null,
   *   rechazar:  { texto, onClick } | null,   // botón "Ahora no" / "Ya la tengo"
   *   alCerrar:  fn                            // la X
   * }
   */
  function mostrarFranja(opciones) {
    inyectarEstilos();
    var div = document.createElement('div');
    div.className = 'pwakit-franja';
    div.setAttribute('role', 'region');
    div.setAttribute('aria-live', 'polite');

    var txt = document.createElement('span');
    txt.className = 'pwakit-txt';
    txt.innerHTML = opciones.html;
    div.appendChild(txt);

    if (opciones.aceptar) {
      var ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'pwakit-si';
      ok.textContent = opciones.aceptar.texto;
      ok.addEventListener('click', function () { opciones.aceptar.onClick(div); });
      div.appendChild(ok);
    }

    if (opciones.rechazar) {
      var no = document.createElement('button');
      no.type = 'button';
      no.className = 'pwakit-no';
      no.textContent = opciones.rechazar.texto;
      no.addEventListener('click', function () { opciones.rechazar.onClick(div); });
      div.appendChild(no);
    }

    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'pwakit-x';
    x.setAttribute('aria-label', 'Cerrar');
    x.textContent = '×';
    x.addEventListener('click', function () {
      if (opciones.alCerrar) opciones.alCerrar();
      cerrar(div);
    });
    div.appendChild(x);

    document.body.appendChild(div);
    // doble rAF: sin esto el navegador puede pintar ya en la posición final
    // y la franja aparece de golpe en vez de deslizarse.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { div.classList.add('pwakit-visible'); });
    });
    return div;
  }

  /* ---------- 1) instalar ---------- */

  function iniciarInstalar() {
    if (cfg.instalar === false) return;
    if (instalada() || enWebviewDeApp() || navegadorSinInstalacionEnIOS()) return;
    if (estaOculto('instalar')) return;

    if (esIOS()) {
      // Safari no avisa nada: mostramos las instrucciones después de un respiro,
      // para no recibir al usuario con un cartel apenas entra.
      setTimeout(function () {
        if (hayFranja() || instalada()) return;
        mostrarFranja({
          html: '<b>Agregá ' + cfg.nombre + ' a tu pantalla de inicio.</b> ' +
                'Tocá Compartir (⬆︎) abajo y elegí “Agregar a inicio”.',
          rechazar: {
            texto: 'Ya la tengo',
            onClick: function (el) { ocultarPorDias('instalar', 3650); cerrar(el); }
          },
          alCerrar: function () { ocultarPorDias('instalar', DIAS_REAPARECER_INSTALAR); }
        });
      }, 4000);
      return;
    }

    // Android / Escritorio: el navegador decide cuándo la app es instalable.
    // El evento ya lo atrapó el listener de arriba; acá solo reaccionamos.
    function ofrecerInstalar() {
      setTimeout(function () {
        if (hayFranja() || instalada() || !promptDiferido) return;
        mostrarFranja({
          html: '<b>Instalá ' + cfg.nombre + '</b> para abrirla como una app, ' +
                'sin la barra del navegador.',
          aceptar: {
            texto: 'Instalar',
            onClick: function (el) {
              cerrar(el);
              var p = promptDiferido;
              promptDiferido = null;
              if (!p) return;
              p.prompt();
              p.userChoice.then(function (r) {
                // Si la rechazó, que no vuelva a molestar por una semana.
                if (r && r.outcome !== 'accepted') {
                  ocultarPorDias('instalar', DIAS_REAPARECER_INSTALAR);
                }
              }).catch(function () {});
            }
          },
          rechazar: {
            texto: 'Ahora no',
            onClick: function (el) { ocultarPorDias('instalar', DIAS_REAPARECER_INSTALAR); cerrar(el); }
          },
          alCerrar: function () { ocultarPorDias('instalar', DIAS_REAPARECER_INSTALAR); }
        });
      }, 3000);
    }

    avisarPrompt = ofrecerInstalar;
    if (promptDiferido) ofrecerInstalar();   // el evento llegó antes que el init
  }

  /* ---------- 2) notificaciones ---------- */

  function notificacionesPosibles() {
    return !!cfg.notificaciones &&
           'Notification' in window &&
           'serviceWorker' in navigator;
  }

  // Devuelve 'granted' | 'denied' | 'default' | 'no-soportado'
  function pedirNotificaciones() {
    if (!notificacionesPosibles()) return Promise.resolve('no-soportado');
    return Notification.requestPermission().then(function (permiso) {
      if (permiso === 'granted' && cfg.notificaciones.alActivar) {
        return Promise.resolve(cfg.notificaciones.alActivar()).then(function () { return permiso; });
      }
      return permiso;
    });
  }

  function iniciarNotificaciones() {
    if (!notificacionesPosibles()) return;
    // Solo tiene sentido pedirlo con la app ya instalada: en iOS el push web
    // directamente no existe fuera del modo standalone, y en Android pedirlo
    // en una pestaña suelta se rechaza casi siempre.
    if (!instalada()) return;
    // 'denied' es terminal: el navegador no vuelve a preguntar. No mostrar botón.
    if (Notification.permission !== 'default') return;
    if (estaOculto('notif')) return;

    var puede = cfg.notificaciones.puedeOfrecerse;

    function intentar() {
      if (hayFranja() || Notification.permission !== 'default') return;
      if (typeof puede === 'function' && !puede()) return;
      mostrarFranja({
        html: '<b>Activá las notificaciones</b>' +
              (cfg.notificaciones.motivo ? ' ' + cfg.notificaciones.motivo : '') + '.',
        aceptar: {
          texto: 'Activar',
          onClick: function (el) {
            cerrar(el);
            pedirNotificaciones().then(function (p) {
              if (p !== 'granted') ocultarPorDias('notif', DIAS_REAPARECER_NOTIF);
            }).catch(function () {});
          }
        },
        rechazar: {
          texto: 'Ahora no',
          onClick: function (el) { ocultarPorDias('notif', DIAS_REAPARECER_NOTIF); cerrar(el); }
        },
        alCerrar: function () { ocultarPorDias('notif', DIAS_REAPARECER_NOTIF); }
      });
    }

    // Espera a que la franja de instalación ya no aplique y a que la app haya
    // arrancado (si hay login de por medio, puedeOfrecerse() lo frena).
    setTimeout(intentar, 6000);
    // Reintento único más tarde: cubre el caso "todavía no había login".
    setTimeout(intentar, 30000);
  }

  /* ---------- 3) versión nueva ---------- */

  function franjaActualizacion() {
    if (hayFranja()) {
      // La de instalar/notificaciones puede esperar: la versión nueva manda.
      cerrar(document.querySelector('.pwakit-franja'));
      setTimeout(franjaActualizacion, 320);
      return;
    }
    mostrarFranja({
      html: '<b>Hay una versión nueva de ' + cfg.nombre + '.</b> Recargá para usarla.',
      aceptar: {
        texto: 'Recargar',
        onClick: function () { window.location.reload(); }
      },
      alCerrar: function () { /* vuelve a aparecer en la próxima actualización */ }
    });
  }

  var chequeoManual = function () {};

  function iniciarActualizaciones() {
    if (cfg.actualizaciones === false) return;
    if (!('serviceWorker' in navigator)) return;

    // Los SW de estas apps hacen skipWaiting() + clients.claim(), así que una
    // versión nueva toma el control sola y dispara 'controllerchange'. Ese es
    // el disparador; el waiting-worker no llega a existir.
    //
    // Trampa: en la PRIMERA visita no hay controlador y el claim inicial también
    // dispara el evento. Sin este guard, todo usuario nuevo vería "hay una
    // versión nueva" apenas entra.
    var teniaControlador = !!navigator.serviceWorker.controller;
    var yaAvisado = false;

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!teniaControlador || yaAvisado) return;
      yaAvisado = true;
      if (cfg.actualizaciones === 'auto') window.location.reload();
      else franjaActualizacion();
    });

    var registro = cfg.sw
      ? navigator.serviceWorker.register(cfg.sw)
      : navigator.serviceWorker.ready;

    registro.then(function (reg) {
      if (!reg) return;

      // Una app instalada puede quedar abierta días sin navegar nunca: si no
      // pedimos el update a mano, no se entera de ningún deploy.
      var ultimoChequeo = Date.now();
      function buscar() {
        if (document.visibilityState !== 'visible') return;
        if (Date.now() - ultimoChequeo < MIN_ENTRE_CHEQUEOS) return;
        ultimoChequeo = Date.now();
        if (reg.update) reg.update().catch(function () { /* sin internet: después */ });
      }
      chequeoManual = function () { ultimoChequeo = 0; buscar(); };

      document.addEventListener('visibilitychange', buscar);
      window.addEventListener('focus', buscar);
      setInterval(buscar, INTERVALO_CHEQUEO);
    }).catch(function (err) {
      console.warn('[pwa-kit] no se pudo registrar el service worker:', err);
    });
  }

  /* ---------- arranque ---------- */

  function initPwaKit(opciones) {
    if (cfg) return global.pwaKit; // idempotente: no duplicar listeners
    cfg = opciones || {};
    if (!cfg.nombre) cfg.nombre = 'la app';
    if (cfg.actualizaciones === undefined) cfg.actualizaciones = true;
    if (cfg.instalar === undefined) cfg.instalar = true;
    if (cfg.notificaciones === undefined) cfg.notificaciones = false;

    function arrancar() {
      iniciarActualizaciones();
      iniciarInstalar();
      iniciarNotificaciones();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', arrancar);
    } else {
      arrancar();
    }

    global.pwaKit = {
      instalada: instalada,
      pedirNotificaciones: pedirNotificaciones,
      buscarActualizacion: function () { chequeoManual(); }
    };
    return global.pwaKit;
  }

  global.initPwaKit = initPwaKit;
})(typeof window !== 'undefined' ? window : undefined);
