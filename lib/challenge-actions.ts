import { supabase } from '@/lib/supabase';
import type { ChallengeInboxEntry } from '@/components/ranking/types';
import type { Database } from '@/types/supabase';

type NotificationType = Database['public']['Enums']['notification_type'];

export async function fetchChallengesInbox(teamId: string): Promise<ChallengeInboxEntry[]> {
    const { data, error } = await supabase.rpc('get_team_challenges_inbox', { p_team_id: teamId });
    if (error) throw error;

    return (data || []).map((row: any) => ({
        challengeId: row.challenge_id,
        createdAt: row.created_at,
        status: row.status,
        matchType: row.match_type,
        direction: row.direction,
        opponentTeamId: row.opponent_team_id,
        opponentTeamName: row.opponent_team_name,
        opponentShieldUrl: row.opponent_shield_url,
        opponentElo: row.opponent_elo,
        creatorName: row.creator_name,
    }));
}

export async function updateChallengeStatus(challengeId: string, status: 'ACEPTADA' | 'RECHAZADA') {
    const { error } = await supabase
        .from('challenges')
        .update({ status })
        .eq('id', challengeId);
    if (error) throw error;
}

export async function cancelChallenge(challengeId: string) {
    const { error } = await supabase
        .from('challenges')
        .update({ status: 'CANCELADA' })
        .eq('id', challengeId);
    if (error) throw error;
}

// Devuelve true si hay un desafío activo (status ENVIADA) entre los dos equipos
export async function getActiveChallengeWithTeam(myTeamId: string, opponentTeamId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('challenges')
        .select('id')
        .eq('status', 'ENVIADA')
        .or(`and(from_team_id.eq.${myTeamId},to_team_id.eq.${opponentTeamId}),and(from_team_id.eq.${opponentTeamId},to_team_id.eq.${myTeamId})`)
        .limit(1);
    if (error) throw error;
    return (data?.length ?? 0) > 0;
}

async function notifyTeamLeaders(teamId: string, type: NotificationType, title: string, body: string, data: Record<string, string>) {
    try {
        // Traemos los capitanes y subcapitanes del equipo
        const { data: members } = await supabase
            .from('team_members')
            .select('profile_id')
            .eq('team_id', teamId)
            .in('role', ['CAPITAN', 'SUBCAPITAN']);

        if (!members || members.length === 0) return;

        await supabase.from('notifications').insert(
            members.map(m => ({
                profile_id: m.profile_id,
                type,
                title,
                body,
                data,
            }))
        );
    } catch {
        // Silenciamos errores de notificación para no bloquear el flujo principal
    }
}

export async function sendChallenge(
    fromTeamId: string,
    toTeamId: string,
    createdBy: string,
    matchType: 'RANKING' | 'AMISTOSO'
): Promise<{ challengeId: string }> {
    const alreadyActive = await getActiveChallengeWithTeam(fromTeamId, toTeamId);
    if (alreadyActive) throw new Error('Ya hay un desafío activo con este equipo. Esperá que sea respondido o cancelado primero.');

    const { data, error } = await supabase
        .from('challenges')
        .insert({
            from_team_id: fromTeamId,
            to_team_id: toTeamId,
            created_by: createdBy,
            match_type: matchType
        })
        .select('id')
        .single();

    if (error) throw error;

    // Notificar a los líderes del equipo rival
    const typeLabel = matchType === 'RANKING' ? 'de ranking' : 'amistoso';
    void notifyTeamLeaders(
        toTeamId,
        'DESAFIO_RECIBIDO',
        '⚔️ Nuevo desafío recibido',
        `Recibiste un desafío ${typeLabel}. ¡Aceptalo desde la pestaña de Ranking!`,
        { challengeId: data.id, fromTeamId, matchType }
    );

    return { challengeId: data.id };
}

export async function acceptChallengeWithNotification(
    challengeId: string,
    fromTeamId: string,
): Promise<void> {
    await updateChallengeStatus(challengeId, 'ACEPTADA');

    void notifyTeamLeaders(
        fromTeamId,
        'DESAFIO_ACEPTADO',
        '✅ ¡Desafío aceptado!',
        'Tu desafío fue aceptado. ¡Coordinen el partido!',
        { challengeId }
    );
}
