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
import { BAHIA_BLANCA, RADIO_ENCUADRE_KM, distanciaKm } from '@/lib/mapa';
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
  /** true una vez puesta la vista inicial de Bahía: tampoco se repite,
   *  o cada cambio de la lista te devuelve el mapa al centro. */
  const arranco = useRef(false);
  /** Cómo acomodar la vista, guardado para poder repetirlo. El encuadre
   *  se decide una vez, pero se vuelve a aplicar cuando el contenedor
   *  cambia de tamaño: el primer cálculo sale contra un div que todavía
   *  no terminó de abrirse, y el resultado son pines fuera de pantalla. */
  const acomodar = useRef<(() => void) | null>(null);
  /** El usuario ya movió el mapa a mano: a partir de ahí no se le toca. */
  const interactuo = useRef(false);
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
      // Leaflet no dibuja nada sin centro. Arranca ya en Bahía en vez de
      // en el mapamundi: si no, se ve el planeta entero un cuadro antes
      // de que el efecto de encuadre lo acomode.
      m.setView([BAHIA_BLANCA.lat, BAHIA_BLANCA.lng], ZOOM_CIUDAD);
      mapa.current = m;

      L.tileLayer(SATELITE, { maxZoom: 19, attribution: ATRIBUCION }).addTo(m);
      L.tileLayer(NOMBRES, { maxZoom: 19 }).addTo(m);

      /* Arrastrar o hacer zoom a mano congela el encuadre automático: de
         ahí en adelante el mapa es del usuario. Se escucha `dragstart` y
         la rueda, y no `zoomstart`, que lo disparan también los setView
         nuestros y nos dejaría sin reencuadre desde el primer cuadro. */
      const aMano = () => {
        interactuo.current = true;
      };
      m.on('dragstart', aMano);
      div.current.addEventListener('wheel', aMano, { passive: true });
      m.getContainer()
        .querySelector('.leaflet-control-zoom')
        ?.addEventListener('click', aMano);

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
        // Y con el tamaño ya bueno, se rehace el encuadre: el primero se
        // calculó contra un contenedor a medio abrir y dejaba las canchas
        // fuera de pantalla. Salvo que el usuario ya haya movido el mapa.
        if (!interactuo.current) acomodar.current?.();
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

      if (centro) {
        // Ya sabemos dónde está: su ciudad, no la región.
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
        acomodar.current = () => m.setView([centro.lat, centro.lng], ZOOM_CIUDAD);
        acomodar.current();
        return;
      }

      /* Todavía sin ubicación (o la negó): arranca en Bahía Blanca, con
         sus canchas encuadradas. Antes entraban todas, y como una está
         en Punta Alta el mapa abría mirando la región entera: las de
         Bahía quedaban amontonadas en cuatro pines del tamaño de un
         poroto. Se decide una sola vez — si después llega la ubicación,
         el bloque de arriba recentra, y si no, el mapa se queda donde el
         usuario lo haya dejado. */
      if (encuadrado.current || arranco.current) return;
      arranco.current = true;

      const enLaCiudad = canchas.filter(
        (c) =>
          distanciaKm(c.lat, c.lng, BAHIA_BLANCA.lat, BAHIA_BLANCA.lng) <=
          RADIO_ENCUADRE_KM,
      );
      acomodar.current =
        enLaCiudad.length === 0
          ? () => m.setView([BAHIA_BLANCA.lat, BAHIA_BLANCA.lng], ZOOM_CIUDAD)
          : () =>
              m.fitBounds(
                L.latLngBounds(enLaCiudad.map((c) => [c.lat, c.lng] as [number, number])),
                { padding: [34, 34], maxZoom: ZOOM_CIUDAD },
              );
      acomodar.current();
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
    if (!c) return;
    // Elegir una cancha también es mover el mapa a propósito: desde acá
    // un resize no puede devolverlo al encuadre de la ciudad.
    interactuo.current = true;
    mapa.current.panTo([c.lat, c.lng], { animate: true });
  }, [elegidaId, canchas]);

  if (canchas.length === 0) return null;

  return <div className="mapaCanchas" ref={div} role="application" aria-label="Mapa de canchas" />;
}
