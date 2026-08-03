import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import type { MatchDetailViewData, DisputeState } from '@/components/matches/types';

interface Props {
  match: MatchDetailViewData;
  profileId: string;
  disputeState: DisputeState | null;
  onVote: (teamId: string) => void;
}

function formatFairPlay(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Panel de una disputa abierta.
 *
 * Acá vivía el botón "Resolver Disputa" del capitán, y con él una carrera:
 * el escrutinio corría en el instante del tap, el desempate cae en Fair Play
 * cuando los votos están igualados, y 0 a 0 es el estado en que NACE toda
 * disputa. El primero en apretar se llevaba el partido.
 *
 * Esta pantalla intentaba taparlo escondiendo el botón cuando el desempate caía
 * en contra, pero eso era una barrera de UI sobre una RPC abierta a cualquier
 * `authenticated`. La resolución pasó a ser un evento de tiempo —el cron
 * `sweep_disputed_matches` cierra la votación a las 24 h— y la RPC se eliminó.
 *
 * Lo que queda acá es votar y entender qué va a pasar. El Fair Play se sigue
 * mostrando, pero ahora para EXPLICAR el desempate, no para decidir cuándo
 * dispararlo.
 */
export function DisputeSection({ match, profileId, disputeState, onVote }: Props) {
  const didCheckin = match.participants.some(
    (p) => p.profileId === profileId && p.didCheckin,
  );

  const isMyTeamA = match.teamA.id === match.myTeamId;
  const myFairPlay = disputeState
    ? isMyTeamA
      ? disputeState.fairPlayTeamA
      : disputeState.fairPlayTeamB
    : null;
  const opponentFairPlay = disputeState
    ? isMyTeamA
      ? disputeState.fairPlayTeamB
      : disputeState.fairPlayTeamA
    : null;
  const opponentName = isMyTeamA ? match.teamB.name : match.teamA.name;

  const votesTied =
    disputeState !== null && disputeState.votesForTeamA === disputeState.votesForTeamB;

  return (
    <View className="mt-4 gap-3">
      {/* ── Estado de la disputa + conteo en vivo ─────────────────────────── */}
      <View className="rounded-2xl bg-warning-tertiary/10 p-4">
        <View className="mb-2 flex-row items-center gap-2">
          <AppIcon family="material-community" name="alert" size={18} color="#FABD32" />
          <Text className="font-uiBold text-sm text-warning-tertiary">Resultado en disputa</Text>
        </View>
        <Text className="font-ui text-sm leading-5 text-neutral-on-surface-variant">
          Los resultados cargados no coinciden. Los jugadores que hicieron check-in pueden votar
          por la versión correcta.
        </Text>
        {disputeState && (
          <View className="mt-3 flex-row gap-6">
            <Text className="font-uiBold text-xs text-neutral-on-surface-variant">
              {match.teamA.name}:{' '}
              <Text className="text-warning-tertiary">
                {disputeState.votesForTeamA} voto{disputeState.votesForTeamA !== 1 ? 's' : ''}
              </Text>
            </Text>
            <Text className="font-uiBold text-xs text-neutral-on-surface-variant">
              {match.teamB.name}:{' '}
              <Text className="text-warning-tertiary">
                {disputeState.votesForTeamB} voto{disputeState.votesForTeamB !== 1 ? 's' : ''}
              </Text>
            </Text>
          </View>
        )}
      </View>

      {/* ── Cierre automático ─────────────────────────────────────────────── */}
      <View className="flex-row items-start gap-2.5 rounded-xl border border-info-secondary/20 bg-info-secondary/10 px-4 py-3">
        <AppIcon family="material-community" name="clock-outline" size={16} color="#8CCDFF" />
        <View className="flex-1">
          <Text className="font-uiBold text-sm text-info-secondary">
            La votación se cierra sola
          </Text>
          <Text className="font-ui mt-1 text-xs leading-5 text-neutral-on-surface-variant">
            A las 24 horas de abierta la disputa se hace el escrutinio automático y el partido se
            resuelve con los votos que haya en ese momento. Nadie puede adelantarlo.
          </Text>
        </View>
      </View>

      {/* ── Votación (sólo para quienes hicieron check-in) ────────────────── */}
      {didCheckin && (
        <>
          {disputeState?.hasVoted ? (
            <View className="rounded-xl border border-brand-primary/20 bg-brand-primary/10 px-4 py-3">
              <View className="flex-row items-center gap-2">
                <AppIcon family="material-community" name="check-circle" size={16} color="#53E076" />
                <Text className="font-uiBold text-sm text-brand-primary">Voto registrado</Text>
              </View>
              <Text className="font-ui mt-1 text-xs text-neutral-on-surface-variant">
                Votaste por el resultado de{' '}
                {disputeState.votedForTeamId === match.teamA.id
                  ? match.teamA.name
                  : match.teamB.name}
                . Esperando el cierre de la votación.
              </Text>
            </View>
          ) : (
            <View className="gap-2">
              <Text className="font-uiBold text-xs uppercase tracking-widest text-neutral-on-surface-variant">
                Votá por el resultado correcto
              </Text>
              {([match.teamA, match.teamB] as const).map((team) => (
                <TouchableOpacity
                  key={team.id}
                  activeOpacity={0.8}
                  onPress={() => onVote(team.id)}
                  className="flex-row items-center justify-between rounded-xl border border-warning-tertiary/30 bg-warning-tertiary/10 px-4 py-3"
                >
                  <Text className="font-uiBold text-sm text-warning-tertiary">
                    Votar por {team.name}
                  </Text>
                  <AppIcon family="material-community" name="chevron-right" size={18} color="#FABD32" />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}

      {/* ── Sin check-in ──────────────────────────────────────────────────── */}
      {!didCheckin && (
        <View className="rounded-xl bg-surface-container px-4 py-3">
          <Text className="font-ui text-sm text-neutral-on-surface-variant">
            No puedes votar porque no hiciste check-in en la cancha.
          </Text>
        </View>
      )}

      {/* ── Cómo caería el desempate ──────────────────────────────────────── */}
      {/* Informativo, no accionable: es exactamente el dato que antes definía si
          convenía apretar el botón, y ahora sirve para que el equipo sepa que le
          conviene juntar votos antes de que cierre. */}
      {votesTied && myFairPlay !== null && opponentFairPlay !== null && (
        <View className="rounded-xl border border-neutral-outline/20 bg-surface-container px-4 py-3">
          <View className="mb-1 flex-row items-center gap-2">
            <AppIcon family="material-community" name="scale-balance" size={16} color="#869585" />
            <Text className="font-uiBold text-sm text-neutral-on-surface">
              Votación empatada
            </Text>
          </View>
          <Text className="font-ui text-xs leading-5 text-neutral-on-surface-variant">
            {myFairPlay === opponentFairPlay
              ? `Ambos equipos tienen el mismo Fair Play (${formatFairPlay(myFairPlay)}), así que el escrutinio automático no va a poder desempatar y el partido pasará a revisión de un administrador. Junten votos antes del cierre.`
              : myFairPlay > opponentFairPlay
                ? `Si cierra así, el desempate es por Fair Play y quedaría a favor de tu equipo: ${formatFairPlay(myFairPlay)} contra ${formatFairPlay(opponentFairPlay)} de ${opponentName}.`
                : `Si cierra así, el desempate es por Fair Play y quedaría a favor de ${opponentName}: ${formatFairPlay(opponentFairPlay)} contra ${formatFairPlay(myFairPlay)} de tu equipo. Conviene que voten los jugadores que hicieron check-in.`}
          </Text>
        </View>
      )}
    </View>
  );
}
