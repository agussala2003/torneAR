import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQueryBuilder } from './test-utils/supabase-mock';
import {
  fetchTeamPosts,
  fetchPlayerPosts,
  createTeamPost,
  createPlayerPost,
  fetchUserManagedTeams,
  fetchAllUserTeamIds,
  fetchManagedTeamMemberIds,
  fetchTeamInviteCode,
  togglePostStatus,
} from './market-api';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

const AUTH_USER = { id: 'auth-1' };
const PROFILE = { id: 'profile-1' };

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: AUTH_USER }, error: null });
});

describe('fetchTeamPosts', () => {
  it('sólo filtra por posición cuando no es CUALQUIERA', async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    supabaseMock.from.mockReturnValueOnce(builder);

    await fetchTeamPosts('ARQUERO', undefined);

    expect(supabaseMock.from).toHaveBeenCalledWith('market_team_posts');
    expect(builder.eq).toHaveBeenCalledWith('is_active', true);
    expect(builder.eq).toHaveBeenCalledWith('position_wanted', 'ARQUERO');
    expect(builder.eq).not.toHaveBeenCalledWith('zone', expect.anything());
  });

  it('no agrega filtro de posición cuando es CUALQUIERA, sí filtra zona si se especifica', async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    supabaseMock.from.mockReturnValueOnce(builder);

    await fetchTeamPosts('CUALQUIERA', 'CABA');

    expect(builder.eq).not.toHaveBeenCalledWith('position_wanted', expect.anything());
    expect(builder.eq).toHaveBeenCalledWith('zone', 'CABA');
  });

  it('propaga el error de la query', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({ data: null, error: new Error('fallo de red') }),
    );
    await expect(fetchTeamPosts()).rejects.toThrow('fallo de red');
  });
});

describe('fetchPlayerPosts', () => {
  it('filtra por posición y tipo de post cuando se especifican', async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    supabaseMock.from.mockReturnValueOnce(builder);

    await fetchPlayerPosts('DELANTERO', 'BUSCA_EQUIPO');

    expect(supabaseMock.from).toHaveBeenCalledWith('market_player_posts');
    expect(builder.eq).toHaveBeenCalledWith('position', 'DELANTERO');
    expect(builder.eq).toHaveBeenCalledWith('post_type', 'BUSCA_EQUIPO');
  });
});

describe('createTeamPost', () => {
  it('resuelve el profile actual e inserta las columnas correctas en snake_case', async () => {
    const profileBuilder = createQueryBuilder({ data: PROFILE, error: null });
    const insertBuilder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(profileBuilder).mockReturnValueOnce(insertBuilder);

    await createTeamPost({
      teamId: 'team-1',
      positionWanted: 'ARQUERO',
      pitchType: 'FUTBOL_5',
      description: 'Buscamos arquero',
      matchDate: '2026-08-01',
      matchTime: '20:00',
      zone: 'CABA',
      complex: 'El Potrero',
    });

    expect(profileBuilder.eq).toHaveBeenCalledWith('auth_user_id', AUTH_USER.id);
    expect(insertBuilder.insert).toHaveBeenCalledWith({
      team_id: 'team-1',
      position_wanted: 'ARQUERO',
      pitch_type: 'FUTBOL_5',
      description: 'Buscamos arquero',
      match_date: '2026-08-01',
      match_time: '20:00',
      zone: 'CABA',
      complex: 'El Potrero',
      // Sin complejo del catálogo el aviso se publica igual: pierde la
      // precisión del badge de distancia, no la posibilidad de existir.
      venue_id: null,
      created_by: PROFILE.id,
    });
  });

  it('persiste el venue_id cuando el alta eligió un complejo del catálogo', async () => {
    const profileBuilder = createQueryBuilder({ data: PROFILE, error: null });
    const insertBuilder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(profileBuilder).mockReturnValueOnce(insertBuilder);

    await createTeamPost({
      teamId: 'team-1',
      positionWanted: 'ARQUERO',
      description: 'Buscamos arquero',
      zone: 'CABA',
      complex: 'El Potrero',
      venueId: '11111111-2222-3333-4444-555555555555',
    });

    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        complex: 'El Potrero',
        venue_id: '11111111-2222-3333-4444-555555555555',
      }),
    );
  });

  it('convierte campos opcionales vacíos a null', async () => {
    const profileBuilder = createQueryBuilder({ data: PROFILE, error: null });
    const insertBuilder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(profileBuilder).mockReturnValueOnce(insertBuilder);

    await createTeamPost({
      teamId: 'team-1',
      positionWanted: 'CUALQUIERA',
      matchDate: '',
      matchTime: '',
      zone: '',
      complex: '',
    });

    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        pitch_type: null,
        description: null,
        match_date: null,
        match_time: null,
        zone: null,
        complex: null,
      }),
    );
  });

  it('lanza si no hay sesión activa', async () => {
    supabaseMock.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(
      createTeamPost({ teamId: 't1', positionWanted: 'CUALQUIERA' }),
    ).rejects.toThrow('No autenticado');
  });
});

describe('createPlayerPost', () => {
  it('inserta con profile_id resuelto y las columnas correctas', async () => {
    const profileBuilder = createQueryBuilder({ data: PROFILE, error: null });
    const insertBuilder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(profileBuilder).mockReturnValueOnce(insertBuilder);

    await createPlayerPost({ postType: 'BUSCA_EQUIPO', position: 'DEFENSOR', description: 'Libre' });

    expect(insertBuilder.insert).toHaveBeenCalledWith({
      profile_id: PROFILE.id,
      post_type: 'BUSCA_EQUIPO',
      position: 'DEFENSOR',
      description: 'Libre',
    });
  });
});

describe('fetchUserManagedTeams', () => {
  it('devuelve [] si no encuentra el profile', async () => {
    supabaseMock.from.mockReturnValueOnce(createQueryBuilder({ data: null, error: new Error('not found') }));
    expect(await fetchUserManagedTeams('auth-1')).toEqual([]);
  });

  it('filtra team_members por rol CAPITAN/SUBCAPITAN y devuelve los equipos', async () => {
    const profileBuilder = createQueryBuilder({ data: PROFILE, error: null });
    const membersBuilder = createQueryBuilder({
      data: [
        { teams: { id: 'team-1', name: 'Equipo A' } },
        { teams: null },
      ],
      error: null,
    });
    supabaseMock.from.mockReturnValueOnce(profileBuilder).mockReturnValueOnce(membersBuilder);

    const result = await fetchUserManagedTeams('auth-1');

    expect(membersBuilder.eq).toHaveBeenCalledWith('profile_id', PROFILE.id);
    expect(membersBuilder.in).toHaveBeenCalledWith('role', ['CAPITAN', 'SUBCAPITAN']);
    expect(result).toEqual([{ id: 'team-1', name: 'Equipo A' }]);
  });
});

describe('fetchAllUserTeamIds', () => {
  it('devuelve los team_id del perfil', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({ data: [{ team_id: 't1' }, { team_id: 't2' }], error: null }),
    );
    expect(await fetchAllUserTeamIds('profile-1')).toEqual(['t1', 't2']);
  });
});

describe('fetchManagedTeamMemberIds', () => {
  it('devuelve [] sin consultar si no hay teamIds', async () => {
    const result = await fetchManagedTeamMemberIds([]);
    expect(result).toEqual([]);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('consulta team_members con .in(team_id) cuando hay ids', async () => {
    const builder = createQueryBuilder({ data: [{ profile_id: 'p1' }, { profile_id: 'p2' }], error: null });
    supabaseMock.from.mockReturnValueOnce(builder);

    const result = await fetchManagedTeamMemberIds(['t1', 't2']);

    expect(builder.in).toHaveBeenCalledWith('team_id', ['t1', 't2']);
    expect(result).toEqual(['p1', 'p2']);
  });
});

describe('fetchTeamInviteCode', () => {
  it('devuelve el invite_code', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({ data: { invite_code: 'ABC123' }, error: null }),
    );
    expect(await fetchTeamInviteCode('team-1')).toBe('ABC123');
  });

  it('devuelve null en error en vez de lanzar', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({ data: null, error: new Error('not found') }),
    );
    expect(await fetchTeamInviteCode('team-1')).toBeNull();
  });
});

describe('togglePostStatus', () => {
  it('actualiza market_team_posts cuando isTeamPost es true', async () => {
    const builder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(builder);

    await togglePostStatus('post-1', true, false);

    expect(supabaseMock.from).toHaveBeenCalledWith('market_team_posts');
    expect(builder.update).toHaveBeenCalledWith({ is_active: false });
    expect(builder.eq).toHaveBeenCalledWith('id', 'post-1');
  });

  it('actualiza market_player_posts cuando isTeamPost es false', async () => {
    const builder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(builder);

    await togglePostStatus('post-2', false, true);

    expect(supabaseMock.from).toHaveBeenCalledWith('market_player_posts');
  });
});
