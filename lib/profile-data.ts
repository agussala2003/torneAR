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

type ProfileBadgeJoinedRow = {
  earned_at: string;
  badges: {
    id: string;
    name: string;
    slug: string;
    icon_url: string | null;
  } | null;
};

type AllBadgesRow = Database['public']['Tables']['badges']['Row'];

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
      eloRating: row.teams!.elo_rating,
      shieldUrl: row.teams!.shield_url,
      role: row.role,
    }));
}

function toBadges(earnedRows: ProfileBadgeJoinedRow[] | null, allBadges: AllBadgesRow[] | null): BadgeItem[] {
  const allBadgesArray = allBadges ?? [];
  const earnedBadgesMap = new Map<string, ProfileBadgeJoinedRow>();

  if (earnedRows) {
    earnedRows
      .filter((row) => !!row.badges)
      .forEach((row) => {
        earnedBadgesMap.set(row.badges!.id, row);
      });
  }

  return allBadgesArray.map((badge) => {
    const earnedRow = earnedBadgesMap.get(badge.id);
    return {
      id: badge.id,
      name: badge.name,
      slug: badge.slug,
      iconUrl: badge.icon_url,
      earnedAt: earnedRow?.earned_at ?? null,
      isEarned: !!earnedRow,
    };
  });
}

export async function fetchProfileViewData(profile: ProfileRow): Promise<ProfileViewData> {
  const [statsRes, teamsRes, badgesRes, allBadgesRes] = await Promise.all([
    supabase
      .from('v_player_stats')
      .select('*')
      .eq('profile_id', profile.id)
      .maybeSingle(),
    supabase
      .from('team_members')
      .select('role, teams(id, name, elo_rating, shield_url)')
      .eq('profile_id', profile.id),
    supabase
      .from('profile_badges')
      .select('earned_at, badges(id, name, slug, icon_url)')
      .eq('profile_id', profile.id)
      .order('earned_at', { ascending: false }),
    supabase
      .from('badges')
      .select('*')
      .order('name', { ascending: true }),
  ]);

  if (statsRes.error) {
    console.error('Profile stats query failed', statsRes.error);
  }

  if (teamsRes.error) {
    console.error('Profile teams query failed', teamsRes.error);
  }

  if (badgesRes.error) {
    console.error('Profile badges query failed', badgesRes.error);
  }

  if (allBadgesRes.error) {
    console.error('All badges query failed', allBadgesRes.error);
  }

  return {
    profile,
    stats: toStats(statsRes.error ? null : statsRes.data),
    teams: toTeams((teamsRes.error ? null : (teamsRes.data as TeamMemberJoinedRow[] | null)) ?? null),
    badges: toBadges(
      (badgesRes.error ? null : (badgesRes.data as ProfileBadgeJoinedRow[] | null)) ?? null,
      (allBadgesRes.error ? null : (allBadgesRes.data as AllBadgesRow[] | null)) ?? null
    ),
  };
}
