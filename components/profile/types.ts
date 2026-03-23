import { Database } from '@/types/supabase';

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type TeamRole = Database['public']['Enums']['team_role'];

export type ProfileStats = {
  matchesPlayed: number;
  goals: number;
  mvps: number;
  wins: number;
};

export type BadgeItem = {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  description?: string | null;
  earnedAt?: string | null;
  isEarned: boolean;
};

export type TeamItem = {
  id: string;
  name: string;
  prRating: number;
  shieldUrl: string | null;
  role: TeamRole;
};

export type ProfileViewData = {
  profile: ProfileRow;
  stats: ProfileStats;
  badges: BadgeItem[];
  teams: TeamItem[];
};
