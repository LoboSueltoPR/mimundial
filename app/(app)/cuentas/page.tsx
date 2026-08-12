'use client';

import { useEffect, useState } from 'react';
import { crearCliente } from '@/lib/supabase/client';
import type { Jugador, Partido } from '@/lib/tipos';
import { calcularCuentas, calcularStats, color, iniciales, plata } from '@/lib/calculos';

type Fila = Partido & { jugadores: Jugador[] };

export default function Cuentas() {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = crearCliente();
      const { data, error } = await supabase.from('partidos').select('*, jugadores!jugadores_partido_id_fkey(*)');
      if (error) {
        setError(error.message);
        setFilas([]);
        return;
      }
      setFilas((data ?? []) as Fila[]);
    })();
  }, []);

  if (error)
    return (
      <div style={{ paddingTop: 18 }}>
        <div className="msg err">{error}</div>
      </div>
    );
  if (!filas) return <div className="cargando">Cargando…</div>;

  const cuentas = calcularCuentas(filas);
  const deben = cuentas.filter((c) => c.saldo > 0);
  const total = deben.reduce((a, c) => a + c.saldo, 0);
  const stats = calcularStats(filas);

  if (cuentas.length === 0)
    return (
      <div style={{ paddingTop: 18 }}>
        <div className="card">
          <div className="vacio">Acá se acumula lo que debe cada uno, partido a partido.</div>
        </div>
      </div>
    );

  return (
    <div style={{ paddingTop: 18 }}>
      <div className="tot">
        <div className="big">{plata(total)}</div>
        <div className="lbl">
          sin cobrar · {deben.length} persona{deben.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="grid" style={{ marginTop: 9 }}>
        <div className="kpi">
          <div className="n" style={{ fontSize: 17 }}>
            {plata(stats.gastado)}
          </div>
          <div className="c">Tu parte, en total</div>
        </div>
      </div>
      <div className="nota">
        Suma de lo que te tocó por cabeza en cada partido, cargado o no.
      </div>

      <div className="sec">
        Saldo por persona · {filas.length} partido{filas.length === 1 ? '' : 's'}
      </div>
      <div className="card">
        {cuentas.map((c) => (
          <div className="saldo" key={c.nombre}>
            <span className="av" style={{ background: color(c.nombre) }}>
              {iniciales(c.nombre)}
            </span>
            <span className="nom">
              <b>{c.nombre}</b>
              <small>
                {c.partidos} partido{c.partidos === 1 ? '' : 's'} · pagó {plata(c.pago)} de{' '}
                {plata(c.debe)}
              </small>
            </span>
            <span className={`m ${c.saldo > 0 ? 'debe' : c.saldo < 0 ? 'favor' : 'ok'}`}>
              {c.saldo > 0 ? plata(c.saldo) : c.saldo < 0 ? '+' + plata(-c.saldo) : 'al día'}
            </span>
          </div>
        ))}
      </div>
      <div className="nota">
        Suma de todos tus partidos. Verde = pagó de más y le queda a favor.
      </div>
    </div>
  );
}
