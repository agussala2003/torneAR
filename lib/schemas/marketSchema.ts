import * as z from 'zod';

export const POSITIONS = ['CUALQUIERA', 'ARQUERO', 'DEFENSOR', 'MEDIOCAMPISTA', 'DELANTERO'] as const;
export const POST_TYPES = ['BUSCA_EQUIPO', 'BUSCA_PARTIDO'] as const;
export const PITCH_TYPES = ['FUTBOL_5', 'FUTBOL_6', 'FUTBOL_7', 'FUTBOL_8', 'FUTBOL_9', 'FUTBOL_11'] as const;

export const MARKET_DESCRIPTION_MAX_LENGTH = 300;

const marketDescription = z
  .string()
  .max(MARKET_DESCRIPTION_MAX_LENGTH, `La descripción no puede superar los ${MARKET_DESCRIPTION_MAX_LENGTH} caracteres`)
  .optional();

export const createTeamPostSchema = z.object({
  teamId: z.string().uuid('ID de equipo inválido'),
  positionWanted: z.enum(POSITIONS),
  description: marketDescription,
  pitchType: z.enum(PITCH_TYPES).optional(),
  matchDate: z.string().optional(),
  matchTime: z.string().optional(),
  zone: z.string().optional(),
  complex: z.string().optional(),
  /**
   * Complejo del catálogo. Opcional porque el alta admite escribir una cancha
   * que no está cargada: en ese caso viaja sólo `complex` y el aviso pierde la
   * precisión del badge de distancia, no la posibilidad de publicarse.
   */
  venueId: z.string().uuid('ID de complejo inválido').optional(),
});

export const createPlayerPostSchema = z.object({
  postType: z.enum(POST_TYPES),
  position: z.enum(POSITIONS),
  description: marketDescription,
});

export type CreateTeamPostInput = z.infer<typeof createTeamPostSchema>;
export type CreatePlayerPostInput = z.infer<typeof createPlayerPostSchema>;
