import { supabase } from '@/lib/supabase';
import type {
    RankingFiltersState, RankingTeamEntry, RivalTeamEntry,
    PlayerLeaderboardEntry, RankingViewData, LeaderboardStat
} from '@/components/ranking/types';

// Helper para mapear fila de DB a objeto TS
function mapToRankingTeamEntry(row: any, userTeamIds: string[]): RankingTeamEntry {
    return {
        rankPosition: Number(row.rank_position),
        teamId: row.team_id,
        teamName: row.team_name,
        shieldUrl: row.shield_url,
        zone: row.zone,
        category: row.category,
        preferredFormat: row.preferred_format,
        eloRating: row.elo_rating,
        fairPlayScore: Number(row.fair_play_score),
        seasonWins: row.season_wins,
        seasonLosses: row.season_losses,
        seasonDraws: row.season_draws,
        matchesPlayed: row.matches_played,
        isMyTeam: userTeamIds.includes(row.team_id),
    };
}

// 1. Fetch de la tabla de posiciones (con filtros)
export async function fetchRankingWithFilters(
    filters: RankingFiltersState,
    userTeamIds: string[],
    activeTeamElo: number | null
): Promise<RankingTeamEntry[]> {
    const { data, error } = await supabase.rpc('get_team_ranking', {
        p_zone: filters.zone ?? undefined,
        p_category: filters.category ?? undefined,
        p_format: filters.format ?? undefined,
    });
    if (error) throw error;

    const rows = (data || []) as any[];

    // Filtrar ELO en el cliente si "Rivales Ideales" está activo
    const filtered = filters.rivalesIdeales && activeTeamElo !== null
        ? rows.filter((row) => row.elo_rating >= activeTeamElo - 200 && row.elo_rating <= activeTeamElo + 200)
        : rows;

    return filtered.map((row) => mapToRankingTeamEntry(row, userTeamIds));
}

// 2. Búsqueda libre de equipos
export async function searchRivalTeams(
    search: string,
    filters: RankingFiltersState,
    userTeamIds: string[],
    activeTeamElo: number | null
): Promise<RivalTeamEntry[]> {
    const minElo = filters.rivalesIdeales && activeTeamElo !== null ? Math.max(0, activeTeamElo - 200) : 0;
    const maxElo = filters.rivalesIdeales && activeTeamElo !== null ? activeTeamElo + 200 : 9999;

    const { data, error } = await supabase.rpc('search_teams', {
        p_search: search || undefined,
        p_zone: filters.zone ?? undefined,
        p_category: filters.category ?? undefined,
        p_format: filters.format ?? undefined,
        p_min_elo: minElo,
        p_max_elo: maxElo,
    });
    if (error) throw error;

    return (data || []).map((row: any) => {
        const entry = mapToRankingTeamEntry(row, userTeamIds);
        return { ...entry, inRanking: row.in_ranking };
    });
}

interface FallbackPlayer {
    profileId: string;
    fullName: string;
    avatarUrl: string | null;
    teamId: string | null;
    teamName: string | null;
}

// 3. Fetch del Leaderboard de jugadores
export async function fetchPlayerLeaderboard(
    stat: LeaderboardStat,
    zone: string | null,
    seasonId: string | null,
    fallback?: FallbackPlayer
): Promise<PlayerLeaderboardEntry[]> {
    const { data, error } = await supabase.rpc('get_player_leaderboard', {
        p_stat: stat,
        p_zone: zone ?? undefined,
        p_season_id: seasonId ?? undefined,
    });
    if (error) throw error;

    const entries: PlayerLeaderboardEntry[] = (data || []).map((row: any) => ({
        rankPosition: Number(row.rank_position),
        profileId: row.profile_id,
        fullName: row.full_name,
        username: row.username ?? undefined,
        avatarUrl: row.avatar_url,
        teamId: row.team_id,
        teamName: row.team_name,
        zone: row.zone ?? undefined,
        value: Number(row.value),
        isMyPlayer: row.profile_id === fallback?.profileId,
    }));

    // Si el usuario no aparece en los resultados, lo inyectamos al final con valor 0
    if (fallback && !entries.some(e => e.profileId === fallback.profileId)) {
        entries.push({
            rankPosition: entries.length + 1,
            profileId: fallback.profileId,
            fullName: fallback.fullName,
            avatarUrl: fallback.avatarUrl,
            teamId: fallback.teamId ?? '',
            teamName: fallback.teamName ?? '',
            value: 0,
            isMyPlayer: true,
        });
    }

    return entries;
}