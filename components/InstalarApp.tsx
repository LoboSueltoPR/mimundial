'use client';

import { useEffect, useState } from 'react';
import { Copita } from './Copa';

/**
 * El aviso de "agregar a la pantalla de inicio", como una notificación que
 * sube desde abajo. En Android/Chrome atrapamos beforeinstallprompt y
 * disparamos el diálogo nativo con un toque. iOS no tiene ese evento —
 * Apple no lo expone — así que ahí solo podemos mostrar el atajo de dedo
 * (Compartir → Agregar a inicio); no hay forma de saltarlo del todo.
 *
 * Que aparezca abajo no es estética: en iOS el botón Compartir está abajo
 * en Safari, y este aviso es la instrucción de tocarlo.
 *
 * Además es el paso previo a las notificaciones: en iPhone, una web solo
 * puede pedir permiso de push si está agregada a la pantalla de inicio.
 * Si esto no se acepta, allá no hay notificaciones posibles.
 */
type EventoInstalar = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const CLAVE_OCULTO = 'mimundial.instalar.oculto';
const CLAVE_INSTALADA = 'mimundial.instalada';
const DIAS_REAPARECER = 14;

/**
 * display-mode:standalone solo da true cuando la pestaña actual es la app
 * instalada — si en iOS instalaste y después volvés a abrir el link desde
 * Safari (no desde el ícono), esto da false igual y no hay ninguna API que
 * lo detecte. Por eso además guardamos una bandera propia: al aceptar en
 * Android, o al tocar "Ya la tengo" en iOS, queda marcado para siempre.
 */
function yaInstalada() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    localStorage.getItem(CLAVE_INSTALADA) === '1'
  );
}

function esIOS() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function ocultadoRecientemente() {
  const v = localStorage.getItem(CLAVE_OCULTO);
  if (!v) return false;
  return (Date.now() - Number(v)) / 86_400_000 < DIAS_REAPARECER;
}

export default function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [modo, setModo] = useState<'android' | 'ios' | null>(null);

  useEffect(() => {
    if (yaInstalada() || ocultadoRecientemente()) return;

    function onPrompt(e: Event) {
      e.preventDefault();
      setEvento(e as EventoInstalar);
      setModo('android');
    }
    window.addEventListener('beforeinstallprompt', onPrompt);

    // En iOS no hay evento que avisar: si parece iOS y no está instalada,
    // mostramos el atajo después de un respiro, no ni bien carga.
    let t: ReturnType<typeof setTimeout> | undefined;
    if (esIOS()) {
      t = setTimeout(() => setModo((m) => m ?? 'ios'), 1800);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      if (t) clearTimeout(t);
    };
  }, []);

  function ocultar() {
    setModo(null);
    localStorage.setItem(CLAVE_OCULTO, String(Date.now()));
  }

  /** Confirmación a mano en iOS: no hay forma de detectarlo, así que le
   *  creemos al usuario y no volvemos a mostrarla nunca más. */
  function yaLaTengo() {
    setModo(null);
    localStorage.setItem(CLAVE_INSTALADA, '1');
  }

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    if (outcome === 'accepted') localStorage.setItem(CLAVE_INSTALADA, '1');
    setEvento(null);
    setModo(null);
  }

  if (!modo) return null;

  return (
    <div
      className="avisoInstalar"
      role="region"
      aria-label="Agregar MiMundial a la pantalla de inicio"
    >
      <span className="ai-ico">
        <Copita tam={18} />
      </span>
      <span className="ai-txt">
        <b>Tené MiMundial a mano</b>
        {modo === 'ios' ? (
          <small>
            Tocá <b>Compartir</b> (<span className="ai-share">⬆</span>) acá abajo y elegí{' '}
            <b>&quot;Agregar a inicio&quot;</b>. Es lo que además habilita las notificaciones.
          </small>
        ) : (
          <small>
            Agregala a tu pantalla de inicio y se abre como una app, sin la barra del navegador.
          </small>
        )}
      </span>
      <button className="ai-cerrar" onClick={ocultar} aria-label="Cerrar">
        ×
      </button>
      <span className="ai-acciones">
        {modo === 'android' ? (
          <>
            <button className="ai-fantasma" onClick={ocultar}>
              Ahora no
            </button>
            <button className="btn pri" onClick={instalar}>
              Agregar
            </button>
          </>
        ) : (
          <button className="ai-fantasma" onClick={yaLaTengo}>
            Ya la tengo
          </button>
        )}
      </span>
    </div>
  );
}
