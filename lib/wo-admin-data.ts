import { supabaseRpc } from '@/lib/supabase';

// Goleador propuesto (enriquecido con nombre por la RPC).
export interface WoScorer {
  profile_id: string;
  goals: number;
  full_name: string | null;
}

export interface PendingWoClaim {
  claimId: string;
  matchId: string;
  createdAt: string;
  scheduledAt: string | null;
  reason: string | null;
  photoUrl: string | null;
  claimingTeamId: string;
  claimingTeamName: string;
  opponentTeamName: string;
  scorers: WoScorer[];
  mvpId: string | null;
  mvpName: string | null;
}

interface RawPendingClaim {
  claim_id: string;
  match_id: string;
  created_at: string;
  scheduled_at: string | null;
  reason: string | null;
  photo_url: string | null;
  claiming_team_id: string;
  claiming_team_name: string;
  opponent_team_name: string;
  scorers: WoScorer[] | null;
  mvp_id: string | null;
  mvp_name: string | null;
}

/** Reclamos de WO pendientes de revisión (solo admin — gateado server-side). */
export async function fetchPendingWoClaims(): Promise<PendingWoClaim[]> {
  const { data, error } = await supabaseRpc('get_pending_wo_claims', {});
  if (error) throw error;

  return ((data ?? []) as RawPendingClaim[]).map((r) => ({
    claimId: r.claim_id,
    matchId: r.match_id,
    createdAt: r.created_at,
    scheduledAt: r.scheduled_at,
    reason: r.reason,
    photoUrl: r.photo_url,
    claimingTeamId: r.claiming_team_id,
    claimingTeamName: r.claiming_team_name,
    opponentTeamName: r.opponent_team_name,
    scorers: r.scorers ?? [],
    mvpId: r.mvp_id,
    mvpName: r.mvp_name,
  }));
}

/** Aprueba o rechaza un reclamo. adminNotes es opcional (útil al rechazar). */
export async function resolveWoClaim(
  claimId: string,
  approve: boolean,
  adminNotes?: string | null,
): Promise<void> {
  const { error } = await supabaseRpc('resolve_wo_claim', {
    p_claim_id: claimId,
    p_approve: approve,
    p_admin_notes: adminNotes ?? null,
  });
  if (error) throw error;
}
