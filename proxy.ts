import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// '/p' es la invitación: entra cualquiera, sin cuenta.
// '/estilo' es el taller de estilo: muestra el sistema visual con datos
// inventados, sin tocar la base. Es público a propósito, para poder
// revisar el diseño desde el celular sin iniciar sesión. No hay ningún
// link hacia él desde la app.
const PUBLICAS = ['/login', '/auth', '/p/', '/estilo'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Sin credenciales configuradas no bloqueamos nada: la pantalla de login
  // explica que falta el .env.local en vez de tirar un error crudo.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Refresca el token si hace falta. No sacar: mantiene viva la sesion.
  // (En Next 16 esto va en proxy.ts, no en middleware.ts.)
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const esPublica = PUBLICAS.some((p) => path.startsWith(p));

  if (!user && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // para volver a donde querías ir despues de entrar
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }

  if (user && path === '/login') {
    const next = request.nextUrl.searchParams.get('next');
    // Solo rutas internas: un `next` absoluto seria un redirector abierto.
    const destino = next && next.startsWith('/') && !next.startsWith('//') ? next : '/camino';
    const url = request.nextUrl.clone();
    url.search = '';
    url.pathname = destino;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
