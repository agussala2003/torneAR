import { supabase } from '@/lib/supabase';
import { TeamCategory, TeamFormat } from '@/lib/team-options';

export async function fetchZones(): Promise<string[]> {
  const { data, error } = await supabase
    .from('zones')
    .select('name')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((zoneRow) => zoneRow.name);
}

export async function createTeam(
  profileId: string,
  name: string,
  zone: string,
  category: TeamCategory,
  format: TeamFormat
): Promise<{ id: string; name: string }> {
  const { data: teamData, error: teamError } = await supabase
    .from('teams')
    .insert({
      name,
      zone,
      category,
      preferred_format: format,
    })
    .select('id, name')
    .single();

  if (teamError) throw teamError;

  const { error: memberError } = await supabase
    .from('team_members')
    .insert({
      team_id: teamData.id,
      profile_id: profileId,
      role: 'CAPITAN',
    });

  if (memberError) throw memberError;

  return teamData;
}
