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

/**
 * `Date` → display del form (DD/MM/YYYY).
 *
 * Lee los componentes en hora LOCAL y no vía `toISOString()`: ese convierte a
 * UTC, y para cualquier fecha elegida en Argentina (UTC-3) devuelve el día
 * anterior. La fecha de nacimiento se corría un día sola al elegirla en el
 * calendario.
 */
export function fromDateToDisplay(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

/** Display del form (DD/MM/YYYY) → `Date` local, o `null` si no está completa. */
export function fromDisplayToDate(value: string): Date | null {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return null;
  const [dd, mm, yyyy] = value.split('/').map(Number);
  const date = new Date(yyyy, mm - 1, dd);
  const isReal =
    date.getFullYear() === yyyy && date.getMonth() === mm - 1 && date.getDate() === dd;
  return isReal ? date : null;
}
