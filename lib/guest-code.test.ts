import { describe, it, expect } from 'vitest';
import {
  GUEST_CODE_TTL_HOURS,
  getGuestCodeExpiry,
  getGuestJoinErrorMessage,
  isGuestCodeExpired,
} from './guest-code';

const HOUR = 60 * 60 * 1000;

describe('getGuestCodeExpiry', () => {
  // E7: el ancla es la hora del partido y no la creación del registro. Con TTL
  // desde `created_at`, un partido coordinado el lunes para el sábado llegaba a
  // la cancha con el código ya muerto — justo cuando se usa.
  it('cuenta el TTL desde scheduled_at cuando hay fecha pactada', () => {
    const scheduled = '2026-08-01T20:00:00.000Z';
    expect(getGuestCodeExpiry(scheduled, '2026-07-01T10:00:00.000Z')?.toISOString()).toBe(
      new Date(new Date(scheduled).getTime() + GUEST_CODE_TTL_HOURS * HOUR).toISOString(),
    );
  });

  // El partido que nunca se coordinó es el caso del "código eterno" de E7.
  it('cae en created_at cuando no hay fecha pactada', () => {
    const created = '2026-07-01T10:00:00.000Z';
    expect(getGuestCodeExpiry(null, created)?.toISOString()).toBe(
      new Date(new Date(created).getTime() + GUEST_CODE_TTL_HOURS * HOUR).toISOString(),
    );
  });

  it('devuelve null sin ninguna fecha con la que calcular', () => {
    expect(getGuestCodeExpiry(null, null)).toBeNull();
    expect(getGuestCodeExpiry(undefined)).toBeNull();
  });

  it('devuelve null ante una fecha ilegible en vez de un Invalid Date', () => {
    expect(getGuestCodeExpiry('no-es-una-fecha')).toBeNull();
  });
});

describe('isGuestCodeExpired', () => {
  it('vence pasadas las 48 h del horario del partido', () => {
    const scheduled = '2026-08-01T20:00:00.000Z';
    const justAfter = new Date(new Date(scheduled).getTime() + (GUEST_CODE_TTL_HOURS + 1) * HOUR);
    expect(isGuestCodeExpired(scheduled, null, justAfter)).toBe(true);
  });

  it('sigue vivo dentro de la ventana', () => {
    const scheduled = '2026-08-01T20:00:00.000Z';
    const justBefore = new Date(new Date(scheduled).getTime() + (GUEST_CODE_TTL_HOURS - 1) * HOUR);
    expect(isGuestCodeExpired(scheduled, null, justBefore)).toBe(false);
  });

  it('sigue vivo antes del partido, por lejos que esté', () => {
    expect(isGuestCodeExpired('2099-01-01T20:00:00.000Z', null, new Date('2026-07-29'))).toBe(false);
  });

  // Sin ancla la decisión es del servidor: adivinar "vencido" acá le bloquearía
  // la pantalla al usuario por un dato que el cliente no tiene.
  it('no da por vencido lo que no puede calcular', () => {
    expect(isGuestCodeExpired(null, null, new Date('2099-01-01'))).toBe(false);
  });
});

describe('getGuestJoinErrorMessage', () => {
  // Razón de existir del traductor: getGenericSupabaseErrorMessage descarta el
  // `message` y el usuario leía "No se pudo completar la operación" — sin el
  // único dato que le permite pedir otro código.
  it('traduce GUEST_CODE_EXPIRED a un mensaje accionable', () => {
    const message = getGuestJoinErrorMessage({
      message: 'GUEST_CODE_EXPIRED: el código de este partido venció el 01/08/2026 20:00.',
    });
    expect(message).toContain('venció');
    expect(message).not.toContain('GUEST_CODE_EXPIRED');
  });

  it('delega el resto en el traductor genérico', () => {
    expect(getGuestJoinErrorMessage({ message: 'row-level security policy' })).toBe(
      'No tienes permisos para realizar esta accion.',
    );
  });
});
