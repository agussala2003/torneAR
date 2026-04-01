import { supabase } from '@/lib/supabase';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import type { MatchCardEntry, MatchesViewData } from '@/components/matches/types';
import type { Database } from '@/types/supabase';

type MatchStatus = Database['public']['Enums']['match_status'];
type MatchType = Database['public']['Enums']['match_type'];
type TeamFormat = Database['public']['Enums']['team_format'];
type ProposalStatus = Database['public']['Enums']['proposal_status'];

interface MatchRow {
  id: string;
  status: MatchStatus;
  match_type: MatchType;
  scheduled_at: string | null;
  format: TeamFormat | null;
  venue_name: string | null;
  location: string | null;
  team_a_id: string;
  team_a_name: string;
  team_a_shield_url: string | null;
  team_a_elo: number | null;
  team_b_id: string;
  team_b_name: string;
  team_b_shield_url: string | null;
  team_b_elo: number | null;
  checkin_team_a_at: string | null;
  checkin_team_b_at: string | null;
  result_team_a: number | null;
  result_team_b: number | null;
  proposal_id: string | null;
  proposal_from_team_id: string | null;
  proposal_scheduled_at: string | null;
  proposal_format: TeamFormat | null;
  proposal_location: string | null;
  proposal_status: ProposalStatus | null;
  has_pending_cancellation: boolean | null;
}

const HISTORY_STATUSES: MatchStatus[] = ['FINALIZADO', 'EN_DISPUTA', 'WO_A', 'WO_B', 'CANCELADO'];

export async function fetchMatchesViewData(teamId: string): Promise<MatchesViewData> {
  const { data, error } = await supabase.rpc('get_my_matches', { p_team_id: teamId });
  if (error) {
    // PostgREST PGRST116 means "0 rows returned" — treat as empty result, not a true error
    if ((error as any).code === 'PGRST116') {
      return { liveMatch: null, upcomingMatches: [], historyMatches: [], myTeamId: teamId };
    }
    throw error;
  }

  const rows = ((data ?? []) as unknown) as MatchRow[];

  const entries: MatchCardEntry[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    matchType: r.match_type,
    scheduledAt: r.scheduled_at,
    format: r.format,
    venue: r.venue_name ?? r.location ?? null,
    teamA: {
      id: r.team_a_id,
      name: r.team_a_name,
      shieldUrl: r.team_a_shield_url
        ? getSupabaseStorageUrl('shields', r.team_a_shield_url)
        : null,
      eloRating: r.team_a_elo ?? 1000,
    },
    teamB: {
      id: r.team_b_id,
      name: r.team_b_name,
      shieldUrl: r.team_b_shield_url
        ? getSupabaseStorageUrl('shields', r.team_b_shield_url)
        : null,
      eloRating: r.team_b_elo ?? 1000,
    },
    checkinTeamAAt: r.checkin_team_a_at,
    checkinTeamBAt: r.checkin_team_b_at,
    activeProposal:
      r.proposal_id && r.proposal_from_team_id && r.proposal_scheduled_at && r.proposal_format && r.proposal_status
        ? {
            id: r.proposal_id,
            fromTeamId: r.proposal_from_team_id,
            scheduledAt: r.proposal_scheduled_at,
            format: r.proposal_format,
            location: r.proposal_location ?? null,
            status: r.proposal_status,
          }
        : null,
    resultTeamA: r.result_team_a ?? null,
    resultTeamB: r.result_team_b ?? null,
    hasPendingCancellation: r.has_pending_cancellation ?? false,
  }));

  const liveMatch = entries.find((e) => e.status === 'EN_VIVO') ?? null;
  const upcomingMatches = entries.filter(
    (e) => e.status === 'PENDIENTE' || e.status === 'CONFIRMADO',
  );
  const historyMatches = entries.filter((e) => HISTORY_STATUSES.includes(e.status));

  return { liveMatch, upcomingMatches, historyMatches, myTeamId: teamId };
}
