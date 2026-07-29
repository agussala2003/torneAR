import { describe, it, expect } from 'vitest';
import {
  isTeamMatchAdmin,
  isTeamMatchStaff,
  canLoadResult,
  canLoadResultFromDetail,
  canLoadResultFromCard,
} from './match-permissions';
import type { MatchCardEntry, MatchDetailViewData } from '@/components/matches/types';

// Fixtures mínimas: sólo los campos que la regla mira. El resto se completa con
// el `as` porque estas funciones son puras y no tocan nada más.

function detail(overrides: Partial<MatchDetailViewData>): MatchDetailViewData {
  return {
    status: 'EN_VIVO',
    myResult: null,
    isResultLoader: false,
    myRole: 'JUGADOR',
    ...overrides,
  } as MatchDetailViewData;
}

function card(overrides: Partial<MatchCardEntry>): MatchCardEntry {
  return {
    status: 'EN_VIVO',
    teamA: { id: 'team-a' },
    teamB: { id: 'team-b' },
    resultTeamA: null,
    resultTeamB: null,
    ...overrides,
  } as MatchCardEntry;
}

const SUBMITTED = { teamId: 'team-a' } as MatchDetailViewData['myResult'];

describe('isTeamMatchAdmin', () => {
  it('sólo CAPITAN y SUBCAPITAN', () => {
    expect(isTeamMatchAdmin('CAPITAN')).toBe(true);
    expect(isTeamMatchAdmin('SUBCAPITAN')).toBe(true);
    expect(isTeamMatchAdmin('JUGADOR')).toBe(false);
    expect(isTeamMatchAdmin(null)).toBe(false);
    expect(isTeamMatchAdmin(undefined)).toBe(false);
  });

  // R6: el DT recibió permisos operativos, NO de conducción. Coordinar el
  // partido —proponer, confirmar, cancelar— sigue siendo del capitán. Este es
  // el test que impide que "darle permisos al DT" se convierta en dárselos
  // todos de un `||` mal puesto.
  it('NO incluye al DIRECTOR_TECNICO: coordinar compromete al club', () => {
    expect(isTeamMatchAdmin('DIRECTOR_TECNICO')).toBe(false);
  });
});

describe('isTeamMatchStaff — R6', () => {
  it('incluye al DIRECTOR_TECNICO junto al capitán y el subcapitán', () => {
    expect(isTeamMatchStaff('CAPITAN')).toBe(true);
    expect(isTeamMatchStaff('SUBCAPITAN')).toBe(true);
    expect(isTeamMatchStaff('DIRECTOR_TECNICO')).toBe(true);
  });

  it('deja afuera al jugador y a los valores fuera del enum', () => {
    expect(isTeamMatchStaff('JUGADOR')).toBe(false);
    expect(isTeamMatchStaff('director_tecnico')).toBe(false);
    expect(isTeamMatchStaff(null)).toBe(false);
    expect(isTeamMatchStaff(undefined)).toBe(false);
  });
});

describe('canLoadResult', () => {
  it('exige EN_VIVO', () => {
    for (const status of ['CONFIRMADO', 'FINALIZADO', 'EN_DISPUTA', 'CANCELADO'] as const) {
      expect(
        canLoadResult({ status, hasMyResult: false, isResultLoader: true, isStaff: true }),
      ).toBe(false);
    }
  });

  it('se cierra apenas mi equipo cargó', () => {
    expect(
      canLoadResult({ status: 'EN_VIVO', hasMyResult: true, isResultLoader: true, isStaff: true }),
    ).toBe(false);
  });

  it('habilita al result-loader aunque no sea staff, y al staff aunque no sea loader', () => {
    expect(
      canLoadResult({ status: 'EN_VIVO', hasMyResult: false, isResultLoader: true, isStaff: false }),
    ).toBe(true);
    expect(
      canLoadResult({ status: 'EN_VIVO', hasMyResult: false, isResultLoader: false, isStaff: true }),
    ).toBe(true);
  });

  it('niega al jugador que no hizo check-in', () => {
    expect(
      canLoadResult({ status: 'EN_VIVO', hasMyResult: false, isResultLoader: false, isStaff: false }),
    ).toBe(false);
  });
});

describe('canLoadResultFromDetail — D10', () => {
  // El caso exacto del hallazgo: el capitán veía "Finalizar Partido" pero no
  // "Cargar resultado" dentro de ResultSection, en la misma pantalla.
  it('el capitán sin check-in puede cargar', () => {
    expect(canLoadResultFromDetail(detail({ myRole: 'CAPITAN', isResultLoader: false }))).toBe(true);
  });

  it('el jugador con check-in puede cargar', () => {
    expect(canLoadResultFromDetail(detail({ myRole: 'JUGADOR', isResultLoader: true }))).toBe(true);
  });

  it('nadie puede recargar un resultado ya enviado', () => {
    expect(
      canLoadResultFromDetail(detail({ myRole: 'CAPITAN', isResultLoader: true, myResult: SUBMITTED })),
    ).toBe(false);
  });

  // R6 — el caso que el hallazgo describía como "un JUGADOR con otra etiqueta":
  // el DT dirige desde el banco y no podía ni anotar el resultado.
  it('el DT sin check-in ahora puede cargar el resultado', () => {
    expect(
      canLoadResultFromDetail(detail({ myRole: 'DIRECTOR_TECNICO', isResultLoader: false })),
    ).toBe(true);
  });

  it('el DT tampoco escapa de las otras dos condiciones', () => {
    expect(
      canLoadResultFromDetail(detail({ myRole: 'DIRECTOR_TECNICO', status: 'CONFIRMADO' })),
    ).toBe(false);
    expect(
      canLoadResultFromDetail(detail({ myRole: 'DIRECTOR_TECNICO', myResult: SUBMITTED })),
    ).toBe(false);
  });
});

describe('canLoadResultFromCard — D10', () => {
  it('ofrece el atajo al admin mientras su equipo no cargó', () => {
    expect(canLoadResultFromCard(card({}), 'team-a', true)).toBe(true);
  });

  // El otro síntoma del hallazgo: la tarjeta seguía ofreciendo "Cargar
  // resultado" después de que mi equipo lo cargara.
  it('se cierra cuando MI equipo ya cargó', () => {
    expect(canLoadResultFromCard(card({ resultTeamA: 3 }), 'team-a', true)).toBe(false);
  });

  it('el resultado del RIVAL no bloquea el mío', () => {
    expect(canLoadResultFromCard(card({ resultTeamB: 1 }), 'team-a', true)).toBe(true);
  });

  it('resuelve mi lado correctamente cuando soy el equipo B', () => {
    expect(canLoadResultFromCard(card({ resultTeamB: 2 }), 'team-b', true)).toBe(false);
    expect(canLoadResultFromCard(card({ resultTeamA: 2 }), 'team-b', true)).toBe(true);
  });

  it('sin rol de gestión no hay atajo: la lista no conoce el is_result_loader', () => {
    expect(canLoadResultFromCard(card({}), 'team-a', false)).toBe(false);
  });

  it('fuera de EN_VIVO nunca', () => {
    expect(canLoadResultFromCard(card({ status: 'CONFIRMADO' }), 'team-a', true)).toBe(false);
  });
});
