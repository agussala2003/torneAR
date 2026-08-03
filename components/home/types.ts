import type { Database } from '@/types/supabase';

type TeamRole = Database['public']['Enums']['team_role'];
type MatchStatus = Database['public']['Enums']['match_status'];
type MatchType = Database['public']['Enums']['match_type'];
type TeamFormat = Database['public']['Enums']['team_format'];

export interface HomeTeamSnapshot {
  id: string;
  name: string;
  shieldUrl: string | null;
  eloRating: number;
  fairPlayScore: number;
  seasonWins: number;
  seasonDraws: number;
  seasonLosses: number;
  role: TeamRole;
}

export interface HomeMatchEntry {
  id: string;
  status: MatchStatus;
  matchType: MatchType;
  scheduledAt: string | null;
  format: TeamFormat | null;
  teamA: { id: string; name: string; shieldUrl: string | null; eloRating: number };
  teamB: { id: string; name: string; shieldUrl: string | null; eloRating: number };
  myTeamId: string;
}

/**
 * D12 — Las señales de la bandeja "Requieren tu atención".
 *
 * Las tres primeras son las originales. Las cuatro siguientes son las que
 * faltaban, y no por casualidad: **todas tienen vencimiento real**. Una
 * propuesta sin responder termina cancelada por `sweep_stale_matches`, una
 * solicitud de cancelación sin responder deja el partido comprometido, un
 * `EN_VIVO` sin resultado se cierra sin computar a las 24 h, y una postulación
 * sin mirar envejece hasta que el aviso se cierra. Eran justo las acciones que
 * más caro salía no ver.
 */
export type PendingActionType =
  | 'TEAM_REQUEST'
  | 'CHALLENGE_RECEIVED'
  | 'DISPUTE'
  | 'MATCH_PROPOSAL'
  | 'CANCELLATION_REQUEST'
  | 'LIVE_RESULT'
  | 'MARKET_APPLICATION';

export interface PendingAction {
  type: PendingActionType;
  count: number;
  label: string;
  /**
   * Partido al que apunta la tarjeta, cuando la acción es de UNO solo. Con
   * varios queda `null` y la navegación cae en la lista. Sin esto, "1 propuesta
   * esperando tu respuesta" obligaba a buscar cuál a mano.
   */
  matchId?: string | null;
}

/**
 * Fila del mini-ranking de la Home: el top 3 del formato que juega el equipo
 * del usuario. Es un recorte de `RankingTeamEntry` — sólo lo que entra en la
 * tarjeta, para no arrastrar zona/categoría/fair play que acá no se muestran.
 */
export interface MiniRankingEntry {
  rankPosition: number;
  teamId: string;
  teamName: string;
  shieldUrl: string | null;
  eloRating: number;
  isMyTeam: boolean;
}

export interface HomeViewData {
  myTeams: HomeTeamSnapshot[];
  upcomingMatches: HomeMatchEntry[];
  pendingActions: PendingAction[];
  /**
   * Solicitudes ACEPTADAS por un equipo que todavía esperan que el jugador
   * confirme el traspaso. Se calcula incluso sin equipos: ése es justamente el
   * caso del jugador recién aceptado que aún no entró a ningún plantel.
   */
  pendingTransfers: number;
}
