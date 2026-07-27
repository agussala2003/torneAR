// tornear/lib/date-mask.ts

/**
 * Helpers de la fecha de nacimiento. El formulario trabaja en DD/MM/YYYY (lo
 * que valida userProfileSchema) y la base guarda ISO (YYYY-MM-DD).
 *
 * Viven en lib/ y no dentro del componente porque los necesitan dos capas: el
 * input aplica la mascara y la pantalla de edicion hidrata el defaultValue
 * desde profiles.date_of_birth.
 */

/** Inserta las barras mientras se tipea: 12 → 12/0 → 12/05 → 12/05/1990 */
export function applyDateMask(text: string): string {
  const digits = text.replace(/\D/g, '');
  if (digits.length > 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
  }
  if (digits.length > 2) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return digits;
}

/** ISO de la base (YYYY-MM-DD) → display del form (DD/MM/YYYY). */
export function toDisplayDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('T')[0].split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}
