import { Text, TouchableOpacity, View } from 'react-native';
import { PlayerLeaderboardRow } from './PlayerLeaderboardRow';
import type { PlayerLeaderboardEntry, LeaderboardStat } from './types';

const STAT_TABS: { key: LeaderboardStat; label: string; valueLabel: string }[] = [
    { key: 'goals', label: 'Goleadores', valueLabel: 'goles' },
    { key: 'mvps', label: 'MVPs', valueLabel: 'MVPs' },
    { key: 'matches', label: 'Partidos', valueLabel: 'partidos' },
];

interface Props {
    entries: PlayerLeaderboardEntry[];
    activeStat: LeaderboardStat;
    onStatChange: (stat: LeaderboardStat) => void;
    loading: boolean;
}

export function PlayerLeaderboard({ entries, activeStat, onStatChange, loading }: Props) {
    const activeTab = STAT_TABS.find(t => t.key === activeStat)!;
    const myPlayerIndex = entries.findIndex(e => e.isMyPlayer);
    const myPlayer = myPlayerIndex !== -1 ? entries[myPlayerIndex] : null;

    // Lógica de "salto" parecida a la de los equipos
    const topLimit = 5;
    const topPlayers = entries.slice(0, topLimit);
    const isMyPlayerOutsideTop = myPlayerIndex >= topLimit;

    return (
        <View className="mt-5">
            <Text className="mb-2.5 font-displayBlack text-base uppercase tracking-widest text-neutral-on-surface">
                ⚽ Mejores jugadores
            </Text>

            <View className="mb-3 flex-row gap-2">
                {STAT_TABS.map(tab => (
                    <TouchableOpacity
                        key={tab.key}
                        activeOpacity={0.7}
                        onPress={() => onStatChange(tab.key)}
                        className={`rounded-full px-3 py-1.5 ${activeStat === tab.key ? 'bg-brand-primary' : 'bg-surface-high'}`}
                    >
                        <Text className={`font-uiBold text-[11px] ${activeStat === tab.key ? 'text-surface-base' : 'text-neutral-on-surface-variant'}`}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {loading ? (
                <Text className="font-display text-base text-neutral-on-surface-variant text-center py-4">Cargando...</Text>
            ) : entries.length === 0 ? (
                <Text className="font-display text-base text-neutral-on-surface-variant text-center py-4">Sin datos registrados.</Text>
            ) : (
                <View>
                    {topPlayers.map(entry => (
                        <PlayerLeaderboardRow key={entry.profileId} entry={entry} statLabel={activeTab.valueLabel} />
                    ))}

                    {isMyPlayerOutsideTop && myPlayer && (
                        <View>
                            <View className="my-1.5 flex-row items-center justify-center gap-2 py-1.5">
                                <View className="h-px flex-1 bg-surface-high" />
                                <Text className="font-displayBlack text-[10px] uppercase tracking-widest text-neutral-outline">
                                    · · · {myPlayerIndex - topLimit} jugadores · · ·
                                </Text>
                                <View className="h-px flex-1 bg-surface-high" />
                            </View>
                            <PlayerLeaderboardRow entry={myPlayer} statLabel={activeTab.valueLabel} />
                        </View>
                    )}
                </View>
            )}
        </View>
    );
}