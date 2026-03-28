import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import type { MatchDetailViewData, DisputeState } from '@/components/matches/types';

interface Props {
  match: MatchDetailViewData;
  profileId: string;
  disputeState: DisputeState | null;
  onVote: (teamId: string) => void;
  onResolve: () => void;
}

export function DisputeSection({ match, profileId, disputeState, onVote, onResolve }: Props) {
  const didCheckin = match.participants.some(
    (p) => p.profileId === profileId && p.didCheckin,
  );
  const isCaptainOrSub = match.myRole === 'CAPITAN' || match.myRole === 'SUBCAPITAN';

  return (
    <View className="mt-4 gap-3">
      {/* ── Warning banner with live vote counts ─────────────────────────── */}
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

      {/* ── Voting UI (only for players who checked in) ───────────────────── */}
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
                . Esperando resolución.
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

      {/* ── No check-in message ───────────────────────────────────────────── */}
      {!didCheckin && (
        <View className="rounded-xl bg-surface-container px-4 py-3">
          <Text className="font-ui text-sm text-neutral-on-surface-variant">
            No puedes votar porque no hiciste check-in en la cancha.
          </Text>
        </View>
      )}

      {/* ── Captain / sub resolution button ──────────────────────────────── */}
      {isCaptainOrSub && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onResolve}
          className="items-center rounded-xl bg-warning-tertiary py-3"
        >
          <Text className="font-displayBlack text-[13px] uppercase tracking-widest text-surface-base">
            ⚖️ Resolver Disputa
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
