'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { crearCliente } from '@/lib/supabase/client';
import type {
  Amigo,
  DesafioParaMi,
  Jugador,
  MiPartidoAnotado,
  Partido,
  RespuestaRPC,
} from '@/lib/tipos';
import {
  cabezas,
  calcularStats,
  fechaCorta,
  nombreDeLado,
  plata,
  totalDebe,
} from '@/lib/calculos';
import ElegirCancha, { type LugarElegido } from '@/components/ElegirCancha';
import ArmarEquipo from '@/components/ArmarEquipo';
import { useConfirmar } from '@/components/Confirmar';

type Fila = Partido & { jugadores: Jugador[] };

const HOY = () => new Date().toISOString().slice(0, 10);

export default function Partidos() {
  const router = useRouter();
  const { confirmar, ui: confirmarUI } = useConfirmar();
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(false);

  /* Desafíos de otros: los que un amigo publicó buscando rival y los que
     me mandaron a mí. Va en su propia RPC y su propio estado — si la
     0021 todavía no corrió en Supabase, esto falla solo a esta sección
     y el resto de la pantalla sigue andando igual (mismo patrón que
     `mis_partidos_anotado` con la 0005). */
  const [desafios, setDesafios] = useState<DesafioParaMi[]>([]);
  /** false hasta que se sepa: la 0021 puede no estar aplicada todavía. */
  const [hayDesafios, setHayDesafios] = useState(false);
  const [armando, setArmando] = useState<string | null>(null);
  const [tomando, setTomando] = useState<string | null>(null);
  /* Aparte de `error` a propósito: ese hace pantalla de error fatal y
     se lleva puesta la página. Que no se pueda tomar un desafío no
     tiene por qué esconder los partidos. */
  const [errorDesafio, setErrorDesafio] = useState<string | null>(null);

  // Partidos ajenos en los que sos jugador: sección aparte, RPC aparte.
  // Si la migración 0005 todavía no corrió en Supabase, esto falla solo
  // a ella — "Tus partidos" tiene que seguir andando igual.
  const [anotados, setAnotados] = useState<MiPartidoAnotado[] | null>(null);

  // Los ajenos ya jugados, con el resultado dado vuelta a tu punto de vista.
  // Van SOLO al G/E/P de arriba: la lista de abajo es la de los que
  // organizaste vos, y la plata de un partido de otro no es tuya.
  const [ajenos, setAjenos] = useState<Partido[]>([]);

  const cargar = useCallback(async () => {
    const supabase = crearCliente();
    // Las dos juntas: si los ajenos llegaran después, el contador pintaría
    // primero el número sin ellos y se corregiría solo — justo el número
    // equivocado que este arreglo viene a sacar.
    const [{ data, error }, { data: deOtros }] = await Promise.all([
      supabase
        .from('partidos')
        .select('*, jugadores!jugadores_partido_id_fkey(*)')
        .order('fecha', { ascending: false })
        .order('creado_en', { ascending: false }),
      supabase.rpc('mis_resultados_ajenos'),
    ]);

    if (error) {
      setError(error.message);
      setFilas([]);
      return;
    }
    setAjenos((deOtros ?? []) as Partido[]);
    setFilas((data ?? []) as Fila[]);
  }, []);

  const cargarAnotados = useCallback(async () => {
    const supabase = crearCliente();
    const { data, error } = await supabase.rpc('mis_partidos_anotado');
    setAnotados(error ? [] : ((data ?? []) as MiPartidoAnotado[]));
  }, []);

  /* La misma llamada sirve de sonda: si la 0021 todavía no corrió, la
     RPC no existe y la sección entera se apaga sola — incluida la
     opción "Desafío" al crear. Sin esto, el front se puede subir antes
     que la migración pero el que la toque se come un error crudo de
     PostgREST. Es una sonda, no un feature flag: se cae sola el día
     que la migración esté aplicada. */
  const cargarDesafios = useCallback(async () => {
    const { data, error } = await crearCliente().rpc('desafios_para_mi');
    setHayDesafios(!error);
    setDesafios(error ? [] : ((data ?? []) as DesafioParaMi[]));
  }, []);

  useEffect(() => {
    cargar();
    cargarAnotados();
    cargarDesafios();
  }, [cargar, cargarAnotados, cargarDesafios]);

  /**
   * Tomar el desafío y armar el equipo son un solo movimiento: aceptar
   * sin armar deja un partido con un lado vacío y a nadie avisado. La
   * RPC ya te anota a vos de tu lado, así que la hoja abre con vos
   * adentro y falta el resto.
   */
  async function tomar(d: DesafioParaMi) {
    // Ya es mío: no hay nada que aceptar, se sigue armando.
    if (d.rol === 'rival') {
      setArmando(d.id);
      return;
    }

    const quien = d.anfitrion || 'ese equipo';
    const texto =
      d.rol === 'invitado'
        ? `¿Aceptás el desafío de ${quien}?`
        : `¿Le tomás el desafío a ${quien}?`;
    if (!(await confirmar(texto, { boton: 'Aceptar' }))) return;

    setTomando(d.id);
    setErrorDesafio(null);
    const { data, error: e } = await crearCliente().rpc('aceptar_desafio', {
      p_partido_id: d.id,
    });
    setTomando(null);
    const r = data as RespuestaRPC | null;
    if (e || !r?.ok) {
      setErrorDesafio(e?.message || r?.error || 'No se pudo aceptar el desafío.');
      cargarDesafios();
      return;
    }
    // Recién ahí se abre la hoja: ya sos el rival y podés escribir.
    setArmando(d.id);
    cargarDesafios();
    cargarAnotados();
  }

  if (error) {
    return (
      <div style={{ paddingTop: 18 }}>
        <div className="msg err">
          <b>No se pudieron traer los partidos.</b>
          <br />
          {error}
          <br />
          <br />
          Si dice algo de <code>relation does not exist</code>, falta correr la migración SQL en
          Supabase (está en <code>supabase/migrations/0001_init.sql</code>).
        </div>
      </div>
    );
  }

  if (!filas) return <div className="cargando">Cargando…</div>;

  /* Ganar en el equipo de otro cuenta igual que ganar en el tuyo: es el mismo
     criterio que el camino y la pantalla de Stats. Sin costo ni jugadores, que
     son datos del dueño del partido. */
  const stats = calcularStats([
    ...filas,
    ...ajenos.map((a) => ({ ...a, costo: 0, equipos: null, jugadores: [] })),
  ]);

  return (
    <div style={{ paddingTop: 18 }}>
      {filas.length + ajenos.length > 0 && (
        <div className="grid">
          <div className="kpi">
            <div className="n g">{stats.ganados}</div>
            <div className="c">Ganados</div>
          </div>
          <div className="kpi">
            <div className="n e">{stats.empatados}</div>
            <div className="c">Empates</div>
          </div>
          <div className="kpi">
            <div className="n p">{stats.perdidos}</div>
            <div className="c">Perdidos</div>
          </div>
        </div>
      )}

      {/* Los desafíos van primero: son los únicos que se vencen. Un
          partido tuyo te espera; un desafío abierto se lo lleva otro. */}
      {desafios.length > 0 && (
        <>
          <div className="sec">Desafíos</div>
          <div className="card">
            {desafios.map((d) => {
              const f = fechaCorta(d.fecha);
              const sello =
                d.rol === 'rival'
                  ? { cls: 'ok', txt: 'Armá tu equipo' }
                  : d.rol === 'invitado'
                    ? { cls: 'debe', txt: 'Te desafió' }
                    : { cls: 'sin', txt: 'Busca rival' };
              return (
                <div
                  key={d.id}
                  className="item"
                  role="button"
                  tabIndex={0}
                  onClick={() => tomando === null && tomar(d)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && tomando === null) {
                      e.preventDefault();
                      tomar(d);
                    }
                  }}
                >
                  <span className="fec">
                    <span className="d">{f.d}</span>
                    <span className="m">{f.m}</span>
                  </span>
                  <span className="info">
                    <b>{nombreDeLado(d.nombre_a, d.anfitrion)}</b>
                    <small>
                      {d.anfitrion ? 'de ' + d.anfitrion : 'Desafío'}
                      {' · '}
                      {d.cabezas_a}/{Math.max(1, Math.floor(d.cupo / 2))}
                      {d.hora ? ' · ' + d.hora : ''}
                      {d.lugar ? ' · ' + d.lugar : ''}
                    </small>
                  </span>
                  <span className={`estado-pill ${sello.cls}`}>
                    {tomando === d.id ? '…' : sello.txt}
                  </span>
                </div>
              );
            })}
          </div>
          {errorDesafio && <div className="msg err">{errorDesafio}</div>}
          <div className="nota">
            Tocá uno para tomarlo y armar tu equipo. Podés sumar amigos con cuenta o escribir
            nombres a mano: el que tiene cuenta se lleva el resultado a <b>su</b> camino.
          </div>
        </>
      )}

      {anotados !== null && anotados.length > 0 && (
        <>
          <div className="sec">Anotado en</div>
          <div className="card">
            {anotados.map((a) => {
              const f = fechaCorta(a.fecha);
              const completo = a.faltan === 0;
              return (
                <div
                  key={a.id}
                  className="item"
                  onClick={() => router.push(`/p/${a.token}`)}
                >
                  <span className="fec">
                    <span className="d">{f.d}</span>
                    <span className="m">{f.m}</span>
                  </span>
                  <span className="info">
                    <b>{a.lugar || 'Partido'}</b>
                    <small>
                      {a.anfitrion ? 'de ' + a.anfitrion + ' · ' : ''}
                      {a.cabezas}/{a.cupo}
                      {a.hora ? ' · ' + a.hora : ''}
                      {a.mi_invitados > 0 ? ` · llevás +${a.mi_invitados}` : ''}
                    </small>
                  </span>
                  <span className={`estado-pill ${completo ? 'ok' : 'sin'}`}>
                    {completo ? 'Se juega' : 'Falta gente'}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="sec">
        Tus partidos
        <button className="act" onClick={() => setForm(true)}>
          + nuevo
        </button>
      </div>

      <div className="card">
        {filas.length === 0 ? (
          <div className="vacio">
            Todavía no cargaste ningún partido.
            <br />
            Tocá <b>+ nuevo</b> y arrancá.
          </div>
        ) : (
          filas.map((p) => {
            const f = fechaCorta(p.fecha);
            const debe = totalDebe(p, p.jugadores);
            /* En un desafío sin rival, lo que falta no es la plata: es
               el rival. Ese estado manda sobre el de la plata mientras
               el partido no se haya jugado. */
            const esperandoRival = p.es_desafio && !p.rival_acepto_en && !p.resultado;
            const pill =
              p.resultado === 'ganamos'
                ? { cls: 'ok', txt: 'Ganamos' }
                : p.resultado === 'perdimos'
                  ? { cls: 'perd', txt: 'Perdimos' }
                  : p.resultado === 'empate'
                    ? { cls: 'emp', txt: 'Empate' }
                    : esperandoRival
                      ? { cls: 'sin', txt: p.rival_id ? 'Sin respuesta' : 'Busca rival' }
                      : debe > 0
                        ? { cls: 'debe', txt: 'falta ' + plata(debe) }
                        : { cls: 'sin', txt: 'sin cargar' };

            return (
              <div key={p.id} className="item" onClick={() => router.push(`/partidos/${p.id}`)}>
                <span className="fec">
                  <span className="d">{f.d}</span>
                  <span className="m">{f.m}</span>
                </span>
                <span className="info">
                  <b>{p.lugar || 'Partido'}</b>
                  <small>
                    {cabezas(p.jugadores)}/{p.cupo} · {plata(p.costo)}
                    {p.hora ? ' · ' + p.hora : ''}
                    {p.goles_favor !== null && p.goles_contra !== null
                      ? ` · ${p.goles_favor}-${p.goles_contra}`
                      : ''}
                  </small>
                </span>
                <span className={`estado-pill ${pill.cls}`}>{pill.txt}</span>
              </div>
            );
          })
        )}
      </div>

      {form && (
        <FormPartido
          hayDesafios={hayDesafios}
          onCerrar={() => setForm(false)}
          onListo={cargar}
        />
      )}

      {armando && (
        <ArmarEquipo
          partidoId={armando}
          onCerrar={() => setArmando(null)}
          onListo={() => {
            cargarAnotados();
            cargarDesafios();
          }}
        />
      )}

      {confirmarUI}
    </div>
  );
}

type TipoPartido = 'picadito' | 'desafio';

function FormPartido({
  hayDesafios,
  onCerrar,
  onListo,
}: {
  /** false si la 0021 todavía no corrió: ahí no se ofrece el desafío. */
  hayDesafios: boolean;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoPartido>('picadito');
  const [fecha, setFecha] = useState(HOY());
  const [hora, setHora] = useState('20:00');
  const [donde, setDonde] = useState<LugarElegido>({ cancha_id: null, lugar: '' });
  const [cupo, setCupo] = useState(12);
  const [costo, setCosto] = useState(0);
  const [alias, setAlias] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** id del partido si quedó creado a medias: ya no se puede volver a crear. */
  const [creado, setCreado] = useState<string | null>(null);

  /* ---- solo para el desafío ---- */
  const [porLadoN, setPorLadoN] = useState(5);
  const [nombreEquipo, setNombreEquipo] = useState('');
  /** null = abierto, que lo tome el amigo que quiera. */
  const [rival, setRival] = useState<string | null>(null);
  const [amigos, setAmigos] = useState<Amigo[]>([]);

  useEffect(() => {
    crearCliente()
      .rpc('mis_amigos')
      .then(({ data }) => setAmigos((data ?? []) as Amigo[]));
  }, []);

  /* El alias arranca con el del ultimo partido que armaste: casi siempre
     es el mismo y reescribirlo todas las semanas seria el mismo trabajo
     manual que la app vino a sacar. Va en el partido igual, por si algun
     dia cobra otro. */
  useEffect(() => {
    crearCliente()
      .from('partidos')
      .select('alias_pago')
      .not('alias_pago', 'is', null)
      .order('creado_en', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const ultimo = data?.[0]?.alias_pago;
        if (ultimo) setAlias(ultimo);
      });
  }, []);

  async function crear() {
    setGuardando(true);
    setError(null);
    const supabase = crearCliente();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('Se cortó la sesión. Volvé a entrar.');
      setGuardando(false);
      return;
    }

    const esDesafio = tipo === 'desafio';
    /* En un desafío `cupo` sigue siendo el total de cabezas del partido
       — se reusa la columna en vez de agregar una. Lo que se pide en
       pantalla es cuántos por lado, que es como se habla. */
    const cupoFinal = esDesafio
      ? Math.max(2, Math.min(40, (porLadoN || 5) * 2))
      : Math.max(2, Math.min(40, cupo || 12));

    /* Las columnas de la 0021 se mandan SOLO si es un desafío. Un
       picadito escribe exactamente los mismos campos que antes.
       Si el front sube antes que la migración, PostgREST rechaza
       cualquier insert que nombre una columna que no existe — y eso
       rompería la creación de partidos entera, no solo los desafíos.
       Es la misma trampa que ya mordió una vez con `equipo_ganador`. */
    const camposDesafio = esDesafio
      ? {
          es_desafio: true,
          nombre_a: nombreEquipo.trim() || null,
          // Sin rival elegido queda abierto y lo ven todos tus amigos.
          rival_id: rival,
        }
      : {};

    const { data, error } = await supabase
      .from('partidos')
      .insert({
        user_id: user.id,
        fecha,
        hora,
        // Con cancha del catálogo, `lugar` guarda su nombre igual: es el
        // campo que siguen leyendo las RPCs de invitación e historial.
        lugar: donde.lugar.trim() || null,
        cancha_id: donde.cancha_id,
        cupo: cupoFinal,
        costo: Math.max(0, costo || 0),
        alias_pago: alias.trim() || null,
        ...camposDesafio,
      })
      .select('id')
      .single();

    if (error) {
      setGuardando(false);
      setError(error.message);
      return;
    }

    // El que arma el partido juega: la lista arranca con él anotado, no
    // vacía. Con `user_id` para que sea la misma persona que la cuenta
    // (avatar, perfil), igual que cuando alguien se anota por el link.
    if (data?.id) {
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('nombre')
        .eq('id', user.id)
        .single();
      const miNombre = (
        perfil?.nombre ||
        (user.user_metadata?.full_name as string) ||
        user.email?.split('@')[0] ||
        ''
      ).trim();
      if (miNombre) {
        const { error: errAnotarme } = await supabase.from('jugadores').insert({
          partido_id: data.id,
          nombre: miNombre,
          orden: 0,
          user_id: user.id,
          // En un desafío el que lo arma es el capitán del lado 'a'. Sin
          // esto no quedaría de ningún lado y el partido no le contaría
          // en su propio camino. Igual que arriba: en un picadito la
          // columna ni se nombra, por si la 0021 todavía no corrió.
          ...(esDesafio ? { lado: 'a' } : {}),
        });
        // El partido ya existe: no se puede volver a apretar Crear. Se avisa
        // y se ofrece entrar igual, en vez de tragarse el error en silencio.
        if (errAnotarme) {
          setGuardando(false);
          setCreado(data.id);
          setError(`El partido se creó, pero no te pudo anotar: ${errAnotarme.message}`);
          onListo();
          return;
        }
      }
    }

    setGuardando(false);
    onListo();
    onCerrar();
    if (data?.id) router.push(`/partidos/${data.id}`);
  }

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="sheet">
        <h2>Nuevo partido</h2>

        {/* Dos casillas del formulario, no un interruptor: son dos
            documentos distintos y conviene que se vea antes de empezar
            a llenar campos, no después. */}
        {hayDesafios && (
        <div className="tipoPartido" role="radiogroup" aria-label="Tipo de partido">
          <label className={`tipoOpcion${tipo === 'picadito' ? ' on' : ''}`}>
            <input
              type="radio"
              name="tipoPartido"
              checked={tipo === 'picadito'}
              onChange={() => setTipo('picadito')}
            />
            <b>Picadito</b>
            <small>Se anota gente y el bombo arma los equipos</small>
          </label>
          <label className={`tipoOpcion${tipo === 'desafio' ? ' on' : ''}`}>
            <input
              type="radio"
              name="tipoPartido"
              checked={tipo === 'desafio'}
              onChange={() => setTipo('desafio')}
            />
            <b>Desafío</b>
            <small>Tu equipo contra otro equipo</small>
          </label>
        </div>
        )}

        <div className="campos">
          <div className="campo">
            <label>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="campo">
            <label>Hora</label>
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
        </div>
        <ElegirCancha valor={donde} onCambiar={setDonde} />

        {tipo === 'desafio' && (
          <>
            <div className="campo">
              <label>Cómo se llama tu equipo</label>
              <input
                value={nombreEquipo}
                onChange={(e) => setNombreEquipo(e.target.value)}
                placeholder="Opcional"
                maxLength={28}
              />
            </div>

            <div className="sec">Contra quién</div>
            <div className="canchaLista">
              <button
                type="button"
                className={`canchaChip${rival === null ? ' elegida' : ''}`}
                onClick={() => setRival(null)}
              >
                El que lo tome
              </button>
              {amigos.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`canchaChip${rival === a.id ? ' elegida' : ''}`}
                  onClick={() => setRival(a.id)}
                >
                  {a.nombre}
                </button>
              ))}
            </div>
            <div className="nota" style={{ marginBottom: 11 }}>
              {rival === null
                ? 'Le va a aparecer a todos tus amigos y lo toma el primero que quiera.'
                : 'Le aparece solo a esa persona, para que arme su equipo.'}
            </div>
          </>
        )}

        <div className="campos">
          <div className="campo">
            <label>{tipo === 'desafio' ? 'Cuántos por lado' : 'Cuántos van'}</label>
            {tipo === 'desafio' ? (
              <input
                type="number"
                min={1}
                max={20}
                value={porLadoN}
                onChange={(e) => setPorLadoN(Number(e.target.value))}
              />
            ) : (
              <input
                type="number"
                min={2}
                max={40}
                value={cupo}
                onChange={(e) => setCupo(Number(e.target.value))}
              />
            )}
          </div>
          <div className="campo">
            <label>Cuánto sale</label>
            <input
              type="number"
              min={0}
              step={500}
              value={costo}
              onChange={(e) => setCosto(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="campo">
          <label>Tu alias para que te transfieran</label>
          <input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="alias.o.cvu"
            maxLength={60}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <small className="nota" style={{ marginTop: 6, display: 'block' }}>
            Lo van a ver los anotados junto a lo que le toca a cada uno, con un botón para
            copiarlo. Opcional.
          </small>
        </div>
        <div className="row2" style={{ marginTop: 6 }}>
          {creado ? (
            <button className="btn pri" onClick={() => router.push(`/partidos/${creado}`)}>
              Ver el partido
            </button>
          ) : (
            <button className="btn pri" onClick={crear} disabled={guardando}>
              {guardando ? 'Creando…' : tipo === 'desafio' ? 'Desafiar' : 'Crear'}
            </button>
          )}
          <button className="btn" onClick={onCerrar} disabled={guardando}>
            {creado ? 'Cerrar' : 'Cancelar'}
          </button>
        </div>
        {error && <div className="msg err">{error}</div>}
      </div>
    </div>
  );
}
