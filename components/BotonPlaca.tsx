'use client';

import { useState } from 'react';
import type { PartidoPublico } from '@/lib/tipos';
import { compartirPlaca, generarPlaca, generarPlacaEquipos } from '@/lib/placa';

/**
 * Genera la placa y la manda por donde se pueda.
 *
 * Hay DOS placas y el botón elige sola cuál corresponde, porque en cada
 * momento lo que hay que mandar al grupo es otra cosa:
 *
 *   · falta gente  → la convocatoria: dónde, cuándo, cuántos faltan y el
 *                    link para anotarse. Sirve para conseguir gente.
 *   · ya está y hay equipos → los equipos. A esa altura el link ya no
 *                    convoca a nadie: lo que se pregunta es con quién juego.
 *
 * Los equipos salen del sorteo guardado, así que si el anfitrión los
 * acomodó a mano la placa sale con esos, no con el sorteo original.
 *
 * Nota sobre Instagram: no existe forma de postear a Instagram desde una
 * web. Lo único que hay es pasarle el archivo al menú de compartir del
 * celular y elegirlo ahí a mano. En compu la imagen se baja.
 */
export default function BotonPlaca({ p }: { p: PartidoPublico }) {
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* El link se lee al tocar, no en un efecto: `window` no existe en el
     render del servidor, y los dos botones corren siempre en el cliente. */
  const linkActual = () => window.location.href.split('?')[0];

  /* Con equipos sorteados la placa es la de equipos. No alcanza con que
     esté completo: si todavía no se sortearon no hay nada que mostrar. */
  const deEquipos = !!p.equipos && p.faltan === 0;

  const textoCon = (link: string) =>
    deEquipos
      ? `Equipos para${p.lugar ? ' ' + p.lugar : ''}${p.hora ? ' a las ' + p.hora : ''}. ${link}`
      : `Se juega${p.lugar ? ' en ' + p.lugar : ''}${p.hora ? ' a las ' + p.hora : ''}. ` +
        `${p.faltan === 1 ? 'Falta 1' : `Faltan ${p.faltan}`}. Anotate: ${link}`;

  function pasarTexto() {
    const link = linkActual();
    const texto = textoCon(link);
    if (navigator.share) {
      navigator.share({ title: 'MiMundial', text: texto, url: link }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
    }
  }

  /** Los nombres como se leen: el invitado no tiene nombre propio. */
  const nombres = (lado: 'a' | 'b') =>
    (p.equipos?.[lado] ?? []).map((c) => (c.inv ? 'Inv. de ' + (c.de ?? '') : c.label));

  async function pasarImagen() {
    setError(null);
    setAviso(null);
    setGenerando(true);
    const link = linkActual();
    try {
      const blob = deEquipos
        ? await generarPlacaEquipos({
            lugar: p.lugar,
            fecha: p.fecha,
            hora: p.hora,
            claros: nombres('a'),
            oscuros: nombres('b'),
            link,
          })
        : await generarPlaca({
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
          {generando ? 'Armando…' : deEquipos ? 'Placa de equipos' : 'Placa de invitación'}
        </button>
      </div>
      {aviso && <div className="msg info">{aviso}</div>}
      {error && <div className="msg err">{error}</div>}
      <div className="nota">
        {deEquipos ? (
          <>
            La <b>placa de equipos</b> es una imagen con el sorteo como está ahora. Si el anfitrión
            los mueve, armala de nuevo y sale con los cambios.
          </>
        ) : (
          <>
            La <b>placa de invitación</b> es una imagen lista para una historia o para tirar en el
            grupo. Ojo: lleva el link, así que cualquiera que la vea se puede anotar. Cuando se
            complete, este botón pasa a darte los equipos.
          </>
        )}
      </div>
    </>
  );
}
