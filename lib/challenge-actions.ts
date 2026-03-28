import { supabase } from '@/lib/supabase';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
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
        opponentShieldUrl: row.opponent_shield_url ? getSupabaseStorageUrl('shields', row.opponent_shield_url) : null,
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

// Valida las restricciones de dominio para un desafío de RANKING.
// Retorna un error si no se puede desafiar, o eloDiffWarning=true si la diferencia > 400.
export async function validateRankingChallenge(
    fromTeamId: string,
    toTeamId: string,
): Promise<{ canChallenge: boolean; errorMessage?: string; eloDiffWarning: boolean }> {
    // 1. ELO de ambos equipos y temporada activa en paralelo
    const [fromRes, toRes, seasonRes] = await Promise.all([
        supabase.from('teams').select('elo_rating').eq('id', fromTeamId).single(),
        supabase.from('teams').select('elo_rating').eq('id', toTeamId).single(),
        supabase.from('seasons').select('id').eq('is_active', true).maybeSingle(),
    ]);

    const eloDiff = Math.abs((fromRes.data?.elo_rating ?? 1000) - (toRes.data?.elo_rating ?? 1000));
    const eloDiffWarning = eloDiff > 400;

    // 2. Anti-farming: jugadores en común
    const [fromMembers, toMembers] = await Promise.all([
        supabase.from('team_members').select('profile_id').eq('team_id', fromTeamId),
        supabase.from('team_members').select('profile_id').eq('team_id', toTeamId),
    ]);
    const fromIds = new Set((fromMembers.data ?? []).map(m => m.profile_id));
    const sharedCount = (toMembers.data ?? []).filter(m => fromIds.has(m.profile_id)).length;
    if (sharedCount >= 2) {
        return {
            canChallenge: false,
            errorMessage: 'Los equipos comparten 2 o más jugadores. No se permiten partidos de ranking entre ellos.',
            eloDiffWarning,
        };
    }

    // 3. Cooldown 30 días
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentMatches } = await supabase
        .from('matches')
        .select('id')
        .eq('match_type', 'RANKING')
        .in('status', ['FINALIZADO', 'WO_A', 'WO_B'])
        .gte('created_at', thirtyDaysAgo)
        .or(`and(team_a_id.eq.${fromTeamId},team_b_id.eq.${toTeamId}),and(team_a_id.eq.${toTeamId},team_b_id.eq.${fromTeamId})`)
        .limit(1);

    if ((recentMatches ?? []).length > 0) {
        return {
            canChallenge: false,
            errorMessage: 'Deben pasar 30 días desde el último partido de ranking entre estos equipos.',
            eloDiffWarning,
        };
    }

    // 4. Máximo 3 partidos de ranking por temporada entre los mismos equipos
    if (seasonRes.data) {
        const { data: seasonMatches } = await supabase
            .from('matches')
            .select('id')
            .eq('match_type', 'RANKING')
            .eq('season_id', seasonRes.data.id)
            .in('status', ['PENDIENTE', 'CONFIRMADO', 'EN_VIVO', 'FINALIZADO', 'EN_DISPUTA', 'WO_A', 'WO_B'])
            .or(`and(team_a_id.eq.${fromTeamId},team_b_id.eq.${toTeamId}),and(team_a_id.eq.${toTeamId},team_b_id.eq.${fromTeamId})`);

        if ((seasonMatches ?? []).length >= 3) {
            return {
                canChallenge: false,
                errorMessage: 'Máximo 3 partidos de ranking por temporada entre los mismos equipos.',
                eloDiffWarning,
            };
        }
    }

    return { canChallenge: true, eloDiffWarning };
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
): Promise<{ matchId: string; conversationId: string }> {
    // Creates match + conversation atomically and marks challenge ACEPTADA
    // accept_challenge is not in generated types yet, cast through unknown
    const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    }).rpc('accept_challenge', { p_challenge_id: challengeId });

    if (error) throw error;

    const result = data as { matchId: string; conversationId: string };

    void notifyTeamLeaders(
        fromTeamId,
        'DESAFIO_ACEPTADO',
        '✅ ¡Desafío aceptado!',
        'Tu desafío fue aceptado. ¡Ya tienen un partido creado!',
        { challengeId, matchId: result.matchId }
    );

    return result;
}
