import { useState } from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { MatchDetailViewData, DisputeState } from '@/components/matches/types';

interface Props {
  match: MatchDetailViewData;
  profileId: string;
  disputeState: DisputeState | null;
  onVote: (teamId: string) => void;
  onResolve: () => void;
}

const CONFIRM_MESSAGE =
  'Atención: Si hay un empate en los votos (o si nadie votó aún), el partido se resolverá ' +
  'instantáneamente a favor del equipo con mayor puntaje de Fair Play. Esta acción es ' +
  'irreversible y sobreescribirá el resultado. ¿Deseas proceder?';

function formatFairPlay(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function DisputeSection({ match, profileId, disputeState, onVote, onResolve }: Props) {
  const [confirming, setConfirming] = useState(false);

  const didCheckin = match.participants.some(
    (p) => p.profileId === profileId && p.didCheckin,
  );
  const isCaptainOrSub = match.myRole === 'CAPITAN' || match.myRole === 'SUBCAPITAN';

  // ─── Anticipación del desempate por Fair Play ──────────────────────────────
  // `resolve_match_dispute` desempata por fair_play_score cuando los votos
  // están igualados, y el 0-0 es el estado en que nace toda disputa: sin esto,
  // el botón le ofrecía al capitán del equipo con menos Fair Play una acción
  // que le regalaba el partido al rival en el acto. Se calcula sobre "votos
  // empatados" (no sólo 0-0) porque ésa es la condición real de la RPC.
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

  // Resolver ahora me haría perder por Fair Play.
  const wouldLoseByFairPlay =
    votesTied && myFairPlay !== null && opponentFairPlay !== null && myFairPlay < opponentFairPlay;

  // Votos y Fair Play idénticos: la RPC no puede desempatar y lanza
  // "Empate total … requiere revisión manual del administrador" (hallazgo D2,
  // todavía abierto). Mostrar el botón acá sólo produce un error crudo.
  const wouldDeadlock =
    votesTied && myFairPlay !== null && opponentFairPlay !== null && myFairPlay === opponentFairPlay;

  // Hasta que el estado de la disputa no cargó no sabemos de qué lado cae el
  // desempate: no ofrecemos la acción a ciegas.
  const canResolve = isCaptainOrSub && disputeState !== null && !wouldLoseByFairPlay && !wouldDeadlock;

  const confirmMessage =
    votesTied && myFairPlay !== null && opponentFairPlay !== null
      ? `${CONFIRM_MESSAGE}\n\nAhora mismo la votación está empatada (${disputeState!.votesForTeamA} a ${disputeState!.votesForTeamB}) y tu equipo tiene el Fair Play más alto: ${formatFairPlay(myFairPlay)} contra ${formatFairPlay(opponentFairPlay)} de ${opponentName}.`
      : CONFIRM_MESSAGE;

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

      {/* ── Captain / sub resolution ─────────────────────────────────────── */}
      {canResolve && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setConfirming(true)}
          className="items-center rounded-xl bg-warning-tertiary py-3"
        >
          <Text className="font-displayBlack text-[13px] uppercase tracking-widest text-surface-base">
            ⚖️ Resolver Disputa
          </Text>
        </TouchableOpacity>
      )}

      {/* Resolver ahora sería auto-derrota: se explica en vez de ofrecerlo. */}
      {isCaptainOrSub && wouldLoseByFairPlay && myFairPlay !== null && opponentFairPlay !== null && (
        <View className="rounded-xl border border-neutral-outline/20 bg-surface-container px-4 py-3">
          <View className="mb-1 flex-row items-center gap-2">
            <AppIcon family="material-community" name="scale-balance" size={16} color="#869585" />
            <Text className="font-uiBold text-sm text-neutral-on-surface">
              Resolución no disponible todavía
            </Text>
          </View>
          <Text className="font-ui text-xs leading-5 text-neutral-on-surface-variant">
            Con la votación empatada ({disputeState!.votesForTeamA} a {disputeState!.votesForTeamB}),
            resolver ahora le daría el partido a {opponentName} por Fair Play:{' '}
            {formatFairPlay(opponentFairPlay)} contra {formatFairPlay(myFairPlay)} de tu equipo.
            Esperá a que voten los jugadores que hicieron check-in.
          </Text>
        </View>
      )}

      {/* Empate total: la RPC no puede desempatar (hallazgo D2, abierto). */}
      {isCaptainOrSub && wouldDeadlock && (
        <View className="rounded-xl border border-neutral-outline/20 bg-surface-container px-4 py-3">
          <View className="mb-1 flex-row items-center gap-2">
            <AppIcon family="material-community" name="scale-balance" size={16} color="#869585" />
            <Text className="font-uiBold text-sm text-neutral-on-surface">
              Resolución no disponible todavía
            </Text>
          </View>
          <Text className="font-ui text-xs leading-5 text-neutral-on-surface-variant">
            La votación está empatada ({disputeState!.votesForTeamA} a {disputeState!.votesForTeamB})
            y ambos equipos tienen el mismo Fair Play, así que la resolución automática no puede
            desempatar. Necesitan que voten los jugadores que hicieron check-in.
          </Text>
        </View>
      )}

      {/* El diálogo va dentro de un Modal nativo: esta sección vive dentro del
          ScrollView del detalle, y el overlay `absolute inset-0` de
          ConfirmDialog se dimensionaría contra esta tarjeta en vez de contra la
          pantalla. Mismo patrón que ResultModal / WoModal / CancellationModal. */}
      <Modal
        visible={confirming}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirming(false)}
      >
        <ConfirmDialog
          visible={confirming}
          title="Resolver disputa"
          message={confirmMessage}
          confirmLabel="Sí, resolver"
          cancelLabel="Volver"
          confirmTone="danger"
          onConfirm={() => {
            setConfirming(false);
            onResolve();
          }}
          onCancel={() => setConfirming(false)}
        />
      </Modal>
    </View>
  );
}
