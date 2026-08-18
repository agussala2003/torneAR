import type { TeamSnippet, ProfileSnippet } from '@/components/matches/types';
import type { Database } from '@/types/supabase';

type MatchType = Database['public']['Enums']['match_type'];

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
}
