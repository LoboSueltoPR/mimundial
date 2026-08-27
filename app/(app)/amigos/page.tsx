'use client';

import { useCallback, useEffect, useState } from 'react';
import { crearCliente } from '@/lib/supabase/client';
import type { Amigo, Partido, RespuestaRPC, Solicitud, Sugerencia } from '@/lib/tipos';
import { calcularSocios } from '@/lib/calculos';
import { useConfirmar } from '@/components/Confirmar';
import Avatar from '@/components/Avatar';
import PerfilModal from '@/components/PerfilModal';
import { conApodo } from '@/lib/nombre';

/** Cómo te anotás vos en la lista: `calcularSocios` no tiene forma de
 *  deducirlo, los anotados son texto libre y no cuentas. */
const CLAVE_APODO = 'mimundial.apodoCancha';
/** Menos de esto y el % no dice nada: un solo partido ganado juntos ya da
 *  "100%", que es ruido y no una racha. */
const MIN_JUNTOS = 2;
const CUANTOS = 3;

export default function Amigos() {
  const { confirmar, ui: confirmarUI } = useConfirmar();
  const [amigos, setAmigos] = useState<Amigo[] | null>(null);
  const [sugeridos, setSugeridos] = useState<Sugerencia[]>([]);
  const [recibidas, setRecibidas] = useState<Solicitud[]>([]);
  const [enviadas, setEnviadas] = useState<Solicitud[]>([]);
  const [email, setEmail] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [enviando, setEnviando] = useState<string | null>(null);
  const [respondiendo, setRespondiendo] = useState<string | null>(null);
  const [perfilAbierto, setPerfilAbierto] = useState<{ id: string; nombre: string } | null>(null);
  /* Se guarda junto con la búsqueda que lo produjo. Así "hay resultados"
     y "estoy buscando" salen de comparar, no de limpiar estado a mano
     cada vez que cambia el texto. */
  const [hallazgo, setHallazgo] = useState<{ q: string; lista: Amigo[] }>({ q: '', lista: [] });

  /* Con quién ganás más. Sale de los equipos sorteados de TUS partidos, así
     que no necesita RPC: la tabla con su RLS ya devuelve lo que hace falta. */
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [apodo, setApodo] = useState('');
  const [editandoApodo, setEditandoApodo] = useState(false);
  const [apodoInput, setApodoInput] = useState('');

  const cargar = useCallback(async () => {
    const supabase = crearCliente();
    const [a, s, r, e, ps] = await Promise.all([
      supabase.rpc('mis_amigos'),
      supabase.rpc('sugerencias_amigos'),
      supabase.rpc('mis_solicitudes_recibidas'),
      supabase.rpc('mis_solicitudes_enviadas'),
      supabase.from('partidos').select('*'),
    ]);
    setAmigos((a.data ?? []) as Amigo[]);
    setSugeridos((s.data ?? []) as Sugerencia[]);
    setRecibidas((r.data ?? []) as Solicitud[]);
    setEnviadas((e.data ?? []) as Solicitud[]);
    setPartidos((ps.data ?? []) as Partido[]);
  }, []);

  useEffect(() => {
    setApodo(localStorage.getItem(CLAVE_APODO) || '');
    cargar();
  }, [cargar]);

  function guardarApodo(ev: React.FormEvent) {
    ev.preventDefault();
    const limpio = apodoInput.trim();
    if (!limpio) return;
    localStorage.setItem(CLAVE_APODO, limpio);
    setApodo(limpio);
    setEditandoApodo(false);
  }

  const q = busqueda.trim().toLowerCase();
  const hayQueBuscar = q.length >= 3;
  const resultados = hallazgo.q === q ? hallazgo.lista : [];
  const buscandoUsername = hayQueBuscar && hallazgo.q !== q;
  const idsEnviadas = new Set(enviadas.map((s) => s.id_usuario));

  // buscar por username con un pequeño debounce, desde 3 caracteres
  useEffect(() => {
    if (q.length < 3) return;
    const id = setTimeout(async () => {
      const supabase = crearCliente();
      const { data } = await supabase.rpc('buscar_por_username', { p_query: q });
      setHallazgo({ q, lista: (data ?? []) as Amigo[] });
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

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
    await enviarSolicitud(encontrado.id, encontrado.nombre);
    setBuscando(false);
    setEmail('');
  }

  async function enviarSolicitud(id: string, nombre: string) {
    if (enviando) return;
    setEnviando(id);
    const supabase = crearCliente();
    const { data, error } = await supabase.rpc('enviar_solicitud', { p_para: id });
    setEnviando(null);
    const r = data as (RespuestaRPC & { estado?: 'pendiente' | 'aceptada' }) | null;
    if (error || !r?.ok) {
      setMsg({ tipo: 'err', texto: r?.error || error?.message || 'No se pudo enviar.' });
      return;
    }
    setMsg({
      tipo: 'ok',
      texto:
        r.estado === 'aceptada'
          ? `${nombre} ya te había mandado solicitud — ahora son amigos.`
          : `Le mandaste una solicitud a ${nombre}.`,
    });
    setHallazgo((h) => ({ ...h, lista: h.lista.filter((x) => x.id !== id) }));
    cargar();
  }

  async function responder(s: Solicitud, aceptar: boolean) {
    if (respondiendo) return;
    setRespondiendo(s.id);
    const supabase = crearCliente();
    await supabase.rpc('responder_solicitud', { p_id: s.id, p_aceptar: aceptar });
    setRespondiendo(null);
    setMsg(aceptar ? { tipo: 'ok', texto: `Ahora sos amigo de ${s.nombre}.` } : null);
    cargar();
  }

  async function cancelar(s: Solicitud) {
    if (respondiendo) return;
    setRespondiendo(s.id);
    const supabase = crearCliente();
    await supabase.rpc('cancelar_solicitud', { p_id: s.id });
    setRespondiendo(null);
    cargar();
  }

  async function sacar(a: Amigo) {
    if (!(await confirmar(`¿Sacar a ${a.nombre} de tus amigos?`, { danger: true, boton: 'Sacar' })))
      return;
    const supabase = crearCliente();
    await supabase.rpc('sacar_amigo', { p_amigo_id: a.id });
    cargar();
  }

  if (!amigos) return <div className="cargando">Cargando…</div>;

  /* Ordenado por porcentaje, NO por cuántos partidos jugaron juntos:
     `calcularSocios` devuelve por `juntos` porque así lo quiere la lista
     larga, y el top de acá es otra pregunta. El mínimo de partidos evita
     que un 100% de dos veces le gane a un 90% de veinte, y los `juntos`
     desempatan cuando el porcentaje es el mismo. */
  const socios = calcularSocios(partidos, apodo);
  const mejores = socios
    .filter((x) => x.juntos >= MIN_JUNTOS)
    .sort((a, b) => b.efectividad - a.efectividad || b.juntos - a.juntos)
    .slice(0, CUANTOS);
  const haySorteos = partidos.some((p) => p.equipos && p.resultado);

  return (
    <div style={{ paddingTop: 18 }}>
      {recibidas.length > 0 && (
        <>
          <div className="sec">Te mandaron solicitud · {recibidas.length}</div>
          <div className="card">
            {recibidas.map((s) => (
              <div className="saldo" key={s.id}>
                <Avatar nombre={s.nombre} url={s.avatar_url} />
                <span className="nom">
                  <b>{conApodo(s.nombre, s.apodo)}</b>
                  {s.username && <small>@{s.username}</small>}
                </span>
                <button
                  className="btn sm"
                  onClick={() => responder(s, false)}
                  disabled={respondiendo === s.id}
                  style={{ marginRight: 6 }}
                >
                  Rechazar
                </button>
                <button
                  className="btn pri sm"
                  onClick={() => responder(s, true)}
                  disabled={respondiendo === s.id}
                >
                  {respondiendo === s.id ? '…' : 'Aceptar'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="sec">
        Con quién ganás más
        {apodo && !editandoApodo && haySorteos && (
          <button className="act" onClick={() => setEditandoApodo(true)}>
            cambiar apodo
          </button>
        )}
      </div>

      {!haySorteos ? (
        <div className="card">
          <div className="vacio">Sorteá equipos en tus partidos y acá vas a ver con quién más ganás.</div>
        </div>
      ) : !apodo || editandoApodo ? (
        <div className="card" style={{ padding: 14 }}>
          <form onSubmit={guardarApodo}>
            <div className="row2">
              <input
                value={apodoInput}
                onChange={(ev) => setApodoInput(ev.target.value)}
                placeholder={apodo || 'Cómo te anotás en la lista'}
                maxLength={40}
                autoFocus={editandoApodo}
              />
              <button
                className="btn pri"
                type="submit"
                style={{ flex: 'none', padding: '12px 20px' }}
                disabled={!apodoInput.trim()}
              >
                Guardar
              </button>
            </div>
          </form>
          <div className="nota">
            Para saber con quién ganás más necesito saber cuál sos vos en la lista de anotados — no
            hay forma de deducirlo solo.
          </div>
        </div>
      ) : mejores.length === 0 ? (
        <div className="card">
          <div className="vacio">
            {socios.length === 0 ? (
              <>
                No encontramos a &quot;{apodo}&quot; en ningún equipo sorteado.{' '}
                <a
                  onClick={() => setEditandoApodo(true)}
                  style={{ cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Revisar apodo
                </a>
              </>
            ) : (
              `Todavía no hay nadie con quien hayas jugado ${MIN_JUNTOS} partidos o más.`
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            {mejores.map((soc, i) => (
              <div className="jug" key={soc.nombre}>
                <span className="num">{i + 1}</span>
                <Avatar nombre={soc.nombre} />
                <span className="nom">
                  <b>{soc.nombre}</b>
                  <small>
                    {soc.ganados} de {soc.juntos} juntos
                  </small>
                </span>
                <span className="m ok">{soc.efectividad}%</span>
              </div>
            ))}
          </div>
          <div className="nota">
            Los {mejores.length === 1 ? '' : mejores.length + ' '}que mejor porcentaje te dan
            jugando en tu equipo, con un mínimo de {MIN_JUNTOS} partidos juntos. Salen de los
            nombres del sorteo, no de las cuentas: pueden no coincidir con tus amigos de abajo.
          </div>
        </>
      )}

      <div className="sec">Buscar por username</div>
      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="@username (mínimo 3 letras)"
      />
      {busqueda.trim().length >= 3 && (
        <div className="card" style={{ marginTop: 10 }}>
          {buscandoUsername ? (
            <div className="vacio">Buscando…</div>
          ) : resultados.length === 0 ? (
            <div className="vacio">Nadie con ese username.</div>
          ) : (
            resultados.map((r) => (
              <div className="saldo" key={r.id}>
                <Avatar nombre={r.nombre} url={r.avatar_url} />
                <span className="nom">
                  <b>{conApodo(r.nombre, r.apodo)}</b>
                  <small>@{r.username}</small>
                </span>
                <button
                  className="btn sm"
                  onClick={() => enviarSolicitud(r.id, r.nombre)}
                  disabled={enviando === r.id || idsEnviadas.has(r.id)}
                >
                  {idsEnviadas.has(r.id) ? 'Pendiente' : enviando === r.id ? '…' : 'Enviar solicitud'}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <div className="sec">O por mail</div>
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
            {buscando ? '…' : 'Enviar'}
          </button>
        </div>
      </form>
      {msg && <div className={`msg ${msg.tipo}`}>{msg.texto}</div>}
      <div className="nota">
        Tiene que haber entrado alguna vez a MiMundial con ese mail. Para los que no tienen cuenta
        está el link de invitación del partido.
      </div>

      {enviadas.length > 0 && (
        <>
          <div className="sec">Esperando respuesta · {enviadas.length}</div>
          <div className="card">
            {enviadas.map((s) => (
              <div className="saldo" key={s.id}>
                <Avatar nombre={s.nombre} url={s.avatar_url} />
                <span className="nom">
                  <b>{conApodo(s.nombre, s.apodo)}</b>
                  {s.username && <small>@{s.username}</small>}
                </span>
                <button className="quitar" onClick={() => cancelar(s)} title="Cancelar">
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}

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
            <div
              className="saldo"
              key={a.id}
              style={{ cursor: 'pointer' }}
              onClick={() => setPerfilAbierto({ id: a.id, nombre: a.nombre })}
            >
              <Avatar nombre={a.nombre} url={a.avatar_url} />
              <span className="nom">
                <b>{conApodo(a.nombre, a.apodo)}</b>
              </span>
              <button
                className="quitar"
                onClick={(ev) => {
                  ev.stopPropagation();
                  sacar(a);
                }}
                title="Sacar"
              >
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
                <Avatar nombre={s.nombre} url={s.avatar_url} />
                <span className="nom">
                  <b>{conApodo(s.nombre, s.apodo)}</b>
                  <small>por {s.via}</small>
                </span>
                <button
                  className="btn sm"
                  onClick={() => enviarSolicitud(s.id, s.nombre)}
                  disabled={enviando === s.id || idsEnviadas.has(s.id)}
                >
                  {idsEnviadas.has(s.id) ? 'Pendiente' : enviando === s.id ? '…' : 'Enviar solicitud'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {perfilAbierto && (
        <PerfilModal
          userId={perfilAbierto.id}
          nombreFallback={perfilAbierto.nombre}
          estado="amigo"
          procesando={false}
          onEnviarSolicitud={() => {}}
          onCerrar={() => setPerfilAbierto(null)}
        />
      )}

      {confirmarUI}
    </div>
  );
}
