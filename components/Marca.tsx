/**
 * El wordmark de MIMUNDIAL.
 *
 * Antes esto eran trazos plotteados a mano, letra por letra. Ninguna
 * curva dibujada a ojo le gana a una tipografía diseñada, así que ahora
 * usa Anton — la misma condensada de cartel de estadio que ya lleva el
 * resto de la app.
 *
 * La animación se conserva: cada letra se revela de izquierda a derecha,
 * escalonada, como si alguien la fuera escribiendo. Eso engancha con la
 * copa, que se traza en tiza justo después.
 */

const PALABRA = 'MIMUNDIAL';

export function MarcaTexto({
  tam = 'clamp(32px, 11vw, 50px)',
  estatica = false,
}: {
  tam?: string;
  estatica?: boolean;
}) {
  return (
    <div
      className={`marcaTexto ${estatica ? 'quieta' : ''}`}
      style={{ fontSize: tam }}
      role="img"
      aria-label="MiMundial"
    >
      {PALABRA.split('').map((letra, i) => (
        <span key={i} aria-hidden="true" style={{ animationDelay: `${i * 45}ms` }}>
          {letra}
        </span>
      ))}
    </div>
  );
}
