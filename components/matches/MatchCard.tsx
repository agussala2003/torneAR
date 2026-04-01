import { View, Text, TouchableOpacity } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import type { MatchCardEntry } from './types';
import { MatchStatusBadge } from './MatchStatusBadge';
import { TeamShield } from './TeamShield';
import { MatchCardCenter } from './MatchCardCenter';
import { MatchCardFooter } from './MatchCardFooter';

const FORMAT_SHORT: Record<string, string> = {
  FUTBOL_5: 'F5', FUTBOL_6: 'F6', FUTBOL_7: 'F7',
  FUTBOL_8: 'F8', FUTBOL_9: 'F9', FUTBOL_11: 'F11',
};

const MATCH_TYPE_LABEL: Record<string, string> = {
  RANKING: 'Ranking',
  AMISTOSO: 'Amistoso',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
}

interface Props {
  entry: MatchCardEntry;
  myTeamId: string;
  onPress: (matchId: string) => void;
  onProposePress?: (matchId: string) => void;
  onAcceptProposal?: (proposalId: string, matchId: string) => void;
  onRejectProposal?: (proposalId: string, matchId: string) => void;
  onCancelProposal?: (proposalId: string, matchId: string) => void;
  onLoadResult?: (matchId: string) => void;
  index?: number;
}

export function MatchCard({
  entry,
  myTeamId,
  onPress,
  onProposePress,
  onAcceptProposal,
  onRejectProposal,
  onCancelProposal,
  onLoadResult,
  index = 0,
}: Props) {
  const isMyTeamA = entry.teamA.id === myTeamId;
  const isMyTeamB = entry.teamB.id === myTeamId;

  return (
    <Animated.View entering={FadeInUp.delay(index * 60).springify()} style={{ marginBottom: 12 }}>
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(entry.id)}
      className="rounded-2xl bg-surface-container p-4"
    >
      {/* Header */}
      <View className="mb-3 flex-row items-center gap-2">
        <MatchStatusBadge status={entry.status} />
        <Text className="font-uiBold text-[11px] text-neutral-on-surface-variant">
          {MATCH_TYPE_LABEL[entry.matchType] ?? entry.matchType}
          {entry.format ? ` · ${FORMAT_SHORT[entry.format] ?? entry.format}` : ''}
        </Text>
        {entry.scheduledAt && (
          <Text className="ml-auto font-ui text-[10px] text-neutral-outline">
            {formatDate(entry.scheduledAt)}
          </Text>
        )}
        {entry.venue && (
          <Text className="font-ui text-[10px] text-neutral-outline" numberOfLines={1}>
            {entry.venue}
          </Text>
        )}
      </View>

      {/* Body: Team A | Center | Team B */}
      <View className="flex-row items-center">
        {/* Team A */}
        <View className="flex-1 items-center gap-1.5">
          <TeamShield shieldUrl={entry.teamA.shieldUrl} size={48} isMyTeam={isMyTeamA} />
          <Text
            className="font-uiBold text-[12px] text-neutral-on-surface"
            numberOfLines={1}
            style={{ maxWidth: 90 }}
          >
            {entry.teamA.name}
          </Text>
          <Text className="font-ui text-[10px] text-neutral-outline">{entry.teamA.eloRating}</Text>
        </View>

        {/* Center */}
        <View className="w-20 items-center">
          <MatchCardCenter entry={entry} />
        </View>

        {/* Team B */}
        <View className="flex-1 items-center gap-1.5">
          <TeamShield shieldUrl={entry.teamB.shieldUrl} size={48} isMyTeam={isMyTeamB} />
          <Text
            className="font-uiBold text-[12px] text-neutral-on-surface"
            numberOfLines={1}
            style={{ maxWidth: 90 }}
          >
            {entry.teamB.name}
          </Text>
          <Text className="font-ui text-[10px] text-neutral-outline">{entry.teamB.eloRating}</Text>
        </View>
      </View>

      {/* Footer (contextual actions) */}
      <MatchCardFooter
        entry={entry}
        myTeamId={myTeamId}
        onProposePress={onProposePress}
        onAcceptProposal={onAcceptProposal}
        onRejectProposal={onRejectProposal}
        onCancelProposal={onCancelProposal}
        onLoadResult={onLoadResult}
      />
    </TouchableOpacity>
    </Animated.View>
  );
}
