'use client';

import { Copita } from '@/components/Copa';
import BotonGoogle from '@/components/BotonGoogle';

const HAY_CONFIG =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function Login() {
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
          /* Sin `destino`: el botón usa el ?next= que dejó el proxy. */
          <BotonGoogle />
        )}
      </div>
    </div>
  );
}
