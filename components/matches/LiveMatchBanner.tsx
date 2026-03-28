import { View, Text, TouchableOpacity } from 'react-native';
import type { MatchCardEntry } from './types';
import { TeamShield } from './TeamShield';

interface Props {
  match: MatchCardEntry;
  myTeamId: string;
  onPress: (matchId: string) => void;
  onLoadResult?: (matchId: string) => void;
}

export function LiveMatchBanner({ match, myTeamId, onPress, onLoadResult }: Props) {
  const scoreA = match.resultTeamA !== null ? match.resultTeamA : '?';
  const scoreB = match.resultTeamB !== null ? match.resultTeamB : '?';
  const isMyTeamA = match.teamA.id === myTeamId;
  const isMyTeamB = match.teamB.id === myTeamId;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => onPress(match.id)}
      className="mb-4 rounded-2xl border border-danger-error/30 bg-danger-error/10 p-4"
    >
      {/* Live indicator */}
      <View className="mb-3 flex-row items-center gap-2">
        <View className="h-2 w-2 rounded-full bg-danger-error" />
        <Text className="font-displayBlack text-[11px] uppercase tracking-widest text-danger-error">
          En vivo
        </Text>
      </View>

      {/* Teams + Score */}
      <View className="flex-row items-center">
        <View className="flex-1 items-center gap-1.5">
          <TeamShield shieldUrl={match.teamA.shieldUrl} size={52} isMyTeam={isMyTeamA} />
          <Text
            className="font-uiBold text-[13px] text-neutral-on-surface"
            numberOfLines={1}
            style={{ maxWidth: 90 }}
          >
            {match.teamA.name}
          </Text>
        </View>

        <View className="w-24 items-center">
          <Text className="font-displayBlack text-[32px] leading-none text-danger-error">
            {scoreA} – {scoreB}
          </Text>
        </View>

        <View className="flex-1 items-center gap-1.5">
          <TeamShield shieldUrl={match.teamB.shieldUrl} size={52} isMyTeam={isMyTeamB} />
          <Text
            className="font-uiBold text-[13px] text-neutral-on-surface"
            numberOfLines={1}
            style={{ maxWidth: 90 }}
          >
            {match.teamB.name}
          </Text>
        </View>
      </View>

      {/* Load result button */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => onLoadResult?.(match.id)}
        className="mt-4 items-center rounded-xl border border-danger-error/50 py-3"
      >
        <Text className="font-uiBold text-[13px] text-danger-error">→ Cargar resultado</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}
