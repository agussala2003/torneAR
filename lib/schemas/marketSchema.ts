import * as z from 'zod';

export const POSITIONS = ['CUALQUIERA', 'ARQUERO', 'DEFENSOR', 'MEDIOCAMPISTA', 'DELANTERO'] as const;
export const POST_TYPES = ['BUSCA_EQUIPO', 'BUSCA_PARTIDO'] as const;
export const PITCH_TYPES = ['FUTBOL_5', 'FUTBOL_6', 'FUTBOL_7', 'FUTBOL_8', 'FUTBOL_9', 'FUTBOL_11'] as const;

export const createTeamPostSchema = z.object({
  teamId: z.string().uuid('ID de equipo inválido'),
  positionWanted: z.enum(POSITIONS),
  description: z.string().optional(),
  pitchType: z.enum(PITCH_TYPES).optional(),
  matchDate: z.string().optional(),
  matchTime: z.string().optional(),
  zone: z.string().optional(),
  complex: z.string().optional(),
});

export const createPlayerPostSchema = z.object({
  postType: z.enum(POST_TYPES),
  position: z.enum(POSITIONS),
  description: z.string().optional(),
});

export type CreateTeamPostInput = z.infer<typeof createTeamPostSchema>;
export type CreatePlayerPostInput = z.infer<typeof createPlayerPostSchema>;
