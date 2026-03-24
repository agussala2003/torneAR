import { fetchTeamPosts, fetchPlayerPosts, fetchUserManagedTeams } from '@/lib/market-api';
import { MarketViewData } from '@/components/market/types';
import { Database } from '@/types/supabase';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export async function fetchMarketViewData(profile: ProfileRow, selectedPosition: string): Promise<MarketViewData> {
  const [teamPosts, playerPosts, managedTeams] = await Promise.all([
    fetchTeamPosts(selectedPosition),
    fetchPlayerPosts(selectedPosition),
    fetchUserManagedTeams(profile.auth_user_id)
  ]);

  return {
    teamPosts,
    playerPosts,
    managedTeams,
  };
}
