import { supabase } from '@/lib/supabase';
import type { MatchResultFormData, CancellationFormData, WoClaimFormData } from '@/components/matches/types';

// Typed helper for RPCs not yet in generated types
type AnyRpc = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

function rpc(fn: string, args: Record<string, unknown>) {
  return (supabase as unknown as AnyRpc).rpc(fn, args);
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
  const { error } = await rpc('confirm_match_proposal', {
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

export async function doCheckin(matchId: string, teamId: string): Promise<void> {
  const { error } = await rpc('checkin_team', {
    p_match_id: matchId,
    p_team_id: teamId,
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
  if (error) throw error;
}

// ─── Cancellation ─────────────────────────────────────────────────────────────
// SECURITY DEFINER RPC because cancellation_requests has no INSERT policy.
// Immediately cancels the match.

export async function requestCancellation(
  matchId: string,
  teamId: string,
  data: CancellationFormData,
): Promise<void> {
  const { error } = await rpc('request_match_cancellation', {
    p_match_id: matchId,
    p_team_id: teamId,
    p_reason: data.reason,
    p_notes: data.notes ?? null,
  });
  if (error) throw error;
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
