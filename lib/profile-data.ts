import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { BadgeItem, ProfileStats, ProfileViewData, TeamItem } from '@/components/profile/types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

type PlayerStatsRow = Database['public']['Views']['v_player_stats']['Row'];

type TeamMemberJoinedRow = {
  role: Database['public']['Enums']['team_role'];
  teams: {
    id: string;
    name: string;
    elo_rating: number;
    shield_url: string | null;
  } | null;
};

type BadgeRpcRow = {
  id: string; slug: string; name: string;
  criteria_description: string; icon_url: string;
  entity_type: string; is_earned: boolean;
};

function toStats(row: PlayerStatsRow | null): ProfileStats {
  return {
    matchesPlayed: row?.matches_played ?? 0,
    goals: row?.total_goals ?? 0,
    mvps: row?.total_mvps ?? 0,
    wins: row?.total_wins ?? 0,
  };
}

function toTeams(rows: TeamMemberJoinedRow[] | null): TeamItem[] {
  if (!rows) return [];

  return rows
    .filter((row) => !!row.teams)
    .map((row) => ({
      id: row.teams!.id,
      name: row.teams!.name,
      prRating: row.teams!.elo_rating,
      shieldUrl: row.teams!.shield_url,
      role: row.role,
    }));
}

function mapBadgesFromRpc(data: BadgeRpcRow[] | null): BadgeItem[] {
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    iconUrl: r.icon_url,
    criteriaDescription: r.criteria_description,
    earnedAt: null,
    isEarned: r.is_earned,
  }));
}

export async function fetchProfileViewData(profile: ProfileRow): Promise<ProfileViewData> {
  const [statsRes, teamsRes, badgesRpcRes] = await Promise.all([
    supabase
      .from('v_player_stats')
      .select('*')
      .eq('profile_id', profile.id)
      .maybeSingle(),
    supabase
      .from('team_members')
      .select('role, teams(id, name, elo_rating, shield_url)')
      .eq('profile_id', profile.id),
    supabase.rpc(
      'get_player_badges' as Parameters<typeof supabase.rpc>[0],
      { p_profile_id: profile.id },
    ),
  ]);

  if (statsRes.error) {
    console.error('Profile stats query failed', statsRes.error);
  }

  if (teamsRes.error) {
    console.error('Profile teams query failed', teamsRes.error);
  }

  if (badgesRpcRes.error) {
    console.error('Profile badges RPC failed', badgesRpcRes.error);
  }

  return {
    profile,
    stats: toStats(statsRes.error ? null : statsRes.data),
    teams: toTeams((teamsRes.error ? null : (teamsRes.data as TeamMemberJoinedRow[] | null)) ?? null),
    badges: mapBadgesFromRpc(badgesRpcRes.error ? null : (badgesRpcRes.data as unknown as BadgeRpcRow[] | null)),
  };
}
