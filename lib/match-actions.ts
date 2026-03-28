import { supabase, supabaseRpc } from '@/lib/supabase';
import type { MatchResultFormData, CancellationFormData, WoClaimFormData } from '@/components/matches/types';

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
  const { error } = await supabaseRpc('confirm_match_proposal', {
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
  const { error } = await supabaseRpc('checkin_team', {
    p_match_id: matchId,
    p_team_id: teamId,
    p_lat: coords?.lat ?? null,
    p_lng: coords?.lng ?? null,
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
// SECURITY DEFINER RPC because cancellation_requests has no INSERT policy.
// Immediately cancels the match.

export async function requestCancellation(
  matchId: string,
  teamId: string,
  data: CancellationFormData,
): Promise<void> {
  const { error } = await supabaseRpc('request_match_cancellation', {
    p_match_id: matchId,
    p_team_id: teamId,
    p_reason: data.reason,
    p_notes: data.notes ?? null,
  });
  if (error) throw error;
}

// ─── Guest join ───────────────────────────────────────────────────────────────
// SECURITY DEFINER RPC — any authenticated user can join via unique code.

export interface GuestJoinResult {
  matchId: string;
  teamId: string;
  teamSide: 'A' | 'B';
  teamAName: string;
  teamBName: string;
}

export async function joinMatchAsGuest(
  uniqueCode: string,
  teamSide: 'A' | 'B',
): Promise<GuestJoinResult> {
  const { data, error } = await supabaseRpc('join_match_as_guest', {
    p_unique_code: uniqueCode,
    p_team_side: teamSide,
  });
  if (error) throw error;
  return data as GuestJoinResult;
}

// ─── Dispute ──────────────────────────────────────────────────────────────────

export async function submitDisputeVote(matchId: string, votedTeamId: string): Promise<void> {
  const { error } = await supabaseRpc('submit_dispute_vote', {
    p_match_id: matchId,
    p_voted_team_id: votedTeamId,
  });
  if (error) throw error;
}

export interface DisputeResolveResult {
  winnerTeamId: string;
  loserTeamId: string;
  votesA: number;
  votesB: number;
  resolutionMethod: 'votes' | 'fair_play_score';
}

export async function resolveMatchDispute(matchId: string): Promise<DisputeResolveResult> {
  const { data, error } = await supabaseRpc('resolve_match_dispute', { p_match_id: matchId });
  if (error) throw error;
  return data as DisputeResolveResult;
}

// ─── WO Claim ─────────────────────────────────────────────────────────────────
// RLS policy allows CAPITAN/SUBCAPITAN to insert.
// Photo is uploaded to wo-evidence bucket first, then the claim is inserted.

export async function claimWo(
  matchId: string,
  teamId: string,
  data: WoClaimFormData,
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
      .from('wo-evidence')
      .upload(fileName, bytes.buffer, {
        contentType: data.photoMimeType,
        upsert: true,
      });
    if (uploadError) throw uploadError;
    photoUrl = uploadData?.path ?? fileName;
  }

  const { error } = await supabase.from('wo_claims').insert({
    match_id: matchId,
    claimed_by: profile.id,
    claiming_team_id: teamId,
    reason: data.reason,
    photo_url: photoUrl,
    status: 'PENDIENTE_REVISION',
  });
  if (error) throw error;
}
