'use client';

import { useEffect, useState } from 'react';

/**
 * El link para mandar por WhatsApp, con copiar de respaldo.
 *
 * Vive aparte porque desde los desafíos hay más de uno por partido:
 * el anfitrión comparte el de su equipo y el capitán rival el del
 * suyo. El `id` del input tiene que ser único por eso mismo — con dos
 * en la misma pantalla, el respaldo de "seleccionar el texto" cuando
 * el portapapeles falla agarraría siempre el primero.
 */
export default function CompartirLink({
  token,
  texto,
  id = 'linkInv',
}: {
  token: string;
  /** Lo que va en el mensaje, sin el link: se le agrega al final. */
  texto: string;
  id?: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const [link, setLink] = useState('');

  // El origin no existe en el servidor, así que el link se arma al montar.
  useEffect(() => {
    setLink(`${window.location.origin}/p/${token}`);
  }, [token]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Safari/iOS sin permiso: al menos lo dejamos seleccionable
      const i = document.getElementById(id) as HTMLInputElement | null;
      i?.select();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  function compartir() {
    const msg = `${texto} ${link}`;
    if (navigator.share) {
      navigator.share({ title: 'MiMundial', text: msg, url: link }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    }
  }

  return (
    <div className="card" style={{ padding: 14 }}>
      <input id={id} readOnly value={link} onFocus={(e) => e.target.select()} />
      <div className="row2" style={{ marginTop: 10 }}>
        <button className="btn pri" onClick={compartir}>
          Compartir
        </button>
        <button className="btn" onClick={copiar}>
          {copiado ? '¡Copiado!' : 'Copiar link'}
        </button>
      </div>
    </div>
  );
}
