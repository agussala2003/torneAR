import { describe, expect, it } from 'vitest';
import { userProfileSchema } from '@/lib/schemas/userSchema';

const dateField = userProfileSchema.shape.dateOfBirth;

/** `DD/MM/YYYY` de un día relativo a hoy. */
function dateOffsetByDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    d.getFullYear(),
  ].join('/');
}

describe('userProfileSchema.dateOfBirth', () => {
  it('acepta una fecha pasada', () => {
    expect(dateField.safeParse('18/12/1997').success).toBe(true);
  });

  it('acepta el día de hoy', () => {
    // El borde es "no futura", no "estrictamente anterior": alguien que carga su
    // fecha el mismo día tiene 0 años, no una fecha inválida.
    expect(dateField.safeParse(dateOffsetByDays(0)).success).toBe(true);
  });

  it('rechaza mañana', () => {
    expect(dateField.safeParse(dateOffsetByDays(1)).success).toBe(false);
  });

  it('rechaza una fecha futura lejana', () => {
    // El caso exacto de la auditoría E2E (módulo 1.2): entraba sin chistar.
    const result = dateField.safeParse('28/02/2027');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('La fecha de nacimiento no puede ser futura');
    }
  });

  it('sigue rechazando un día que no existe en el calendario', () => {
    // `new Date(1995, 1, 31)` no falla: desborda al 3 de marzo. Sin el
    // round-trip contra los getters, 31/02 pasaría.
    expect(dateField.safeParse('31/02/1995').success).toBe(false);
  });

  it('sigue rechazando un formato que no es DD/MM/YYYY', () => {
    expect(dateField.safeParse('1997-12-18').success).toBe(false);
    expect(dateField.safeParse('').success).toBe(false);
  });
});
