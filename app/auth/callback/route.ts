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
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // La foto no se sube a mano: siempre es la de Google, así que en
      // cada login se resincroniza acá — cubre tanto que la hayan
      // cambiado en Google como cualquier avatar viejo que hubiera
      // quedado de la época en que sí se podía subir una propia.
      const avatarGoogle = data.user?.user_metadata?.avatar_url as string | undefined;
      if (data.user && avatarGoogle) {
        await supabase.from('perfiles').update({ avatar_url: avatarGoogle }).eq('id', data.user.id);
      }
      return NextResponse.redirect(`${origin}${destino}`);
    }
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${origin}/login`);
}
