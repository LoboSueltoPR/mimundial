/**
 * "Alejo Lobos" + apodo "Lobo" -> Alejo "Lobo" Lobos. El nombre de cuenta
 * viene de Google tal cual y no se puede tocar; el apodo es lo único
 * editable, así que se inserta entre la primera palabra y el resto. Si
 * el nombre es una sola palabra, el apodo va después.
 */
export function conApodo(nombre: string, apodo?: string | null): string {
  const a = apodo?.trim();
  if (!a) return nombre;
  const partes = nombre.trim().split(/\s+/);
  if (partes.length < 2) return `${nombre} "${a}"`;
  return `${partes[0]} "${a}" ${partes.slice(1).join(' ')}`;
}
