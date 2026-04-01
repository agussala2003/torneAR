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

export type PendingActionType = 'TEAM_REQUEST' | 'CHALLENGE_RECEIVED' | 'DISPUTE';

export interface PendingAction {
  type: PendingActionType;
  count: number;
  label: string;
}

export interface HomeViewData {
  myTeams: HomeTeamSnapshot[];
  upcomingMatches: HomeMatchEntry[];
  pendingActions: PendingAction[];
}
