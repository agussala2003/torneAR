import { supabase } from '@/lib/supabase';
import type { MatchResultFormData, CancellationFormData, WoClaimFormData } from '@/components/matches/types';
import type { Database } from '@/types/supabase';

type NotificationType = Database['public']['Enums']['notification_type'];

// Notifica a CAPITAN/SUBCAPITAN de un equipo. Silencioso: nunca bloquea el flujo principal.
async function notifyTeamLeaders(
  teamId: string,
  type: NotificationType,
  title: string,
  body: string,
  data: Record<string, string>,
) {
  try {
    const { data: members } = await supabase
      .from('team_members')
      .select('profile_id')
      .eq('team_id', teamId)
      .in('role', ['CAPITAN', 'SUBCAPITAN']);

    if (!members || members.length === 0) return;

    await supabase.from('notifications').insert(
      members.map((m) => ({ profile_id: m.profile_id, type, title, body, data })),
    );
  } catch {
    // Silenciamos errores de notificación para no bloquear el flujo principal
  }
}

// ─── Proposal ────────────────────────────────────────────────────────────────

export async function submitProposal(
  matchId: string,
  fromTeamId: string,
  data: import('@/components/matches/types').MatchProposalFormData,
): Promise<void> {
  const { data: session } = await supabase.auth.getUser();
  if (!session.user) throw new Error('No autenticado');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', session.user.id)
    .single();
  if (profileError) throw profileError;
  if (!profile) throw new Error('Perfil no encontrado');

  const { error } = await supabase.from('match_proposals').insert({
    match_id: matchId,
    proposed_by: profile.id,
    from_team_id: fromTeamId,
    format: data.format,
    match_type: data.matchType,
    scheduled_at: data.scheduledAt.toISOString(),
    duration_minutes: data.durationMinutes,
    location: data.location,
    venue_id: data.venueId,
    signal_amount: data.signalAmount,
    total_cost: data.totalCost,
  });
  if (error) throw error;
}

export async function acceptProposal(proposalId: string, matchId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_match_proposal', {
    p_proposal_id: proposalId,
    p_match_id: matchId,
  });
  if (error) throw error;
}

export async function rejectProposal(proposalId: string): Promise<void> {
  const { error } = await supabase
    .from('match_proposals')
    .update({ status: 'RECHAZADA' })
    .eq('id', proposalId);
  if (error) throw error;
}

export async function cancelProposal(proposalId: string): Promise<void> {
  const { error } = await supabase
    .from('match_proposals')
    .update({ status: 'RECHAZADA' })
    .eq('id', proposalId);
  if (error) throw error;
}

// ─── Check-in ─────────────────────────────────────────────────────────────────
// Stamps the team's arrival, marks the caller as result-loader, and flips the
// match to EN_VIVO once both teams are checked in.

export async function doCheckin(
  matchId: string,
  teamId: string,
  coords?: { lat: number; lng: number },
): Promise<void> {
  // p_lat/p_lng son args opcionales del RPC tipado: undefined = omitidos en el
  // body y toman el DEFAULT NULL del servidor (misma semántica que antes).
  const { error } = await supabase.rpc('checkin_team', {
    p_match_id: matchId,
    p_team_id: teamId,
    p_lat: coords?.lat,
    p_lng: coords?.lng,
  });
  if (error) throw error;
}

// ─── Result ──────────────────────────────────────────────────────────────────
// RLS allows CAPITAN/SUBCAPITAN to insert results regardless of is_result_loader.
// resolve_match trigger fires automatically and handles FINALIZADO / EN_DISPUTA / ELO.

export async function submitMatchResult(
  matchId: string,
  teamId: string,
  data: MatchResultFormData,
): Promise<void> {
  const { data: session } = await supabase.auth.getUser();
  if (!session.user) throw new Error('No autenticado');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', session.user.id)
    .single();
  if (profileError) throw profileError;
  if (!profile) throw new Error('Perfil no encontrado');

  const scorersJson = (data.scorers ?? []).map((s) => ({
    profile_id: s.profileId,
    goals: s.goals,
  }));

  const { error } = await supabase.from('match_results').insert({
    match_id: matchId,
    team_id: teamId,
    submitted_by: profile.id,
    goals_scored: data.goalsScored,
    goals_against: data.goalsAgainst,
    scorers: scorersJson,
    mvp_id: data.mvpProfileId ?? null,
  });

  if (error) {
    // Código 23505 = unique_violation: el resultado ya fue enviado (UNIQUE match_id + team_id).
    // Esto ocurre cuando el usuario reintenta tras un timeout de red donde el servidor sí
    // procesó el INSERT. Es idempotente: el resultado ya está guardado correctamente.
    if (error.code === '23505') return;
    throw error;
  }
}

// ─── Cancellation ─────────────────────────────────────────────────────────────
// SECURITY DEFINER RPC. Doble consentimiento: crea la solicitud en PENDIENTE,
// el partido NO se cancela hasta que el equipo rival responda (ver
// respondToCancellationRequest más abajo).

export async function requestCancellation(
  matchId: string,
  teamId: string,
  data: CancellationFormData,
  opponentTeamId: string,
): Promise<void> {
  const { error } = await supabase.rpc('request_match_cancellation', {
    p_match_id: matchId,
    p_team_id: teamId,
    p_reason: data.reason,
    p_notes: data.notes ?? undefined,
  });
  if (error) throw error;

  void notifyTeamLeaders(
    opponentTeamId,
    'CANCELACION_SOLICITADA',
    '⚠️ Solicitud de cancelación',
    'El equipo rival solicitó cancelar el partido. Revisá los detalles y respondé.',
    { matchId },
  );
}

// El equipo rival acepta o rechaza. Si acepta, el partido pasa a CANCELADO
// (y si la cancelación es tardía, ahí recién se aplica la penalización de
// Fair Play — no al pedirla). Si rechaza, el partido sigue en pie.
export async function respondToCancellationRequest(
  requestId: string,
  accept: boolean,
  requestedByTeamId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('respond_to_cancellation_request', {
    p_request_id: requestId,
    p_accept: accept,
  });
  if (error) throw error;

  void notifyTeamLeaders(
    requestedByTeamId,
    accept ? 'PARTIDO_CANCELADO' : 'CANCELACION_RECHAZADA',
    accept ? '✅ Cancelación aceptada' : '❌ Cancelación rechazada',
    accept
      ? 'El equipo rival aceptó cancelar el partido.'
      : 'El equipo rival rechazó tu solicitud de cancelación. El partido sigue en pie.',
    { requestId },
  );

  return data as string;
}

// ─── Guest join ───────────────────────────────────────────────────────────────
// SECURITY DEFINER RPC — any authenticated user can join via unique code.

// type (no interface): habilita el cast directo desde el Json tipado del RPC.
export type GuestJoinResult = {
  matchId: string;
  teamId: string;
  teamSide: 'A' | 'B';
  teamAName: string;
  teamBName: string;
};

export async function joinMatchAsGuest(
  uniqueCode: string,
  teamSide: 'A' | 'B',
): Promise<GuestJoinResult> {
  const { data, error } = await supabase.rpc('join_match_as_guest', {
    p_unique_code: uniqueCode,
    p_team_side: teamSide,
  });
  if (error) throw error;
  return data as GuestJoinResult;
}

// ─── Dispute ──────────────────────────────────────────────────────────────────

export async function submitDisputeVote(matchId: string, votedTeamId: string): Promise<void> {
  const { error } = await supabase.rpc('submit_dispute_vote', {
    p_match_id: matchId,
    p_voted_team_id: votedTeamId,
  });
  if (error) throw error;
}

// type (no interface): habilita el cast directo desde el Json tipado del RPC.
export type DisputeResolveResult = {
  winnerTeamId: string;
  loserTeamId: string;
  votesA: number;
  votesB: number;
  resolutionMethod: 'votes' | 'fair_play_score';
};

export async function resolveMatchDispute(matchId: string): Promise<DisputeResolveResult> {
  const { data, error } = await supabase.rpc('resolve_match_dispute', { p_match_id: matchId });
  if (error) throw error;
  return data as DisputeResolveResult;
}

// ─── WO Claim ─────────────────────────────────────────────────────────────────
// La foto se sube al bucket wo_evidences y luego se llama a la RPC claim_wo
// (SECURITY DEFINER), que valida autorización + pertenencia de goleadores/MVP
// server-side e inserta el reclamo. claimed_by se deriva de auth.uid() en la RPC.

export async function claimWo(
  matchId: string,
  teamId: string,
  data: WoClaimFormData,
): Promise<void> {
  // Upload evidence photo
  let photoUrl = '';
  if (data.photoBase64) {
    const fileName = `${matchId}/${teamId}_${Date.now()}.jpg`;
    const binaryStr = atob(data.photoBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('wo_evidences')
      .upload(fileName, bytes.buffer, {
        contentType: data.photoMimeType,
        upsert: true,
      });
    if (uploadError) throw uploadError;
    photoUrl = uploadData?.path ?? fileName;
  }

  const scorers = (data.scorers ?? []).map((s) => ({ profile_id: s.profileId, goals: s.goals }));

  // p_mvp_id es opcional en el RPC tipado: undefined = omitido (DEFAULT NULL).
  const { error } = await supabase.rpc('claim_wo', {
    p_match_id: matchId,
    p_team_id: teamId,
    p_reason: data.reason,
    p_photo_url: photoUrl,
    p_scorers: scorers,
    p_mvp_id: data.mvpProfileId ?? undefined,
  });
  if (error) throw error;
}
