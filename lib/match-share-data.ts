import { supabase } from '@/lib/supabase';
import { fetchMatchDetailViewData } from '@/lib/match-detail-data';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { Logger } from '@/lib/logger';
import type { MatchShareCardData } from '@/components/match-share/types';
import type { ProfileSnippet } from '@/components/matches/types';

function scoreForTeam(
  teamId: string,
  myResult: { teamId: string; goalsScored: number } | null,
  opponentResult: { teamId: string; goalsScored: number } | null,
): number | null {
  if (myResult?.teamId === teamId) return myResult.goalsScored;
  if (opponentResult?.teamId === teamId) return opponentResult.goalsScored;
  return null;
}

/**
 * `get_match_detail` devuelve `mvp.avatarUrl` como el path crudo del bucket
 * (igual que `avatar_url` en `profiles`), sin resolver — nadie lo había
 * necesitado como imagen todavía (`ResultSection` sólo muestra el nombre).
 * Acá sí se renderiza como avatar, así que se resuelve con el mismo helper
 * que usa el resto de la app (`ProfileHeader`, chats de mercado, etc.).
 */
function resolveMvpAvatar(mvp: ProfileSnippet | null): ProfileSnippet | null {
  if (!mvp) return null;
  return {
    ...mvp,
    avatarUrl: mvp.avatarUrl ? getSupabaseStorageUrl('avatars', mvp.avatarUrl) : null,
  };
}

/**
 * Arma los datos de `MatchShareCard` para `matchId` desde la perspectiva de
 * `myTeamId`. Reusa `fetchMatchDetailViewData` (mismo par matchId/myTeamId
 * que ya expone esa función) en vez de duplicar la RPC `get_match_detail`, y
 * suma UNA query incremental a `elo_history` — la única pieza que esa RPC no
 * trae. `get_match_detail` es una RPC de seguridad crítica y muy auditada; no
 * se justifica tocarla para un enriquecimiento de sólo lectura.
 */
export async function fetchMatchShareViewData(
  matchId: string,
  myTeamId: string,
): Promise<MatchShareCardData> {
  const [match, eloRes] = await Promise.all([
    fetchMatchDetailViewData(matchId, myTeamId),
    supabase
      .from('elo_history')
      .select('delta, elo_before, elo_after')
      .eq('match_id', matchId)
      .eq('team_id', myTeamId)
      .maybeSingle(),
  ]);

  if (eloRes.error) {
    // Degradado, no bloqueante: sin el delta la tarjeta simplemente no
    // muestra el chip de rating — mismo tratamiento que un amistoso.
    Logger.warn('No se pudo leer elo_history para la tarjeta compartible', {
      scope: 'match-share-data.fetchMatchShareViewData',
      matchId,
      teamId: myTeamId,
      error: eloRes.error,
    });
  }

  // ── Regla de producto ────────────────────────────────────────────────────
  // El chip de rating SOLO viaja si el delta es >= 0 (ganó rating, o empate
  // sin pérdida). Amistoso (sin fila en elo_history), derrota (delta < 0), o
  // falla al leer el historial: los tres colapsan a `null` acá mismo, en el
  // mapeo de datos — el componente visual ni se entera de la distinción, sólo
  // sabe "hay chip" o "no hay chip".
  const rawDelta = eloRes.error ? null : (eloRes.data?.delta ?? null);
  const eloDelta =
    rawDelta !== null && rawDelta >= 0 ? { teamId: myTeamId, delta: rawDelta } : null;

  return {
    teamA: match.teamA,
    teamB: match.teamB,
    scoreA: scoreForTeam(match.teamA.id, match.myResult, match.opponentResult),
    scoreB: scoreForTeam(match.teamB.id, match.myResult, match.opponentResult),
    matchType: match.matchType,
    finishedAt: match.finishedAt,
    eloDelta,
    mvp: resolveMvpAvatar(match.myResult?.mvp ?? null),
  };
}
