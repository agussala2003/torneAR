import { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { TeamShield } from '@/components/matches/TeamShield';
import { LiveTimer } from '@/components/matches/LiveTimer';
import type { MatchDetailViewData } from '@/components/matches/types';

interface Props {
  match: MatchDetailViewData;
  myTeamId: string;
}

function ScoreCenter({ scoreA, scoreB }: { scoreA: number; scoreB: number }) {
  return (
    <View className="items-center">
      <Text className="font-displayBlack text-5xl text-neutral-on-surface">
        {scoreA} – {scoreB}
      </Text>
    </View>
  );
}

function LiveBadge() {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={{ opacity: pulse }}
      className="mt-2 rounded-full bg-danger-error/20 px-3 py-1"
    >
      <Text className="font-uiBold text-xs uppercase tracking-widest text-danger-error">
        EN VIVO
      </Text>
    </Animated.View>
  );
}

export function MatchDetailHero({ match, myTeamId }: Props) {
  const { status, teamA, teamB, myResult, opponentResult } = match;

  const isMyTeamA = teamA.id === myTeamId;
  const myTeam = isMyTeamA ? teamA : teamB;
  const opponentTeam = isMyTeamA ? teamB : teamA;

  const myGoals = isMyTeamA ? myResult?.goalsScored : opponentResult?.goalsAgainst;
  const opponentGoals = isMyTeamA ? opponentResult?.goalsScored : myResult?.goalsAgainst;

  function renderCenter() {
    if (status === 'EN_VIVO') {
      const sA = match.myResult?.goalsScored ?? 0;
      const sB = match.opponentResult?.goalsScored ?? 0;
      return (
        <View className="items-center gap-1">
          <ScoreCenter scoreA={isMyTeamA ? sA : sB} scoreB={isMyTeamA ? sB : sA} />
          <LiveBadge />
          {match.startedAt && (
            <LiveTimer
              startedAt={match.startedAt}
              className="font-displayBlack text-lg text-danger-error/80"
            />
          )}
        </View>
      );
    }

    if (status === 'FINALIZADO') {
      const sA = myGoals ?? 0;
      const sB = opponentGoals ?? 0;
      const iWon = sA > sB;
      const isDraw = sA === sB;
      return (
        <View className="items-center gap-1">
          <ScoreCenter scoreA={sA} scoreB={sB} />
          {!isDraw && (
            <View
              className={`rounded-full px-3 py-1 ${iWon ? 'bg-brand-primary/20' : 'bg-danger-error/20'}`}
            >
              <Text
                className={`font-uiBold text-xs uppercase tracking-widest ${iWon ? 'text-brand-primary' : 'text-danger-error'}`}
              >
                {iWon ? 'Victoria' : 'Derrota'}
              </Text>
            </View>
          )}
          {isDraw && (
            <View className="rounded-full bg-neutral-outline/20 px-3 py-1">
              <Text className="font-uiBold text-xs uppercase tracking-widest text-neutral-on-surface-variant">
                Empate
              </Text>
            </View>
          )}
        </View>
      );
    }

    if (status === 'EN_DISPUTA') {
      return (
        <View className="items-center">
          <Text className="font-displayBlack text-5xl text-warning-tertiary">? – ?</Text>
          <View className="mt-2 rounded-full bg-warning-tertiary/20 px-3 py-1">
            <Text className="font-uiBold text-xs uppercase tracking-widest text-warning-tertiary">
              En disputa
            </Text>
          </View>
        </View>
      );
    }

    if (status === 'WO_A' || status === 'WO_B') {
      const woWinner = status === 'WO_A' ? teamA : teamB;
      const iWinByWo = woWinner.id === myTeamId;
      const myWoScore = iWinByWo ? 3 : 0;
      const theirWoScore = iWinByWo ? 0 : 3;
      return (
        <View className="items-center gap-1">
          <ScoreCenter scoreA={myWoScore} scoreB={theirWoScore} />
          <View className="rounded-full bg-warning-tertiary/20 px-3 py-1">
            <Text className="font-uiBold text-xs uppercase tracking-widest text-warning-tertiary">
              WO
            </Text>
          </View>
        </View>
      );
    }

    // PENDIENTE / CONFIRMADO
    return (
      <Text className="font-displayBlack text-3xl italic text-neutral-outline">VS</Text>
    );
  }

  const isFinalized = status === 'FINALIZADO';

  return (
    <View
      className={`items-center rounded-2xl px-6 py-8 ${
        isFinalized ? 'bg-brand-primary/5' : 'bg-surface-container'
      }`}
    >
      <View className="flex-row items-center justify-center gap-6">
        {/* My team */}
        <View className="flex-1 items-center gap-2">
          <TeamShield shieldUrl={myTeam.shieldUrl} size={72} isMyTeam />
          <Text
            className="font-uiBold text-center text-sm text-neutral-on-surface"
            numberOfLines={2}
          >
            {myTeam.name}
          </Text>
          <Text className="font-ui text-xs text-neutral-outline">{myTeam.eloRating} ELO</Text>
        </View>

        {/* Center */}
        <View className="items-center">{renderCenter()}</View>

        {/* Opponent team */}
        <View className="flex-1 items-center gap-2">
          <TeamShield shieldUrl={opponentTeam.shieldUrl} size={72} />
          <Text
            className="font-uiBold text-center text-sm text-neutral-on-surface"
            numberOfLines={2}
          >
            {opponentTeam.name}
          </Text>
          <Text className="font-ui text-xs text-neutral-outline">{opponentTeam.eloRating} ELO</Text>
        </View>
      </View>
    </View>
  );
}
