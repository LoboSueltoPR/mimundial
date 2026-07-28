'use client';

import { useState } from 'react';
import { crearCliente } from '@/lib/supabase/client';

const HAY_CONFIG =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function Login() {
  const [email, setEmail] = useState('');
  const [cargando, setCargando] = useState<'google' | 'mail' | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  async function conGoogle() {
    setMsg(null);
    setCargando('google');
    try {
      const supabase = crearCliente();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      // redirige solo
    } catch (e) {
      setCargando(null);
      setMsg({ tipo: 'err', texto: e instanceof Error ? e.message : 'No se pudo entrar con Google.' });
    }
  }

  async function conMail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setMsg(null);
    setCargando('mail');
    try {
      const supabase = crearCliente();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setMsg({
        tipo: 'ok',
        texto: `Te mandé un link a ${email.trim()}. Abrilo desde este mismo dispositivo y entrás derecho.`,
      });
    } catch (e) {
      setMsg({ tipo: 'err', texto: e instanceof Error ? e.message : 'No se pudo mandar el mail.' });
    } finally {
      setCargando(null);
    }
  }

  return (
    <div className="login">
      <div className="logo">⚽</div>
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
            <button className="btn pri wide" onClick={conGoogle} disabled={cargando !== null}>
              {cargando === 'google' ? 'Abriendo Google…' : 'Entrar con Google'}
            </button>

            <div className="sep">o con tu mail</div>

            <form onSubmit={conMail}>
              <div className="campo">
                <input
                  type="email"
                  placeholder="tu@mail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              <button className="btn wide" type="submit" disabled={cargando !== null}>
                {cargando === 'mail' ? 'Mandando…' : 'Mandame un link'}
              </button>
            </form>

            {msg && <div className={`msg ${msg.tipo}`}>{msg.texto}</div>}

            <p className="nota" style={{ textAlign: 'left' }}>
              No hay contraseña que recordar: te llega un link al mail y con eso entrás.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
