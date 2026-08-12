/**
 * Achica cualquier foto a un cuadrado chico y la devuelve como data URI
 * (JPEG en base64), lista para guardar directo en perfiles.avatar_url.
 * Sin Supabase Storage: el avatar se ve en chiquito y de tanto en tanto,
 * así que unos KB en la misma columna de texto alcanzan y sobran.
 */
export function archivoAAvatar(archivo: File, lado = 160, calidad = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!archivo.type.startsWith('image/')) {
      reject(new Error('Eso no es una imagen.'));
      return;
    }

    const lector = new FileReader();
    lector.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      img.onload = () => {
        const recorte = Math.min(img.width, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = lado;
        canvas.height = lado;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo procesar la imagen.'));
          return;
        }
        // recorte centrado a cuadrado antes de achicar, para no deformarla
        const ox = (img.width - recorte) / 2;
        const oy = (img.height - recorte) / 2;
        ctx.drawImage(img, ox, oy, recorte, recorte, 0, 0, lado, lado);
        resolve(canvas.toDataURL('image/jpeg', calidad));
      };
      img.src = lector.result as string;
    };
    lector.readAsDataURL(archivo);
  });
}
