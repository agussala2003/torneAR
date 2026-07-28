import { supabase } from '@/lib/supabase';
import { TeamManageViewData, TeamDetailRow, TeamMemberRow, TeamJoinRequestRow } from '@/components/team-manage/types';
import { sendPushNotification } from '@/lib/push-notifications';
import { TeamCategory, TeamFormat, TeamRole, getTeamRoleLabel } from '@/lib/team-options';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { decode } from 'base64-arraybuffer';

// ─── Errores estables de las RPCs de membresía ───────────────────────────────
// Desde la migración 20260723123000 el DELETE directo sobre team_members está
// revocado: las salidas entran sólo por RPCs SECURITY DEFINER que fijan
// tornear.leave_reason para el ledger team_stints. Cada una lanza con prefijo
// estable ("CODIGO: detalle"), igual que submit_team_checkin, así que acá se
// mapea código → mensaje sin parsear texto libre del servidor.

export const TEAM_ACTION_ERROR_CODES = [
  'PROFILE_NOT_FOUND',
  'NOT_A_MEMBER',
  'NOT_TEAM_ADMIN',
  'NOT_TEAM_CAPTAIN',
  'CAPTAIN_MUST_TRANSFER',
  'CANNOT_REMOVE_SELF',
  'CANNOT_REMOVE_CAPTAIN',
  'ACTIVE_MATCH',
  'INVALID_PAYLOAD',
  // transfer_to_team
  'TEAM_NOT_FOUND',
  'ALREADY_MEMBER',
  'NOT_APPROVED',
] as const;

export type TeamActionErrorCode = (typeof TEAM_ACTION_ERROR_CODES)[number];

const TEAM_ACTION_ERROR_MESSAGES: Record<TeamActionErrorCode, string> = {
  PROFILE_NOT_FOUND: 'No pudimos identificar tu perfil. Cerrá sesión y volvé a entrar.',
  NOT_A_MEMBER: 'Ya no sos miembro de este equipo.',
  NOT_TEAM_ADMIN: 'Solo el capitán o subcapitán puede hacer esto.',
  NOT_TEAM_CAPTAIN: 'Solo el capitán puede ceder la capitanía.',
  CAPTAIN_MUST_TRANSFER:
    'Sos el capitán: cedé la capitanía a otro jugador antes de abandonar el equipo.',
  CANNOT_REMOVE_SELF: 'Para salir del equipo usá la opción "Abandonar equipo".',
  CANNOT_REMOVE_CAPTAIN: 'No se puede remover al capitán del equipo.',
  ACTIVE_MATCH:
    'Tenés un partido confirmado o en curso con este equipo. Esperá a que termine para salir.',
  INVALID_PAYLOAD: 'Los datos de la operación no son válidos. Actualizá la pantalla e intentá de nuevo.',
  TEAM_NOT_FOUND: 'El equipo de destino ya no existe.',
  ALREADY_MEMBER: 'Ya sos parte de este equipo.',
  NOT_APPROVED: 'El equipo todavía no aprobó tu incorporación. Esperá a que acepten tu solicitud.',
};

export class TeamActionError extends Error {
  readonly code: TeamActionErrorCode;

  constructor(code: TeamActionErrorCode, message: string) {
    super(message);
    this.name = 'TeamActionError';
    this.code = code;
  }
}

function parseTeamActionErrorCode(error: unknown): TeamActionErrorCode | null {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
  const prefix = message.split(':')[0]?.trim();
  return (TEAM_ACTION_ERROR_CODES as readonly string[]).includes(prefix)
    ? (prefix as TeamActionErrorCode)
    : null;
}

/** Convierte cualquier error de estas RPCs en un mensaje presentable al usuario. */
export function getTeamActionErrorMessage(error: unknown, fallback?: string): string {
  if (error instanceof TeamActionError) return error.message;
  const code = parseTeamActionErrorCode(error);
  return code ? TEAM_ACTION_ERROR_MESSAGES[code] : getGenericSupabaseErrorMessage(error, fallback);
}

/** Normaliza el error de una RPC de membresía antes de propagarlo. */
function throwTeamActionError(error: unknown): never {
  const code = parseTeamActionErrorCode(error);
  if (code) throw new TeamActionError(code, TEAM_ACTION_ERROR_MESSAGES[code]);
  throw error;
}

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

// El capitán/subcapitán ACEPTA la solicitud, pero ya NO agrega al jugador al
// plantel: sólo marca la solicitud como ACEPTADA. El alta la dispara el propio
// jugador al confirmar el traspaso (transfer_to_team), que exige justamente una
// team_join_requests en estado ACEPTADA.
//
// Por qué el flujo en dos pasos: transfer_to_team cierra el ciclo del club
// anterior con motivo TRANSFERENCIA de forma atómica. Si el capitán insertara
// directo en team_members (como antes), el jugador entraría al equipo sin pasar
// por esa RPC y su salida del club previo quedaría registrada como ABANDONO en
// lugar de TRANSFERENCIA. Además, la decisión de dejar su equipo actual pasa a
// ser explícita del jugador y no un efecto colateral de que lo acepten.
export async function acceptJoinRequest(request: TeamJoinRequestRow, team: { id: string; name: string }): Promise<void> {
  const { error: updateRequestError } = await supabase
    .from('team_join_requests')
    .update({ status: 'ACEPTADA', updated_at: new Date().toISOString() })
    .eq('id', request.id)
    .eq('status', 'PENDIENTE');

  if (updateRequestError) throw updateRequestError;

  if (request.profiles?.expo_push_token) {
    void sendPushNotification(
      request.profiles.expo_push_token,
      '¡Solicitud aceptada!',
      `${team.name} aceptó tu solicitud. Entrá a "Mis solicitudes" y confirmá tu traspaso para unirte.`,
    );
  }

  await supabase.from('notifications').insert({
    profile_id: request.profile_id,
    type: 'SOLICITUD_UNION_ACEPTADA',
    title: '¡Solicitud aceptada!',
    body: `${team.name} aceptó tu solicitud. Confirmá tu traspaso para unirte al equipo.`,
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
    type: 'ROL_ACTUALIZADO',
    title: 'Rol de equipo actualizado',
    body: `Tu rol en el equipo ${team.name} ahora es ${getTeamRoleLabel(role)}.`,
    data: { team_id: teamId },
  });
}

// Expulsión por el capitán/subcapitán. Cierra el ciclo en team_stints con
// motivo EXPULSADO (antes, con el DELETE directo, quedaba como ABANDONO).
export async function removeMember(
  teamId: string,
  profileId: string,
  team: { id: string; name: string },
  pushToken?: string | null
): Promise<void> {
  const { error } = await supabase.rpc('remove_team_member', {
    p_team_id: teamId,
    p_profile_id: profileId,
  });

  if (error) throwTeamActionError(error);

  if (pushToken) {
    void sendPushNotification(
      pushToken,
      "Eliminado del equipo",
      `Fuiste removido del equipo ${team.name}.`
    );
  }

  await supabase.from('notifications').insert({
    profile_id: profileId,
    type: 'EXPULSADO_EQUIPO',
    title: 'Eliminado del equipo',
    body: `Fuiste removido del equipo ${team.name}.`,
    data: { team_id: teamId },
  });
}

// El jugador abandona el equipo. Cierra el ciclo en team_stints con motivo
// ABANDONO. El perfil lo resuelve la RPC desde auth.uid(), por eso ya no se
// pasa profileId: nadie puede hacer salir a otro por esta vía.
//
// La RPC rechaza al CAPITAN (CAPTAIN_MUST_TRANSFER) y a quien tenga partidos
// CONFIRMADO/EN_VIVO (ACTIVE_MATCH). Ambos llegan como TeamActionError.
export async function leaveTeam(teamId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_team_as_member', {
    p_team_id: teamId,
  });

  if (error) throwTeamActionError(error);
}

// El jugador confirma su traspaso a un equipo que ya aceptó su solicitud.
// Atómico en el servidor: cierra el ciclo en `fromTeamId` con motivo
// TRANSFERENCIA y abre el nuevo en `toTeamId`. `fromTeamId` null = alta como
// agente libre (sin ciclo previo que cerrar).
//
// La RPC exige una team_join_requests ACEPTADA para `toTeamId` (NOT_APPROVED si
// no la hay) y rechaza si ya sos miembro (ALREADY_MEMBER) o si sos capitán del
// club de origen (CAPTAIN_MUST_TRANSFER).
export async function transferToTeam(
  toTeamId: string,
  fromTeamId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('transfer_to_team', {
    p_to_team_id: toTeamId,
    // Omitido si es null: la RPC toma su DEFAULT (agente libre) en vez de un
    // literal null explícito.
    p_from_team_id: fromTeamId ?? undefined,
  });

  if (error) throwTeamActionError(error);
}

// Transfiere la capitanía y deja al capitán actual en el equipo como SUBCAPITÁN.
// Usar cuando el capitán cede el rol sin abandonar el equipo.
export async function grantCaptainRole(
  teamId: string,
  currentCaptainId: string,
  newCaptainId: string,
  newCaptainPreviousRole: TeamRole
): Promise<void> {
  const { error: promoteError } = await supabase
    .from('team_members')
    .update({ role: 'CAPITAN' })
    .eq('team_id', teamId)
    .eq('profile_id', newCaptainId);

  if (promoteError) throw promoteError;

  const { error: demoteError } = await supabase
    .from('team_members')
    .update({ role: 'SUBCAPITAN' })
    .eq('team_id', teamId)
    .eq('profile_id', currentCaptainId);

  if (demoteError) {
    // Rollback: restaurar rol previo del nuevo capitán
    await supabase
      .from('team_members')
      .update({ role: newCaptainPreviousRole })
      .eq('team_id', teamId)
      .eq('profile_id', newCaptainId);
    throw demoteError;
  }
}

// Transfiere la capitanía Y el capitán actual abandona el equipo.
// Usar cuando el capitán quiere salir y hay otros miembros.
//
// Ahora es UNA transacción del lado del servidor: promoción + salida se aplican
// juntas o no se aplica ninguna. La versión anterior hacía UPDATE y DELETE en
// dos viajes con rollback manual, y una caída entre medio dejaba al equipo con
// dos capitanes. Por eso ya no hace falta newCaptainPreviousRole.
export async function transferCaptain(teamId: string, toProfileId: string): Promise<void> {
  const { error } = await supabase.rpc('transfer_captaincy_and_leave', {
    p_team_id: teamId,
    p_to_profile_id: toProfileId,
  });

  if (error) throwTeamActionError(error);
}

// Elimina el equipo completo. Solo debe llamarse cuando el capitán es el último miembro.
// team_members tiene ON DELETE CASCADE, por lo que se eliminan todos los registros relacionados.
//
// ⚠️ El `.select()` no es decorativo: verifica FILAS AFECTADAS.
// Un DELETE que RLS filtra no es un error en Postgres — simplemente no matchea
// ninguna fila, y PostgREST responde 204 sin `error`. Mirando sólo `error`, el
// cliente cantaba "Equipo eliminado correctamente" mientras el equipo seguía
// vivo (faltaba la policy de DELETE sobre `teams`; ver la migración
// 20260727160000). Con el select, 0 filas devueltas = fallo explícito.
export async function deleteTeam(teamId: string): Promise<void> {
  const { data, error } = await supabase
    .from('teams')
    .delete()
    .eq('id', teamId)
    .select('id');

  if (error) {
    // 23503 = foreign_key_violation. Los FKs de historial deportivo (matches,
    // match_results, wo_claims, …) son NO ACTION a propósito: cascadearlos
    // borraría partidos que también le pertenecen al equipo rival. Que no se
    // pueda eliminar es correcto; lo que no servía era el error crudo.
    if ((error as { code?: string }).code === '23503') {
      throw new Error(
        'Este equipo tiene historial deportivo (partidos, resultados o reclamos) y no se puede eliminar. ' +
        'Podés dejarlo inactivo sin borrarlo.',
      );
    }
    throw error;
  }

  if (!data || data.length === 0) {
    throw new Error(
      'No se pudo eliminar el equipo: la base rechazó la operación. ' +
      'Verificá que seas el capitán y el único miembro.',
    );
  }
}
