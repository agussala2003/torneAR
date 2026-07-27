import { supabase } from '@/lib/supabase';

// Goleador propuesto (enriquecido con nombre por la RPC).
// type (no interface): habilita el cast directo desde el Json tipado del RPC.
export type WoScorer = {
  profile_id: string;
  goals: number;
  full_name: string | null;
};

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

/** Reclamos de WO pendientes de revisión (solo admin — gateado server-side). */
export async function fetchPendingWoClaims(): Promise<PendingWoClaim[]> {
  // Filas tipadas por types/supabase.ts (RETURNS TABLE de la RPC); sólo el
  // jsonb de scorers necesita cast. La RPC puede devolver null en los campos
  // opcionales aunque el tipo generado no lo exprese (limitación de RETURNS
  // TABLE) — PendingWoClaim ya los modela como nullables.
  const { data, error } = await supabase.rpc('get_pending_wo_claims');
  if (error) throw error;

  return (data ?? []).map((r) => ({
    claimId: r.claim_id,
    matchId: r.match_id,
    createdAt: r.created_at,
    scheduledAt: r.scheduled_at,
    reason: r.reason,
    photoUrl: r.photo_url,
    claimingTeamId: r.claiming_team_id,
    claimingTeamName: r.claiming_team_name,
    opponentTeamName: r.opponent_team_name,
    scorers: (r.scorers as WoScorer[] | null) ?? [],
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
  // p_admin_notes es opcional en el RPC tipado: undefined = omitido (DEFAULT NULL).
  const { error } = await supabase.rpc('resolve_wo_claim', {
    p_claim_id: claimId,
    p_approve: approve,
    p_admin_notes: adminNotes ?? undefined,
  });
  if (error) throw error;
}
