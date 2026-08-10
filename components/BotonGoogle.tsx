'use client';

import { useState } from 'react';
import { crearCliente } from '@/lib/supabase/client';

/**
 * El logo oficial de Google, a cuatro colores. Se usa tal cual: la guía
 * de marca de Google no permite recolorearlo con la paleta de la app.
 */
function LogoGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.348 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

/**
 * A dónde volver después de entrar. Solo se aceptan rutas internas: un
 * `next` absoluto convertiría el login en un redirector abierto hacia
 * cualquier dominio.
 */
export function destinoSeguro(crudo: string | null | undefined): string {
  if (!crudo || !crudo.startsWith('/') || crudo.startsWith('//')) return '/camino';
  return crudo;
}

/**
 * Entrar con Google y volver a `destino`. Si no se le pasa uno, lo toma
 * del `?next=` de la URL — que es lo que deja puesto el proxy cuando te
 * manda al login por querer entrar a una pantalla con sesión.
 *
 * Vive en un componente propio porque se usa en dos lugares: la pantalla
 * de login y la invitación, donde conviene que el que abre el link pueda
 * crearse la cuenta ahí mismo sin rebotar por otra pantalla primero.
 */
export default function BotonGoogle({
  destino,
  texto = 'Continuar con Google',
}: {
  destino?: string;
  texto?: string;
}) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function entrar() {
    setError(null);
    setCargando(true);
    try {
      // Se resuelve al hacer clic, no al renderizar: así esta pantalla no
      // necesita leer la URL durante el render ni sincronizar estado.
      const volverA =
        destino ?? destinoSeguro(new URLSearchParams(window.location.search).get('next'));
      const supabase = crearCliente();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(volverA)}`,
        },
      });
      if (error) throw error;
      // redirige solo
    } catch (e) {
      setCargando(false);
      setError(e instanceof Error ? e.message : 'No se pudo entrar con Google.');
    }
  }

  return (
    <>
      <button className="btnGoogle" onClick={entrar} disabled={cargando}>
        <LogoGoogle />
        {cargando ? 'Abriendo Google…' : texto}
      </button>
      {error && <div className="msg err">{error}</div>}
    </>
  );
}
