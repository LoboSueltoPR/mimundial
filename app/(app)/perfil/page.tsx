'use client';

import { useEffect, useRef, useState } from 'react';
import { crearCliente } from '@/lib/supabase/client';
import type { ExportLocal, Jugador, Partido } from '@/lib/tipos';

export default function Perfil() {
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err' | 'info'; texto: string } | null>(null);
  const [importando, setImportando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
    })();
  }, []);

  /* ---------- importar del Se Juega local ---------- */
  async function importar(archivo: File) {
    setImportando(true);
    setMsg(null);
    try {
      const texto = await archivo.text();
      const datos = JSON.parse(texto) as ExportLocal;

      if (!datos || !Array.isArray(datos.partidos)) {
        throw new Error('El archivo no tiene la forma esperada (falta la lista de partidos).');
      }

      const supabase = crearCliente();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Se cortó la sesión.');

      let ok = 0;

      for (const viejo of datos.partidos) {
        const { data: creado, error: e1 } = await supabase
          .from('partidos')
          .insert({
            user_id: user.id,
            fecha: viejo.fecha || new Date().toISOString().slice(0, 10),
            hora: viejo.hora || null,
            lugar: viejo.lugar || null,
            cupo: Math.max(2, Math.min(40, viejo.cupo || 12)),
            costo: Math.max(0, viejo.costo || 0),
            equipos: viejo.equipos ?? null,
          })
          .select('id')
          .single();

        if (e1 || !creado) throw new Error(e1?.message || 'No se pudo crear un partido.');

        const jugadores = (viejo.jugadores || []).map((j, i) => ({
          partido_id: creado.id,
          nombre: j.nombre,
          invitados: Math.max(0, j.invitados || 0),
          pagado: Math.max(0, j.pagado || 0),
          orden: i,
        }));

        if (jugadores.length) {
          const { data: insertados, error: e2 } = await supabase
            .from('jugadores')
            .insert(jugadores)
            .select('id, nombre');
          if (e2) throw new Error(e2.message);

          // el "puso" viejo apuntaba a un id local: lo re-apuntamos por nombre
          if (viejo.puso) {
            const nombrePagador = (viejo.jugadores || []).find((j) => j.id === viejo.puso)?.nombre;
            const nuevo = insertados?.find((x) => x.nombre === nombrePagador);
            if (nuevo) {
              await supabase.from('partidos').update({ puso: nuevo.id }).eq('id', creado.id);
            }
          }
        }
        ok++;
      }

      setMsg({
        tipo: 'ok',
        texto: `Listo: se importaron ${ok} partido${ok === 1 ? '' : 's'}. Miralos en la pestaña Partidos.`,
      });
    } catch (e) {
      setMsg({
        tipo: 'err',
        texto: e instanceof Error ? e.message : 'No se pudo leer el archivo.',
      });
    } finally {
      setImportando(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  /* ---------- exportar todo ---------- */
  async function exportar() {
    const supabase = crearCliente();
    const { data, error } = await supabase.from('partidos').select('*, jugadores!jugadores_partido_id_fkey(*)');
    if (error) {
      setMsg({ tipo: 'err', texto: error.message });
      return;
    }
    const blob = new Blob([JSON.stringify({ partidos: data as (Partido & { jugadores: Jugador[] })[] }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mimundial-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <div style={{ paddingTop: 18 }}>
      <div className="sec">Tu cuenta</div>
      <div className="card">
        <div className="saldo">
          <span className="nom">
            <b>{nombre || '—'}</b>
            <small>{email}</small>
          </span>
        </div>
      </div>

      <div className="sec">Traer datos de Se Juega</div>
      <div className="card">
        <div className="vacio" style={{ textAlign: 'left' }}>
          Si venías usando la app local, exportá el JSON desde ahí (<b>Historial → Exportar copia</b>)
          y subilo acá. Se cargan todos los partidos con sus jugadores, invitados y pagos.
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importar(f);
        }}
      />
      <div className="row2" style={{ marginTop: 12 }}>
        <button className="btn pri" onClick={() => fileRef.current?.click()} disabled={importando}>
          {importando ? 'Importando…' : 'Subir JSON'}
        </button>
        <button className="btn" onClick={exportar}>
          Exportar todo
        </button>
      </div>

      {msg && <div className={`msg ${msg.tipo}`}>{msg.texto}</div>}

      <div className="sec">Instalar en el celular</div>
      <div className="card">
        <div className="vacio" style={{ textAlign: 'left' }}>
          Abrí esta página en el celular y usá <b>Agregar a pantalla de inicio</b>. Se abre como app,
          sin barra del navegador. En iPhone hay que hacerlo sí o sí para que después funcionen las
          notificaciones.
        </div>
      </div>
    </div>
  );
}
