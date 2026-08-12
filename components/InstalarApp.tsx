'use client';

import { useEffect, useState } from 'react';
import { Copita } from './Copa';

/**
 * La franja de "agregar a la pantalla de inicio" en vez de tener que ir a
 * Compartir a mano. En Android/Chrome atrapamos beforeinstallprompt y
 * disparamos el diálogo nativo con un toque. iOS no tiene ese evento —
 * Apple no lo expone — así que ahí solo podemos mostrar el atajo de dedo
 * (Compartir → Agregar a inicio); no hay forma de saltarlo del todo.
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
    <div className="instalarApp" role="region" aria-label="Agregar MiMundial a la pantalla de inicio">
      <span className="instalarApp-ico">
        <Copita tam={17} />
      </span>
      <span className="instalarApp-txt">
        {modo === 'ios' ? (
          <>
            <b>Agregá MiMundial a tu pantalla de inicio.</b> Tocá <b>Compartir</b> (
            <span className="instalarApp-share">⬆</span>) y elegí <b>&quot;Agregar a inicio&quot;</b>.
          </>
        ) : (
          <>
            <b>Agregá MiMundial</b> a tu pantalla de inicio para abrirla como una app.
          </>
        )}
      </span>
      {modo === 'android' && (
        <button className="btn pri sm" onClick={instalar}>
          Agregar
        </button>
      )}
      {modo === 'ios' && (
        <button className="instalarApp-yaLaTengo" onClick={yaLaTengo}>
          Ya la tengo
        </button>
      )}
      <button className="instalarApp-cerrar" onClick={ocultar} aria-label="Cerrar">
        ×
      </button>
    </div>
  );
}
