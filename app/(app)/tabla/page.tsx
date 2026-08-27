'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearCliente } from '@/lib/supabase/client';
import type { AmigoCamino, Partido } from '@/lib/tipos';
import { GRUPOS, LLAVES, calcularCamino, type EstadoCamino } from '@/lib/camino';
import Avatar from '@/components/Avatar';
import PerfilModal from '@/components/PerfilModal';
import { conApodo } from '@/lib/nombre';

type Fila = {
  id: string;
  nombre: string;
  avatarUrl: string | null;
  vos: boolean;
  e: EstadoCamino;
};

/* Quién va primero. `etapa` ya es un solo eje 0…INSTANCIAS-1 con los tres de
   grupos abajo, así que ordena grupos por debajo de las llaves sin ningún
   caso especial. Los puntos desempatan adentro de grupos, y la mejor
   instancia histórica desempata al que ya llegó lejos alguna vez. */
function ordenar(a: Fila, b: Fila) {
  return (
    b.e.copas - a.e.copas ||
    b.e.etapa - a.e.etapa ||
    b.e.puntos - a.e.puntos ||
    b.e.mejorInstancia - a.e.mejorInstancia
  );
}

/** Dónde está parado hoy, en una línea. */
function dondeVa(e: EstadoCamino) {
  const copas = e.copas > 0 ? `${e.copas} copa${e.copas > 1 ? 's' : ''} · ` : '';
  return e.enGrupos
    ? `${copas}${e.puntos} pt${e.puntos === 1 ? '' : 's'} en grupos`
    : `${copas}${e.etapa - GRUPOS} de ${LLAVES} llaves`;
}

export default function Tabla() {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [perfilAbierto, setPerfilAbierto] = useState<{ id: string; nombre: string } | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = crearCliente();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      /* Todo junto: si los ajenos o los amigos llegaran después, la tabla se
         reordenaría sola delante de los ojos con las posiciones cambiando. */
      const [{ data: mios, error: e1 }, { data: ajenos }, { data: amigos }, { data: perfil }] =
        await Promise.all([
          supabase.from('partidos').select('*'),
          supabase.rpc('mis_resultados_ajenos'),
          supabase.rpc('camino_de_amigos'),
          supabase.from('perfiles').select('apodo, avatar_url').eq('id', user.id).single(),
        ]);

      if (e1) {
        setError(e1.message);
        setFilas([]);
        return;
      }

      const miNombre =
        (user.user_metadata?.full_name as string) ||
        (user.user_metadata?.name as string) ||
        user.email?.split('@')[0] ||
        'vos';

      /* Tu camino sale de las dos fuentes, igual que en la pantalla Camino:
         los que organizaste vos y los que jugaste en el equipo de otro. */
      const yo: Fila = {
        id: user.id,
        nombre: conApodo(miNombre, perfil?.apodo ?? null),
        avatarUrl: perfil?.avatar_url ?? null,
        vos: true,
        e: calcularCamino([...((mios ?? []) as Partido[]), ...((ajenos ?? []) as Partido[])]),
      };

      const resto: Fila[] = ((amigos ?? []) as AmigoCamino[]).map((am) => ({
        id: am.id,
        nombre: conApodo(am.nombre, am.apodo),
        avatarUrl: am.avatar_url,
        vos: false,
        e: calcularCamino(am.partidos),
      }));

      setFilas([yo, ...resto].sort(ordenar));
    })();
  }, []);

  if (error)
    return (
      <div style={{ paddingTop: 18 }}>
        <div className="msg err">{error}</div>
      </div>
    );
  if (!filas) return <div className="cargando">Cargando…</div>;

  const solo = filas.length === 1;

  return (
    <div style={{ paddingTop: 18 }}>
      <div className="sec">La tabla</div>
      <div className="card">
        {filas.map((f, i) => (
          <div
            className="jug"
            key={f.id}
            style={f.vos ? undefined : { cursor: 'pointer' }}
            onClick={f.vos ? undefined : () => setPerfilAbierto({ id: f.id, nombre: f.nombre })}
          >
            <span className="num">{i + 1}</span>
            <Avatar nombre={f.nombre} url={f.avatarUrl} />
            <span className="nom">
              <b>
                {f.nombre}
                {f.vos && <span className="chip puso">vos</span>}
              </b>
              <small>{dondeVa(f.e)}</small>
            </span>
            <span className="estado-pill emp">{f.e.proxima.corto}</span>
          </div>
        ))}
      </div>

      <div className="nota">
        {solo ? (
          <>
            Por ahora estás solo acá. Agregá gente en{' '}
            <Link href="/amigos" style={{ color: 'var(--acento)', fontWeight: 600 }}>
              Amigos
            </Link>{' '}
            y la tabla se llena.
          </>
        ) : (
          <>
            Primero el que más copas levantó; después el que llegó más lejos en el mundial que está
            jugando. La pastilla dice qué instancia le toca ahora. Cuenta también lo que cada uno
            jugó en el equipo de otro. Tocá a alguien para ver su camino entero.
          </>
        )}
      </div>

      {perfilAbierto && (
        <PerfilModal
          userId={perfilAbierto.id}
          nombreFallback={perfilAbierto.nombre}
          // Todos los de la tabla ya son amigos: no hay solicitud que mandar.
          estado="amigo"
          procesando={false}
          onEnviarSolicitud={() => {}}
          onCerrar={() => setPerfilAbierto(null)}
        />
      )}
    </div>
  );
}
