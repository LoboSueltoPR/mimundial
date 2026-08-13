'use client';

/* ============================================================
   El campo "Dónde" del partido.

   Dos modos: el catálogo (mapa + lista) o texto libre. El catálogo
   es de solo lectura — las canchas se cargan por migración, nadie
   las edita desde la app — pero el texto libre queda para cuando
   juegan en un lugar que no está relevado, que es como funcionaba
   todo hasta ahora.

   Elijas lo que elijas, `lugar` se termina escribiendo con texto.
   Si es del catálogo se le copia el nombre de la cancha. Por eso
   las ~8 RPCs que embeben 'lugar' siguen andando sin tocarse.
   ============================================================ */

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { crearCliente } from '@/lib/supabase/client';
import { RADIO_CIUDAD_KM, distanciaKm, ubicacion } from '@/lib/mapa';
import type { Cancha } from '@/lib/tipos';

// Leaflet toca `window` en el import: no puede renderizarse en el server.
const MapaCanchas = dynamic(() => import('./MapaCanchas'), {
  ssr: false,
  loading: () => <div className="mapaCanchas mapaCanchas-cargando">Cargando el mapa…</div>,
});

export type LugarElegido = { cancha_id: string | null; lugar: string };

export default function ElegirCancha({
  valor,
  onCambiar,
}: {
  valor: LugarElegido;
  onCambiar: (v: LugarElegido) => void;
}) {
  const [canchas, setCanchas] = useState<Cancha[] | null>(null);
  const [aMano, setAMano] = useState(false);
  const [yo, setYo] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = crearCliente();
      const { data } = await supabase
        .from('canchas')
        .select('id, nombre, direccion, lat, lng, notas')
        .order('nombre');
      setCanchas((data ?? []) as Cancha[]);
    })();
    // En paralelo y sin bloquear: si no la da, el mapa igual se dibuja.
    ubicacion().then(setYo);
  }, []);

  /* Con canchas de una sola ciudad da lo mismo, pero el día que haya de
     varias, encuadrar "todas" te deja mirando el país entero. Con la
     ubicación se recorta a tu ciudad y se ordena por cercanía: lo que
     tenés al lado, primero. */
  const cerca = useMemo(() => {
    if (!canchas || !yo) return canchas;
    const conDist = canchas
      .map((c) => ({ c, km: distanciaKm(yo.lat, yo.lng, c.lat, c.lng) }))
      .sort((a, b) => a.km - b.km);
    const enLaCiudad = conDist.filter((x) => x.km <= RADIO_CIUDAD_KM);
    // Si no tenés ninguna cerca, mejor mostrarlas todas que una lista vacía.
    return (enLaCiudad.length > 0 ? enLaCiudad : conDist).map((x) => x.c);
  }, [canchas, yo]);

  const elegir = (c: Cancha) =>
    onCambiar(
      // Volver a tocar la cancha elegida la desmarca.
      valor.cancha_id === c.id
        ? { cancha_id: null, lugar: '' }
        : { cancha_id: c.id, lugar: c.nombre },
    );

  // Sin catálogo cargado, el campo es el de texto libre de siempre.
  const sinCatalogo = canchas !== null && canchas.length === 0;
  const soloTexto = aMano || sinCatalogo;

  return (
    <div className="campo">
      <div className="campo-cab">
        <label>Dónde</label>
        {/* Sin catálogo no hay a qué volver: el escape no se ofrece. */}
        {!sinCatalogo && (
          <button type="button" className="linkbtn" onClick={() => setAMano((v) => !v)}>
            {aMano ? 'Elegir del mapa' : 'No está en la lista'}
          </button>
        )}
      </div>

      {soloTexto ? (
        <input
          placeholder="ITLP, La Piedad, el parque…"
          value={valor.lugar}
          onChange={(e) => onCambiar({ cancha_id: null, lugar: e.target.value })}
        />
      ) : canchas === null ? (
        <div className="mapaCanchas mapaCanchas-cargando">Cargando el mapa…</div>
      ) : (
        <>
          <MapaCanchas
            canchas={cerca ?? canchas}
            centro={yo}
            elegidaId={valor.cancha_id}
            onElegir={elegir}
          />
          <div className="canchaLista" role="listbox" aria-label="Canchas">
            {(cerca ?? canchas).map((c) => (
              <button
                type="button"
                key={c.id}
                role="option"
                aria-selected={valor.cancha_id === c.id}
                className={`canchaChip ${valor.cancha_id === c.id ? 'elegida' : ''}`}
                onClick={() => elegir(c)}
              >
                {c.nombre}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
