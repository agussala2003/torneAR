import { supabase } from './supabase';
import type { Database } from '@/types/supabase';

type NotificationType = Database['public']['Enums']['notification_type'];
export type ApplicationStatus = 'PENDIENTE' | 'VISTA' | 'ACEPTADA' | 'RECHAZADA';
export type MarketPostType = 'TEAM' | 'PLAYER';

export interface MarketApplicationEntry {
  id: string;
  status: ApplicationStatus;
  createdAt: string;
  // Perfil real a notificar/responder — SIEMPRE un profile.id (el jugador en
  // posts de equipo, o el capitán que aplicó en posts de jugador).
  notifyProfileId: string;
  // Id para navegar/mostrar — un profile.id (jugador) o un team.id (equipo)
  // según el tipo de post. No confundir con notifyProfileId.
  displayId: string;
  displayName: string;
  displayAvatarOrShieldUrl: string | null;
  displaySubtitle: string | null; // posición (jugador) o zona (equipo)
}

/**
 * Resuelve el profiles.id del usuario autenticado.
 * IMPORTANTE: profiles.id ≠ auth.users.id — siempre usar este helper.
 */
async function getProfileId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();
  if (error || !data) throw new Error('Perfil no encontrado');
  return data.id;
}

// Notifica a CAPITAN/SUBCAPITAN de un equipo. Silencioso: nunca bloquea el flujo principal.
async function notifyTeamLeaders(
  teamId: string,
  type: NotificationType,
  title: string,
  body: string,
  data: Record<string, string>,
) {
  try {
    const { data: members } = await supabase
      .from('team_members')
      .select('profile_id')
      .eq('team_id', teamId)
      .in('role', ['CAPITAN', 'SUBCAPITAN']);

    if (!members || members.length === 0) return;

    await supabase.from('notifications').insert(
      members.map((m) => ({ profile_id: m.profile_id, type, title, body, data })),
    );
  } catch {
    // Silenciamos errores de notificación para no bloquear el flujo principal
  }
}

// Notifica a un único perfil. Silencioso: nunca bloquea el flujo principal.
async function notifyProfile(
  profileId: string,
  type: NotificationType,
  title: string,
  body: string,
  data: Record<string, string>,
) {
  try {
    await supabase.from('notifications').insert({ profile_id: profileId, type, title, body, data });
  } catch {
    // Silenciamos errores de notificación para no bloquear el flujo principal
  }
}

/**
 * Un jugador se postula a un post de equipo (busca jugador).
 * Idempotente: postularse dos veces al mismo post no falla ni duplica.
 */
export async function applyToTeamPost(postId: string, teamId: string): Promise<void> {
  const profileId = await getProfileId();

  const { error } = await supabase.from('market_team_post_applications').insert({
    post_id: postId,
    profile_id: profileId,
  });

  if (error && error.code !== '23505') throw error;
  if (error?.code === '23505') return; // ya se había postulado — no-op silencioso

  void notifyTeamLeaders(
    teamId,
    'POSTULACION_RECIBIDA',
    '📥 Nueva postulación',
    'Un jugador se postuló a tu publicación en el Mercado.',
    { postId },
  );
}

/**
 * Un equipo (capitán/subcapitán) se postula a un post de jugador (busca equipo/partido).
 * Idempotente: postularse dos veces al mismo post no falla ni duplica.
 */
export async function applyToPlayerPost(
  postId: string,
  teamId: string,
  postOwnerProfileId: string,
): Promise<void> {
  const applicantProfileId = await getProfileId();

  const { error } = await supabase.from('market_player_post_applications').insert({
    post_id: postId,
    team_id: teamId,
    applicant_profile_id: applicantProfileId,
  });

  if (error && error.code !== '23505') throw error;
  if (error?.code === '23505') return;

  void notifyProfile(
    postOwnerProfileId,
    'POSTULACION_RECIBIDA',
    '📥 Nueva postulación',
    'Un equipo se postuló a tu publicación en el Mercado.',
    { postId },
  );
}

/**
 * Postulaciones recibidas en un post propio, con datos básicos del postulante.
 */
export async function fetchApplicationsForPost(
  postId: string,
  postType: MarketPostType,
): Promise<MarketApplicationEntry[]> {
  if (postType === 'TEAM') {
    const { data, error } = await supabase
      .from('market_team_post_applications')
      .select('id, status, created_at, profile_id, profiles(full_name, avatar_url, preferred_position)')
      .eq('post_id', postId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return (data ?? []).map((row) => ({
      id: row.id,
      status: row.status as ApplicationStatus,
      createdAt: row.created_at,
      notifyProfileId: row.profile_id,
      displayId: row.profile_id,
      displayName: row.profiles?.full_name ?? 'Jugador',
      displayAvatarOrShieldUrl: row.profiles?.avatar_url ?? null,
      displaySubtitle: row.profiles?.preferred_position ?? null,
    }));
  }

  const { data, error } = await supabase
    .from('market_player_post_applications')
    .select('id, status, created_at, team_id, applicant_profile_id, teams(name, zone, shield_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    status: row.status as ApplicationStatus,
    createdAt: row.created_at,
    notifyProfileId: row.applicant_profile_id,
    displayId: row.team_id,
    displayName: row.teams?.name ?? 'Equipo',
    displayAvatarOrShieldUrl: row.teams?.shield_url ?? null,
    displaySubtitle: row.teams?.zone ?? null,
  }));
}

/**
 * Cantidad de postulaciones por post propio — para el badge "Ver postulaciones (N)".
 */
export async function fetchApplicationCounts(
  postIds: string[],
  postType: MarketPostType,
): Promise<Record<string, number>> {
  if (postIds.length === 0) return {};

  const table = postType === 'TEAM' ? 'market_team_post_applications' : 'market_player_post_applications';
  const { data, error } = await supabase
    .from(table)
    .select('post_id')
    .in('post_id', postIds);
  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ post_id: string }>) {
    counts[row.post_id] = (counts[row.post_id] ?? 0) + 1;
  }
  return counts;
}

/**
 * El dueño de la publicación acepta o rechaza una postulación.
 */
export async function respondToApplication(
  applicationId: string,
  postType: MarketPostType,
  status: 'ACEPTADA' | 'RECHAZADA',
  applicantProfileId: string,
): Promise<void> {
  const table = postType === 'TEAM' ? 'market_team_post_applications' : 'market_player_post_applications';
  const { error } = await supabase.from(table).update({ status }).eq('id', applicationId);
  if (error) throw error;

  void notifyProfile(
    applicantProfileId,
    'POSTULACION_RESPONDIDA',
    status === 'ACEPTADA' ? '✅ Postulación aceptada' : '❌ Postulación rechazada',
    status === 'ACEPTADA'
      ? 'Tu postulación en el Mercado fue aceptada.'
      : 'Tu postulación en el Mercado fue rechazada.',
    { applicationId },
  );
}
