import { supabase } from '@/lib/supabase';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import type { Database } from '@/types/supabase';
import type {
  HomeViewData,
  HomeTeamSnapshot,
  HomeMatchEntry,
  PendingAction,
} from '@/components/home/types';

type TeamRole = Database['public']['Enums']['team_role'];
type MatchStatus = Database['public']['Enums']['match_status'];

// ─── Raw DB row types ─────────────────────────────────────────────────────────

type TeamMemberRow = {
  team_id: string;
  role: TeamRole;
  teams: {
    id: string;
    name: string;
    elo_rating: number;
    shield_url: string | null;
    // Columns added by Phase 3 triggers — not yet in generated types
    fair_play_score: number;
    season_wins: number;
    season_draws: number;
    season_losses: number;
  } | null;
};

type MatchRow = {
  id: string;
  status: MatchStatus;
  match_type: string;
  scheduled_at: string | null;
  format: string | null;
  team_a_id: string;
  team_b_id: string;
};

type TeamSnapshotRow = {
  id: string;
  name: string;
  shield_url: string | null;
  elo_rating: number;
};

// Status order for client-side sort: EN_VIVO always first
const STATUS_PRIORITY: Partial<Record<MatchStatus, number>> = {
  EN_VIVO: 0,
  CONFIRMADO: 1,
  PENDIENTE: 2,
};

// ─── Main fetch ───────────────────────────────────────────────────────────────

export async function fetchHomeViewData(profileId: string): Promise<HomeViewData> {
  // Step 1 — load team memberships (all subsequent queries depend on team IDs)
  const { data: memberData, error: memberError } = await supabase
    .from('team_members')
    .select(
      'team_id, role, teams(id, name, elo_rating, shield_url, fair_play_score, season_wins, season_draws, season_losses)',
    )
    .eq('profile_id', profileId);

  if (memberError) throw memberError;

  const memberRows = ((memberData as unknown as TeamMemberRow[]) ?? []).filter(
    (r) => r.teams !== null,
  );

  if (memberRows.length === 0) {
    return { myTeams: [], upcomingMatches: [], pendingActions: [] };
  }

  const teamIds = memberRows.map((r) => r.team_id);
  const captainTeamIds = memberRows
    .filter((r) => r.role === 'CAPITAN' || r.role === 'SUBCAPITAN')
    .map((r) => r.team_id);

  // Supabase .or() filter string for matches involving any of my teams
  const teamInFilter = teamIds.join(',');
  const matchOrFilter = `team_a_id.in.(${teamInFilter}),team_b_id.in.(${teamInFilter})`;

  // Step 2 — parallel queries that only depend on team IDs
  const parallelQueries = [
    // A: upcoming active matches
    supabase
      .from('matches')
      .select('id, status, match_type, scheduled_at, format, team_a_id, team_b_id')
      .in('status', ['PENDIENTE', 'CONFIRMADO', 'EN_VIVO'])
      .or(matchOrFilter)
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .limit(10),

    // B: matches in dispute
    supabase
      .from('matches')
      .select('id')
      .eq('status', 'EN_DISPUTA')
      .or(matchOrFilter),

    // C: received challenges (ENVIADA → requires captain action)
    supabase
      .from('challenges')
      .select('id')
      .in('to_team_id', teamIds)
      .eq('status', 'ENVIADA'),

    // D: pending team join requests (captains/subcaptains only)
    captainTeamIds.length > 0
      ? supabase
          .from('team_join_requests')
          .select('id')
          .in('team_id', captainTeamIds)
          .eq('status', 'PENDIENTE')
      : Promise.resolve({ data: [], error: null }),
  ] as const;

  const [matchesRes, disputesRes, challengesRes, requestsRes] = await Promise.all(
    parallelQueries,
  );

  // Step 3 — fetch team details for all teams referenced in upcoming matches
  // (needed for opponent names/shields that aren't in my team list)
  const upcomingRows = ((matchesRes.data ?? []) as unknown as MatchRow[]);
  const allMatchTeamIds = [
    ...new Set([...upcomingRows.map((m) => m.team_a_id), ...upcomingRows.map((m) => m.team_b_id)]),
  ];

  const teamsMap = new Map<string, TeamSnapshotRow>();
  if (allMatchTeamIds.length > 0) {
    const { data: teamsData } = await supabase
      .from('teams')
      .select('id, name, shield_url, elo_rating')
      .in('id', allMatchTeamIds);
    ((teamsData ?? []) as TeamSnapshotRow[]).forEach((t) => teamsMap.set(t.id, t));
  }

  // ─── Build HomeViewData ───────────────────────────────────────────────────

  const myTeamIdSet = new Set(teamIds);

  // Sort: EN_VIVO first, then by scheduled_at (already ordered by DB)
  const sortedMatches = upcomingRows
    .slice()
    .sort(
      (a, b) =>
        (STATUS_PRIORITY[a.status] ?? 3) - (STATUS_PRIORITY[b.status] ?? 3),
    )
    .slice(0, 5);

  const upcomingMatches: HomeMatchEntry[] = sortedMatches.map((m) => {
    const myTeamId = myTeamIdSet.has(m.team_a_id) ? m.team_a_id : m.team_b_id;
    const teamAData = teamsMap.get(m.team_a_id);
    const teamBData = teamsMap.get(m.team_b_id);
    return {
      id: m.id,
      status: m.status,
      matchType: m.match_type as HomeMatchEntry['matchType'],
      scheduledAt: m.scheduled_at,
      format: m.format as HomeMatchEntry['format'],
      teamA: {
        id: m.team_a_id,
        name: teamAData?.name ?? 'Equipo A',
        shieldUrl: teamAData?.shield_url
          ? getSupabaseStorageUrl('shields', teamAData.shield_url)
          : null,
        eloRating: teamAData?.elo_rating ?? 1000,
      },
      teamB: {
        id: m.team_b_id,
        name: teamBData?.name ?? 'Equipo B',
        shieldUrl: teamBData?.shield_url
          ? getSupabaseStorageUrl('shields', teamBData.shield_url)
          : null,
        eloRating: teamBData?.elo_rating ?? 1000,
      },
      myTeamId,
    };
  });

  const pendingActions: PendingAction[] = [];

  const disputeCount = (disputesRes.data ?? []).length;
  if (disputeCount > 0) {
    pendingActions.push({
      type: 'DISPUTE',
      count: disputeCount,
      label: disputeCount === 1 ? '1 partido en disputa' : `${disputeCount} partidos en disputa`,
    });
  }

  const challengeCount = (challengesRes.data ?? []).length;
  if (challengeCount > 0) {
    pendingActions.push({
      type: 'CHALLENGE_RECEIVED',
      count: challengeCount,
      label:
        challengeCount === 1 ? '1 desafío recibido' : `${challengeCount} desafíos recibidos`,
    });
  }

  const requestCount = (requestsRes.data ?? []).length;
  if (requestCount > 0) {
    pendingActions.push({
      type: 'TEAM_REQUEST',
      count: requestCount,
      label:
        requestCount === 1
          ? '1 solicitud de ingreso pendiente'
          : `${requestCount} solicitudes de ingreso pendientes`,
    });
  }

  const myTeams: HomeTeamSnapshot[] = memberRows.map((r) => ({
    id: r.teams!.id,
    name: r.teams!.name,
    shieldUrl: r.teams!.shield_url
      ? getSupabaseStorageUrl('shields', r.teams!.shield_url)
      : null,
    eloRating: r.teams!.elo_rating,
    fairPlayScore: r.teams!.fair_play_score ?? 100,
    seasonWins: r.teams!.season_wins ?? 0,
    seasonDraws: r.teams!.season_draws ?? 0,
    seasonLosses: r.teams!.season_losses ?? 0,
    role: r.role,
  }));

  return { myTeams, upcomingMatches, pendingActions };
}
