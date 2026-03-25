import { fetchTeamPosts, fetchPlayerPosts, fetchUserManagedTeams, fetchAllUserTeamIds, fetchManagedTeamMemberIds } from '@/lib/market-api';
import { sortPostsByNearest, filterActiveTeamPostsBySchedule } from '@/lib/market-utils';
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

  const [teamPosts, playerPosts, managedTeams, myTeamIds] = await Promise.all([
    fetchTeamPosts(selectedPosition, zone),
    fetchPlayerPosts(selectedPosition, undefined),
    fetchUserManagedTeams(profile.auth_user_id),
    fetchAllUserTeamIds(profile.id),
  ]);

  const managedTeamIds = managedTeams.map((t) => t.id);
  const myManagedTeamsMemberProfileIds = await fetchManagedTeamMemberIds(managedTeamIds);

  const activeTeamPosts = filterActiveTeamPostsBySchedule(teamPosts);
  const sortedTeamPosts = sortBy === 'nearest' ? sortPostsByNearest(activeTeamPosts) : activeTeamPosts;

  return {
    teamPosts: sortedTeamPosts,
    playerPosts,
    managedTeams,
    myTeamIds,
    myManagedTeamsMemberProfileIds,
  };
}
