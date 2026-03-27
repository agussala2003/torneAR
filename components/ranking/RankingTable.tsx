import { Text, View } from 'react-native';
import { RankingTeamRow } from './RankingTeamRow';
import type { RankingTeamEntry } from './types';

interface Props {
    entries: RankingTeamEntry[];
    onTeamPress: (teamId: string) => void;
    topLimit?: number;
}

export function RankingTable({ entries, onTeamPress, topLimit = 5 }: Props) {
    if (entries.length === 0) {
        return (
            <View>
                <Text className="mb-2.5 font-displayBlack text-base uppercase tracking-widest text-neutral-on-surface">
                    🏆 Mejores equipos
                </Text>
                <View className="items-center py-12">
                    <Text className="font-display text-base text-neutral-on-surface-variant">
                        No hay equipos en el ranking con estos filtros.
                    </Text>
                </View>
            </View>
        );
    }

    const myTeamIndex = entries.findIndex((e) => e.isMyTeam);
    const myTeam = myTeamIndex !== -1 ? entries[myTeamIndex] : null;
    const topTeams = entries.slice(0, topLimit);
    const isMyTeamOutsideTop = myTeamIndex >= topLimit;
    const teamsInBetween = isMyTeamOutsideTop ? myTeamIndex - topLimit : 0;

    return (
        <View>
            <Text className="mb-2.5 font-displayBlack text-base uppercase tracking-widest text-neutral-on-surface">
                🏆 Mejores equipos
            </Text>
            <View className="mb-2 flex-row items-center px-3">
                <Text className="w-7 font-uiBold text-xs uppercase text-neutral-on-surface-variant">#</Text>
                <View className="w-10" />
                <Text className="flex-1 font-uiBold text-xs uppercase text-neutral-on-surface-variant">Equipo</Text>
                <Text className="font-uiBold text-xs uppercase text-neutral-on-surface-variant">Rating</Text>
                <View className="w-5" />
            </View>

            {topTeams.map((entry) => (
                <RankingTeamRow key={entry.teamId} entry={entry} onPress={onTeamPress} />
            ))}

            {isMyTeamOutsideTop && myTeam && (
                <View>
                    <View className="my-2 flex-row items-center justify-center gap-2 py-2">
                        <View className="h-px flex-1 bg-surface-high" />
                        <Text className="font-displayBlack text-[10px] uppercase tracking-widest text-neutral-outline">
                            · · · {teamsInBetween} equipos · · ·
                        </Text>
                        <View className="h-px flex-1 bg-surface-high" />
                    </View>
                    <RankingTeamRow key={myTeam.teamId} entry={myTeam} onPress={onTeamPress} />
                </View>
            )}
        </View>
    );
}