import { supabase } from '@/lib/supabase';
import type { H2HMatch } from '@/components/team-stats/types';

export async function fetchTeamH2H(myTeamId: string, opponentTeamId: string): Promise<H2HMatch[]> {
    const { data, error } = await supabase.rpc('get_team_h2h', {
        p_team_a_id: myTeamId,
        p_team_b_id: opponentTeamId,
    });

    if (error) throw error;

    return (data || []).map((row: any) => ({
        matchId: row.match_id,
        scheduledAt: row.scheduled_at,
        matchType: row.match_type,
        teamAId: row.team_a_id,
        teamAName: row.team_a_name,
        teamAGoals: row.team_a_goals,
        teamBId: row.team_b_id,
        teamBName: row.team_b_name,
        teamBGoals: row.team_b_goals,
        status: row.status,
    }));
}