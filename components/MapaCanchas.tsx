'use client';

/* ============================================================
   El mapa para elegir cancha.

   Tiles satelitales de Esri, no de Google, y no es preferencia:
   la key de Google iría en NEXT_PUBLIC_ y `/p/[token]` es una
   página que abre cualquiera sin cuenta — una key scrapeada de
   ahí se factura. Esri World Imagery no pide key ni tarjeta.

   Satelital y no callejero porque una cancha de sintético en un
   mapa de calles es un rectángulo sin nombre, y en la foto se ve.
   Encima va la capa de referencia de Esri, que pone los nombres
   de calle sobre la imagen.

   Los pines son divIcon con HTML propio, no el marker PNG que
   trae Leaflet: ese depende de rutas de asset que el bundler
   reescribe y es el clásico "marcador invisible en producción".
   De paso quedan con la tinta celeste y el oro de la app.
   ============================================================ */

import { useEffect, useRef } from 'react';
import type { Map as LMap, Marker } from 'leaflet';
import type { Cancha } from '@/lib/tipos';
import 'leaflet/dist/leaflet.css';

const SATELITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const NOMBRES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const ATRIBUCION = 'Imágenes: Esri, Maxar, Earthstar Geographics';

/** El pin: un círculo con cola. `elegida` lo agranda y le pone halo —
 *  no lo pinta de oro, que sigue siendo solo de la copa. */
function pinHTML(elegida: boolean) {
  return `<span class="pinCancha ${elegida ? 'pinCancha-elegida' : ''}"></span>`;
}

export default function MapaCanchas({
  canchas,
  elegidaId,
  onElegir,
}: {
  canchas: Cancha[];
  elegidaId: string | null;
  onElegir: (c: Cancha) => void;
}) {
  const div = useRef<HTMLDivElement>(null);
  const mapa = useRef<LMap | null>(null);
  const pines = useRef<Map<string, Marker>>(new Map());
  /* onElegir se redefine en cada render del padre. Si lo metiéramos en
     las dependencias del efecto, el mapa se destruiría y recrearía a
     cada tecla del formulario. Va por ref y el handler lee siempre el
     último. */
  const elegir = useRef(onElegir);
  useEffect(() => {
    elegir.current = onElegir;
  });

  // Montaje: una sola vez. Leaflet toca `window`, así que va en efecto.
  useEffect(() => {
    if (!div.current || mapa.current || canchas.length === 0) return;
    let vivo = true;
    // El Map de marcadores, tomado acá: en el cleanup el ref puede
    // apuntar a otro lado (lo avisa react-hooks/exhaustive-deps).
    const marcadores = pines.current;

    (async () => {
      const L = (await import('leaflet')).default;
      if (!vivo || !div.current || mapa.current) return;

      const m = L.map(div.current, { zoomControl: true, attributionControl: true });
      mapa.current = m;

      L.tileLayer(SATELITE, { maxZoom: 19, attribution: ATRIBUCION }).addTo(m);
      L.tileLayer(NOMBRES, { maxZoom: 19 }).addTo(m);

      for (const c of canchas) {
        const marca = L.marker([c.lat, c.lng], {
          title: c.nombre,
          alt: c.nombre,
          keyboard: true,
          icon: L.divIcon({
            className: 'pinCanchaWrap',
            html: pinHTML(false),
            iconSize: [22, 22],
            iconAnchor: [11, 22],
          }),
        })
          .addTo(m)
          .bindTooltip(c.nombre, { direction: 'top', offset: [0, -20] })
          .on('click', () => elegir.current(c));
        marcadores.set(c.id, marca);
      }

      // Encuadre inicial: todas las canchas en pantalla.
      m.fitBounds(
        L.latLngBounds(canchas.map((c) => [c.lat, c.lng] as [number, number])),
        { padding: [34, 34], maxZoom: 15 },
      );

      /* El contenedor arranca con alto 0 mientras el modal se abre y
         Leaflet mide mal: sin esto quedan tiles grises. */
      setTimeout(() => m.invalidateSize(), 120);
    })();

    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
      marcadores.clear();
    };
    // canchas se carga una vez y no cambia: el mapa no se rearma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canchas.length]);

  /* Repintar el pin elegido sin tocar el mapa: cambiarle el icono al
     marker es más barato que rehacer la capa. */
  useEffect(() => {
    (async () => {
      const L = (await import('leaflet')).default;
      for (const [id, marca] of pines.current) {
        marca.setIcon(
          L.divIcon({
            className: 'pinCanchaWrap',
            html: pinHTML(id === elegidaId),
            iconSize: [22, 22],
            iconAnchor: [11, 22],
          }),
        );
        if (id === elegidaId) marca.setZIndexOffset(500);
        else marca.setZIndexOffset(0);
      }
    })();
  }, [elegidaId]);

  // Centrar en la cancha elegida cuando se elige desde la lista.
  useEffect(() => {
    if (!elegidaId || !mapa.current) return;
    const c = canchas.find((x) => x.id === elegidaId);
    if (c) mapa.current.panTo([c.lat, c.lng], { animate: true });
  }, [elegidaId, canchas]);

  if (canchas.length === 0) return null;

  return <div className="mapaCanchas" ref={div} role="application" aria-label="Mapa de canchas" />;
}
