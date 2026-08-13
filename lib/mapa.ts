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
