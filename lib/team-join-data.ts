import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { resolveShieldUrl } from '@/lib/supabase-storage';
import { TeamCategory, TeamFormat, TeamRole } from '@/lib/team-options';

export type TeamPreview = {
  id: string;
  name: string;
  zone: string;
  category: TeamCategory;
  preferred_format: TeamFormat;
  elo_rating: number;
  /** Escudo ya resuelto a URL absoluta. `null` si el club no cargo uno. */
  shieldUrl: string | null;
};

type TeamPreviewRow = Omit<TeamPreview, 'shieldUrl'> & { shield_url: string | null };

export async function findTeamByCode(code: string): Promise<TeamPreview | null> {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, zone, category, preferred_format, elo_rating, shield_url')
    .eq('invite_code', code)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) return null;

  const { shield_url, ...team } = data as TeamPreviewRow;
  return { ...team, shieldUrl: resolveShieldUrl(shield_url) };
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
    // R8: la solicitud SÍ quedó creada (el throw de arriba ya pasó). Lo que se
    // pierde es el aviso al capitán, o sea que la solicitud queda esperando en
    // una bandeja que nadie sabe que tiene algo.
    Logger.error('Error enviando notificación: solicitud de unión a equipo', {
      scope: 'team-join-data.requestToJoinTeam',
      teamId,
      requesterProfileId: profile.id,
      error: notificationError,
    });
  }
}
