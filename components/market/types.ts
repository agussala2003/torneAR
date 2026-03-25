import { MarketTeamPost, MarketPlayerPost, ManagedTeam } from '@/lib/market-api';

export type TabType = 'TEAMS_LOOKING' | 'PLAYERS_LOOKING';

export type MarketViewData = {
  teamPosts: MarketTeamPost[];
  playerPosts: MarketPlayerPost[];
  managedTeams: ManagedTeam[];
};

export type MarketSortBy = 'nearest' | 'recent';

export type MarketFilters = {
  zone: string | null;
  selectedDays: string[];
  sortBy: MarketSortBy;
};
