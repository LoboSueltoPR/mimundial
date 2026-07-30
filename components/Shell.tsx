'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { crearCliente } from '@/lib/supabase/client';

const TABS = [
  { href: '/camino', label: 'Camino' },
  { href: '/partidos', label: 'Partidos' },
  { href: '/stats', label: 'Stats' },
  { href: '/cuentas', label: 'Cuentas' },
  { href: '/perfil', label: 'Perfil' },
];

export default function Shell({
  children,
  nombre,
}: {
  children: React.ReactNode;
  nombre: string;
}) {
  const path = usePathname();
  const router = useRouter();

  async function salir() {
    const supabase = crearCliente();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="hd">
            <Link href="/partidos" className="brand">
              <div className="dot">MM</div>
              <div>
                <h1>MiMundial</h1>
                <small>{nombre}</small>
              </div>
            </Link>
            <button className="btn sm" onClick={salir}>
              Salir
            </button>
          </div>
          <nav className="tabs">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={path === t.href || path.startsWith(t.href + '/') ? 'on' : ''}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <div className="wrap">{children}</div>
    </>
  );
}
