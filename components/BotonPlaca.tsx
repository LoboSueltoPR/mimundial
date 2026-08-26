'use client';

import { useState } from 'react';
import type { PartidoPublico } from '@/lib/tipos';
import { compartirPlaca, generarPlaca } from '@/lib/placa';

/**
 * Genera la convocatoria como imagen y la manda por donde se pueda.
 *
 * Hay dos botones y no uno porque hacen cosas distintas: la imagen es
 * para una historia o para que se vea en el chat sin abrir nada; el
 * texto con el link es para pegar en el grupo. El de siempre (texto)
 * queda primero: es el que se usa todos los miércoles.
 *
 * Nota sobre Instagram: no existe forma de postear a Instagram desde
 * una web. Lo único que hay es pasarle el archivo al menú de compartir
 * del celular y elegirlo ahí a mano. En compu la imagen se baja.
 */
export default function BotonPlaca({ p }: { p: PartidoPublico }) {
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* El link se lee al tocar, no en un efecto: `window` no existe en el
     render del servidor, y los dos botones corren siempre en el cliente.
     Guardarlo en estado obligaba a un setState dentro de useEffect, que
     es un render de más por nada. */
  const linkActual = () => window.location.href.split('?')[0];

  const textoCon = (link: string) =>
    `Se juega${p.lugar ? ' en ' + p.lugar : ''}${p.hora ? ' a las ' + p.hora : ''}. ` +
    `${p.faltan === 0 ? 'Está completo' : p.faltan === 1 ? 'Falta 1' : `Faltan ${p.faltan}`}. ` +
    `Anotate: ${link}`;

  function pasarTexto() {
    const link = linkActual();
    const texto = textoCon(link);
    if (navigator.share) {
      navigator.share({ title: 'MiMundial', text: texto, url: link }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
    }
  }

  async function pasarImagen() {
    setError(null);
    setAviso(null);
    setGenerando(true);
    const link = linkActual();
    try {
      const blob = await generarPlaca({
        anfitrion: p.anfitrion,
        lugar: p.lugar,
        fecha: p.fecha,
        hora: p.hora,
        cabezas: p.cabezas,
        cupo: p.cupo,
        faltan: p.faltan,
        link,
      });
      const como = await compartirPlaca(blob, textoCon(link));
      if (como === 'bajada') setAviso('La imagen se bajó: subila donde quieras.');
    } catch (e) {
      setError((e as Error)?.message || 'No se pudo generar la imagen.');
    } finally {
      setGenerando(false);
    }
  }

  return (
    <>
      <div className="row2">
        <button className="btn pri" onClick={pasarTexto}>
          Pasar el link
        </button>
        <button className="btn" onClick={pasarImagen} disabled={generando}>
          {generando ? 'Armando…' : 'Armar la placa'}
        </button>
      </div>
      {aviso && <div className="msg info">{aviso}</div>}
      {error && <div className="msg err">{error}</div>}
      <div className="nota">
        La <b>placa</b> es una imagen lista para una historia de Instagram o para tirar en el grupo.
        Ojo: lleva el link, así que cualquiera que la vea se puede anotar. Si no querés eso, cerrá
        las anotaciones cuando estén los que tienen que estar.
      </div>
    </>
  );
}
