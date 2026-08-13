'use client';

/* ============================================================
   El mapa de canchas, en el taller de estilo.

   Vive acá porque `/estilo` es público y el mapa real está detrás
   del login: sin esto, la única forma de mirar los pines, el
   encuadre y cómo cae la foto satelital entre el papel de la
   planilla es iniciar sesión y crear un partido.

   Las canchas van a mano, con las coordenadas del relevamiento,
   para no depender de la base — igual que el resto del taller,
   que se dibuja con datos puestos a dedo.
   ============================================================ */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { Cancha } from '@/lib/tipos';
import { comoLlegar } from '@/lib/mapa';

const MapaCanchas = dynamic(() => import('@/components/MapaCanchas'), {
  ssr: false,
  loading: () => <div className="mapaCanchas mapaCanchas-cargando">Cargando el mapa…</div>,
});

const c = (id: string, nombre: string, lat: number, lng: number): Cancha => ({
  id,
  nombre,
  direccion: null,
  lat,
  lng,
  notas: null,
});

const CANCHAS: Cancha[] = [
  c('1', 'ITLP Sintético', -38.726601, -62.2853122),
  c('2', 'Sintético Club Libertad', -38.7524781, -62.2650653),
  c('3', 'Sintético Villa Mitre', -38.7399931, -62.252494),
  c('4', 'Mundial FC', -38.7215709, -62.2843832),
  c('5', 'La Cantera', -38.688919, -62.274289),
  c('6', 'Futbol Club', -38.6827059, -62.2234736),
  c('7', 'Cancha', -38.7185707, -62.2899589),
];

/** El centro de Bahía, para ver el encuadre "tu ciudad" sin tener que
 *  darle permiso de ubicación al navegador. */
const BAHIA = { lat: -38.7196, lng: -62.2724 };

export default function TallerMapa() {
  const [elegida, setElegida] = useState<string | null>(null);
  const [conUbicacion, setConUbicacion] = useState(false);

  return (
    <div className="wrap" style={{ paddingTop: 18 }}>
      <div className="sec">El mapa de canchas</div>

      <div className="campo">
        <div className="campo-cab">
          <label>Dónde</label>
          <button type="button" className="linkbtn" onClick={() => setConUbicacion((v) => !v)}>
            {conUbicacion ? 'Ver sin ubicación' : 'Ver como si diera la ubicación'}
          </button>
        </div>

        <MapaCanchas
          key={conUbicacion ? 'con' : 'sin'}
          canchas={CANCHAS}
          centro={conUbicacion ? BAHIA : null}
          elegidaId={elegida}
          onElegir={(x) => setElegida((v) => (v === x.id ? null : x.id))}
        />

        <div className="canchaLista" role="listbox" aria-label="Canchas">
          {CANCHAS.map((x) => (
            <button
              type="button"
              key={x.id}
              role="option"
              aria-selected={elegida === x.id}
              className={`canchaChip ${elegida === x.id ? 'elegida' : ''}`}
              onClick={() => setElegida((v) => (v === x.id ? null : x.id))}
            >
              {x.nombre}
            </button>
          ))}
        </div>
      </div>

      <div className="sec" style={{ marginTop: 18 }}>
        El botón de la invitación
      </div>
      <div className="card" style={{ padding: 14 }}>
        <a
          className="comoLlegar"
          href={comoLlegar(BAHIA.lat, BAHIA.lng)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Cómo llegar
        </a>
        <div className="inv-notas">Portón azul, timbre 2</div>
      </div>

      <div className="nota">
        Datos a mano: el mapa real está detrás del login. Las coordenadas son las del
        relevamiento.
      </div>
    </div>
  );
}
