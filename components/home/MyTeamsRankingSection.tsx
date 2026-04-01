import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { TeamShield } from '@/components/matches/TeamShield';
import type { HomeTeamSnapshot } from './types';

const ROLE_LABEL: Record<string, string> = {
  CAPITAN: 'Capitán',
  SUBCAPITAN: 'Subcapitán',
  JUGADOR: 'Jugador',
  DIRECTOR_TECNICO: 'DT',
};

interface TeamCardProps {
  team: HomeTeamSnapshot;
  onPress: (teamId: string) => void;
}

function TeamRankingCard({ team, onPress }: TeamCardProps) {
  const record = `${team.seasonWins}V ${team.seasonDraws}E ${team.seasonLosses}D`;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(team.id)}
      className="mr-3 w-44 overflow-hidden rounded-2xl bg-surface-container p-4"
    >
      {/* Shield + name */}
      <View className="mb-3 items-center gap-2">
        <TeamShield shieldUrl={team.shieldUrl} size={48} isMyTeam />
        <Text
          className="font-uiBold text-center text-[13px] text-neutral-on-surface"
          numberOfLines={1}
        >
          {team.name}
        </Text>
        <Text className="font-ui text-[10px] text-neutral-on-surface-variant">
          {ROLE_LABEL[team.role] ?? team.role}
        </Text>
      </View>

      {/* ELO rating */}
      <View className="mb-2 items-center rounded-xl bg-surface-high py-2">
        <Text className="font-displayBlack text-xl text-brand-primary">{team.eloRating}</Text>
        <Text className="font-ui text-[10px] uppercase tracking-wider text-neutral-on-surface-variant">
          Rating
        </Text>
      </View>

      {/* W/D/L */}
      <Text className="font-ui text-center text-[11px] text-neutral-on-surface-variant">
        {record}
      </Text>

      {/* Fair Play Score */}
      <View className="mt-2 flex-row items-center justify-center gap-1">
        <AppIcon family="material-community" name="hand-peace" size={12} color="#53E076" />
        <Text className="font-uiBold text-[11px] text-brand-primary">{team.fairPlayScore}</Text>
        <Text className="font-ui text-[10px] text-neutral-outline">FPS</Text>
      </View>
    </TouchableOpacity>
  );
}

interface Props {
  teams: HomeTeamSnapshot[];
  onTeamPress: (teamId: string) => void;
  onSeeRanking: () => void;
}

export function MyTeamsRankingSection({ teams, onTeamPress, onSeeRanking }: Props) {
  if (teams.length === 0) return null;

  return (
    <View className="mb-5">
      {/* Section header */}
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="font-displayBlack text-xs uppercase tracking-widest text-neutral-on-surface-variant">
          Mis Equipos
        </Text>
        <TouchableOpacity activeOpacity={0.7} onPress={onSeeRanking}>
          <Text className="font-uiBold text-xs text-info-secondary">Ver ranking</Text>
        </TouchableOpacity>
      </View>

      {teams.length === 1 ? (
        // Single team: full-width card
        <View className="overflow-hidden rounded-2xl bg-surface-container">
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => onTeamPress(teams[0].id)}
            className="flex-row items-center gap-4 p-4"
          >
            <TeamShield shieldUrl={teams[0].shieldUrl} size={52} isMyTeam />
            <View className="flex-1">
              <Text className="font-uiBold text-[15px] text-neutral-on-surface">
                {teams[0].name}
              </Text>
              <Text className="font-ui text-[11px] text-neutral-on-surface-variant">
                {ROLE_LABEL[teams[0].role] ?? teams[0].role}
              </Text>
              <Text className="font-ui mt-1 text-[11px] text-neutral-on-surface-variant">
                {`${teams[0].seasonWins}V ${teams[0].seasonDraws}E ${teams[0].seasonLosses}D`}
              </Text>
            </View>
            <View className="items-end">
              <>
                <Text className="font-displayBlack text-2xl text-brand-primary">
                  {teams[0].eloRating}
                </Text>
                <Text className="font-ui text-[10px] uppercase tracking-wider text-neutral-on-surface-variant">
                  Rating
                </Text>
              </>
              <View className="mt-1 flex-row items-center gap-1">
                <AppIcon family="material-community" name="hand-peace" size={11} color="#53E076" />
                <Text className="font-uiBold text-[11px] text-brand-primary">
                  {teams[0].fairPlayScore}
                </Text>
                <Text className="font-ui text-[10px] text-neutral-outline">FPS</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      ) : (
        // Multiple teams: horizontal scroll cards
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {teams.map((team) => (
            <TeamRankingCard key={team.id} team={team} onPress={onTeamPress} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
