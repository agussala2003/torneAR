import { Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import type { RankingFiltersState } from './types';

interface Props {
    filters: RankingFiltersState;
    onOpenModal: () => void;
    onToggleIdeales: () => void;
    canUseRivalesIdeales: boolean;
}

export function RankingFilterBar({ filters, onOpenModal, onToggleIdeales, canUseRivalesIdeales }: Props) {
    let activeCount = 0;
    if (filters.zone) activeCount++;
    if (filters.category) activeCount++;
    if (filters.format) activeCount++;

    return (
        <View className="mb-4 flex-row items-center gap-2">
            <TouchableOpacity
                activeOpacity={0.8}
                onPress={onOpenModal}
                className={`flex-row items-center gap-1.5 rounded-xl border px-3 py-2.5 ${activeCount > 0
                        ? 'border-brand-primary/30 bg-brand-primary/10'
                        : 'border-transparent bg-surface-high'
                    }`}
            >
                <AppIcon family="material-community" name="tune" size={16} color={activeCount > 0 ? '#53E076' : '#BCCBB9'} />
                <Text className={`font-uiBold text-xs ${activeCount > 0 ? 'text-brand-primary' : 'text-neutral-on-surface-variant'}`}>
                    Filtros
                </Text>
                {activeCount > 0 && (
                    <View className="ml-1 h-4 w-4 items-center justify-center rounded-full bg-brand-primary">
                        <Text className="font-uiBold text-[10px] text-surface-base">{activeCount}</Text>
                    </View>
                )}
            </TouchableOpacity>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
                <View className="flex-row items-center gap-1.5 py-1">
                    {filters.zone && <View className="rounded-lg bg-surface-container px-2 py-1"><Text className="font-uiBold text-[11px] text-neutral-on-surface-variant">{filters.zone}</Text></View>}
                    {filters.format && <View className="rounded-lg bg-surface-container px-2 py-1"><Text className="font-uiBold text-[11px] text-neutral-on-surface-variant">{filters.format}</Text></View>}
                    {filters.category && <View className="rounded-lg bg-surface-container px-2 py-1"><Text className="font-uiBold text-[11px] text-neutral-on-surface-variant">{filters.category}</Text></View>}
                    {activeCount === 0 && <Text className="px-2 font-ui text-xs text-outline">Todos los equipos</Text>}
                </View>
            </ScrollView>

            {canUseRivalesIdeales && (
                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={onToggleIdeales}
                    className={`flex-row items-center gap-1 rounded-full border px-3 py-1.5 ${filters.rivalesIdeales
                            ? 'border-warning-tertiary/30 bg-warning-tertiary/20'
                            : 'border-transparent bg-surface-high'
                        }`}
                >
                    <AppIcon family="material-community" name="target" size={14} color={filters.rivalesIdeales ? '#FABD32' : '#BCCBB9'} />
                    <Text className={`font-uiBold text-[11px] ${filters.rivalesIdeales ? 'text-warning-tertiary' : 'text-neutral-on-surface-variant'}`}>
                        Ideales
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
}