import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQueryBuilder } from './test-utils/supabase-mock';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

import {
  applyToTeamPost,
  applyToPlayerPost,
  fetchApplicationsForPost,
  fetchApplicationCounts,
  respondToApplication,
} from './market-applications-api';

const AUTH_USER = { id: 'auth-1' };
const PROFILE = { id: 'profile-1' };

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: AUTH_USER }, error: null });
  // notifyTeamLeaders/notifyProfile son fire-and-forget: por defecto no rompen nada.
  supabaseMock.from.mockReturnValue(createQueryBuilder({ data: [], error: null }));
});

describe('applyToTeamPost', () => {
  it('inserta la postulación con el profile resuelto', async () => {
    const profileBuilder = createQueryBuilder({ data: PROFILE, error: null });
    const insertBuilder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(profileBuilder).mockReturnValueOnce(insertBuilder);

    await applyToTeamPost('post-1', 'team-1');

    expect(supabaseMock.from).toHaveBeenNthCalledWith(2, 'market_team_post_applications');
    expect(insertBuilder.insert).toHaveBeenCalledWith({ post_id: 'post-1', profile_id: PROFILE.id });
  });

  it('trata 23505 (ya postulado) como éxito silencioso', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: PROFILE, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: null, error: { code: '23505' } }));

    await expect(applyToTeamPost('post-1', 'team-1')).resolves.toBeUndefined();
  });

  it('relanza cualquier otro error', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: PROFILE, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: null, error: { code: '42501', message: 'rls' } }));

    await expect(applyToTeamPost('post-1', 'team-1')).rejects.toMatchObject({ code: '42501' });
  });
});

describe('applyToPlayerPost', () => {
  it('inserta la postulación con team_id y applicant_profile_id', async () => {
    const profileBuilder = createQueryBuilder({ data: PROFILE, error: null });
    const insertBuilder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(profileBuilder).mockReturnValueOnce(insertBuilder);

    await applyToPlayerPost('post-2', 'team-1', 'owner-profile');

    expect(insertBuilder.insert).toHaveBeenCalledWith({
      post_id: 'post-2',
      team_id: 'team-1',
      applicant_profile_id: PROFILE.id,
    });
  });

  it('trata 23505 como éxito silencioso', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: PROFILE, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: null, error: { code: '23505' } }));

    await expect(applyToPlayerPost('post-2', 'team-1', 'owner-profile')).resolves.toBeUndefined();
  });
});

describe('fetchApplicationsForPost', () => {
  it('mapea postulaciones a un post de EQUIPO — notifyProfileId y displayId son el profile del jugador', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({
        data: [
          {
            id: 'app-1',
            status: 'PENDIENTE',
            created_at: '2026-07-01T00:00:00Z',
            profile_id: 'player-1',
            profiles: { full_name: 'Juan', avatar_url: 'p/juan.jpg', preferred_position: 'DELANTERO' },
          },
        ],
        error: null,
      }),
    );

    const result = await fetchApplicationsForPost('post-1', 'TEAM');

    expect(result[0]).toEqual({
      id: 'app-1',
      status: 'PENDIENTE',
      createdAt: '2026-07-01T00:00:00Z',
      notifyProfileId: 'player-1',
      displayId: 'player-1',
      displayName: 'Juan',
      displayAvatarOrShieldUrl: 'p/juan.jpg',
      displaySubtitle: 'DELANTERO',
    });
  });

  it('mapea postulaciones a un post de JUGADOR — notifyProfileId es el capitán, displayId es el equipo', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({
        data: [
          {
            id: 'app-2',
            status: 'PENDIENTE',
            created_at: '2026-07-02T00:00:00Z',
            team_id: 'team-9',
            applicant_profile_id: 'captain-9',
            teams: { name: 'Equipo Rival', zone: 'CABA', shield_url: 't/shield.png' },
          },
        ],
        error: null,
      }),
    );

    const result = await fetchApplicationsForPost('post-2', 'PLAYER');

    expect(result[0]).toEqual({
      id: 'app-2',
      status: 'PENDIENTE',
      createdAt: '2026-07-02T00:00:00Z',
      notifyProfileId: 'captain-9',
      displayId: 'team-9',
      displayName: 'Equipo Rival',
      displayAvatarOrShieldUrl: 't/shield.png',
      displaySubtitle: 'CABA',
    });
  });
});

describe('fetchApplicationCounts', () => {
  it('devuelve {} sin consultar si no hay postIds', async () => {
    const result = await fetchApplicationCounts([], 'TEAM');
    expect(result).toEqual({});
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('agrega el conteo de postulaciones por post_id', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({
        data: [{ post_id: 'post-1' }, { post_id: 'post-1' }, { post_id: 'post-2' }],
        error: null,
      }),
    );

    const result = await fetchApplicationCounts(['post-1', 'post-2'], 'TEAM');

    expect(supabaseMock.from).toHaveBeenCalledWith('market_team_post_applications');
    expect(result).toEqual({ 'post-1': 2, 'post-2': 1 });
  });
});

describe('respondToApplication', () => {
  it('actualiza el status en la tabla correcta según postType', async () => {
    const builder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(builder);

    await respondToApplication('app-1', 'PLAYER', 'ACEPTADA', 'captain-9');

    expect(supabaseMock.from).toHaveBeenCalledWith('market_player_post_applications');
    expect(builder.update).toHaveBeenCalledWith({ status: 'ACEPTADA' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'app-1');
  });

  it('propaga el error del update', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({ data: null, error: new Error('rls violation') }),
    );
    await expect(respondToApplication('app-1', 'TEAM', 'RECHAZADA', 'player-1')).rejects.toThrow(
      'rls violation',
    );
  });
});
