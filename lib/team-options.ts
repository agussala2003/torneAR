import { Database } from '@/types/supabase';

export type TeamCategory = Database['public']['Enums']['team_category'];
export type TeamFormat = Database['public']['Enums']['team_format'];
export type TeamRole = Database['public']['Enums']['team_role'];

export const TEAM_CATEGORY_OPTIONS: Array<{ value: TeamCategory; label: string }> = [
  { value: 'HOMBRES', label: 'Hombres' },
  { value: 'MUJERES', label: 'Mujeres' },
  { value: 'MIXTO', label: 'Mixto' },
];

export const TEAM_FORMAT_OPTIONS: Array<{ value: TeamFormat; label: string }> = [
  { value: 'FUTBOL_5', label: 'Futbol 5' },
  { value: 'FUTBOL_6', label: 'Futbol 6' },
  { value: 'FUTBOL_7', label: 'Futbol 7' },
  { value: 'FUTBOL_8', label: 'Futbol 8' },
  { value: 'FUTBOL_9', label: 'Futbol 9' },
  { value: 'FUTBOL_11', label: 'Futbol 11' },
];

export function getTeamCategoryLabel(category: TeamCategory): string {
  return TEAM_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? category;
}

export function getTeamFormatLabel(format: TeamFormat): string {
  return TEAM_FORMAT_OPTIONS.find((option) => option.value === format)?.label ?? format;
}

export function getTeamRoleLabel(role: TeamRole): string {
  switch (role) {
    case 'CAPITAN':
      return 'Capitan';
    case 'SUBCAPITAN':
      return 'Subcapitan';
    case 'DIRECTOR_TECNICO':
      return 'DT';
    default:
      return 'Jugador';
  }
}