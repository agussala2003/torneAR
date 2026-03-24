import { supabase } from '@/lib/supabase';
import { TeamCategory, TeamFormat, TeamRole } from '@/lib/team-options';

export type TeamPreview = {
  id: string;
  name: string;
  zone: string;
  category: TeamCategory;
  preferred_format: TeamFormat;
  elo_rating: number;
};

export async function findTeamByCode(code: string): Promise<TeamPreview | null> {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, zone, category, preferred_format, elo_rating')
    .eq('invite_code', code)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data as TeamPreview | null;
}

export async function sendJoinRequest(
  teamId: string,
  profile: { id: string; full_name: string | null; username: string | null },
  teamName: string
): Promise<void> {
  const [{ data: memberData, error: memberError }, { data: existingRequest, error: requestReadError }] = await Promise.all([
    supabase.from('team_members').select('id').eq('team_id', teamId).eq('profile_id', profile.id).maybeSingle(),
    supabase.from('team_join_requests').select('id, status').eq('team_id', teamId).eq('profile_id', profile.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (memberError) throw memberError;
  if (requestReadError) throw requestReadError;

  if (memberData) {
    throw new Error('ALREADY_MEMBER');
  }

  if (existingRequest?.status === 'PENDIENTE') {
    throw new Error('REQUEST_PENDING');
  }

  const { data: requestRow, error } = await supabase
    .from('team_join_requests')
    .upsert(
      {
        team_id: teamId,
        profile_id: profile.id,
        status: 'PENDIENTE',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'team_id,profile_id' }
    )
    .select('id')
    .single();

  if (error) throw error;

  try {
    const managerRoles: TeamRole[] = ['CAPITAN', 'SUBCAPITAN'];
    const { data: managers, error: managersError } = await supabase
      .from('team_members')
      .select('profile_id')
      .eq('team_id', teamId)
      .in('role', managerRoles)
      .neq('profile_id', profile.id);

    if (managersError) throw managersError;

    const notificationsPayload = (managers ?? []).map((manager) => ({
      profile_id: manager.profile_id,
      type: 'SOLICITUD_UNION_EQUIPO' as const,
      title: 'Nueva solicitud de union',
      body: `${profile.full_name ?? profile.username ?? 'Un jugador'} envio una solicitud para unirse a ${teamName}.`,
      data: {
        team_id: teamId,
        team_name: teamName,
        request_id: requestRow?.id ?? null,
        requester_profile_id: profile.id,
      },
    }));

    if (notificationsPayload.length > 0) {
      const { error: notificationsError } = await supabase.from('notifications').insert(notificationsPayload);
      if (notificationsError) throw notificationsError;
    }
  } catch (notificationError) {
    console.warn('No se pudieron crear notificaciones para solicitud de equipo', notificationError);
  }
}
