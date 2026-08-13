/* ============================================================
   "Cómo llegar".

   No dibujamos el camino nosotros: le pasamos las coordenadas al
   Maps del celular, que ya sabe hacerlo y encima tiene el tráfico.
   La URL universal de Google Maps es la que funciona en los dos
   lados — en Android abre la app, en iPhone abre la app si está y
   si no cae en el navegador. El esquema `geo:` es más limpio pero
   iOS directamente no lo entiende.

   Que esto apunte a Google no contradice usar tiles de Esri en el
   mapa propio: acá no hay API key, es un link.
   ============================================================ */

export function comoLlegar(lat: number, lng: number): string {
  const u = new URLSearchParams({ api: '1', destination: `${lat},${lng}` });
  return `https://www.google.com/maps/dir/?${u.toString()}`;
}

/** Coordenadas legibles, por si alguien las quiere copiar a mano. */
export const coordenadas = (lat: number, lng: number) =>
  `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

/* ------------------------------------------------------------
   Distancia en km (haversine). Alcanza y sobra: acá se usa para
   ordenar canchas de una misma ciudad, no para navegar.
   ------------------------------------------------------------ */

const RADIO_TIERRA_KM = 6371;
const aRad = (g: number) => (g * Math.PI) / 180;

export function distanciaKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const dLat = aRad(bLat - aLat);
  const dLng = aRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRad(aLat)) * Math.cos(aRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(s));
}

/** Hasta acá se considera "tu ciudad". Bahía Blanca entra holgada, y
 *  Punta Alta (a ~23 km) queda adentro a propósito: para alguien de
 *  Bahía esa cancha es una opción real. */
export const RADIO_CIUDAD_KM = 40;

/** Dónde arranca el mapa mientras no se sepa dónde estás: el centro de
 *  Bahía Blanca (Plaza Rivadavia). Es la ciudad de todo el catálogo menos
 *  la cancha de Punta Alta, y encuadrar el catálogo entero dejaba el mapa
 *  mirando la región desde 20 km de altura por esa sola cancha. */
export const BAHIA_BLANCA = { lat: -38.7183, lng: -62.2663 };

/** Hasta acá se considera "dentro de la ciudad" para encuadrar el mapa.
 *  Más corto que RADIO_CIUDAD_KM a propósito: para la lista, la cancha de
 *  Punta Alta es una opción real y tiene que aparecer; para el encuadre
 *  inicial, meterla adentro obliga a mirar la región entera. */
export const RADIO_ENCUADRE_KM = 15;

/** Dónde te queda el mapa. `punto` es tu posición si la diste. */
export type Encuadre =
  | { tipo: 'cerca'; lat: number; lng: number }
  | { tipo: 'todas' };

/** Pide la ubicación sin bloquear: el mapa se dibuja igual y se
 *  recentra si llega. Si el usuario dice que no, no se insiste. */
export function ubicacion(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolver) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolver({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolver(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  });
}
