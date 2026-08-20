import { describe, it, expect } from 'vitest';
import { deriveMatchOutcome } from './match-share-outcome';
import type { MatchShareCardData } from '@/components/match-share/types';

type MatchLike = Pick<MatchShareCardData, 'teamA' | 'teamB' | 'scoreA' | 'scoreB'>;

const teamA: MatchLike['teamA'] = { id: 'team-a', name: 'Equipo A', shieldUrl: null, eloRating: 1200 };
const teamB: MatchLike['teamB'] = { id: 'team-b', name: 'Equipo B', shieldUrl: null, eloRating: 1200 };

function data(scoreA: number | null, scoreB: number | null): MatchLike {
  return { teamA, teamB, scoreA, scoreB };
}

describe('deriveMatchOutcome', () => {
  it('devuelve WIN cuando mi equipo (teamA) anotó más', () => {
    expect(deriveMatchOutcome(data(3, 1), teamA.id)).toBe('WIN');
  });

  it('devuelve LOSS cuando mi equipo (teamA) anotó menos', () => {
    expect(deriveMatchOutcome(data(0, 2), teamA.id)).toBe('LOSS');
  });

  it('devuelve DRAW con marcador igual', () => {
    expect(deriveMatchOutcome(data(2, 2), teamA.id)).toBe('DRAW');
  });

  it('invierte WIN/LOSS según quién sea "mi equipo" para el mismo partido', () => {
    // Mismo resultado (3-1), perspectivas opuestas: es el caso que justifica
    // que `outcome` no pueda derivarse sólo de scoreA/scoreB sin myTeamId.
    const match = data(3, 1);
    expect(deriveMatchOutcome(match, teamA.id)).toBe('WIN');
    expect(deriveMatchOutcome(match, teamB.id)).toBe('LOSS');
  });

  it('devuelve DRAW si mi resultado todavía no se cargó (scoreA null)', () => {
    expect(deriveMatchOutcome(data(null, 1), teamA.id)).toBe('DRAW');
  });

  it('devuelve DRAW si el resultado del rival todavía no se cargó (scoreB null)', () => {
    expect(deriveMatchOutcome(data(2, null), teamA.id)).toBe('DRAW');
  });

  it('devuelve DRAW si ningún resultado se cargó todavía', () => {
    expect(deriveMatchOutcome(data(null, null), teamA.id)).toBe('DRAW');
  });
});
