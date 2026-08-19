import type { MatchShareCardData } from '@/components/match-share/types';

/**
 * Resultado desde la perspectiva de quien comparte, no "quién ganó en
 * abstracto": el mismo partido es `WIN` para un equipo y `LOSS` para el otro.
 * Gobierna el tinte de acento de la tarjeta (`MatchShareCard.tsx`,
 * `CardBackground.tsx`) — nunca el contenido, que ya viene resuelto en
 * `MatchShareCardData`.
 *
 * Vive en `lib/` y no junto a `MatchShareCardData` en
 * `components/match-share/types.ts`: es lógica pura sin JSX, y
 * `vitest.config.ts` separa la suite en dos proyectos por eso mismo — `lib`
 * corre en Node y recoge `lib/**‍/*.test.ts`, `ui` corre en jsdom y sólo
 * recoge `.test.tsx` bajo `components/`. Un test acá puesto en
 * `components/match-share/` no lo levantaría ninguno de los dos proyectos.
 */
export type MatchOutcome = 'WIN' | 'LOSS' | 'DRAW';

/**
 * Deriva el `MatchOutcome` de `myTeamId` contra `data.teamA/teamB` +
 * `scoreA/scoreB`.
 *
 * Vive acá y no en `MatchShareCard` porque el componente NO sabe cuál de los
 * dos equipos es "el mío" — `MatchShareCardData` no lo dice explícitamente
 * (`teamA`/`teamB` mantienen el orden que trae la RPC, no "mi equipo
 * primero"). El único lugar que sabe `myTeamId` es `ShareMatchButton`, así
 * que ahí se deriva y se pasa ya resuelto.
 *
 * Sin resultado cargado en algún lado devuelve `DRAW`: es el tinte más
 * neutro de los tres, y esta función no es quien debe decidir si eso cuenta
 * como "gané" o "perdí" — más vale una tarjeta sin bias visual que una
 * pintada de verde o azul sobre un dato que todavía no existe.
 */
export function deriveMatchOutcome(
  data: Pick<MatchShareCardData, 'teamA' | 'teamB' | 'scoreA' | 'scoreB'>,
  myTeamId: string,
): MatchOutcome {
  const iAmTeamA = data.teamA.id === myTeamId;
  const myScore = iAmTeamA ? data.scoreA : data.scoreB;
  const theirScore = iAmTeamA ? data.scoreB : data.scoreA;

  if (myScore === null || theirScore === null) return 'DRAW';
  if (myScore > theirScore) return 'WIN';
  if (myScore < theirScore) return 'LOSS';
  return 'DRAW';
}
