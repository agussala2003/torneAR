import { supabase } from '@/lib/supabase';
import { TeamManageViewData, TeamDetailRow, TeamMemberRow, TeamJoinRequestRow } from '@/components/team-manage/types';
import { sendPushNotification } from '@/lib/push-notifications';
import { TeamCategory, TeamFormat, TeamRole, getTeamRoleLabel } from '@/lib/team-options';
import { decode } from 'base64-arraybuffer';

export async function fetchTeamManageViewData(teamId: string, profileId: string | undefined): Promise<TeamManageViewData> {
  const [teamRes, membersRes, pendingRes, historyRes] = await Promise.all([
    supabase
      .from('teams')
      .select('id, name, zone, category, preferred_format, invite_code, elo_rating, matches_played, fair_play_score, shield_url')
      .eq('id', teamId)
      .maybeSingle(),
    supabase
      .from('team_members')
      .select('profile_id, role, joined_at, profiles(id, full_name, username, avatar_url, preferred_position, expo_push_token)')
      .eq('team_id', teamId)
      .order('joined_at', { ascending: true }),
    supabase
      .from('team_join_requests')
      .select('id, profile_id, status, created_at, profiles(id, full_name, username, avatar_url, preferred_position, expo_push_token)')
      .eq('team_id', teamId)
      .eq('status', 'PENDIENTE')
      .order('created_at', { ascending: true }),
    supabase
      .from('team_join_requests')
      .select('id, profile_id, status, created_at, profiles(id, full_name, username, avatar_url, preferred_position, expo_push_token)')
      .eq('team_id', teamId)
      .in('status', ['ACEPTADA', 'RECHAZADA'])
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (teamRes.error) throw teamRes.error;
  if (membersRes.error) throw membersRes.error;
  if (pendingRes.error) throw pendingRes.error;
  if (historyRes.error) throw historyRes.error;

  const membersData = (membersRes.data as TeamMemberRow[] | null) ?? [];
  const selfRole = profileId ? membersData.find((member) => member.profile_id === profileId)?.role : null;
  const selfCanModerate = selfRole === 'CAPITAN' || selfRole === 'SUBCAPITAN';

  return {
    team: (teamRes.data as TeamDetailRow | null) ?? null,
    members: membersData,
    pendingRequests: selfCanModerate ? ((pendingRes.data as TeamJoinRequestRow[] | null) ?? []) : [],
    historyRequests: selfCanModerate ? ((historyRes.data as TeamJoinRequestRow[] | null) ?? []) : [],
  };
}

export async function uploadTeamShield(teamId: string, base64: string, mimeType: string): Promise<void> {
  const fileData = decode(base64);
  const fileExt = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const filePath = `${teamId}/shield-${Date.now()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('shields')
    .upload(filePath, fileData, { cacheControl: '3600', upsert: true, contentType: mimeType });

  if (uploadError) throw uploadError;

  const { error: updateError } = await supabase
    .from('teams')
    .update({ shield_url: filePath, updated_at: new Date().toISOString() })
    .eq('id', teamId);

  if (updateError) throw updateError;
}

export async function updateTeam(
  teamId: string, 
  data: { name: string; zone: string; category: TeamCategory; preferred_format: TeamFormat }
): Promise<void> {
  const { error } = await supabase
    .from('teams')
    .update({
      name: data.name,
      zone: data.zone,
      category: data.category,
      preferred_format: data.preferred_format,
      updated_at: new Date().toISOString(),
    })
    .eq('id', teamId);

  if (error) throw error;
}

export async function acceptJoinRequest(request: TeamJoinRequestRow, team: { id: string; name: string }): Promise<void> {
  const { error: insertMemberError } = await supabase.from('team_members').insert({
    team_id: team.id,
    profile_id: request.profile_id,
    role: 'JUGADOR',
  });

  if (insertMemberError && insertMemberError.code !== '23505') throw insertMemberError;

  const { error: updateRequestError } = await supabase
    .from('team_join_requests')
    .update({ status: 'ACEPTADA', updated_at: new Date().toISOString() })
    .eq('id', request.id)
    .eq('status', 'PENDIENTE');

  if (updateRequestError) throw updateRequestError;
  
  if (request.profiles?.expo_push_token) {
    void sendPushNotification(request.profiles.expo_push_token, "¡Solicitud aceptada!", `Fuiste aceptado en el equipo ${team.name}.`);
  }

  await supabase.from('notifications').insert({
    profile_id: request.profile_id,
    type: 'SOLICITUD_UNION_ACEPTADA',
    title: '¡Solicitud aceptada!',
    body: `Fuiste aceptado en el equipo ${team.name}.`,
    data: { team_id: team.id },
  });
}

export async function rejectJoinRequest(requestId: string): Promise<void> {
  const { error } = await supabase
    .from('team_join_requests')
    .update({ status: 'RECHAZADA', updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', 'PENDIENTE');

  if (error) throw error;
}

export async function updateMemberRole(
  teamId: string, 
  profileId: string, 
  role: TeamRole, 
  team: { id: string; name: string },
  pushToken?: string | null
): Promise<void> {
  const { error } = await supabase
    .from('team_members')
    .update({ role })
    .eq('team_id', teamId)
    .eq('profile_id', profileId);

  if (error) throw error;
  
  if (pushToken) {
    void sendPushNotification(
      pushToken,
      "Rol de equipo actualizado",
      `Tu rol en el equipo ${team.name} ahora es ${getTeamRoleLabel(role)}.`
    );
  }

  await supabase.from('notifications').insert({
    profile_id: profileId,
    type: 'MENSAJE_NUEVO',
    title: 'Rol de equipo actualizado',
    body: `Tu rol en el equipo ${team.name} ahora es ${getTeamRoleLabel(role)}.`,
    data: { team_id: teamId },
  });
}

export async function removeMember(
  teamId: string, 
  profileId: string, 
  team: { id: string; name: string },
  pushToken?: string | null
): Promise<void> {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('profile_id', profileId);

  if (error) throw error;

  if (pushToken) {
    void sendPushNotification(
      pushToken,
      "Eliminado del equipo",
      `Fuiste removido del equipo ${team.name}.`
    );
  }

  await supabase.from('notifications').insert({
    profile_id: profileId,
    type: 'MENSAJE_NUEVO',
    title: 'Eliminado del equipo',
    body: `Fuiste removido del equipo ${team.name}.`,
    data: { team_id: teamId },
  });
}

export async function leaveTeam(teamId: string, profileId: string): Promise<void> {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('profile_id', profileId);

  if (error) throw error;
}

export async function transferCaptain(
  teamId: string, 
  fromProfileId: string, 
  toProfileId: string,
  newCaptainPreviousRole: TeamRole
): Promise<void> {
  const { error: transferError } = await supabase
    .from('team_members')
    .update({ role: 'CAPITAN' })
    .eq('team_id', teamId)
    .eq('profile_id', toProfileId);

  if (transferError) throw transferError;

  const { error: leaveError } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('profile_id', fromProfileId);

  if (leaveError) {
    await supabase
      .from('team_members')
      .update({ role: newCaptainPreviousRole })
      .eq('team_id', teamId)
      .eq('profile_id', toProfileId);
    throw leaveError;
  }
}
