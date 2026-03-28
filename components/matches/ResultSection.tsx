import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import type { MatchDetailViewData, MatchResultEntry } from '@/components/matches/types';

interface Props {
  match: MatchDetailViewData;
  onLoadResult?: () => void;
}

function ResultCard({
  result,
  teamName,
  isMine,
}: {
  result: MatchResultEntry | null;
  teamName: string;
  isMine: boolean;
}) {
  return (
    <View className={`flex-1 rounded-xl p-3 ${isMine ? 'bg-brand-primary/10' : 'bg-surface-high'}`}>
      <Text
        className="font-uiBold mb-2 text-center text-xs text-neutral-on-surface"
        numberOfLines={1}
      >
        {teamName}
      </Text>
      {result ? (
        <View className="items-center gap-1">
          <Text className="font-displayBlack text-2xl text-neutral-on-surface">
            {result.goalsScored}
          </Text>
          {result.scorers.length > 0 && (
            <View className="mt-1 gap-0.5">
              {result.scorers.map((s) => (
                <Text
                  key={s.profileId}
                  className="font-ui text-center text-[10px] text-neutral-on-surface-variant"
                >
                  {s.fullName} ({s.goals})
                </Text>
              ))}
            </View>
          )}
          {result.mvp && (
            <View className="mt-1 flex-row items-center gap-1">
              <AppIcon family="material-community" name="star" size={12} color="#FABD32" />
              <Text className="font-ui text-[10px] text-warning-tertiary">
                {result.mvp.fullName}
              </Text>
            </View>
          )}
        </View>
      ) : (
        <View className="items-center">
          <Text className="font-ui text-lg text-neutral-outline">—</Text>
          <Text className="font-ui text-[10px] text-neutral-outline">Sin cargar</Text>
        </View>
      )}
    </View>
  );
}

export function ResultSection({ match, onLoadResult }: Props) {
  const { status, teamA, teamB, myTeamId, myResult, opponentResult, isResultLoader } = match;

  const isMyTeamA = teamA.id === myTeamId;
  const myTeam = isMyTeamA ? teamA : teamB;
  const opponentTeam = isMyTeamA ? teamB : teamA;
  const myRes = myResult;
  const opponentRes = opponentResult;

  const canLoad = status === 'EN_VIVO' && isResultLoader && myRes === null;

  return (
    <View className="mt-4 rounded-2xl bg-surface-container p-4">
      <Text className="font-uiBold mb-3 text-base text-neutral-on-surface">Resultado</Text>
      <View className="mb-4 flex-row gap-2">
        <ResultCard result={myRes} teamName={myTeam.name} isMine />
        <ResultCard result={opponentRes} teamName={opponentTeam.name} isMine={false} />
      </View>

      {canLoad && onLoadResult && (
        <TouchableOpacity
          onPress={onLoadResult}
          activeOpacity={0.8}
          className="rounded-xl bg-brand-primary py-3"
        >
          <Text className="font-uiBold text-center text-sm text-[#003914]">Cargar resultado</Text>
        </TouchableOpacity>
      )}

      {status === 'FINALIZADO' && myRes && opponentRes && (
        <View className="mt-2 flex-row items-center gap-2 rounded-xl bg-surface-high px-3 py-2">
          <AppIcon family="material-community" name="handshake" size={16} color="#869585" />
          <Text className="font-ui text-xs text-neutral-on-surface-variant">
            Ambos equipos confirmaron el resultado.
          </Text>
        </View>
      )}
    </View>
  );
}
