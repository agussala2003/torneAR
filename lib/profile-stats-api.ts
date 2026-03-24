import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import type {
  ProfileStatsViewData,
  ProfileRow,
  RecentMatchResult,
  EarnedBadge,
  TeamEntry,
} from '@/components/profile-stats/types';

type TeamRole = Database['public']['Enums']['team_role'];

type ParticipantRaw = {
  team_id: string;
  matches: {
    id: string;
    scheduled_at: string | null;
    status: string;
    match_type: string;
    team_a_id: string;
    team_b_id: string;
    team_a: { name: string } | null;
    team_b: { name: string } | null;
    match_results: Array<{ team_id: string; goals_scored: number; goals_against: number }>;
  } | null;
};

type BadgeRaw = {
  earned_at: string;
  badges: { id: string; name: string; slug: string; icon_url: string | null } | null;
};

type TeamRaw = {
  role: TeamRole;
  teams: { id: string; name: string; elo_rating: number; shield_url: string | null } | null;
};

function percent(n: number, d: number): string {
  if (d <= 0) return '0%';
  return `${Math.round((n / d) * 100)}%`;
}

function ratio(v: number, d: number): string {
  if (d <= 0) return '0.00';
  return (v / d).toFixed(2);
}

export async function fetchProfileStatsViewData(profileId: string): Promise<ProfileStatsViewData> {
  const [profileRes, statsRes, participantsRes, badgesRes, teamsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', profileId).single(),
    supabase
      .from('v_player_stats')
      .select('matches_played, total_goals, total_mvps, total_wins')
      .eq('profile_id', profileId)
      .maybeSingle(),
    supabase
      .from('match_participants')
      .select(`
        team_id,
        matches(
          id, scheduled_at, status, match_type,
          team_a_id, team_b_id,
          team_a:teams!team_a_id(name),
          team_b:teams!team_b_id(name),
          match_results(team_id, goals_scored, goals_against)
        )
      `)
      .eq('profile_id', profileId)
      .limit(30),
    supabase
      .from('profile_badges')
      .select('earned_at, badges(id, name, slug, icon_url)')
      .eq('profile_id', profileId)
      .order('earned_at', { ascending: false }),
    supabase
      .from('team_members')
      .select('role, teams(id, name, elo_rating, shield_url)')
      .eq('profile_id', profileId),
  ]);

  if (profileRes.error) throw profileRes.error;

  const s = statsRes.data as {
    matches_played: number;
    total_goals: number;
    total_mvps: number;
    total_wins: number;
  } | null;

  const matchesPlayed = Number(s?.matches_played ?? 0);
  const goals = Number(s?.total_goals ?? 0);
  const mvps = Number(s?.total_mvps ?? 0);
  const wins = Number(s?.total_wins ?? 0);

  const participantRows = ((participantsRes.data as ParticipantRaw[]) ?? []).filter(
    (row) => !!row.matches,
  );

  const recentMatches: RecentMatchResult[] = participantRows
    .map((row) => {
      const match = row.matches!;
      const rivalName =
        match.team_a_id === row.team_id
          ? (match.team_b?.name ?? 'Rival')
          : (match.team_a?.name ?? 'Rival');

      let result: 'V' | 'E' | 'D' | null = null;
      let goalsFor: number | null = null;
      let goalsAgainst: number | null = null;

      if (match.status === 'FINALIZADO') {
        const own = match.match_results.find((r) => r.team_id === row.team_id);
        if (own) {
          goalsFor = own.goals_scored;
          goalsAgainst = own.goals_against;
          result = goalsFor > goalsAgainst ? 'V' : goalsFor < goalsAgainst ? 'D' : 'E';
        }
      } else if (match.status === 'WO_A' || match.status === 'WO_B') {
        const isTeamA = match.team_a_id === row.team_id;
        result = (match.status === 'WO_A') === isTeamA ? 'V' : 'D';
      }

      return {
        id: match.id,
        scheduledAt: match.scheduled_at,
        status: match.status,
        matchType: match.match_type,
        rivalName,
        goalsFor,
        goalsAgainst,
        result,
      };
    })
    .sort((a, b) => {
      const at = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
      const bt = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
      return bt - at;
    })
    .slice(0, 10);

  const badges: EarnedBadge[] = ((badgesRes.data as BadgeRaw[]) ?? [])
    .filter((row) => !!row.badges)
    .map((row) => ({
      id: row.badges!.id,
      name: row.badges!.name,
      slug: row.badges!.slug,
      iconUrl: row.badges!.icon_url,
      earnedAt: row.earned_at,
    }));

  const teams: TeamEntry[] = ((teamsRes.data as TeamRaw[]) ?? [])
    .filter((row) => !!row.teams)
    .map((row) => ({
      id: row.teams!.id,
      name: row.teams!.name,
      prRating: row.teams!.elo_rating,
      shieldUrl: row.teams!.shield_url,
      role: row.role,
    }));

  return {
    profile: profileRes.data as ProfileRow,
    stats: {
      matchesPlayed,
      goals,
      mvps,
      wins,
      avgGoals: ratio(goals, matchesPlayed),
      winPercent: percent(wins, matchesPlayed),
    },
    recentMatches,
    badges,
    teams,
  };
}
