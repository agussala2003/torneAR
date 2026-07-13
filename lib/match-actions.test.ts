import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQueryBuilder, createStorageMock } from './test-utils/supabase-mock';

const { supabaseMock, supabaseRpcMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
    storage: { from: vi.fn() },
  },
  supabaseRpcMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
  supabaseRpc: supabaseRpcMock,
}));

import {
  submitProposal,
  acceptProposal,
  rejectProposal,
  cancelProposal,
  doCheckin,
  submitMatchResult,
  requestCancellation,
  respondToCancellationRequest,
  joinMatchAsGuest,
  submitDisputeVote,
  resolveMatchDispute,
  claimWo,
} from './match-actions';

const AUTH_USER = { id: 'auth-1' };
const PROFILE = { id: 'profile-1' };

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: AUTH_USER }, error: null });
});

describe('submitProposal', () => {
  const formData = {
    format: 'FUTBOL_5' as const,
    matchType: 'RANKING' as const,
    scheduledAt: new Date('2026-08-01T15:00:00Z'),
    durationMinutes: 60,
    venueId: 'venue-1',
    location: null,
    signalAmount: null,
    totalCost: null,
  };

  it('lanza si no hay sesión activa', async () => {
    supabaseMock.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(submitProposal('m1', 'teamA', formData)).rejects.toThrow('No autenticado');
  });

  it('busca el profile por auth_user_id e inserta la propuesta con las columnas correctas', async () => {
    const profileBuilder = createQueryBuilder({ data: PROFILE, error: null });
    const insertBuilder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from
      .mockReturnValueOnce(profileBuilder) // .from('profiles')
      .mockReturnValueOnce(insertBuilder); // .from('match_proposals')

    await submitProposal('m1', 'teamA', formData);

    expect(profileBuilder.eq).toHaveBeenCalledWith('auth_user_id', AUTH_USER.id);
    expect(supabaseMock.from).toHaveBeenNthCalledWith(2, 'match_proposals');
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        match_id: 'm1',
        proposed_by: PROFILE.id,
        from_team_id: 'teamA',
        format: 'FUTBOL_5',
        match_type: 'RANKING',
        duration_minutes: 60,
        venue_id: 'venue-1',
      }),
    );
  });
});

describe('acceptProposal / rejectProposal / cancelProposal', () => {
  it('acceptProposal llama a confirm_match_proposal con los ids correctos', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: null, error: null });
    await acceptProposal('prop1', 'm1');
    expect(supabaseRpcMock).toHaveBeenCalledWith('confirm_match_proposal', {
      p_proposal_id: 'prop1',
      p_match_id: 'm1',
    });
  });

  it('acceptProposal propaga el error si el invocador no es del equipo receptor', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: null, error: new Error('No autorizado') });
    await expect(acceptProposal('prop1', 'm1')).rejects.toThrow('No autorizado');
  });

  it('rejectProposal y cancelProposal actualizan status a RECHAZADA sobre match_proposals', async () => {
    const rejectBuilder = createQueryBuilder({ data: null, error: null });
    const cancelBuilder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(rejectBuilder).mockReturnValueOnce(cancelBuilder);

    await rejectProposal('prop1');
    await cancelProposal('prop2');

    expect(supabaseMock.from).toHaveBeenNthCalledWith(1, 'match_proposals');
    expect(rejectBuilder.update).toHaveBeenCalledWith({ status: 'RECHAZADA' });
    expect(rejectBuilder.eq).toHaveBeenCalledWith('id', 'prop1');

    expect(supabaseMock.from).toHaveBeenNthCalledWith(2, 'match_proposals');
    expect(cancelBuilder.update).toHaveBeenCalledWith({ status: 'RECHAZADA' });
    expect(cancelBuilder.eq).toHaveBeenCalledWith('id', 'prop2');
  });
});

describe('doCheckin', () => {
  it('manda p_lat/p_lng null explícitos cuando no hay coords (nunca se omiten las claves)', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: null, error: null });
    await doCheckin('m1', 'teamA');
    expect(supabaseRpcMock).toHaveBeenCalledWith('checkin_team', {
      p_match_id: 'm1',
      p_team_id: 'teamA',
      p_lat: null,
      p_lng: null,
    });
  });

  it('manda las coords cuando se proveen', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: null, error: null });
    await doCheckin('m1', 'teamA', { lat: -34.6, lng: -58.4 });
    expect(supabaseRpcMock).toHaveBeenCalledWith('checkin_team', {
      p_match_id: 'm1',
      p_team_id: 'teamA',
      p_lat: -34.6,
      p_lng: -58.4,
    });
  });

  it('propaga el error del RPC (ej. fuera del geofence o equipo no autorizado)', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: null, error: new Error('Fuera de rango') });
    await expect(doCheckin('m1', 'teamA')).rejects.toThrow('Fuera de rango');
  });
});

describe('submitMatchResult', () => {
  const formData = {
    goalsScored: 3,
    goalsAgainst: 1,
    scorers: [{ profileId: 'p1', goals: 2 }, { profileId: 'p2', goals: 1 }],
    mvpProfileId: 'p1',
  };

  it('arma el insert con los scorers en snake_case y el mvp_id', async () => {
    const profileBuilder = createQueryBuilder({ data: PROFILE, error: null });
    const insertBuilder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(profileBuilder).mockReturnValueOnce(insertBuilder);

    await submitMatchResult('m1', 'teamA', formData);

    expect(insertBuilder.insert).toHaveBeenCalledWith({
      match_id: 'm1',
      team_id: 'teamA',
      submitted_by: PROFILE.id,
      goals_scored: 3,
      goals_against: 1,
      scorers: [
        { profile_id: 'p1', goals: 2 },
        { profile_id: 'p2', goals: 1 },
      ],
      mvp_id: 'p1',
    });
  });

  it('trata 23505 (unique_violation) como éxito idempotente, no lo relanza', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: PROFILE, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: null, error: { code: '23505' } }));

    await expect(submitMatchResult('m1', 'teamA', formData)).resolves.toBeUndefined();
  });

  it('relanza cualquier otro código de error', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: PROFILE, error: null }))
      .mockReturnValueOnce(
        createQueryBuilder({ data: null, error: { code: '23503', message: 'fk violation' } }),
      );

    await expect(submitMatchResult('m1', 'teamA', formData)).rejects.toMatchObject({
      code: '23503',
    });
  });
});

describe('requestCancellation / joinMatchAsGuest / submitDisputeVote / resolveMatchDispute', () => {
  it('requestCancellation llama a request_match_cancellation con reason/notes (el partido no se cancela acá)', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: null, error: null });
    await requestCancellation('m1', 'teamA', { reason: 'MUTUO_ACUERDO', notes: 'ok' }, 'teamB');
    expect(supabaseRpcMock).toHaveBeenCalledWith('request_match_cancellation', {
      p_match_id: 'm1',
      p_team_id: 'teamA',
      p_reason: 'MUTUO_ACUERDO',
      p_notes: 'ok',
    });
  });

  it('requestCancellation propaga el error del RPC (ej. ya hay una solicitud pendiente)', async () => {
    supabaseRpcMock.mockResolvedValueOnce({
      data: null,
      error: new Error('Ya existe una solicitud de cancelación pendiente'),
    });
    await expect(
      requestCancellation('m1', 'teamA', { reason: 'MUTUO_ACUERDO', notes: null }, 'teamB'),
    ).rejects.toThrow('Ya existe una solicitud de cancelación pendiente');
  });

  it('respondToCancellationRequest llama a respond_to_cancellation_request y devuelve el nuevo status', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: 'ACEPTADA', error: null });
    const result = await respondToCancellationRequest('req-1', true, 'teamA');
    expect(supabaseRpcMock).toHaveBeenCalledWith('respond_to_cancellation_request', {
      p_request_id: 'req-1',
      p_accept: true,
    });
    expect(result).toBe('ACEPTADA');
  });

  it('respondToCancellationRequest propaga el error (ej. la solicitud ya fue respondida)', async () => {
    supabaseRpcMock.mockResolvedValueOnce({
      data: null,
      error: new Error('La solicitud ya fue respondida'),
    });
    await expect(respondToCancellationRequest('req-1', false, 'teamA')).rejects.toThrow(
      'La solicitud ya fue respondida',
    );
  });

  it('joinMatchAsGuest llama a join_match_as_guest con el código y el lado', async () => {
    supabaseRpcMock.mockResolvedValueOnce({
      data: { matchId: 'm1', teamId: 'teamA', teamSide: 'A', teamAName: 'A', teamBName: 'B' },
      error: null,
    });
    const result = await joinMatchAsGuest('ABC123', 'A');
    expect(supabaseRpcMock).toHaveBeenCalledWith('join_match_as_guest', {
      p_unique_code: 'ABC123',
      p_team_side: 'A',
    });
    expect(result.matchId).toBe('m1');
  });

  it('submitDisputeVote llama a submit_dispute_vote con match y equipo votado', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: null, error: null });
    await submitDisputeVote('m1', 'teamA');
    expect(supabaseRpcMock).toHaveBeenCalledWith('submit_dispute_vote', {
      p_match_id: 'm1',
      p_voted_team_id: 'teamA',
    });
  });

  it('resolveMatchDispute llama a resolve_match_dispute y devuelve el resultado', async () => {
    supabaseRpcMock.mockResolvedValueOnce({
      data: {
        winnerTeamId: 'teamA',
        loserTeamId: 'teamB',
        votesA: 5,
        votesB: 2,
        resolutionMethod: 'votes',
      },
      error: null,
    });
    const result = await resolveMatchDispute('m1');
    expect(supabaseRpcMock).toHaveBeenCalledWith('resolve_match_dispute', { p_match_id: 'm1' });
    expect(result.winnerTeamId).toBe('teamA');
  });
});

describe('claimWo', () => {
  it('sube la foto y luego llama a la RPC claim_wo mapeando goleadores y MVP', async () => {
    supabaseMock.storage.from.mockReturnValue(
      createStorageMock({ data: { path: 'm1/teamA_123.jpg' }, error: null }).from('wo-evidence'),
    );
    supabaseRpcMock.mockResolvedValueOnce({ data: 'claim-1', error: null });

    await claimWo('m1', 'teamA', {
      reason: 'NO_PRESENTACION',
      photoBase64: Buffer.from('fake-image').toString('base64'),
      photoMimeType: 'image/jpeg',
      notes: null,
      scorers: [
        { profileId: 'p1', goals: 2 },
        { profileId: 'p2', goals: 1 },
      ],
      mvpProfileId: 'p1',
    });

    expect(supabaseMock.storage.from).toHaveBeenCalledWith('wo-evidence');
    expect(supabaseRpcMock).toHaveBeenCalledWith('claim_wo', {
      p_match_id: 'm1',
      p_team_id: 'teamA',
      p_reason: 'NO_PRESENTACION',
      p_photo_url: 'm1/teamA_123.jpg',
      p_scorers: [
        { profile_id: 'p1', goals: 2 },
        { profile_id: 'p2', goals: 1 },
      ],
      p_mvp_id: 'p1',
    });
  });

  it('envía scorers vacío y mvp null cuando no se cargan goleadores', async () => {
    supabaseMock.storage.from.mockReturnValue(
      createStorageMock({ data: { path: 'm1/teamA_123.jpg' }, error: null }).from('wo-evidence'),
    );
    supabaseRpcMock.mockResolvedValueOnce({ data: 'claim-2', error: null });

    await claimWo('m1', 'teamA', {
      reason: 'NO_PRESENTACION',
      photoBase64: Buffer.from('fake-image').toString('base64'),
      photoMimeType: 'image/jpeg',
      notes: null,
    });

    expect(supabaseRpcMock).toHaveBeenCalledWith(
      'claim_wo',
      expect.objectContaining({ p_scorers: [], p_mvp_id: null }),
    );
  });

  it('propaga el error si falla el upload y no llama a la RPC', async () => {
    supabaseMock.storage.from.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: null, error: new Error('upload falló') }),
    });

    await expect(
      claimWo('m1', 'teamA', {
        reason: 'ABANDONO',
        photoBase64: Buffer.from('fake-image').toString('base64'),
        photoMimeType: 'image/jpeg',
        notes: null,
      }),
    ).rejects.toThrow('upload falló');

    expect(supabaseRpcMock).not.toHaveBeenCalled(); // nunca llega a la RPC
  });
});
