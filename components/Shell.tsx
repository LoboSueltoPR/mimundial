'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Copita } from './Copa';
import {
  IconoAmigos,
  IconoCamino,
  IconoPartidos,
  IconoPerfil,
  IconoTabla,
} from './Iconos';

/**
 * En el celular esto se maneja como una app: barra abajo con las cuatro
 * secciones, y el perfil arriba a la derecha (donde vive "cerrar sesión").
 * De 640px para arriba la barra pasa a pestañas arriba, que en un monitor
 * ancho se lee mejor que una barra flotante abajo.
 */
const SECCIONES = [
  { href: '/camino', label: 'Camino', Icono: IconoCamino },
  { href: '/partidos', label: 'Partidos', Icono: IconoPartidos },
  { href: '/tabla', label: 'Tabla', Icono: IconoTabla },
  { href: '/amigos', label: 'Amigos', Icono: IconoAmigos },
];

export default function Shell({
  children,
  nombre,
}: {
  children: React.ReactNode;
  nombre: string;
}) {
  const path = usePathname();
  const activa = (href: string) => path === href || path.startsWith(href + '/');

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="hd">
            <Link href="/camino" className="brand">
              <div className="dot">
                <Copita tam={15} />
              </div>
              <h1>MiMundial</h1>
            </Link>

            <Link
              href="/perfil"
              className={`avatarBtn ${activa('/perfil') ? 'on' : ''}`}
              aria-label={`Tu perfil (${nombre})`}
              title={nombre}
            >
              <IconoPerfil />
            </Link>
          </div>

          {/* En escritorio la navegación vive acá arriba. */}
          <nav className="tabs escritorio">
            {SECCIONES.map((s) => (
              <Link key={s.href} href={s.href} className={activa(s.href) ? 'on' : ''}>
                {s.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="wrap">{children}</div>

      {/* En celular, abajo. */}
      <nav className="barraAbajo" aria-label="Secciones">
        {SECCIONES.map(({ href, label, Icono }) => (
          <Link key={href} href={href} className={activa(href) ? 'on' : ''}>
            <Icono />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
