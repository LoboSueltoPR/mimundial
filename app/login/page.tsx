'use client';

import { useState } from 'react';
import { crearCliente } from '@/lib/supabase/client';
import { Copita } from '@/components/Copa';

const HAY_CONFIG =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** El logo oficial de Google, a 4 colores: se usa tal cual, sin recolorear. */
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

export default function Login() {
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  async function conGoogle() {
    setMsg(null);
    setCargando(true);
    try {
      const supabase = crearCliente();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      // redirige solo
    } catch (e) {
      setCargando(false);
      setMsg({ tipo: 'err', texto: e instanceof Error ? e.message : 'No se pudo entrar con Google.' });
    }
  }

  return (
    <div className="login">
      <div className="logo">
        <Copita tam={30} />
      </div>
      <h1>MiMundial</h1>
      <p className="sub">Tu registro de picaditos: quién juega, quién debe, y cómo salió.</p>

      <div className="caja">
        {!HAY_CONFIG ? (
          <div className="msg info">
            <b>Falta configurar Supabase.</b>
            <br />
            Creá un archivo <code>.env.local</code> con <code>NEXT_PUBLIC_SUPABASE_URL</code> y{' '}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, y reiniciá el servidor. Está todo explicado en
            el README.
          </div>
        ) : (
          <>
            <button className="btnGoogle" onClick={conGoogle} disabled={cargando}>
              <LogoGoogle />
              {cargando ? 'Abriendo Google…' : 'Continuar con Google'}
            </button>

            {msg && <div className={`msg ${msg.tipo}`}>{msg.texto}</div>}
          </>
        )}
      </div>
    </div>
  );
}
