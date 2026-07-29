import { describe, it, expect } from 'vitest';
import { canManageMember, allowedRolesToAssign } from './team-helpers';

/**
 * R6 — La mitad silenciosa del fix.
 *
 * Al `DIRECTOR_TECNICO` se le dieron permisos **operativos del partido**
 * (presentar la lista, cargar el resultado). La decisión de producto excluye
 * explícitamente la **gestión del club**, y esa exclusión no se implementó con
 * código nuevo: se sostiene porque `team-helpers.ts` nunca lo contempló.
 *
 * Justamente por eso necesita un test. Un `||` agregado sin pensar en el
 * momento de "darle permisos al DT" cerraría el círculo entero sin que nada
 * fallara. Estas aserciones son la barrera contra ese cambio.
 */
describe('canManageMember — el DT no administra el plantel (R6)', () => {
  it('un DT no puede gestionar a nadie, ni siquiera a un JUGADOR', () => {
    expect(canManageMember('DIRECTOR_TECNICO', 'JUGADOR', false)).toBe(false);
    expect(canManageMember('DIRECTOR_TECNICO', 'DIRECTOR_TECNICO', false)).toBe(false);
    expect(canManageMember('DIRECTOR_TECNICO', 'SUBCAPITAN', false)).toBe(false);
    expect(canManageMember('DIRECTOR_TECNICO', 'CAPITAN', false)).toBe(false);
  });

  it('el DT sí sigue siendo gestionable por la conducción', () => {
    expect(canManageMember('CAPITAN', 'DIRECTOR_TECNICO', false)).toBe(true);
    expect(canManageMember('SUBCAPITAN', 'DIRECTOR_TECNICO', false)).toBe(true);
  });
});

describe('allowedRolesToAssign — el DT no reparte roles (R6)', () => {
  it('un DT no puede asignar ningún rol', () => {
    expect(allowedRolesToAssign('DIRECTOR_TECNICO')).toEqual([]);
  });

  // Ceder la capitanía es exclusivo del capitán (R5, vía grant_captain_role).
  it('sólo el capitán puede transferir la capitanía', () => {
    expect(allowedRolesToAssign('CAPITAN')).toContain('CAPITAN');
    expect(allowedRolesToAssign('SUBCAPITAN')).not.toContain('CAPITAN');
    expect(allowedRolesToAssign('JUGADOR')).toEqual([]);
  });
});
