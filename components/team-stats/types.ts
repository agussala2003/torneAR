import { Database } from '@/types/supabase';

export type TeamCategory = Database['public']['Enums']['team_category'];
export type TeamFormat = Database['public']['Enums']['team_format'];
export type TeamRole = Database['public']['Enums']['team_role'];

export type TeamStatsHeader = {
  id: string;
  name: string;
  zone: string;
  category: TeamCategory;
  format: TeamFormat;
  shieldUrl: string | null;
  prRating: number;
  fairPlayScore: number;
  inRanking: boolean;
};

export type TeamSeasonRecord = {
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  winPercent: string;
  avgGoals: string;
};

export type FormResult = 'V' | 'E' | 'D';

export type TeamRecentMatch = {
  id: string;
  scheduledAt: string | null;
  status: string;
  matchType: string;
  rivalName: string;
  goalsFor: number | null;
  goalsAgainst: number | null;
  result: FormResult | null;
  prDelta: number | null;
};

export type TeamMemberStat = {
  profileId: string;
  fullName: string;
  username: string;
  avatarUrl: string | null;
  position: string;
  role: TeamRole;
  matchesPlayed: number;
  goals: number;
  presencePercent: string;
};

export type TeamStatsViewData = {
  header: TeamStatsHeader;
  season: TeamSeasonRecord;
  form: FormResult[];
  recentMatches: TeamRecentMatch[];
  members: TeamMemberStat[];
  isOwnTeam: boolean;
};
