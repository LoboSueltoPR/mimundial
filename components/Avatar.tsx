import { color, iniciales } from '@/lib/calculos';

/** El círculo de siempre (color + iniciales), pero con foto si hay una. */
export default function Avatar({
  nombre,
  url,
  tam = 29,
  className = '',
}: {
  nombre: string;
  url?: string | null;
  tam?: number;
  className?: string;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className={`av ${className}`}
        style={{ width: tam, height: tam, objectFit: 'cover' }}
      />
    );
  }
  return (
    <span className={`av ${className}`} style={{ background: color(nombre), width: tam, height: tam }}>
      {iniciales(nombre)}
    </span>
  );
}
