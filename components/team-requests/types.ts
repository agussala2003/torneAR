import { TeamCategory, TeamFormat } from '@/lib/team-options';

export type TeamRequestRow = {
  id: string;
  status: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';
  created_at: string;
  updated_at: string;
  team_id: string;
  teams: {
    id: string;
    name: string;
    zone: string;
    category: TeamCategory;
    preferred_format: TeamFormat;
  } | null;
};

export type TeamRequestsViewData = {
  requests: TeamRequestRow[];
};
