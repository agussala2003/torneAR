import { describe, expect, it } from 'vitest';
import {
  buildDisputeScoreboard,
  formatScoreline,
  toCanonicalScoreline,
} from '@/lib/dispute-scores';

describe('toCanonicalScoreline', () => {
  it('deja la planilla del equipo A tal cual: ya está en orden A–B', () => {
    expect(toCanonicalScoreline({ goalsScored: 2, goalsAgainst: 0 }, 'A')).toEqual({
      goalsTeamA: 2,
      goalsTeamB: 0,
    });
  });

  it('da vuelta la planilla del equipo B — es el paso que la UI se salteaba', () => {
    // B dice "metí 2, me metieron 0" → en eje A–B eso es 0-2.
    expect(toCanonicalScoreline({ goalsScored: 2, goalsAgainst: 0 }, 'B')).toEqual({
      goalsTeamA: 0,
      goalsTeamB: 2,
    });
  });
});

describe('formatScoreline', () => {
  it('formatea el marcador', () => {
    expect(formatScoreline({ goalsTeamA: 3, goalsTeamB: 1 })).toBe('3 – 1');
  });

  it('marca con guion al equipo que no cargó', () => {
    expect(formatScoreline(null)).toBe('—');
  });
});

describe('buildDisputeScoreboard', () => {
  const teams = {
    teamAId: 'team-a',
    teamAName: 'Leones',
    teamBId: 'team-b',
    teamBName: 'Tigres',
  };

  it('pone las dos propuestas en el mismo eje A–B', () => {
    // El caso del enunciado: cada uno dice que ganó 2-0.
    const board = buildDisputeScoreboard({
      ...teams,
      scoreByTeamA: { goalsScored: 2, goalsAgainst: 0 },
      scoreByTeamB: { goalsScored: 2, goalsAgainst: 0 },
    });

    expect(board.teamA.scoreline).toEqual({ goalsTeamA: 2, goalsTeamB: 0 });
    expect(board.teamB.scoreline).toEqual({ goalsTeamA: 0, goalsTeamB: 2 });
    expect(board.claimsAgree).toBe(false);
    expect(board.hasMissingClaim).toBe(false);
  });

  it('detecta cuando las dos planillas coinciden', () => {
    // A dice 2-0 y B reconoce 0-2: el mismo partido, contado igual.
    const board = buildDisputeScoreboard({
      ...teams,
      scoreByTeamA: { goalsScored: 2, goalsAgainst: 0 },
      scoreByTeamB: { goalsScored: 0, goalsAgainst: 2 },
    });

    expect(board.claimsAgree).toBe(true);
  });

  it('señala al equipo que nunca cargó su planilla', () => {
    const board = buildDisputeScoreboard({
      ...teams,
      scoreByTeamA: { goalsScored: 1, goalsAgainst: 1 },
      scoreByTeamB: null,
    });

    expect(board.teamB.scoreline).toBeNull();
    expect(board.hasMissingClaim).toBe(true);
    // Sin las dos planillas no se puede afirmar que coincidan.
    expect(board.claimsAgree).toBe(false);
  });

  it('conserva nombres e ids para que la UI no tenga que re-mapear', () => {
    const board = buildDisputeScoreboard({
      ...teams,
      scoreByTeamA: null,
      scoreByTeamB: null,
    });

    expect(board.teamA).toMatchObject({ teamId: 'team-a', teamName: 'Leones' });
    expect(board.teamB).toMatchObject({ teamId: 'team-b', teamName: 'Tigres' });
  });
});
