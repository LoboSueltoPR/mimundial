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

   Los efectos van separados a propósito: crear el mapa, dibujar
   los pines y encuadrar son tres cosas con ritmos distintos. La
   ubicación llega después del montaje, y si el dibujado colgara
   del montaje los pines quedarían congelados en la primera lista.
   ============================================================ */

import { useEffect, useRef } from 'react';
import type { Map as LMap, Marker } from 'leaflet';
import type { Cancha } from '@/lib/tipos';
import 'leaflet/dist/leaflet.css';

const SATELITE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const NOMBRES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const ATRIBUCION = 'Imágenes: Esri, Maxar, Earthstar Geographics';

/** Zoom de "tu ciudad" cuando no hay nada más con qué encuadrar. */
const ZOOM_CIUDAD = 13;

/** El pin: un círculo con cola. `elegida` lo agranda y le pone halo —
 *  no lo pinta de oro, que sigue siendo solo de la copa. */
const pinHTML = (elegida: boolean) =>
  `<span class="pinCancha ${elegida ? 'pinCancha-elegida' : ''}"></span>`;

export default function MapaCanchas({
  canchas,
  centro,
  elegidaId,
  onElegir,
}: {
  canchas: Cancha[];
  /** Dónde está el usuario, si la dio. null mientras no se sepa. */
  centro: { lat: number; lng: number } | null;
  elegidaId: string | null;
  onElegir: (c: Cancha) => void;
}) {
  const div = useRef<HTMLDivElement>(null);
  const mapa = useRef<LMap | null>(null);
  const pines = useRef<Map<string, Marker>>(new Map());
  const yoPin = useRef<Marker | null>(null);
  const observador = useRef<ResizeObserver | null>(null);
  /** true una vez que ya se encuadró con la ubicación: no reencuadrar
   *  después, o le movés el mapa al usuario mientras lo está mirando. */
  const encuadrado = useRef(false);
  /* onElegir se redefine en cada render del padre. Si fuera dependencia
     del efecto, el mapa se destruiría y recrearía a cada tecla del
     formulario. Va por ref y el handler lee siempre el último. */
  const elegir = useRef(onElegir);
  useEffect(() => {
    elegir.current = onElegir;
  });

  // ---------- 1. crear el mapa, una sola vez ----------
  useEffect(() => {
    if (!div.current || mapa.current) return;
    let vivo = true;
    // Tomado acá: en el cleanup el ref puede apuntar a otro Map.
    const marcadores = pines.current;

    (async () => {
      const L = (await import('leaflet')).default;
      if (!vivo || !div.current || mapa.current) return;

      const m = L.map(div.current, { zoomControl: true, attributionControl: true });
      // Vista provisoria: Leaflet no dibuja nada sin centro y los
      // efectos de abajo la corrigen apenas hay con qué.
      m.setView([0, 0], 2);
      mapa.current = m;

      L.tileLayer(SATELITE, { maxZoom: 19, attribution: ATRIBUCION }).addTo(m);
      L.tileLayer(NOMBRES, { maxZoom: 19 }).addTo(m);

      /* El contenedor arranca con alto 0 mientras el modal se abre y
         Leaflet mide mal: sin esto quedan tiles grises. El observer es
         más confiable que un setTimeout adivinado contra la animación.

         El guard de `vivo` no es paranoia: al desmontar, el contenedor
         cambia de tamaño y el observer dispara una vez más DESPUÉS de
         que el mapa se destruyó. Sin esto, Leaflet revienta con
         "Cannot read properties of undefined (reading '_leaflet_pos')". */
      const obs = new ResizeObserver(() => {
        if (!vivo || !mapa.current) return;
        mapa.current.invalidateSize();
      });
      obs.observe(div.current);
      observador.current = obs;
    })();

    return () => {
      vivo = false;
      observador.current?.disconnect();
      observador.current = null;
      mapa.current?.remove();
      mapa.current = null;
      marcadores.clear();
      yoPin.current = null;
    };
  }, []);

  // ---------- 2. dibujar los pines cada vez que cambia la lista ----------
  useEffect(() => {
    let vivo = true;
    (async () => {
      const L = (await import('leaflet')).default;
      const m = mapa.current;
      if (!vivo || !m) return;

      const marcadores = pines.current;
      const icono = (elegida: boolean) =>
        L.divIcon({
          className: 'pinCanchaWrap',
          html: pinHTML(elegida),
          iconSize: [22, 22],
          iconAnchor: [11, 22],
        });

      // Sacar los que ya no están en la lista.
      const vigentes = new Set(canchas.map((c) => c.id));
      for (const [id, marca] of marcadores) {
        if (!vigentes.has(id)) {
          marca.remove();
          marcadores.delete(id);
        }
      }

      for (const c of canchas) {
        if (marcadores.has(c.id)) continue;
        const marca = L.marker([c.lat, c.lng], {
          title: c.nombre,
          alt: c.nombre,
          keyboard: true,
          icon: icono(false),
        })
          .addTo(m)
          .bindTooltip(c.nombre, { direction: 'top', offset: [0, -20] })
          .on('click', () => elegir.current(c));
        marcadores.set(c.id, marca);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [canchas]);

  // ---------- 3. encuadrar ----------
  useEffect(() => {
    let vivo = true;
    (async () => {
      const L = (await import('leaflet')).default;
      const m = mapa.current;
      if (!vivo || !m || canchas.length === 0) return;

      const puntos: [number, number][] = canchas.map((c) => [c.lat, c.lng]);

      if (centro) {
        // Ya sabemos dónde está: se encuadra su ciudad, no el país.
        if (encuadrado.current) return;
        encuadrado.current = true;

        if (!yoPin.current) {
          yoPin.current = L.marker([centro.lat, centro.lng], {
            title: 'Estás acá',
            alt: 'Estás acá',
            icon: L.divIcon({
              className: 'pinCanchaWrap',
              html: '<span class="pinYo"></span>',
              iconSize: [14, 14],
              iconAnchor: [7, 7],
            }),
          }).addTo(m);
        }
        puntos.push([centro.lat, centro.lng]);
        m.fitBounds(L.latLngBounds(puntos), { padding: [34, 34], maxZoom: ZOOM_CIUDAD });
        return;
      }

      // Todavía sin ubicación (o la negó): todas las canchas en pantalla.
      if (encuadrado.current) return;
      m.fitBounds(L.latLngBounds(puntos), { padding: [34, 34], maxZoom: 15 });
    })();
    return () => {
      vivo = false;
    };
  }, [canchas, centro]);

  // ---------- 4. repintar el elegido ----------
  useEffect(() => {
    let vivo = true;
    (async () => {
      const L = (await import('leaflet')).default;
      if (!vivo) return;
      for (const [id, marca] of pines.current) {
        const es = id === elegidaId;
        marca.setIcon(
          L.divIcon({
            className: 'pinCanchaWrap',
            html: pinHTML(es),
            iconSize: [22, 22],
            iconAnchor: [11, 22],
          }),
        );
        marca.setZIndexOffset(es ? 500 : 0);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [elegidaId, canchas]);

  // ---------- 5. acercarse a la elegida desde la lista ----------
  useEffect(() => {
    if (!elegidaId || !mapa.current) return;
    const c = canchas.find((x) => x.id === elegidaId);
    if (c) mapa.current.panTo([c.lat, c.lng], { animate: true });
  }, [elegidaId, canchas]);

  if (canchas.length === 0) return null;

  return <div className="mapaCanchas" ref={div} role="application" aria-label="Mapa de canchas" />;
}
