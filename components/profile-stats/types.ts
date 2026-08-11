import { Database } from '@/types/supabase';

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type TeamRole = Database['public']['Enums']['team_role'];

export type ProfileStatsSummary = {
  matchesPlayed: number;
  goals: number;
  mvps: number;
  wins: number;
  avgGoals: string;
  winPercent: string;
};

export type RecentMatchResult = {
  id: string;
  scheduledAt: string | null;
  status: string;
  matchType: string;
  rivalName: string;
  /** Escudo del rival, ya resuelto a URL absoluta. `null` si el club no cargo uno. */
  rivalShieldUrl: string | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  result: 'V' | 'E' | 'D' | null;
  /** Goles que convirtio ESTE jugador en el partido. 0 = no anoto. */
  playerGoals: number;
  /** El jugador fue elegido MVP del partido por su equipo. */
  isMvp: boolean;
  /**
   * Movimiento de Ranking del equipo en ese partido.
   *
   * `null` cuando no hubo (amistoso, partido sin cerrar) o cuando el historial
   * no se pudo leer: son casos distintos pero la UI hace lo mismo con los dos —
   * no pinta el badge. Un 0 explicito si se muestra: significa "no se movio".
   */
  rankDelta: number | null;
};

export type EarnedBadge = {
  id: string;
  name: string;
  slug: string;
  iconUrl: string;
  criteriaDescription: string;
  earnedAt: string;
  isEarned: boolean;
};

export type TeamEntry = {
  id: string;
  name: string;
  prRating: number;
  shieldUrl: string | null;
  role: TeamRole;
};

export type ProfileStatsViewData = {
  profile: ProfileRow;
  stats: ProfileStatsSummary;
  recentMatches: RecentMatchResult[];
  badges: EarnedBadge[];
  teams: TeamEntry[];
};
