import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQueryBuilder } from './test-utils/supabase-mock';
import { pickMyTeamId, resolveMyTeamIdForMatch } from './match-detail-data';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

const MATCH = { teamAId: 'team-a', teamBId: 'team-b' };

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── R9: qué equipo soy YO en ESTE partido ───────────────────────────────────

describe('pickMyTeamId', () => {
  it('respeta el myTeamId de los params cuando es uno de los dos equipos', () => {
    expect(pickMyTeamId({ ...MATCH, myTeamIds: ['team-a'] }, 'team-b', 'team-a')).toBe('team-b');
  });

  // Un param viejo o de otra pantalla no puede mandar: era la otra mitad del
  // mismo problema que el equipo activo.
  it('ignora un param que no juega este partido', () => {
    expect(pickMyTeamId({ ...MATCH, myTeamIds: ['team-b'] }, 'team-ajeno', null)).toBe('team-b');
  });

  it('usa el equipo activo cuando juega este partido', () => {
    expect(pickMyTeamId({ ...MATCH, myTeamIds: ['team-a', 'team-b'] }, null, 'team-b')).toBe('team-b');
  });

  // EL caso del hallazgo: milito en dos clubes, entro al partido del B y tengo
  // el A activo. Antes se consultaba get_match_detail por el A.
  it('ignora el equipo activo cuando no juega este partido', () => {
    expect(pickMyTeamId({ ...MATCH, myTeamIds: ['team-b'] }, null, 'team-otro')).toBe('team-b');
  });

  it('devuelve null si el usuario no está en ninguno de los dos equipos', () => {
    expect(pickMyTeamId({ ...MATCH, myTeamIds: [] }, null, 'team-otro')).toBeNull();
  });
});

describe('resolveMyTeamIdForMatch', () => {
  it('corta con una sola query cuando el param ya es uno de los equipos', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({ data: { team_a_id: 'team-a', team_b_id: 'team-b' }, error: null }),
    );

    await expect(resolveMyTeamIdForMatch('m1', 'profile-1', 'team-b', 'team-a')).resolves.toBe('team-b');
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
    expect(supabaseMock.from).toHaveBeenCalledWith('matches');
  });

  it('resuelve por membresía cuando el param falta y el activo no juega', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: { team_a_id: 'team-a', team_b_id: 'team-b' }, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: [{ team_id: 'team-b' }], error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: [], error: null }));

    await expect(resolveMyTeamIdForMatch('m1', 'profile-1', null, 'team-otro')).resolves.toBe('team-b');
  });

  // join_match_as_guest no crea membresía: el invitado sólo existe en
  // match_participants. Sin esta rama, un invitado no tendría equipo.
  it('resuelve al invitado por match_participants', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: { team_a_id: 'team-a', team_b_id: 'team-b' }, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: [], error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: [{ team_id: 'team-a' }], error: null }));

    await expect(resolveMyTeamIdForMatch('m1', 'guest-1', null, null)).resolves.toBe('team-a');
  });

  it('devuelve null cuando el usuario no juega el partido, en vez de caer al equipo activo', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: { team_a_id: 'team-a', team_b_id: 'team-b' }, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: [], error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: [], error: null }));

    await expect(resolveMyTeamIdForMatch('m1', 'profile-1', null, 'team-otro')).resolves.toBeNull();
  });

  it('devuelve null si el partido no existe', async () => {
    supabaseMock.from.mockReturnValueOnce(createQueryBuilder({ data: null, error: null }));
    await expect(resolveMyTeamIdForMatch('m-fantasma', 'profile-1', 'team-a', null)).resolves.toBeNull();
  });
});
