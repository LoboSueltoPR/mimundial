import { NextResponse, type NextRequest } from 'next/server';
import { crearClienteServidor } from '@/lib/supabase/server';

/** Vuelta de Google o del link por mail: canjea el code por una sesion. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const errorDescripcion = searchParams.get('error_description');

  // Solo rutas internas: un `next` absoluto convertiria esta ruta en un
  // redirector abierto hacia cualquier dominio.
  const pedido = searchParams.get('next');
  const destino = pedido && pedido.startsWith('/') && !pedido.startsWith('//') ? pedido : '/camino';

  if (errorDescripcion) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorDescripcion)}`);
  }

  if (code) {
    const supabase = await crearClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${destino}`);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${origin}/login`);
}
