'use client';

/**
 * TALLER DE ESTILO.
 *
 * Renderiza cada pieza visual de la app con datos inventados, sin
 * Supabase y sin sesión, para poder mirar el sistema entero de una vez
 * en lugar de recorrer nueve pantallas con datos reales para juzgar un
 * borde.
 *
 * Es público a propósito (ver proxy.ts): así se revisa el diseño desde
 * el celular sin iniciar sesión. Ningún dato de acá sale de este
 * archivo, y no hay ningún link hacia esta ruta desde la app.
 */

import { useState } from 'react';
import Copa, { Copita } from '@/components/Copa';
import { MarcaTexto } from '@/components/Marca';
import { MarcaEmpate, MarcaPerdio, MarcaRacha, MarcaTilde } from '@/components/Marcas';
import BotonGoogle from '@/components/BotonGoogle';
import { CAMINO } from '@/lib/camino';
import { color, iniciales, plata } from '@/lib/calculos';

const GENTE = ['Alejo Lobos', 'Brunito', 'Fede Paz', 'El Ruso', 'Tincho', 'Nacho Vera'];

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 34 }}>
      <h2
        style={{
          fontSize: 10,
          letterSpacing: 2,
          textTransform: 'uppercase',
          opacity: 0.5,
          margin: '0 0 10px',
          fontWeight: 700,
        }}
      >
        {titulo}
      </h2>
      {children}
    </section>
  );
}

export default function Taller() {
  const [modal, setModal] = useState(false);

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="hd">
            <span className="brand">
              <span className="dot">
                <Copita tam={15} />
              </span>
              <h1>MiMundial</h1>
            </span>
            <span className="avatarBtn on">A</span>
          </div>
          <nav className="tabs escritorio">
            <a className="on">Camino</a>
            <a>Partidos</a>
            <a>Stats</a>
            <a>Plata</a>
            <a>Amigos</a>
          </nav>
        </div>
      </header>

      <div className="wrap" style={{ paddingTop: 18 }}>
        {/* ---------------- CAMINO ---------------- */}
        <Bloque titulo="Camino · la cabecera">
          <div className="copaBox">
            <div className="copaBox-eyebrow">
              <span>Mundial #3</span>
              <span>2 copas</span>
            </div>
            <div className="copaBox-fase">{CAMINO[4].nombre}</div>
            <div className="copaBox-frase">En cuartos. Empieza lo lindo.</div>
            <div className="casilleros">
              {CAMINO.map((inst, i) => {
                const ganada = i < 4;
                const premio = i === CAMINO.length - 1;
                return (
                  <span
                    key={inst.id}
                    className={`casillero ${ganada ? 'ganada' : ''} ${i === 4 ? 'actual' : ''} ${premio ? 'premio' : ''}`}
                  >
                    {ganada ? <MarcaTilde tam={15} /> : premio ? <Copita tam={13} /> : null}
                  </span>
                );
              })}
            </div>
            <div className="copaBox-pie">
              <b>4</b> al hilo<span className="sep">·</span>faltan <b>3</b> para la copa
            </div>
          </div>

          <div style={{ height: 10 }} />
          <div className="copaBox ardiendo">
            <div className="copaBox-eyebrow">
              <span>Mundial #3</span>
              <span>2 copas</span>
            </div>
            <div className="copaBox-fase">{CAMINO[6].nombre}</div>
            <div className="copaBox-frase">La final. Ganás esto y sos campeón.</div>
            <div className="casilleros">
              {CAMINO.map((inst, i) => {
                const ganada = i < 6;
                const premio = i === CAMINO.length - 1;
                return (
                  <span
                    key={inst.id}
                    className={`casillero ${ganada ? 'ganada' : ''} ${i === 6 ? 'actual' : ''} ${premio ? 'premio' : ''}`}
                  >
                    {ganada ? <MarcaTilde tam={15} /> : premio ? <Copita tam={13} /> : null}
                  </span>
                );
              })}
            </div>
            <div className="copaBox-pie">
              <b>6</b> al hilo<span className="sep">·</span>falta <b>1</b> para la copa
            </div>
          </div>
        </Bloque>

        <Bloque titulo="Camino · la ruta">
          <div className="card">
            <ol className="ruta">
              {CAMINO.map((inst, i) => {
                const estado = i < 4 ? 'pasada' : i === 4 ? 'actual' : 'pendiente';
                return (
                  <li key={inst.id} className={`ruta-paso ${estado}`}>
                    <span className="ruta-punto">
                      {estado === 'pasada' ? <MarcaTilde tam={14} /> : i + 1}
                    </span>
                    <span className="ruta-txt">
                      <b>{inst.nombre}</b>
                      <small>
                        {estado === 'pasada'
                          ? 'superada'
                          : estado === 'actual'
                            ? 'te toca ahora'
                            : `a ${i - 4} triunfo${i - 4 > 1 ? 's' : ''}`}
                      </small>
                    </span>
                  </li>
                );
              })}
              <li className="ruta-paso copa pendiente">
                <span className="ruta-punto">
                  <Copita tam={13} />
                </span>
                <span className="ruta-txt">
                  <b>Campeón del mundo</b>
                  <small>3 triunfos y la levantás</small>
                </span>
              </li>
            </ol>
          </div>
        </Bloque>

        <Bloque titulo="Camino · vitrina e historial">
          <div className="vitrina">
            <span className="trofeo">
              <Copita tam={24} />
            </span>
            <span className="trofeo">
              <Copita tam={24} />
            </span>
          </div>
          <div className="sec">Cómo llegaste hasta acá</div>
          <div className="card">
            {(
              [
                ['ganamos', 'Cuartos de final', '12 jul · La Piedad'],
                ['empate', 'Cuartos de final', '5 jul · ITLP'],
                ['perdimos', 'Octavos de final', '28 jun · El Galpón'],
              ] as const
            ).map(([res, inst, sub], i) => (
              <span className="paso" key={i}>
                <span className={`paso-res ${res}`}>
                  {res === 'ganamos' ? 'G' : res === 'empate' ? 'E' : 'P'}
                </span>
                <span className="paso-info">
                  <b>
                    {inst}
                    {i === 0 && <span className="chip copaChip">campeón</span>}
                  </b>
                  <small>{sub}</small>
                </span>
                <span className="paso-flecha">
                  {res === 'ganamos' ? '↑' : res === 'perdimos' ? '↺' : '→'}
                </span>
              </span>
            ))}
          </div>
        </Bloque>

        {/* ---------------- PARTIDOS ---------------- */}
        <Bloque titulo="Partidos · kpis y lista">
          <div className="grid">
            <div className="kpi">
              <div className="n g">14</div>
              <div className="c">Ganados</div>
            </div>
            <div className="kpi">
              <div className="n e">3</div>
              <div className="c">Empates</div>
            </div>
            <div className="kpi">
              <div className="n p">6</div>
              <div className="c">Perdidos</div>
            </div>
          </div>

          <div className="sec">
            Tus partidos
            <button className="act">+ nuevo</button>
          </div>
          <div className="card">
            {(
              [
                ['12', 'jul', 'La Piedad', '12/12 · $48.000 · 20:00 · 5-3', 'ok', 'Ganamos'],
                ['5', 'jul', 'ITLP', '10/12 · $42.000 · 21:00', 'debe', 'falta $8.400'],
                ['28', 'jun', 'El Galpón', '12/12 · $40.000 · 20:30 · 2-4', 'perd', 'Perdimos'],
                ['21', 'jun', 'La Piedad', '8/12 · $0 · 20:00', 'sin', 'sin cargar'],
              ] as const
            ).map(([d, m, lugar, sub, cls, txt], i) => (
              <span className="item" key={i}>
                <span className="fec">
                  <span className="d">{d}</span>
                  <span className="m">{m}</span>
                </span>
                <span className="info">
                  <b>{lugar}</b>
                  <small>{sub}</small>
                </span>
                <span className={`estado-pill ${cls}`}>{txt}</span>
              </span>
            ))}
          </div>
        </Bloque>

        {/* ---------------- DETALLE ---------------- */}
        <Bloque titulo="Partido · resumen (falta / completo)">
          <div className="resumen falta">
            <div className="rs-top">
              <span className="pulso" />
              <span className="rs-estado">Faltan 2</span>
            </div>
            <div className="rs-sub">Somos 10 de 12.</div>
            <div className="rs-meta">
              <div>
                <div className="k">Cuándo</div>
                <div className="v">12 jul · 20:00</div>
              </div>
              <div>
                <div className="k">Dónde</div>
                <div className="v">La Piedad</div>
              </div>
              <div>
                <div className="k">Anotados</div>
                <div className="v">10/12</div>
              </div>
            </div>
            <div className="barra">
              <i style={{ width: '83%' }} />
            </div>
          </div>
          <div style={{ height: 10 }} />
          <div className="resumen completo">
            <div className="rs-top">
              <span className="pulso" />
              <span className="rs-estado">Se juega</span>
            </div>
            <div className="rs-sub">Somos 12. Ya está.</div>
            <div className="barra">
              <i style={{ width: '100%' }} />
            </div>
          </div>
        </Bloque>

        <Bloque titulo="Partido · pestañas y anotados">
          <nav className="tabs" style={{ paddingBottom: 0 }}>
            <a className="on">Anotados</a>
            <a>Equipos</a>
            <a>Plata</a>
            <a>Resultado</a>
          </nav>
          <div className="sec">Los anotados</div>
          <div className="card">
            {GENTE.slice(0, 4).map((n, i) => {
              const inv = i === 1 ? 2 : 0;
              return (
                <div className="jug" key={n}>
                  <span className="num">{inv ? `${i + 1}–${i + 1 + inv}` : i + 1}</span>
                  <span className="av" style={{ background: color(n) }}>
                    {iniciales(n)}
                  </span>
                  <span className="nom">
                    <b>{n}</b>
                    {inv > 0 && <small>+{inv} invitados · 3 lugares</small>}
                  </span>
                  <span className="inv">
                    <button disabled={inv === 0}>−</button>
                    <span>+{inv}</span>
                    <button>+</button>
                  </span>
                  <button className="quitar">×</button>
                </div>
              );
            })}
          </div>

          <div className="sec">Tus amigos</div>
          <div className="chips">
            {GENTE.slice(4).map((n) => (
              <button key={n} className="chipAmigo">
                <span className="mini" style={{ background: color(n) }}>
                  {iniciales(n)}
                </span>
                {n}
                <b>+</b>
              </button>
            ))}
          </div>

          <div className="sec">Sumar a mano</div>
          <div className="row2">
            <input placeholder="Nombre" />
            <button className="btn pri" style={{ flex: 'none', padding: '12px 20px' }}>
              Sumar
            </button>
          </div>
          <div className="nota">
            Sumás a alguien y después le ponés <b>+</b> por cada invitado que lleva.
          </div>
        </Bloque>

        <Bloque titulo="Partido · equipos">
          <div className="aviso-cambio">La lista cambió desde el último sorteo.</div>
          <div className="equipos">
            <div className="eq">
              <div className="eq-head">
                <span className="chaleco" style={{ background: '#eef0ea', border: '1px solid #c3c9bd' }} />
                <b>Claros</b>
                <span>5</span>
              </div>
              <ul>
                {GENTE.slice(0, 3).map((n) => (
                  <li key={n}>
                    <span className="mini" style={{ background: color(n) }}>
                      {iniciales(n)}
                    </span>
                    <span>{n}</span>
                  </li>
                ))}
                <li className="invitado">
                  <span className="mini" style={{ background: color('inv') }}>
                    IN
                  </span>
                  <span>Invitado de Brunito</span>
                </li>
              </ul>
            </div>
            <div className="eq">
              <div className="eq-head">
                <span className="chaleco" style={{ background: '#2b3648' }} />
                <b>Oscuros</b>
                <span>5</span>
              </div>
              <ul>
                {GENTE.slice(3).map((n) => (
                  <li key={n}>
                    <span className="mini" style={{ background: color(n) }}>
                      {iniciales(n)}
                    </span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Bloque>

        <Bloque titulo="Partido · plata">
          <div className="tot">
            <div className="big">{plata(48000)}</div>
            <div className="lbl">La Piedad · 12 jul</div>
            <div className="split">
              <div>
                <div className="n">{plata(4000)}</div>
                <div className="c">por cabeza</div>
              </div>
              <div>
                <div className="n ok">{plata(39600)}</div>
                <div className="c">cubierto</div>
              </div>
              <div>
                <div className="n debe">{plata(8400)}</div>
                <div className="c">le deben a Alejo</div>
              </div>
            </div>
          </div>
          <div className="sec">
            Quién pagó · 3 de 5<button className="act">cambiar total</button>
          </div>
          <div className="card">
            {GENTE.slice(0, 4).map((n, i) => {
              const listo = i < 2;
              const esPagador = i === 0;
              return (
                <div className="pago" key={n}>
                  <button className={`tick ${listo ? 'ok' : ''}`} disabled={esPagador}>
                    {listo ? '✓' : '·'}
                  </button>
                  <span className="nom">
                    <b>
                      {n}
                      {esPagador && <span className="chip puso">puso</span>}
                      {i === 1 && <span className="chip">+2</span>}
                    </b>
                    <small>
                      {esPagador ? `adelantó ${plata(48000)} · su parte está cubierta` : listo ? `pagó ${plata(4000)}` : `debe ${plata(4000)}`}
                    </small>
                  </span>
                  <span className={`monto ${listo ? 'ok' : 'debe'}`}>{plata(4000)}</span>
                </div>
              );
            })}
          </div>
        </Bloque>

        <Bloque titulo="Partido · resultado">
          <div className="resultado">
            <button className="on gano">
              <span className="ico">
                <Copita tam={19} />
              </span>
              Ganamos
            </button>
            <button className="emp">
              <span className="ico">
                <MarcaEmpate />
              </span>
              Empate
            </button>
            <button className="perd">
              <span className="ico">
                <MarcaPerdio />
              </span>
              Perdimos
            </button>
          </div>
          <div className="marcador">
            <input defaultValue={5} />
            <span>a</span>
            <input defaultValue={3} />
          </div>
        </Bloque>

        {/* ---------------- STATS / CUENTAS ---------------- */}
        <Bloque titulo="Stats · racha y saldos">
          <div className="card rachaBox">
            <span className="emo g">
              <MarcaRacha tipo="ganamos" />
            </span>
            <span className="txt">
              <b>4 ganados al hilo</b>
              <small>La mejor del año</small>
            </span>
          </div>
          <div className="sec">Cuentas</div>
          <div className="card">
            {GENTE.slice(0, 3).map((n, i) => (
              <div className="saldo" key={n}>
                <span className="av" style={{ background: color(n) }}>
                  {iniciales(n)}
                </span>
                <span className="nom">
                  <b>{n}</b>
                  <small>{6 - i} partidos</small>
                </span>
                <span className={`m ${i === 0 ? 'debe' : i === 1 ? 'ok' : 'favor'}`}>
                  {plata(i === 0 ? 12000 : i === 1 ? 0 : -8000)}
                </span>
              </div>
            ))}
          </div>
        </Bloque>

        {/* ---------------- FORMULARIOS ---------------- */}
        <Bloque titulo="Formulario, botones y mensajes">
          <div className="card" style={{ padding: 14 }}>
            <div className="campos">
              <div className="campo">
                <label>Fecha</label>
                <input type="date" defaultValue="2026-07-12" />
              </div>
              <div className="campo">
                <label>Hora</label>
                <input type="time" defaultValue="20:00" />
              </div>
            </div>
            <div className="campo">
              <label>Dónde</label>
              <input placeholder="ITLP, La Piedad, el parque…" />
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label>Posición</label>
              <select>
                <option>Mediocampista</option>
              </select>
            </div>
          </div>
          <div className="row2" style={{ marginTop: 12 }}>
            <button className="btn pri">Crear</button>
            <button className="btn">Cancelar</button>
          </div>
          <button className="btn danger wide sm" style={{ marginTop: 10 }}>
            Borrar este partido
          </button>
          <div className="msg ok">Listo, se guardó.</div>
          <div className="msg err">Ese username ya está tomado.</div>
          <div className="msg info">Falta configurar algo.</div>
          <div className="contador" style={{ marginTop: 12 }}>
            <button>−</button>
            <span>+1 invitado</span>
            <button>+</button>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setModal(true)}>
              Abrir modal
            </button>
          </div>
        </Bloque>

        {/* ---------------- INVITACIÓN ---------------- */}
        <Bloque titulo="Invitación pública">
          <div className="inv-marca">
            <span className="dot">
              <Copita tam={11} />
            </span>{' '}
            MiMundial
          </div>
          <div className="cancha">
            <div className="cancha-lineas" />
            <div className="cancha-contenido">
              <div className="inv-invita">
                <b>Alejo</b> te invita a jugar
              </div>
              <div className="inv-lugar">La Piedad</div>
              <div className="inv-cuando">12 jul · 20:00</div>
              <div className="marcador-cupo">
                <span className="mc-n">10</span>
                <span className="mc-sep">/</span>
                <span className="mc-t">12</span>
              </div>
              <div className="inv-faltan">Faltan 2</div>
            </div>
          </div>
        </Bloque>

        <Bloque titulo="Invitación · sin cuenta (los dos caminos)">
          <div className="sec">Anotate con tu cuenta</div>
          <div className="card" style={{ padding: 14 }}>
            <BotonGoogle destino="/estilo" texto="Entrar con Google" />
            <div className="nota" style={{ marginTop: 12 }}>
              Te anotás con tu nombre y arrancás <b>tu propio Mundial</b>: cada partido que ganás
              te hace avanzar una instancia. Siete al hilo y levantás la copa.
            </div>
          </div>

          <div className="sec">O anotate sin cuenta</div>
          <div className="card" style={{ padding: 14 }}>
            <div className="campo">
              <label>Tu nombre</label>
              <input placeholder="Cómo te conocen" />
            </div>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label>¿Llevás a alguien?</label>
              <div className="contador">
                <button disabled>−</button>
                <span>Voy solo</span>
                <button>+</button>
              </div>
            </div>
          </div>
          <div className="row2" style={{ marginTop: 12 }}>
            <button className="btn pri wide">Anotarme sin cuenta</button>
          </div>
          <div className="nota">
            Sin cuenta solo podés manejar <b>tu</b> lugar y los que llevás vos, y desde este
            teléfono.
          </div>
        </Bloque>

        <Bloque titulo="Invitación · con cuenta">
          <div className="sec">Anotate</div>
          <div className="comoEntras">
            <span className="av" style={{ background: color('Alejo Lobos') }}>
              AL
            </span>
            <span>
              Entrás como <b>Alejo Lobos</b> · @alejo
            </span>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="campo" style={{ marginBottom: 0 }}>
              <label>Tu nombre</label>
              <input defaultValue="Alejo Lobos" />
            </div>
          </div>
          <div className="row2" style={{ marginTop: 12 }}>
            <button className="btn pri wide">Anotarme</button>
          </div>

          <div className="sec">Quiénes van · 4</div>
          <div className="card">
            {GENTE.slice(0, 3).map((n, i) => (
              <div className="jug" key={n}>
                <span className="av" style={{ background: color(n) }}>
                  {iniciales(n)}
                </span>
                <span className="nom">
                  <b>{n}</b>
                  <small>@{n.split(' ')[0].toLowerCase()}</small>
                </span>
                {i === 0 ? (
                  <span className="chip">Amigo</span>
                ) : (
                  <button className="btn sm">+ Amigo</button>
                )}
              </div>
            ))}
            <div className="jug">
              <span className="av" style={{ background: color('Tincho') }}>
                TI
              </span>
              <span className="nom">
                <b>Tincho</b>
                <small>+1 invitado</small>
              </span>
            </div>
          </div>
          <div className="nota">
            El último no tiene cuenta, así que no se le puede mandar solicitud de amistad.
          </div>
        </Bloque>

        {/* ---------------- MARCA ---------------- */}
        <Bloque titulo="Marca">
          <div className="fichaPerfil">
            <span className="fichaPerfil-av" style={{ background: color('Alejo Lobos') }}>
              AL
            </span>
            <b>Alejo Lobos</b>
            <small>@alejo</small>
            <small>alejo@mail.com</small>
          </div>
          <div
            style={{
              marginTop: 12,
              background: '#0a1424',
              borderRadius: 4,
              padding: 24,
              display: 'grid',
              placeItems: 'center',
              gap: 14,
            }}
          >
            <MarcaTexto estatica />
            <Copa tam={90} />
          </div>
          <button
            className="btn wide"
            style={{ marginTop: 10 }}
            onClick={() => {
              sessionStorage.removeItem('mimundial.arranque');
              location.reload();
            }}
          >
            Ver el arranque otra vez
          </button>
          <div className="nota">
            El arranque se muestra una sola vez por sesión del navegador: es un regalo la primera
            vez y un peaje la quinta.
          </div>
        </Bloque>

        <div style={{ height: 60 }} />
      </div>

      {modal && (
        <div className="modal" onClick={() => setModal(false)}>
          <div className="sheet sheetConfirmar" onClick={(e) => e.stopPropagation()}>
            <p className="confirmarTexto">¿Borrar el partido con todo lo cargado?</p>
            <div className="row2">
              <button className="btn danger" onClick={() => setModal(false)}>
                Borrar
              </button>
              <button className="btn" onClick={() => setModal(false)}>
                No
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="barraAbajo">
        <a className="on">
          <span>Camino</span>
        </a>
        <a>
          <span>Partidos</span>
        </a>
        <a>
          <span>Stats</span>
        </a>
        <a>
          <span>Plata</span>
        </a>
        <a>
          <span>Amigos</span>
        </a>
      </nav>
    </>
  );
}
