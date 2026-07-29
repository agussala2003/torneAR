import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQueryBuilder } from './test-utils/supabase-mock';
import {
  sendChallenge,
  acceptChallengeWithNotification,
  updateChallengeStatus,
  cancelChallenge,
  getActiveChallengeWithTeam,
  fetchChallengesInbox,
} from './challenge-actions';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn(), rpc: vi.fn() },
}));
// El DAL usa supabase.rpc() tipado; el alias conserva legible el resto del archivo.
const supabaseRpcMock = supabaseMock.rpc;

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

vi.mock('@/lib/supabase-storage', () => ({
  getSupabaseStorageUrl: (bucket: string, path: string) => `URL:${bucket}/${path}`,
}));

// El módulo real importa `react-native` (Platform), que no existe en el runtime
// `node` de este proyecto de tests. Se moquea la superficie pública completa.
vi.mock('@/lib/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  // notifyTeamLeaders es fire-and-forget: por defecto no hace nada (team_members vacío).
  supabaseMock.from.mockReturnValue(createQueryBuilder({ data: [], error: null }));
});

describe('sendChallenge', () => {
  it('llama a send_challenge con los parámetros correctos y devuelve el resultado', async () => {
    supabaseRpcMock.mockResolvedValueOnce({
      data: { challengeId: 'c1', eloDiffWarning: true },
      error: null,
    });

    const result = await sendChallenge('teamA', 'teamB', 'RANKING');

    expect(supabaseRpcMock).toHaveBeenCalledWith('send_challenge', {
      p_from_team_id: 'teamA',
      p_to_team_id: 'teamB',
      p_match_type: 'RANKING',
    });
    expect(result).toEqual({ challengeId: 'c1', eloDiffWarning: true });
  });

  it('propaga el error del RPC (ej. cooldown o anti-farming rechazado en el backend)', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: null, error: new Error('cooldown activo') });

    await expect(sendChallenge('teamA', 'teamB', 'RANKING')).rejects.toThrow('cooldown activo');
  });
});

describe('acceptChallengeWithNotification', () => {
  it('llama a accept_challenge con p_challenge_id y devuelve matchId/conversationId', async () => {
    supabaseRpcMock.mockResolvedValueOnce({
      data: { matchId: 'm1', conversationId: 'conv1' },
      error: null,
    });

    const result = await acceptChallengeWithNotification('c1', 'teamFrom');

    expect(supabaseRpcMock).toHaveBeenCalledWith('accept_challenge', { p_challenge_id: 'c1' });
    expect(result).toEqual({ matchId: 'm1', conversationId: 'conv1' });
  });

  it('propaga el error del RPC (ej. usuario no autorizado del equipo receptor)', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: null, error: new Error('No autorizado') });

    await expect(acceptChallengeWithNotification('c1', 'teamFrom')).rejects.toThrow('No autorizado');
  });
});

describe('updateChallengeStatus / cancelChallenge', () => {
  it('updateChallengeStatus arma el update({status}).eq(id) correcto', async () => {
    const builder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(builder);

    await updateChallengeStatus('c1', 'RECHAZADA');

    expect(supabaseMock.from).toHaveBeenCalledWith('challenges');
    expect(builder.update).toHaveBeenCalledWith({ status: 'RECHAZADA' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'c1');
  });

  it('cancelChallenge siempre manda status CANCELADA', async () => {
    const builder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(builder);

    await cancelChallenge('c1');

    expect(builder.update).toHaveBeenCalledWith({ status: 'CANCELADA' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'c1');
  });

  it('propaga el error si la RLS rechaza el update', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({ data: null, error: new Error('row-level security violation') }),
    );

    await expect(updateChallengeStatus('c1', 'RECHAZADA')).rejects.toThrow(
      'row-level security violation',
    );
  });
});

describe('getActiveChallengeWithTeam', () => {
  it('arma el filtro or() simétrico entre los dos equipos', async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    supabaseMock.from.mockReturnValueOnce(builder);

    await getActiveChallengeWithTeam('teamA', 'teamB');

    expect(builder.eq).toHaveBeenCalledWith('status', 'ENVIADA');
    expect(builder.or).toHaveBeenCalledWith(
      'and(from_team_id.eq.teamA,to_team_id.eq.teamB),and(from_team_id.eq.teamB,to_team_id.eq.teamA)',
    );
  });

  it('devuelve true cuando hay al menos un desafío activo', async () => {
    supabaseMock.from.mockReturnValueOnce(createQueryBuilder({ data: [{ id: 'c1' }], error: null }));
    expect(await getActiveChallengeWithTeam('teamA', 'teamB')).toBe(true);
  });

  it('devuelve false cuando no hay ninguno', async () => {
    supabaseMock.from.mockReturnValueOnce(createQueryBuilder({ data: [], error: null }));
    expect(await getActiveChallengeWithTeam('teamA', 'teamB')).toBe(false);
  });
});

describe('fetchChallengesInbox', () => {
  it('mapea snake_case a camelCase y arma la URL del escudo sólo si hay opponent_shield_url', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: [
        {
          challenge_id: 'c1',
          created_at: '2026-07-01T00:00:00Z',
          status: 'ENVIADA',
          match_type: 'RANKING',
          direction: 'RECIBIDO',
          opponent_team_id: 'teamB',
          opponent_team_name: 'Rivales FC',
          opponent_shield_url: 'teamB/shield.png',
          opponent_elo: 1100,
          creator_name: 'Juan',
        },
        {
          challenge_id: 'c2',
          created_at: '2026-07-02T00:00:00Z',
          status: 'ENVIADA',
          match_type: 'AMISTOSO',
          direction: 'ENVIADO',
          opponent_team_id: 'teamC',
          opponent_team_name: 'Otro Equipo',
          opponent_shield_url: null,
          opponent_elo: 950,
          creator_name: 'Ana',
        },
      ],
      error: null,
    });

    const result = await fetchChallengesInbox('teamA');

    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_team_challenges_inbox', {
      p_team_id: 'teamA',
    });
    expect(result[0]).toMatchObject({
      challengeId: 'c1',
      opponentTeamId: 'teamB',
      opponentShieldUrl: 'URL:shields/teamB/shield.png',
    });
    expect(result[1].opponentShieldUrl).toBeNull();
  });

  it('propaga el error del RPC', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: new Error('rpc falló') });
    await expect(fetchChallengesInbox('teamA')).rejects.toThrow('rpc falló');
  });
});
