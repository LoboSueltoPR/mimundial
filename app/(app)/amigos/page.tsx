'use client';

import { useCallback, useEffect, useState } from 'react';
import { crearCliente } from '@/lib/supabase/client';
import type { Amigo, Sugerencia } from '@/lib/tipos';
import { color, iniciales } from '@/lib/calculos';

export default function Amigos() {
  const [amigos, setAmigos] = useState<Amigo[] | null>(null);
  const [sugeridos, setSugeridos] = useState<Sugerencia[]>([]);
  const [email, setEmail] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    const supabase = crearCliente();
    const [a, s] = await Promise.all([
      supabase.rpc('mis_amigos'),
      supabase.rpc('sugerencias_amigos'),
    ]);
    setAmigos((a.data ?? []) as Amigo[]);
    setSugeridos((s.data ?? []) as Sugerencia[]);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function agregarPorMail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setMsg(null);
    setBuscando(true);
    const supabase = crearCliente();
    const { data, error } = await supabase.rpc('buscar_usuario', { p_email: email.trim() });
    if (error) {
      setBuscando(false);
      setMsg({ tipo: 'err', texto: error.message });
      return;
    }
    const encontrado = data as Amigo | null;
    if (!encontrado) {
      setBuscando(false);
      setMsg({ tipo: 'err', texto: 'No hay nadie con ese mail en MiMundial todavía.' });
      return;
    }
    await sumar(encontrado.id, encontrado.nombre);
    setBuscando(false);
    setEmail('');
  }

  async function sumar(id: string, nombre: string) {
    const supabase = crearCliente();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('amigos').insert({ user_id: user.id, amigo_id: id });
    if (error) {
      setMsg({
        tipo: 'err',
        texto: error.code === '23505' ? `${nombre} ya está en tu lista.` : error.message,
      });
      return;
    }
    setMsg({ tipo: 'ok', texto: `${nombre} se sumó a tus amigos.` });
    cargar();
  }

  async function sacar(a: Amigo) {
    if (!confirm(`¿Sacar a ${a.nombre} de tus amigos?`)) return;
    const supabase = crearCliente();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('amigos').delete().eq('user_id', user.id).eq('amigo_id', a.id);
    cargar();
  }

  if (!amigos) return <div className="cargando">Cargando…</div>;

  return (
    <div style={{ paddingTop: 18 }}>
      <div className="sec">Sumar un amigo</div>
      <form onSubmit={agregarPorMail}>
        <div className="row2">
          <input
            type="email"
            placeholder="su mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            className="btn pri"
            type="submit"
            style={{ flex: 'none', padding: '12px 20px' }}
            disabled={buscando}
          >
            {buscando ? '…' : 'Sumar'}
          </button>
        </div>
      </form>
      {msg && <div className={`msg ${msg.tipo}`}>{msg.texto}</div>}
      <div className="nota">
        Tiene que haber entrado alguna vez a MiMundial con ese mail. Para los que no tienen cuenta
        está el link de invitación del partido.
      </div>

      <div className="sec">Tus amigos · {amigos.length}</div>
      <div className="card">
        {amigos.length === 0 ? (
          <div className="vacio">
            Todavía no tenés amigos cargados.
            <br />
            Sumalos por mail y después los invitás a tus partidos de una.
          </div>
        ) : (
          amigos.map((a) => (
            <div className="saldo" key={a.id}>
              <span className="av" style={{ background: color(a.nombre) }}>
                {iniciales(a.nombre)}
              </span>
              <span className="nom">
                <b>{a.nombre}</b>
              </span>
              <button className="quitar" onClick={() => sacar(a)} title="Sacar">
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {sugeridos.length > 0 && (
        <>
          <div className="sec">Amigos de tus amigos</div>
          <div className="card">
            {sugeridos.map((s) => (
              <div className="saldo" key={s.id}>
                <span className="av" style={{ background: color(s.nombre) }}>
                  {iniciales(s.nombre)}
                </span>
                <span className="nom">
                  <b>{s.nombre}</b>
                  <small>por {s.via}</small>
                </span>
                <button className="btn sm" onClick={() => sumar(s.id, s.nombre)}>
                  Sumar
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
