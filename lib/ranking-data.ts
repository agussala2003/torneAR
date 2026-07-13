import { supabase } from '@/lib/supabase';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import type { Database } from '@/types/supabase';
import type {
    RankingFiltersState, RankingTeamEntry, RivalTeamEntry,
    PlayerLeaderboardEntry, LeaderboardStat
} from '@/components/ranking/types';

// Fila devuelta por get_team_ranking / search_teams. rank_position sólo lo trae
// get_team_ranking; in_ranking sólo search_teams — ambos opcionales acá.
type RankingRpcRow = {
    rank_position?: number;
    team_id: string;
    team_name: string;
    shield_url: string | null;
    zone: string;
    category: Database['public']['Enums']['team_category'];
    preferred_format: Database['public']['Enums']['team_format'];
    elo_rating: number;
    fair_play_score: number;
    season_wins: number;
    season_losses: number;
    season_draws: number;
    matches_played: number;
    in_ranking?: boolean;
};

// Helper para mapear fila de DB a objeto TS
function mapToRankingTeamEntry(row: RankingRpcRow, userTeamIds: string[]): RankingTeamEntry {
    return {
        rankPosition: Number(row.rank_position),
        teamId: row.team_id,
        teamName: row.team_name,
        shieldUrl: row.shield_url ? getSupabaseStorageUrl('shields', row.shield_url) : null,
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

    const rows = data ?? [];

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

    return (data ?? []).map((row) => {
        const entry = mapToRankingTeamEntry(row, userTeamIds);
        return { ...entry, inRanking: row.in_ranking ?? false };
    });
}

// ── Bootstrap del ranking (temporada activa, zonas, datos del equipo activo) ──

export interface ActiveTeamRankingInfo {
    eloRating: number;
    zone: string | null;
    category: Database['public']['Enums']['team_category'];
    format: Database['public']['Enums']['team_format'];
}

// Temporada activa (o null si no hay ninguna).
export async function fetchActiveSeason(): Promise<{ id: string; name: string } | null> {
    const { data, error } = await supabase
        .from('seasons')
        .select('id, name')
        .eq('is_active', true)
        .maybeSingle();
    if (error) throw error;
    return data;
}

// ELO + datos de filtro semilla del equipo activo (o null si no existe).
export async function fetchActiveTeamRankingInfo(teamId: string): Promise<ActiveTeamRankingInfo | null> {
    const { data, error } = await supabase
        .from('teams')
        .select('elo_rating, zone, category, preferred_format')
        .eq('id', teamId)
        .single();
    if (error || !data) return null;
    return {
        eloRating: data.elo_rating,
        zone: data.zone,
        category: data.category,
        format: data.preferred_format,
    };
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

    const entries: PlayerLeaderboardEntry[] = (data ?? []).map((row) => ({
        rankPosition: Number(row.rank_position),
        profileId: row.profile_id,
        fullName: row.full_name,
        username: row.username ?? undefined,
        avatarUrl: row.avatar_url ? getSupabaseStorageUrl('avatars', row.avatar_url) : null,
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
            avatarUrl: fallback.avatarUrl ? getSupabaseStorageUrl('avatars', fallback.avatarUrl) : null,
            teamId: fallback.teamId ?? '',
            teamName: fallback.teamName ?? '',
            value: 0,
            isMyPlayer: true,
        });
    }

    return entries;
}