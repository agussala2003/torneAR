import { supabase } from '@/lib/supabase';
import { fetchMatchDetailViewData } from '@/lib/match-detail-data';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { Logger } from '@/lib/logger';
import type { MatchScorer, MatchShareCardData } from '@/components/match-share/types';
import type { ProfileSnippet, ScorerEntry } from '@/components/matches/types';

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
 * Fila de `get_match_scorers` (20260819120000_match_goals.sql). Se declara
 * acá y no se infiere de `types/supabase.ts` porque el mapeo de abajo sólo
 * necesita dos de las tres columnas: escribirlo explícito documenta el
 * contrato que consume la tarjeta sin arrastrar el tipo generado entero.
 */
interface RawMatchScorer {
  player_id: string;
  full_name: string;
  goals_count: number;
}

/**
 * Normaliza cualquiera de las dos fuentes de goleadores al shape que pinta
 * `ScorersBlock` (`{ name, goals }`). Devuelve `null` —y no `[]`— cuando no
 * hay nada: es la ausencia lo que el componente sabe colapsar, un array
 * vacío obligaría a que cada consumidor repita el chequeo de `length`.
 */
function toCardScorers(
  rows: readonly { name: string; goals: number }[] | null | undefined,
): MatchScorer[] | null {
  if (!rows || rows.length === 0) return null;
  return rows.map((row) => ({ name: row.name, goals: row.goals }));
}

/**
 * Arma los datos de `MatchShareCard` para `matchId` desde la perspectiva de
 * `myTeamId`. Reusa `fetchMatchDetailViewData` (mismo par matchId/myTeamId
 * que ya expone esa función) en vez de duplicar la RPC `get_match_detail`, y
 * suma DOS queries incrementales — `elo_history` y `get_match_scorers` —, las
 * únicas piezas que esa RPC no cubre por sí sola. `get_match_detail` es una
 * RPC de seguridad crítica y muy auditada; no se justifica tocarla para un
 * enriquecimiento de sólo lectura.
 *
 * Las tres van en el MISMO `Promise.all`: son independientes entre sí y
 * encadenarlas sólo sumaría latencia al modal de preview, que ya bloquea con
 * un spinner hasta tener todo.
 */
export async function fetchMatchShareViewData(
  matchId: string,
  myTeamId: string,
): Promise<MatchShareCardData> {
  const [match, eloRes, scorersRes] = await Promise.all([
    fetchMatchDetailViewData(matchId, myTeamId),
    supabase
      .from('elo_history')
      .select('delta, elo_before, elo_after')
      .eq('match_id', matchId)
      .eq('team_id', myTeamId)
      .maybeSingle(),
    supabase.rpc('get_match_scorers', { p_match_id: matchId, p_team_id: myTeamId }),
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

  // ── Goleadores ───────────────────────────────────────────────────────────
  // Fuente primaria: `match_goals` vía `get_match_scorers` — normalizada,
  // ordenada en la base y con FK real contra `profiles`.
  //
  // Fallback: `match.myResult.scorers`, que `get_match_detail` ya resuelve
  // desde el jsonb `match_results.scorers`. NO es redundancia por las dudas,
  // cubre dos estados reales y transitorios:
  //   · el binario corriendo contra una base donde la migración
  //     20260819120000 todavía no se aplicó (la RPC no existe → error), y
  //   · un partido cargado ANTES del backfill cuya proyección quedó vacía.
  // Ambos degradan a "la tarjeta muestra los goleadores igual", que es el
  // punto — no a "la tarjeta pierde el bloque". Mismo criterio que el chip de
  // rating: nada acá bloquea la generación de la tarjeta.
  if (scorersRes.error) {
    Logger.warn('No se pudo leer match_goals para la tarjeta compartible', {
      scope: 'match-share-data.fetchMatchShareViewData',
      matchId,
      teamId: myTeamId,
      error: scorersRes.error,
    });
  }

  const projectedScorers: RawMatchScorer[] = scorersRes.error ? [] : (scorersRes.data ?? []);

  const scorers =
    toCardScorers(
      projectedScorers.map((row) => ({ name: row.full_name, goals: row.goals_count })),
    ) ??
    toCardScorers(
      (match.myResult?.scorers ?? []).map((entry: ScorerEntry) => ({
        name: entry.fullName,
        goals: entry.goals,
      })),
    );

  return {
    teamA: match.teamA,
    teamB: match.teamB,
    scoreA: scoreForTeam(match.teamA.id, match.myResult, match.opponentResult),
    scoreB: scoreForTeam(match.teamB.id, match.myResult, match.opponentResult),
    matchType: match.matchType,
    finishedAt: match.finishedAt,
    eloDelta,
    mvp: resolveMvpAvatar(match.myResult?.mvp ?? null),
    scorers,
  };
}
