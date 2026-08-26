'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { crearCliente } from '@/lib/supabase/client';
import type { Pie, Posicion } from '@/lib/tipos';
import { useConfirmar } from '@/components/Confirmar';
import Notificaciones from '@/components/Notificaciones';
import Avatar from '@/components/Avatar';
import { conApodo } from '@/lib/nombre';

const POSICIONES: { valor: Posicion; etiqueta: string }[] = [
  { valor: 'arquero', etiqueta: 'Arquero' },
  { valor: 'defensor', etiqueta: 'Defensor' },
  { valor: 'mediocampista', etiqueta: 'Mediocampista' },
  { valor: 'delantero', etiqueta: 'Delantero' },
];
const PIES: { valor: Pie; etiqueta: string }[] = [
  { valor: 'derecho', etiqueta: 'Derecho' },
  { valor: 'zurdo', etiqueta: 'Zurdo' },
  { valor: 'ambos', etiqueta: 'Ambos' },
];

export default function Perfil() {
  const router = useRouter();
  const { confirmar, ui: confirmarUI } = useConfirmar();
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');

  const [username, setUsername] = useState('');
  const [usernameGuardado, setUsernameGuardado] = useState<string | null>(null);
  const [apodo, setApodo] = useState('');
  const [club, setClub] = useState('');
  const [posicion, setPosicion] = useState<Posicion | ''>('');
  const [pie, setPie] = useState<Pie | ''>('');
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [msgPerfil, setMsgPerfil] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = crearCliente();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? '');
      setNombre(
        (user.user_metadata?.full_name as string) ||
          (user.user_metadata?.name as string) ||
          user.email?.split('@')[0] ||
          '',
      );

      const { data: perfil } = await supabase
        .from('perfiles')
        .select('username, apodo, club, posicion, pie, avatar_url')
        .eq('id', user.id)
        .single();
      if (perfil) {
        setUsername(perfil.username || '');
        setUsernameGuardado(perfil.username || null);
        setApodo(perfil.apodo || '');
        setClub(perfil.club || '');
        setPosicion((perfil.posicion as Posicion) || '');
        setPie((perfil.pie as Pie) || '');
        setAvatarUrl(perfil.avatar_url || null);
      }
    })();
  }, []);

  async function guardarUsername(e: React.FormEvent) {
    e.preventDefault();
    setMsgPerfil(null);
    setGuardandoPerfil(true);
    const supabase = crearCliente();
    const { data, error } = await supabase.rpc('fijar_username', { p_username: username });
    setGuardandoPerfil(false);
    const r = data as { ok: boolean; error?: string } | null;
    if (error || !r?.ok) {
      setMsgPerfil({ tipo: 'err', texto: r?.error || error?.message || 'No se pudo guardar.' });
      return;
    }
    setUsernameGuardado(username.trim().toLowerCase());
    setMsgPerfil({ tipo: 'ok', texto: 'Listo.' });
  }

  async function guardarJugador(campo: 'posicion' | 'pie', valor: string) {
    if (campo === 'posicion') setPosicion(valor as Posicion);
    else setPie(valor as Pie);
    const supabase = crearCliente();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('perfiles')
      .update({ [campo]: valor || null })
      .eq('id', user.id);
  }

  /** Se guarda al salir del campo, no en cada tecla. */
  async function guardarTexto(campo: 'apodo' | 'club', valor: string) {
    const supabase = crearCliente();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('perfiles')
      .update({ [campo]: valor.trim() || null })
      .eq('id', user.id);
  }

  async function salir() {
    if (!(await confirmar('¿Cerrar sesión?', { boton: 'Cerrar sesión', danger: true }))) return;
    const supabase = crearCliente();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <div style={{ paddingTop: 18 }}>
      <div className="fichaPerfil">
        <Avatar nombre={nombre || '?'} url={avatarUrl} tam={58} className="fichaPerfil-av" />
        <b>{nombre ? conApodo(nombre, apodo) : '—'}</b>
        {usernameGuardado && <small>@{usernameGuardado}</small>}
        {club && <small>Hincha de {club}</small>}
        <small>{email}</small>
      </div>

      <div className="sec">Tu username</div>
      <div className="card" style={{ padding: 14 }}>
        <form onSubmit={guardarUsername}>
          <div className="row2">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="tu_username"
              maxLength={20}
            />
            <button
              className="btn pri"
              type="submit"
              style={{ flex: 'none', padding: '12px 20px' }}
              disabled={guardandoPerfil || !username.trim()}
            >
              {guardandoPerfil ? '…' : 'Guardar'}
            </button>
          </div>
        </form>
        {msgPerfil && <div className={`msg ${msgPerfil.tipo}`} style={{ marginTop: 10 }}>{msgPerfil.texto}</div>}
        <div className="nota">
          Con esto te van a poder buscar y sumar de amigo. 3 a 20 caracteres: letras, números y
          guión bajo.
        </div>
      </div>

      <div className="sec">Tu apodo</div>
      <div className="card" style={{ padding: 14 }}>
        <input
          value={apodo}
          onChange={(e) => setApodo(e.target.value)}
          onBlur={() => guardarTexto('apodo', apodo)}
          placeholder="Cómo te dicen"
          maxLength={24}
        />
        <div className="nota">
          Se muestra entre tu nombre y tu apellido, así:{' '}
          <b>{conApodo(nombre || 'Nombre Apellido', apodo || 'Apodo')}</b>.
        </div>
      </div>

      <div className="sec">Tu juego</div>
      <div className="card" style={{ padding: 14 }}>
        <div className="campo">
          <label>Posición</label>
          <select value={posicion} onChange={(e) => guardarJugador('posicion', e.target.value)}>
            <option value="">Sin definir</option>
            {POSICIONES.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label>Pierna hábil</label>
          <select value={pie} onChange={(e) => guardarJugador('pie', e.target.value)}>
            <option value="">Sin definir</option>
            {PIES.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div className="campo" style={{ marginBottom: 0 }}>
          <label>Hincha de</label>
          <input
            value={club}
            onChange={(e) => setClub(e.target.value)}
            onBlur={() => guardarTexto('club', club)}
            placeholder="Tu club"
            maxLength={40}
          />
        </div>
      </div>

      <div className="sec">Instalar en el celular</div>
      <div className="card">
        <div className="vacio" style={{ textAlign: 'left' }}>
          Abrí esta página en el celular y usá <b>Agregar a pantalla de inicio</b>. Se abre como app,
          sin barra del navegador. En iPhone hay que hacerlo sí o sí para que después funcionen las
          notificaciones.
        </div>
      </div>

      <Notificaciones />

      <div className="sec">Sesión</div>
      <button className="btn danger wide" onClick={salir}>
        Cerrar sesión
      </button>

      {confirmarUI}
    </div>
  );
}
