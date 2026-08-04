/**
 * Los marcadores propuestos en una disputa, puestos en un mismo eje.
 *
 * Una disputa nace porque los dos equipos cargaron planillas distintas, pero
 * cada planilla está escrita en primera persona: `goals_scored` son "mis goles"
 * y `goals_against` "los del rival". Mostrarlas tal cual las guarda la base es
 * lo que hacía que la votación fuera a ciegas — el jugador leía dos números
 * sueltos y tenía que hacer la vuelta mental de a qué equipo pertenece cada uno.
 *
 * Acá se traducen las dos planillas al MISMO orden canónico (local–visitante,
 * es decir equipo A primero) para que la discrepancia se lea de un vistazo:
 *
 *     GUEST_A cargó  2 – 0
 *     GUEST_B cargó  0 – 2      ← claramente el mismo partido contado al revés
 *
 * El módulo es puro a propósito: lo consumen tanto la pantalla del jugador
 * (DisputeSection) como el panel de administración, que leen de dos RPCs
 * distintas (`get_match_detail` y `get_disputed_matches`). La normalización
 * tiene que dar idéntico resultado en las dos o el admin y el jugador estarían
 * mirando marcadores que no coinciden.
 */

/** Una planilla tal como la cargó su equipo: en primera persona. */
export interface SubmittedScore {
  /** Goles que ese equipo se adjudica. */
  goalsScored: number;
  /** Goles que ese equipo le adjudica al rival. */
  goalsAgainst: number;
}

/** El mismo marcador reescrito siempre como "equipo A – equipo B". */
export interface CanonicalScoreline {
  goalsTeamA: number;
  goalsTeamB: number;
}

/** Lo que propuso un equipo, listo para pintar. `null` = nunca cargó. */
export interface DisputeClaim {
  teamId: string;
  teamName: string;
  /** Su propuesta en orden canónico A–B, o `null` si no presentó planilla. */
  scoreline: CanonicalScoreline | null;
}

export interface DisputeScoreboard {
  teamA: DisputeClaim;
  teamB: DisputeClaim;
  /**
   * true cuando los dos cargaron y coinciden.
   *
   * No debería pasar —un partido llega a EN_DISPUTA justamente porque no
   * coinciden— pero si una resolución previa corrigió una de las planillas, la
   * pantalla no puede afirmar "no coinciden" abajo de dos marcadores iguales.
   */
  claimsAgree: boolean;
  /** true si a alguno de los dos le falta la planilla. */
  hasMissingClaim: boolean;
}

/**
 * Pasa una planilla al eje A–B.
 *
 * Para el equipo A es la identidad; para el B hay que darla vuelta, que es
 * exactamente el paso que la UI se estaba salteando.
 */
export function toCanonicalScoreline(
  score: SubmittedScore,
  side: 'A' | 'B',
): CanonicalScoreline {
  return side === 'A'
    ? { goalsTeamA: score.goalsScored, goalsTeamB: score.goalsAgainst }
    : { goalsTeamA: score.goalsAgainst, goalsTeamB: score.goalsScored };
}

/** "2 – 0", o el guion largo solo cuando ese equipo no cargó nada. */
export function formatScoreline(scoreline: CanonicalScoreline | null): string {
  if (!scoreline) return '—';
  return `${scoreline.goalsTeamA} – ${scoreline.goalsTeamB}`;
}

function sameScoreline(
  a: CanonicalScoreline | null,
  b: CanonicalScoreline | null,
): boolean {
  if (!a || !b) return false;
  return a.goalsTeamA === b.goalsTeamA && a.goalsTeamB === b.goalsTeamB;
}

/**
 * Arma el tablero comparativo a partir de las dos planillas.
 *
 * Recibe los scores ya asociados a su equipo (quién es A y quién es B lo sabe
 * el caller, porque cada RPC lo expresa distinto) y devuelve las dos propuestas
 * en el mismo eje.
 */
export function buildDisputeScoreboard(params: {
  teamAId: string;
  teamAName: string;
  teamBId: string;
  teamBName: string;
  /** Planilla del equipo A, en primera persona. `null` si no cargó. */
  scoreByTeamA: SubmittedScore | null;
  /** Planilla del equipo B, en primera persona. `null` si no cargó. */
  scoreByTeamB: SubmittedScore | null;
}): DisputeScoreboard {
  const claimA = params.scoreByTeamA
    ? toCanonicalScoreline(params.scoreByTeamA, 'A')
    : null;
  const claimB = params.scoreByTeamB
    ? toCanonicalScoreline(params.scoreByTeamB, 'B')
    : null;

  return {
    teamA: { teamId: params.teamAId, teamName: params.teamAName, scoreline: claimA },
    teamB: { teamId: params.teamBId, teamName: params.teamBName, scoreline: claimB },
    claimsAgree: sameScoreline(claimA, claimB),
    hasMissingClaim: claimA === null || claimB === null,
  };
}
