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
  goalsFor: number | null;
  goalsAgainst: number | null;
  result: 'V' | 'E' | 'D' | null;
};

export type EarnedBadge = {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  earnedAt: string;
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
