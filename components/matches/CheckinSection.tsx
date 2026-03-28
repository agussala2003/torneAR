import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import type { MatchDetailViewData } from '@/components/matches/types';

interface Props {
  match: MatchDetailViewData;
  onCheckin: () => void;
}

function TeamCheckinBox({
  teamName,
  checkinAt,
  isMyTeam,
}: {
  teamName: string;
  checkinAt: string | null;
  isMyTeam: boolean;
}) {
  const done = checkinAt !== null;
  return (
    <View
      className={`flex-1 rounded-xl p-3 ${
        isMyTeam ? 'border border-brand-primary/30 bg-brand-primary/10' : 'bg-surface-high'
      }`}
    >
      <Text
        className="font-uiBold mb-2 text-center text-xs text-neutral-on-surface"
        numberOfLines={1}
      >
        {teamName}
      </Text>
      {done ? (
        <View className="items-center gap-1">
          <AppIcon family="material-community" name="check-circle" size={22} color="#53E076" />
          <Text className="font-ui text-center text-[10px] text-brand-primary">
            {new Date(checkinAt!).toLocaleTimeString('es-AR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      ) : (
        <View className="items-center">
          <AppIcon family="material-community" name="clock-outline" size={22} color="#869585" />
          <Text className="font-ui mt-1 text-center text-[10px] text-neutral-outline">
            Pendiente
          </Text>
        </View>
      )}
    </View>
  );
}

function isWithin2Hours(scheduledAt: string | null): boolean {
  if (!scheduledAt) return false;
  const diff = new Date(scheduledAt).getTime() - Date.now();
  return diff <= 2 * 60 * 60 * 1000 && diff > -60 * 60 * 1000;
}

export function CheckinSection({ match, onCheckin }: Props) {
  const { teamA, teamB, myTeamId, checkinTeamAAt, checkinTeamBAt, scheduledAt } = match;

  const isMyTeamA = teamA.id === myTeamId;
  const myTeam = isMyTeamA ? teamA : teamB;
  const opponentTeam = isMyTeamA ? teamB : teamA;
  const myCheckinAt = isMyTeamA ? checkinTeamAAt : checkinTeamBAt;
  const opponentCheckinAt = isMyTeamA ? checkinTeamBAt : checkinTeamAAt;

  const alreadyCheckedIn = myCheckinAt !== null;
  const canCheckin = !alreadyCheckedIn && isWithin2Hours(scheduledAt);

  return (
    <View className="mt-4 rounded-2xl bg-surface-container p-4">
      <Text className="font-uiBold mb-3 text-base text-neutral-on-surface">Check-in</Text>
      <View className="mb-4 flex-row gap-2">
        <TeamCheckinBox
          teamName={myTeam.name}
          checkinAt={myCheckinAt}
          isMyTeam
        />
        <TeamCheckinBox
          teamName={opponentTeam.name}
          checkinAt={opponentCheckinAt}
          isMyTeam={false}
        />
      </View>

      {!alreadyCheckedIn && !canCheckin && (
        <View className="rounded-xl bg-surface-high px-4 py-3">
          <Text className="font-ui text-center text-sm text-neutral-on-surface-variant">
            El check-in se habilita 2 horas antes del partido
          </Text>
        </View>
      )}

      {canCheckin && (
        <TouchableOpacity
          onPress={onCheckin}
          activeOpacity={0.8}
          className="rounded-xl bg-brand-primary py-3"
        >
          <Text className="font-uiBold text-center text-sm text-[#003914]">Marcar llegada</Text>
        </TouchableOpacity>
      )}

      {alreadyCheckedIn && (
        <View className="rounded-xl bg-brand-primary/10 px-4 py-3">
          <Text className="font-uiBold text-center text-sm text-brand-primary">
            Ya marcaste tu llegada
          </Text>
        </View>
      )}
    </View>
  );
}
