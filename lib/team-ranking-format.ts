import { TEAM_FORMAT_OPTIONS, type TeamFormat } from '@/lib/team-options';

/**
 * Resolución del "mejor formato" de un equipo: el de mayor `elo_score`.
 *
 * Existe como módulo aparte porque el MISMO criterio se aplica en tres lugares
 * que el usuario compara de un vistazo —el widget de Top 3 de la Home, la
 * tarjeta de "Mis Equipos" y el bootstrap de la tab Ranking— y cuando cada uno
 * lo resolvía por su cuenta el mismo equipo mostraba 1000 en el widget y 961
 * dos bloques más abajo. Los dos números eran reales: uno era el ELO del
 * formato donde el equipo compite mejor y el otro el `teams.elo_rating` global.
 *
 * ## El desempate importa
 *
 * Con dos formatos empatados en puntaje, cuál gane decide qué etiqueta se
 * muestra ("• F5" contra "• F7"). Si cada pantalla desempata distinto, el
 * número coincide pero el rótulo no, y la incoherencia se ve igual.
 *
 * El criterio replica el `ORDER BY tr.elo_score DESC, tr.format` del
 * `DISTINCT ON` de `get_team_ranking`
 * (`20260811160000_ranking_global_best_format.sql`): mayor puntaje primero y,
 * en empate, el formato que va antes en el enum.
 *
 * ⚠️ Postgres ordena un enum por su **orden de declaración**, no alfabéticamente
 * (alfabéticamente 'FUTBOL_11' iría antes que 'FUTBOL_5'). Por eso el desempate
 * usa la posición en `TEAM_FORMAT_OPTIONS`, que espeja la declaración de
 * `create type team_format` — si algún día se agrega un formato al enum, tiene
 * que agregarse ahí en la misma posición.
 */

export interface FormatRankingRow {
  format: TeamFormat;
  elo_score: number;
}

export interface ResolvedTeamRanking {
  eloRating: number;
  format: TeamFormat;
  /**
   * `true` cuando el equipo no tiene ninguna fila en `team_rankings` — nunca
   * jugó un partido de ranking — y el par salió del fallback. La UI lo usa para
   * no rotular con un formato que el equipo todavía no disputó.
   */
  isFallback: boolean;
}

/** Posición en el enum. Los formatos desconocidos van al final. */
function formatOrder(format: TeamFormat): number {
  const index = TEAM_FORMAT_OPTIONS.findIndex((option) => option.value === format);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/**
 * Mejor par (puntaje, formato) del equipo.
 *
 * `fallback` es lo único que hay cuando el equipo nunca jugó un partido de
 * ranking: el ELO global de `teams` y su `preferred_format`.
 */
export function resolveBestFormatRanking(
  rows: FormatRankingRow[],
  fallback: { eloRating: number; format: TeamFormat },
): ResolvedTeamRanking {
  const best = rows.reduce<FormatRankingRow | null>((top, row) => {
    if (top === null) return row;
    if (row.elo_score !== top.elo_score) return row.elo_score > top.elo_score ? row : top;
    return formatOrder(row.format) < formatOrder(top.format) ? row : top;
  }, null);

  if (!best) {
    return { eloRating: fallback.eloRating, format: fallback.format, isFallback: true };
  }

  return { eloRating: best.elo_score, format: best.format, isFallback: false };
}
