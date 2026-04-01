import { useState } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { BadgeItem } from './types';
import { AppIcon } from '@/components/ui/AppIcon';

type ProfileBadgesSectionProps = {
  badges: BadgeItem[];
};

function getHowToUnlock(badge: BadgeItem): string {
  if (badge.criteriaDescription && badge.criteriaDescription.trim().length > 0) {
    return badge.criteriaDescription;
  }
  return 'Participá en más partidos y completá desafíos para desbloquear esta insignia.';
}

export function ProfileBadgesSection({ badges }: ProfileBadgesSectionProps) {
  const earnedBadges = badges.filter((b) => b.isEarned);
  const lockedBadges = badges.filter((b) => !b.isEarned);
  const [selectedBadge, setSelectedBadge] = useState<BadgeItem | null>(null);

  return (
    <View className="mt-8">
      <View className="mb-4 flex-row items-center justify-between px-1">
        <Text className="font-display text-sm uppercase tracking-wider text-neutral-on-surface-variant">
          Insignias Ganadas
        </Text>
        <Text className="font-uiBold text-[10px] uppercase text-neutral-on-surface-variant" style={{ fontVariant: ['tabular-nums'] }}>
          {earnedBadges.length} de {badges.length}
        </Text>
      </View>

      {badges.length === 0 ? (
        <View className="rounded-xl border border-dashed border-neutral-outline-variant/15 bg-surface-high px-4 py-3">
          <Text className="text-xs text-neutral-on-surface-variant">Aun no hay insignias disponibles.</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 16, paddingHorizontal: 4, paddingVertical: 0 }}
        >
          {/* Insignias ganadas */}
          {earnedBadges.map((badge) => (
            <TouchableOpacity
              key={`earned-${badge.id}`}
              activeOpacity={0.85}
              className="items-center gap-2"
              onPress={() => setSelectedBadge(badge)}
            >
              <View className="h-20 w-20 items-center justify-center rounded-full border-2 border-brand-primary bg-surface-high">
                <AppIcon family="material-community" name={badge.iconUrl || 'medal-outline'} size={28} color="#53E076" />
              </View>
              <Text
                className="font-uiBold max-w-[72px] text-center text-[10px] text-neutral-on-surface"
                numberOfLines={2}
              >
                {badge.name}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Insignias bloqueadas */}
          {lockedBadges.map((badge) => (
            <TouchableOpacity
              key={`locked-${badge.id}`}
              activeOpacity={0.85}
              className="items-center gap-2"
              onPress={() => setSelectedBadge(badge)}
            >
              <View className="relative h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-neutral-outline-variant/15 bg-surface-high">
                <AppIcon family="material-community" name={badge.iconUrl || 'medal-outline'} size={28} color="#595959" />
                <View className="absolute h-6 w-6 items-center justify-center rounded-full bg-neutral-outline-variant">
                  <AppIcon family="material-community" name="lock-outline" size={12} color="#8CCDFF" />
                </View>
              </View>
              <Text
                className="font-uiBold max-w-[72px] text-center text-[10px] text-neutral-on-surface-variant"
                numberOfLines={2}
              >
                {badge.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <Modal
        visible={!!selectedBadge}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedBadge(null)}
      >
        <TouchableWithoutFeedback onPress={() => setSelectedBadge(null)}>
          <View className="flex-1 items-center justify-center bg-black/80 px-5">
            <TouchableWithoutFeedback>
              <View className="w-full max-w-sm rounded-2xl bg-surface-high p-5">
                {selectedBadge && (
                  <>
                    <View className="mb-3 flex-row items-center justify-between">
                      <Text className="font-display text-lg text-neutral-on-surface">{selectedBadge.name}</Text>
                      <View className={`rounded-full px-3 py-1 ${selectedBadge.isEarned ? 'bg-brand-primary/25' : 'bg-neutral-outline-variant/20'}`}>
                        <Text className={`font-uiBold text-[10px] uppercase ${selectedBadge.isEarned ? 'text-brand-primary' : 'text-neutral-on-surface-variant'}`}>
                          {selectedBadge.isEarned ? 'Ganada' : 'Bloqueada'}
                        </Text>
                      </View>
                    </View>

                    <Text className="font-ui text-sm leading-5 text-neutral-on-surface-variant">
                      {getHowToUnlock(selectedBadge)}
                    </Text>

                    {!selectedBadge.isEarned && (
                      <View className="mt-4 rounded-xl bg-surface-low px-3 py-2">
                        <Text className="font-uiBold text-xs uppercase tracking-wide text-brand-primary">Como conseguirla</Text>
                        <Text className="font-ui mt-1 text-xs text-neutral-on-surface-variant">
                          Completa su objetivo en partidos oficiales para desbloquear esta insignia.
                        </Text>
                      </View>
                    )}

                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => setSelectedBadge(null)}
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
