import * as z from 'zod';
import { supabase } from '@/lib/supabase';
import { Constants } from '@/types/supabase';

// Contrato del jsonb que devuelve la RPC get_player_career (migración
// 20260715100200_transfer_history_rpc.sql). Se valida en runtime con Zod:
// si el backend cambia la forma del payload, el fetch falla acá con un error
// claro en vez de propagar undefined silenciosos a la UI.

export const stintTotalsSchema = z.object({
  pj_ranking: z.number(),
  pj_amistoso: z.number(),
  goals: z.number(),
  mvps: z.number(),
  clean_sheets: z.number(),
  wins: z.number(),
  draws: z.number(),
  losses: z.number(),
});

// season_id/season_name NULL = partidos sin temporada etiquetada.
export const seasonBreakdownSchema = stintTotalsSchema.extend({
  season_id: z.string().nullable(),
  season_name: z.string().nullable(),
});

export const stintStatsSchema = z.object({
  total: stintTotalsSchema,
  by_season: z.array(seasonBreakdownSchema),
  computed_at: z.string(),
});

export const careerStintSchema = z.object({
  stint_id: z.string(),
  team_id: z.string(),
  team_name: z.string(),
  shield_url: z.string().nullable(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  is_current: z.boolean(),
  leave_reason: z.enum(Constants.public.Enums.stint_leave_reason).nullable(),
  last_role: z.enum(Constants.public.Enums.team_role).nullable(),
  is_reconstructed: z.boolean(),
  stats: stintStatsSchema,
});

export const guestAppearanceSchema = z.object({
  team_id: z.string(),
  team_name: z.string(),
  shield_url: z.string().nullable(),
  pj_ranking: z.number(),
  pj_amistoso: z.number(),
  goals: z.number(),
  mvps: z.number(),
  first_played_at: z.string(),
  last_played_at: z.string(),
});

export const playerCareerSchema = z.object({
  profile_id: z.string(),
  stints: z.array(careerStintSchema),
  guest_appearances: z.array(guestAppearanceSchema),
});

export type StintTotals = z.infer<typeof stintTotalsSchema>;
export type SeasonBreakdown = z.infer<typeof seasonBreakdownSchema>;
export type CareerStint = z.infer<typeof careerStintSchema>;
export type GuestAppearance = z.infer<typeof guestAppearanceSchema>;
export type PlayerCareer = z.infer<typeof playerCareerSchema>;
export type StintLeaveReason = CareerStint['leave_reason'];

export async function fetchPlayerCareer(profileId: string): Promise<PlayerCareer> {
  const { data, error } = await supabase.rpc('get_player_career', {
    p_profile_id: profileId,
  });
  if (error) throw error;
  return playerCareerSchema.parse(data);
}
