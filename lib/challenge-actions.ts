import { supabase, supabaseRpc } from '@/lib/supabase';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import type { ChallengeInboxEntry } from '@/components/ranking/types';
import type { Database } from '@/types/supabase';

type NotificationType = Database['public']['Enums']['notification_type'];

// Row shape returned by the get_team_challenges_inbox RPC
type ChallengesInboxRow = {
  challenge_id: string;
  created_at: string;
  status: 'ENVIADA' | 'ACEPTADA' | 'RECHAZADA' | 'CANCELADA';
  match_type: 'RANKING' | 'AMISTOSO';
  direction: 'ENVIADO' | 'RECIBIDO';
  opponent_team_id: string;
  opponent_team_name: string;
  opponent_shield_url: string | null;
  opponent_elo: number;
  creator_name: string;
};

export async function fetchChallengesInbox(teamId: string): Promise<ChallengeInboxEntry[]> {
  const { data, error } = await supabase.rpc('get_team_challenges_inbox', { p_team_id: teamId });
  if (error) throw error;

  return (data as ChallengesInboxRow[] ?? []).map((row) => ({
    challengeId: row.challenge_id,
    createdAt: row.created_at,
    status: row.status,
    matchType: row.match_type,
    direction: row.direction,
    opponentTeamId: row.opponent_team_id,
    opponentTeamName: row.opponent_team_name,
    opponentShieldUrl: row.opponent_shield_url
      ? getSupabaseStorageUrl('shields', row.opponent_shield_url)
      : null,
    opponentElo: row.opponent_elo,
    creatorName: row.creator_name,
  }));
}

// Direct table update — protected by RLS (to_team can only set RECHAZADA)
export async function updateChallengeStatus(challengeId: string, status: 'RECHAZADA') {
  const { error } = await supabase
    .from('challenges')
    .update({ status })
    .eq('id', challengeId);
  if (error) throw error;
}

// Direct table update — protected by RLS (from_team can only set CANCELADA)
export async function cancelChallenge(challengeId: string) {
  const { error } = await supabase
    .from('challenges')
    .update({ status: 'CANCELADA' })
    .eq('id', challengeId);
  if (error) throw error;
}

// Returns true if there is an active (ENVIADA) challenge between the two teams.
// Used for UI state only (show "already challenged" badge) — not a security gate.
export async function getActiveChallengeWithTeam(
  myTeamId: string,
  opponentTeamId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('challenges')
    .select('id')
    .eq('status', 'ENVIADA')
    .or(
      `and(from_team_id.eq.${myTeamId},to_team_id.eq.${opponentTeamId}),` +
      `and(from_team_id.eq.${opponentTeamId},to_team_id.eq.${myTeamId})`,
    )
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

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

export interface SendChallengeResult {
  challengeId: string;
  eloDiffWarning: boolean;
}

// Sends a challenge via the send_challenge RPC.
// All business-rule validations run server-side (anti-farming, cooldown, season limit, auth).
export async function sendChallenge(
  fromTeamId: string,
  toTeamId: string,
  matchType: 'RANKING' | 'AMISTOSO',
): Promise<SendChallengeResult> {
  const { data, error } = await supabaseRpc('send_challenge', {
    p_from_team_id: fromTeamId,
    p_to_team_id: toTeamId,
    p_match_type: matchType,
  });
  if (error) throw error;

  const result = data as SendChallengeResult;

  const typeLabel = matchType === 'RANKING' ? 'de ranking' : 'amistoso';
  void notifyTeamLeaders(
    toTeamId,
    'DESAFIO_RECIBIDO',
    '⚔️ Nuevo desafío recibido',
    `Recibiste un desafío ${typeLabel}. ¡Aceptalo desde la pestaña de Ranking!`,
    { challengeId: result.challengeId, fromTeamId, matchType },
  );

  return result;
}

export async function acceptChallengeWithNotification(
  challengeId: string,
  fromTeamId: string,
): Promise<{ matchId: string; conversationId: string }> {
  const { data, error } = await supabaseRpc('accept_challenge', { p_challenge_id: challengeId });
  if (error) throw error;

  const result = data as { matchId: string; conversationId: string };

  void notifyTeamLeaders(
    fromTeamId,
    'DESAFIO_ACEPTADO',
    '✅ ¡Desafío aceptado!',
    'Tu desafío fue aceptado. ¡Ya tienen un partido creado!',
    { challengeId, matchId: result.matchId },
  );

  return result;
}
