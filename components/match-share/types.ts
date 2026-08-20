import type { TeamSnippet, ProfileSnippet } from '@/components/matches/types';
import type { Database } from '@/types/supabase';
import type { MatchOutcome } from '@/lib/match-share-outcome';

// Re-exportado para que los componentes de esta carpeta puedan seguir
// importando todo lo de este dominio ("los datos y cómo se pintan") desde un
// solo lugar: `import type { MatchOutcome } from './types'` en vez de
// acordarse de que ESTE tipo puntual vive en `lib/` por motivos de testing
// (ver el comentario largo en `lib/match-share-outcome.ts`).
export type { MatchOutcome };

type MatchType = Database['public']['Enums']['match_type'];

/** Un goleador para `ScorersBlock`. `goals` es la cuenta EN ESTE partido, no
 *  acumulada de temporada. */
export interface MatchScorer {
  name: string;
  goals: number;
}

/**
 * Datos ya recortados para `MatchShareCard`: nada de estado de formularios,
 * disputa, checkin, etc. — sólo lo que la tarjeta necesita pintar.
 */
export interface MatchShareCardData {
  teamA: TeamSnippet;
  teamB: TeamSnippet;
  /** `null` cuando el resultado de ese equipo todavía no se cargó. */
  scoreA: number | null;
  scoreB: number | null;
  matchType: MatchType;
  finishedAt: string | null;

  /**
   * `null` en tres casos, todos intencionales (ver `lib/match-share-data.ts`):
   * amistoso (no genera fila en `elo_history`), derrota (delta negativo — la
   * tarjeta no se arma para lucir un número en rojo), o falla al leer el
   * historial. La tarjeta trata los tres exactamente igual: no muestra el chip.
   */
  eloDelta: { teamId: string; delta: number } | null;

  /**
   * MVP de MI equipo (no un MVP "del partido" — cada equipo nombra el propio
   * al cargar su resultado). Es el relevante para quien comparte la tarjeta.
   */
  mvp: ProfileSnippet | null;

  /**
   * Goleadores de MI equipo en este partido, para `ScorersBlock`.
   *
   * Se puebla desde `match_goals` (proyección normalizada de
   * `match_results.scorers`, migración 20260819120000) vía la RPC
   * `get_match_scorers`, con fallback al jsonb que ya devuelve
   * `get_match_detail` — ver el bloque «Goleadores» en
   * `lib/match-share-data.ts` para por qué son dos fuentes y no una.
   *
   * Sigue siendo `null` —y no `[]`— cuando el equipo no cargó goleadores:
   * `ScorersBlock` colapsa ante la ausencia, igual que el chip de rating y el
   * MVP. Un array vacío obligaría a cada consumidor a chequear `length`.
   */
  scorers: MatchScorer[] | null;
}

/**
 * Paleta de acento por resultado. Un solo lugar para los dos consumidores
 * (`CardBackground.tsx` pinta `glow`, `MatchShareCard.tsx` pinta `line`) —
 * tenerla duplicada en los dos archivos es exactamente el bug que dejó
 * desactualizado el ratio del wordmark en la iteración anterior.
 *
 *  · WIN reusa el verde de marca (`brand-primary`): ya es el color
 *    "positivo" en toda la app, no hacía falta inventar uno nuevo.
 *  · DRAW reusa `neutral.outline`: el gris neutro que ya usa el resto de la
 *    tarjeta para separadores y texto secundario.
 *  · LOSS es el único tono genuinamente nuevo. A propósito NO es
 *    `danger.error` (el rojo/salmón de la app): ese color significa "algo
 *    salió mal" en el resto de la UI (errores de validación, fallos de red),
 *    y perder un partido no es un error — es un resultado válido. Un azul
 *    acero/plomo lo comunica sin pedir perdón por el marcador.
 */
export const OUTCOME_ACCENT: Record<MatchOutcome, { glow: string; line: string }> = {
  WIN: { glow: '#123822', line: '#53E076' },
  LOSS: { glow: '#16222E', line: '#7C97AD' },
  DRAW: { glow: '#212220', line: '#869585' },
};
