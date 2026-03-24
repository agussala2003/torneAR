import { supabase } from '@/lib/supabase';
import { TeamRequestsViewData, TeamRequestRow } from '@/components/team-requests/types';

export async function fetchTeamRequestsViewData(profileId: string): Promise<TeamRequestsViewData> {
  const { data, error } = await supabase
    .from('team_join_requests')
    .select('id, status, created_at, updated_at, team_id, teams(id, name, zone, category, preferred_format)')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return {
    requests: (data as TeamRequestRow[] | null) ?? [],
  };
}
