import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import type {
  TeamStatsViewData,
  TeamStatsHeader,
  TeamSeasonRecord,
  TeamRecentMatch,
  TeamMemberStat,
  FormResult,
  TeamBadgeItem,
} from '@/components/team-stats/types';

type TeamRole = Database['public']['Enums']['team_role'];
type PlayerPosition = Database['public']['Enums']['player_position'];

type TeamRow = {
  id: string;
  name: string;
  zone: string;
  category: Database['public']['Enums']['team_category'];
  preferred_format: Database['public']['Enums']['team_format'];
  shield_url: string | null;
  elo_rating: number;
  fair_play_score: number;
  season_wins: number;
  season_losses: number;
  season_draws: number;
  season_goals_for: number;
  season_goals_against: number;
};

type MatchRaw = {
  id: string;
  scheduled_at: string | null;
  status: string;
  match_type: string;
  team_a_id: string;
  team_b_id: string;
  team_a: { name: string } | null;
  team_b: { name: string } | null;
  match_results: Array<{ team_id: string; goals_scored: number; goals_against: number }>;
};

type MemberRaw = {
  profile_id: string;
  role: TeamRole;
  profiles: {
    full_name: string;
    username: string;
    avatar_url: string | null;
    preferred_position: PlayerPosition;
  } | null;
};

type EloHistoryRaw = {
  match_id: string;
  delta: number;
};

function percent(n: number, d: number): string {
  if (d <= 0) return '0%';
  return `${Math.round((n / d) * 100)}%`;
}

function ratio(v: number, d: number): string {
  if (d <= 0) return '0.00';
  return (v / d).toFixed(2);
}

function matchResult(
  teamId: string,
  match: MatchRaw,
): { result: FormResult | null; goalsFor: number | null; goalsAgainst: number | null } {
  if (match.status === 'FINALIZADO') {
    const own = match.match_results.find((r) => r.team_id === teamId);
    if (!own) return { result: null, goalsFor: null, goalsAgainst: null };
    const gf = own.goals_scored;
    const ga = own.goals_against;
    return {
      result: gf > ga ? 'V' : gf < ga ? 'D' : 'E',
      goalsFor: gf,
      goalsAgainst: ga,
    };
  }
  if (match.status === 'WO_A' || match.status === 'WO_B') {
    const isTeamA = match.team_a_id === teamId;
    return {
      result: (match.status === 'WO_A') === isTeamA ? 'V' : 'D',
      goalsFor: null,
      goalsAgainst: null,
    };
  }
  return { result: null, goalsFor: null, goalsAgainst: null };
}

export async function fetchTeamStatsViewData(
  teamId: string,
  currentProfileId: string | null,
): Promise<TeamStatsViewData> {
  const [teamRes, matchesRes, membersRes, eloHistoryRes] = await Promise.all([
    supabase
      .from('teams')
      .select(
        'id, name, zone, category, preferred_format, shield_url, elo_rating, fair_play_score, season_wins, season_losses, season_draws, season_goals_for, season_goals_against',
      )
      .eq('id', teamId)
      .single(),
    supabase
      .from('matches')
      .select(`
        id, scheduled_at, status, match_type,
        team_a_id, team_b_id,
        team_a:teams!team_a_id(name),
        team_b:teams!team_b_id(name),
        match_results(team_id, goals_scored, goals_against)
      `)
      .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
      .order('scheduled_at', { ascending: false })
      .limit(10),
    supabase
      .from('team_members')
      .select('profile_id, role, profiles(full_name, username, avatar_url, preferred_position)')
      .eq('team_id', teamId),
    supabase
      .from('elo_history')
      .select('match_id, delta')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  if (teamRes.error) throw teamRes.error;

  const team = teamRes.data as TeamRow;
  const matches = ((matchesRes.data as MatchRaw[]) ?? []);
  const memberRows = ((membersRes.data as MemberRaw[]) ?? []).filter((m) => !!m.profiles);
  const eloHistory = ((eloHistoryRes.data as EloHistoryRaw[]) ?? []);

  // Header
  const header: TeamStatsHeader = {
    id: team.id,
    name: team.name,
    zone: team.zone,
    category: team.category,
    format: team.preferred_format,
    shieldUrl: team.shield_url,
    prRating: team.elo_rating,
    fairPlayScore: Number(team.fair_play_score),
  };

  // Season record
  const totalMatches = team.season_wins + team.season_draws + team.season_losses;
  const season: TeamSeasonRecord = {
    wins: team.season_wins,
    draws: team.season_draws,
    losses: team.season_losses,
    goalsFor: team.season_goals_for,
    goalsAgainst: team.season_goals_against,
    winPercent: percent(team.season_wins, totalMatches),
    avgGoals: ratio(team.season_goals_for, totalMatches),
  };

  // Build elo delta map for quick lookup
  const eloDeltaMap = new Map<string, number>(eloHistory.map((e) => [e.match_id, e.delta]));

  // Recent matches (sorted already by scheduled_at desc)
  const recentMatches: TeamRecentMatch[] = matches.map((match) => {
    const rivalName =
      match.team_a_id === teamId
        ? (match.team_b?.name ?? 'Rival')
        : (match.team_a?.name ?? 'Rival');
    const { result, goalsFor, goalsAgainst } = matchResult(teamId, match);
    return {
      id: match.id,
      scheduledAt: match.scheduled_at,
      status: match.status,
      matchType: match.match_type,
      rivalName,
      goalsFor,
      goalsAgainst,
      result,
      prDelta: eloDeltaMap.get(match.id) ?? null,
    };
  });

  // Form: last 5 finished results
  const form: FormResult[] = recentMatches
    .filter((m) => m.result !== null)
    .slice(0, 5)
    .map((m) => m.result!);

  // Members with participation stats
  // Fetch match_participants counts per member in this team
  const profileIds = memberRows.map((m) => m.profile_id);
  let participationMap = new Map<string, { matchesPlayed: number; goals: number }>();

  if (profileIds.length > 0) {
    const [participantsRes] = await Promise.all([
      supabase
        .from('match_participants')
        .select('profile_id')
        .eq('team_id', teamId)
        .in('profile_id', profileIds),
    ]);

    if (!participantsRes.error) {
      const rows = participantsRes.data as Array<{ profile_id: string }>;
      for (const row of rows) {
        const current = participationMap.get(row.profile_id) ?? { matchesPlayed: 0, goals: 0 };
        participationMap.set(row.profile_id, {
          ...current,
          matchesPlayed: current.matchesPlayed + 1,
        });
      }
    }

    // Goals from match_results scorers jsonb
    const finishedMatchIds = matches
      .filter((m) => m.status === 'FINALIZADO')
      .map((m) => m.id);

    if (finishedMatchIds.length > 0) {
      const resultsRes = await supabase
        .from('match_results')
        .select('scorers')
        .eq('team_id', teamId)
        .in('match_id', finishedMatchIds);

      if (!resultsRes.error && resultsRes.data) {
        for (const row of resultsRes.data as Array<{ scorers: Array<{ profile_id: string; goals: number }> }>) {
          for (const scorer of row.scorers ?? []) {
            const current = participationMap.get(scorer.profile_id) ?? {
              matchesPlayed: 0,
              goals: 0,
            };
            participationMap.set(scorer.profile_id, {
              ...current,
              goals: current.goals + (scorer.goals ?? 0),
            });
          }
        }
      }
    }
  }

  const totalTeamMatches = team.season_wins + team.season_draws + team.season_losses;

  const members: TeamMemberStat[] = memberRows.map((m) => {
    const stats = participationMap.get(m.profile_id) ?? { matchesPlayed: 0, goals: 0 };
    return {
      profileId: m.profile_id,
      fullName: m.profiles!.full_name,
      username: m.profiles!.username,
      avatarUrl: m.profiles!.avatar_url,
      position: m.profiles!.preferred_position,
      role: m.role,
      matchesPlayed: stats.matchesPlayed,
      goals: stats.goals,
      presencePercent: percent(stats.matchesPlayed, totalTeamMatches),
    };
  });

  // Sort members: captains first, then by matches played desc
  members.sort((a, b) => {
    const roleOrder = { CAPITAN: 0, SUBCAPITAN: 1, DIRECTOR_TECNICO: 2, JUGADOR: 3 };
    const roleDiff = (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3);
    if (roleDiff !== 0) return roleDiff;
    return b.matchesPlayed - a.matchesPlayed;
  });

  // Is this the current user's team?
  const isOwnTeam = currentProfileId
    ? memberRows.some((m) => m.profile_id === currentProfileId)
    : false;

  return { header, season, form, recentMatches, members, isOwnTeam, badges: [] };
}

export async function fetchTeamBadges(teamId: string): Promise<TeamBadgeItem[]> {
  const { data, error } = await supabase.rpc(
    'get_team_badges' as Parameters<typeof supabase.rpc>[0],
    { p_team_id: teamId },
  );
  if (error) throw error;
  return ((data ?? []) as Array<{
    id: string; slug: string; name: string;
    criteria_description: string; icon_url: string;
    entity_type: string; is_earned: boolean;
  }>).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    criteriaDescription: r.criteria_description,
    iconUrl: r.icon_url,
    entityType: r.entity_type,
    isEarned: r.is_earned,
  }));
}
