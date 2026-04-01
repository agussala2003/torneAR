import { useState } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import type { TeamBadgeItem } from './types';

type Props = {
  badges: TeamBadgeItem[];
};

export function TeamBadgesSection({ badges }: Props) {
  const [selected, setSelected] = useState<TeamBadgeItem | null>(null);
  const earned = badges.filter((b) => b.isEarned);
  const locked = badges.filter((b) => !b.isEarned);

  return (
    <View className="mt-8">
      <View className="mb-4 flex-row items-center justify-between px-1">
        <Text className="font-display text-sm uppercase tracking-wider text-neutral-on-surface-variant">
          Insignias del Equipo
        </Text>
        <Text
          className="font-uiBold text-[10px] uppercase text-neutral-on-surface-variant"
          style={{ fontVariant: ['tabular-nums'] }}>
          {earned.length} de {badges.length}
        </Text>
      </View>

      {badges.length === 0 ? (
        <View className="rounded-xl border border-dashed border-neutral-outline/15 bg-surface-high px-4 py-3">
          <Text className="text-xs text-neutral-on-surface-variant">Sin insignias disponibles.</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 16, paddingHorizontal: 4 }}
        >
          {earned.map((badge) => (
            <TouchableOpacity
              key={`e-${badge.id}`}
              activeOpacity={0.85}
              className="items-center gap-2"
              onPress={() => setSelected(badge)}
            >
              <View className="h-20 w-20 items-center justify-center rounded-full border-2 border-brand-primary bg-surface-high">
                <AppIcon family="material-community" name={badge.iconUrl} size={28} color="#53E076" />
              </View>
              <Text
                className="font-uiBold max-w-[72px] text-center text-[10px] text-neutral-on-surface"
                numberOfLines={2}>
                {badge.name}
              </Text>
            </TouchableOpacity>
          ))}

          {locked.map((badge) => (
            <TouchableOpacity
              key={`l-${badge.id}`}
              activeOpacity={0.85}
              className="items-center gap-2"
              onPress={() => setSelected(badge)}
            >
              <View className="relative h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-neutral-outline/15 bg-surface-high opacity-40">
                <AppIcon family="material-community" name={badge.iconUrl} size={28} color="#595959" />
                <View className="absolute h-6 w-6 items-center justify-center rounded-full bg-neutral-outline">
                  <AppIcon family="material-community" name="lock-outline" size={12} color="#8CCDFF" />
                </View>
              </View>
              <Text
                className="font-uiBold max-w-[72px] text-center text-[10px] text-neutral-on-surface-variant"
                numberOfLines={2}>
                {badge.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <TouchableWithoutFeedback onPress={() => setSelected(null)}>
          <View className="flex-1 items-center justify-center bg-black/80 px-5">
            <TouchableWithoutFeedback>
              <View className="w-full max-w-sm rounded-2xl bg-surface-high p-5">
                {selected && (
                  <>
                    <View className="mb-3 flex-row items-center justify-between">
                      <Text className="font-display text-lg text-neutral-on-surface">{selected.name}</Text>
                      <View
                        className={`rounded-full px-3 py-1 ${selected.isEarned ? 'bg-brand-primary/25' : 'bg-neutral-outline/20'}`}>
                        <Text
                          className={`font-uiBold text-[10px] uppercase ${selected.isEarned ? 'text-brand-primary' : 'text-neutral-on-surface-variant'}`}>
                          {selected.isEarned ? 'Ganada' : 'Bloqueada'}
                        </Text>
                      </View>
                    </View>
                    <Text className="font-ui text-sm leading-5 text-neutral-on-surface-variant">
                      {selected.criteriaDescription}
                    </Text>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => setSelected(null)}
                      className="mt-5 items-center rounded-xl bg-brand-primary py-3"
                    >
                      <Text className="font-display text-sm uppercase tracking-wide text-[#003914]">Entendido</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}
