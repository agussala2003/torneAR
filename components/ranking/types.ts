export type RankingMode = 'RANKING' | 'RIVALES';
export type LeaderboardStat = 'goals' | 'mvps' | 'matches';

export interface RankingFiltersState {
    zone: string | null;
    category: 'HOMBRES' | 'MUJERES' | 'MIXTO' | null;
    format: 'FUTBOL_5' | 'FUTBOL_6' | 'FUTBOL_7' | 'FUTBOL_8' | 'FUTBOL_9' | 'FUTBOL_11' | null;
    rivalesIdeales: boolean;
}

export interface RankingTeamEntry {
    rankPosition: number;
    teamId: string;
    teamName: string;
    shieldUrl: string | null;
    zone: string;
    category: string;
    preferredFormat: string;
    eloRating: number;
    fairPlayScore: number;
    seasonWins: number;
    seasonLosses: number;
    seasonDraws: number;
    matchesPlayed: number;
    isMyTeam: boolean;
}

export interface RivalTeamEntry extends Omit<RankingTeamEntry, 'rankPosition'> {
    inRanking: boolean;
}

export interface PlayerLeaderboardEntry {
    rankPosition: number;
    profileId: string;
    fullName: string;
    username?: string;
    avatarUrl: string | null;
    teamId: string;
    teamName: string;
    zone?: string;
    value: number;
    isMyPlayer?: boolean;
}

export interface ChallengeInboxEntry {
    challengeId: string;
    createdAt: string;
    status: 'ENVIADA' | 'ACEPTADA' | 'RECHAZADA' | 'CANCELADA'; // <- Cambio acá
    matchType: 'RANKING' | 'AMISTOSO';
    direction: 'RECIBIDO' | 'ENVIADO';
    opponentTeamId: string;
    opponentTeamName: string;
    opponentShieldUrl: string | null;
    opponentElo: number;
    creatorName: string;
}

export interface RankingViewData {
    activeTeamId: string | null;
    activeTeamElo: number | null;
    activeTeamZone: string | null;
    activeTeamCategory: any;
    activeTeamFormat: any;
    userTeamIds: string[];
    ranking: RankingTeamEntry[];
    playerLeaderboard: PlayerLeaderboardEntry[];
    activeSeason: { id: string; name: string } | null;
    unreadChallengesCount: number;
}