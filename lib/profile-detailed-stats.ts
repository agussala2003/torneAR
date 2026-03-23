import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';

type PlayerStatsRow = Database['public']['Views']['v_player_stats']['Row'];
type MatchParticipantRow = Database['public']['Tables']['match_participants']['Row'];
type MatchRow = Database['public']['Tables']['matches']['Row'];
type TeamRow = Database['public']['Tables']['teams']['Row'];

export type DetailedStatItem = {
  label: string;
  value: string;
  helper?: string;
};

export type RecentMatchItem = {
  id: string;
  scheduledAt: string | null;
  status: string;
  location: string | null;
  matchType: string;
  participantTeamId: string;
  participantTeamName: string;
  didCheckin: boolean;
};

export type DetailedProfileStats = {
  summary: DetailedStatItem[];
  activity: DetailedStatItem[];
  recentMatches: RecentMatchItem[];
};

function percent(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function ratio(value: number, base: number): string {
  if (base <= 0) return '0.00';
  return (value / base).toFixed(2);
}

export async function fetchDetailedProfileStats(profileId: string): Promise<DetailedProfileStats> {
  const [statsRes, participantsRes] = await Promise.all([
    supabase
      .from('v_player_stats')
      .select('*')
      .eq('profile_id', profileId)
      .maybeSingle(),
    supabase
      .from('match_participants')
      .select('id, did_checkin, checkin_at, is_guest, is_result_loader, team_id, matches(id, scheduled_at, status, match_type, location, team_a_id, team_b_id)')
      .eq('profile_id', profileId)
      .limit(30),
  ]);

  if (statsRes.error) {
    console.error('Detailed stats query failed', statsRes.error);
  }

  if (participantsRes.error) {
    console.error('Detailed participation query failed', participantsRes.error);
  }

  const stats = (statsRes.data as PlayerStatsRow | null) ?? null;
  const participants = ((participantsRes.data as Array<MatchParticipantRow & { matches: MatchRow | null }>) ?? [])
    .filter((row) => !!row.matches);

  const uniqueTeamIds = Array.from(new Set(participants.map((row) => row.team_id)));
  let teamMap = new Map<string, string>();

  if (uniqueTeamIds.length > 0) {
    const teamsRes = await supabase
      .from('teams')
      .select('id, name')
      .in('id', uniqueTeamIds);

    if (teamsRes.error) {
      console.error('Detailed teams query failed', teamsRes.error);
    } else {
      teamMap = new Map((teamsRes.data as TeamRow[]).map((team) => [team.id, team.name]));
    }
  }

  const matchesPlayed = stats?.matches_played ?? 0;
  const goals = stats?.total_goals ?? 0;
  const mvps = stats?.total_mvps ?? 0;
  const wins = stats?.total_wins ?? 0;

  const checkinsDone = participants.filter((row) => row.did_checkin).length;
  const matchesAsGuest = participants.filter((row) => row.is_guest).length;
  const asResultLoader = participants.filter((row) => row.is_result_loader).length;

  const summary: DetailedStatItem[] = [
    {
      label: 'Promedio de goles por partido',
      value: ratio(goals, matchesPlayed),
      helper: `${goals} goles en ${matchesPlayed} partidos`,
    },
    {
      label: 'Ratio de MVP',
      value: percent(mvps, matchesPlayed),
      helper: `${mvps} MVPs`,
    },
    {
      label: 'Porcentaje de victorias',
      value: percent(wins, matchesPlayed),
      helper: `${wins} ganados`,
    },
  ];

  const activity: DetailedStatItem[] = [
    {
      label: 'Check-ins completados',
      value: `${checkinsDone}`,
      helper: `${percent(checkinsDone, participants.length)} de asistencias marcadas`,
    },
    {
      label: 'Partidos como invitado',
      value: `${matchesAsGuest}`,
      helper: 'Participaciones fuera de plantilla fija',
    },
    {
      label: 'Carga de resultados',
      value: `${asResultLoader}`,
      helper: 'Partidos donde fuiste cargador de resultado',
    },
  ];

  const recentMatches: RecentMatchItem[] = participants
    .map((row) => ({
      id: row.matches!.id,
      scheduledAt: row.matches!.scheduled_at,
      status: row.matches!.status,
      location: row.matches!.location,
      matchType: row.matches!.match_type,
      participantTeamId: row.team_id,
      participantTeamName: teamMap.get(row.team_id) ?? 'Tu equipo',
      didCheckin: row.did_checkin,
    }))
    .sort((a, b) => {
      const aTime = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
      const bTime = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 12);

  return {
    summary,
    activity,
    recentMatches,
  };
}
