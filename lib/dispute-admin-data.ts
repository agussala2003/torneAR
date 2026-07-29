import { supabase } from '@/lib/supabase';

/**
 * Herramienta administrativa para disputas (D2).
 *
 * Las dos RPCs son de la migración 20260728190000 y todavía no están en
 * `types/supabase.ts` (hay que regenerarlo tras aplicar las migraciones), así
 * que se invocan con el mismo cast que ya usa `get_match_detail` en
 * lib/match-detail-data.ts.
 */

export type DisputeResolution = 'WIN_A' | 'WIN_B' | 'CANCEL';

interface RawDisputedMatch {
  match_id: string;
  scheduled_at: string | null;
  match_type: 'RANKING' | 'AMISTOSO';
  format: string | null;
  team_a_id: string;
  team_a_name: string;
  team_a_goals: number | null;
  team_a_fps: number;
  team_a_votes: number;
  team_b_id: string;
  team_b_name: string;
  team_b_goals: number | null;
  team_b_fps: number;
  team_b_votes: number;
}

export interface DisputedMatchSide {
  teamId: string;
  teamName: string;
  /** null = ese equipo nunca cargó su resultado. */
  goals: number | null;
  fairPlayScore: number;
  votes: number;
}

export interface DisputedMatch {
  matchId: string;
  scheduledAt: string | null;
  matchType: 'RANKING' | 'AMISTOSO';
  format: string | null;
  teamA: DisputedMatchSide;
  teamB: DisputedMatchSide;
  /**
   * true cuando la resolución automática no puede desempatar: mismos votos y
   * mismo Fair Play. Es el escenario exacto que dejaba el partido colgado para
   * siempre, y el que justifica que exista esta pantalla.
   */
  isDeadlocked: boolean;
}

/** Partidos en EN_DISPUTA (solo admin — gateado server-side). */
export async function fetchDisputedMatches(): Promise<DisputedMatch[]> {
  const { data, error } = await supabase.rpc(
    'get_disputed_matches' as Parameters<typeof supabase.rpc>[0],
  );
  if (error) throw error;

  return ((data ?? []) as unknown as RawDisputedMatch[]).map((r) => {
    const votesA = Number(r.team_a_votes);
    const votesB = Number(r.team_b_votes);
    const fpsA = Number(r.team_a_fps);
    const fpsB = Number(r.team_b_fps);

    return {
      matchId: r.match_id,
      scheduledAt: r.scheduled_at,
      matchType: r.match_type,
      format: r.format,
      teamA: {
        teamId: r.team_a_id,
        teamName: r.team_a_name,
        goals: r.team_a_goals,
        fairPlayScore: fpsA,
        votes: votesA,
      },
      teamB: {
        teamId: r.team_b_id,
        teamName: r.team_b_name,
        goals: r.team_b_goals,
        fairPlayScore: fpsB,
        votes: votesB,
      },
      isDeadlocked: votesA === votesB && fpsA === fpsB,
    };
  });
}

/**
 * Fuerza la resolución de una disputa. `WIN_A`/`WIN_B` finalizan el partido y
 * aplican ELO/stats/Fair Play; `CANCEL` lo anula sin computar.
 */
export async function adminResolveDispute(
  matchId: string,
  resolution: DisputeResolution,
  adminNotes?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc(
    'admin_resolve_dispute' as Parameters<typeof supabase.rpc>[0],
    {
      p_match_id: matchId,
      p_resolution: resolution,
      p_admin_notes: adminNotes?.trim() || undefined,
    } as never,
  );
  if (error) throw error;
}
