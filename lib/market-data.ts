import { fetchTeamPosts, fetchPlayerPosts, fetchUserManagedTeams } from '@/lib/market-api';
import { sortPostsByNearest } from '@/lib/market-utils';
import { MarketViewData, MarketFilters } from '@/components/market/types';
import { Database } from '@/types/supabase';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export async function fetchMarketViewData(
  profile: ProfileRow,
  selectedPosition: string,
  filters?: Partial<MarketFilters>
): Promise<MarketViewData> {
  const zone = filters?.zone ?? null;
  const sortBy = filters?.sortBy ?? 'recent';

  const [teamPosts, playerPosts, managedTeams] = await Promise.all([
    fetchTeamPosts(selectedPosition, zone),
    fetchPlayerPosts(selectedPosition, undefined),
    fetchUserManagedTeams(profile.auth_user_id)
  ]);

  const sortedTeamPosts = sortBy === 'nearest' ? sortPostsByNearest(teamPosts) : teamPosts;

  return {
    teamPosts: sortedTeamPosts,
    playerPosts,
    managedTeams,
  };
}
