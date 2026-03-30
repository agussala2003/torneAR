import { Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { AppIcon } from '@/components/ui/AppIcon';
import type { RankingTeamEntry } from './types';

interface Props {
    entry: RankingTeamEntry;
    onPress: (teamId: string) => void;
    index?: number;
}

export function RankingTeamRow({ entry, onPress, index = 0 }: Props) {
    const isTop3 = entry.rankPosition <= 3;
    const posColors = ['#FABD32', '#C0C0C0', '#CD7F32'] as const; // Oro, Plata, Bronce
    const posColor = isTop3 ? posColors[entry.rankPosition - 1] : '#869585';

    return (
        <Animated.View entering={FadeInRight.delay(index * 50).springify()} style={{ marginBottom: 6 }}>
        <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => onPress(entry.teamId)}
            className={`flex-row items-center overflow-hidden rounded-xl px-3 py-3 ${entry.isMyTeam ? 'border border-brand-primary/20 bg-[#1e2a1e]' : 'bg-surface-container'
                }`}
        >
            {/* Barra lateral de color (solo top 3 o mi equipo) */}
            {(isTop3 || entry.isMyTeam) && (
                <View
                    className="absolute bottom-0 left-0 top-0 w-1 rounded-l-sm"
                    style={{ backgroundColor: entry.isMyTeam && !isTop3 ? '#53E076' : posColor }}
                />
            )}

            {/* Posición */}
            <Text style={{ color: entry.isMyTeam && !isTop3 ? '#53E076' : posColor, width: 28, marginLeft: isTop3 || entry.isMyTeam ? 4 : 0 }} className="font-displayBlack text-base">
                {entry.rankPosition}
            </Text>

            {/* Escudo */}
            {entry.shieldUrl ? (
                <Image source={{ uri: entry.shieldUrl }} style={{ width: 34, height: 34, borderRadius: 17, marginRight: 10 }} contentFit="cover" />
            ) : (
                <View className="mr-2.5 h-[34px] w-[34px] items-center justify-center rounded-full bg-surface-high">
                    <AppIcon family="material-community" name="shield" size={18} color="#869585" />
                </View>
            )}

            {/* Nombre e info */}
            <View className="flex-1">
                <Text className={`font-uiBold text-[13px] ${entry.isMyTeam ? 'text-brand-primary' : 'text-neutral-on-surface'}`} numberOfLines={1}>
                    {entry.teamName} {entry.isMyTeam && '★'}
                </Text>
                <Text className="font-ui text-[10px] text-neutral-on-surface-variant">
                    {entry.seasonWins}V · {entry.seasonLosses}D · {entry.seasonDraws}E
                </Text>
            </View>

            {/* Rating */}
            <View className="items-end">
                <Text className={`font-displayBlack text-[17px] leading-none ${entry.isMyTeam ? 'text-brand-primary' : 'text-neutral-on-surface'}`}>
                    {entry.eloRating}
                </Text>
                <Text className="mt-1 font-ui text-[10px] text-neutral-on-surface-variant">PJ {entry.matchesPlayed}</Text>
            </View>

            <AppIcon family="material-community" name="chevron-right" size={14} color="#869585" />
        </TouchableOpacity>
        </Animated.View>
    );
}