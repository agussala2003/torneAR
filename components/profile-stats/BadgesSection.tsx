import { ScrollView, Text, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import type { EarnedBadge } from './types';

type BadgesSectionProps = {
  badges: EarnedBadge[];
};

export function BadgesSection({ badges }: BadgesSectionProps) {
  return (
    <View className="mt-8">
      <Text className="font-display mb-3 px-1 text-sm uppercase tracking-wider text-neutral-on-surface-variant">
        Insignias · {badges.length}
      </Text>
      {badges.length === 0 ? (
        <View className="rounded-xl bg-surface-low px-4 py-5">
          <Text className="font-ui text-sm text-neutral-on-surface-variant">
            Todavía no se ganaron insignias.
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 16, paddingHorizontal: 4 }}
        >
          {badges.map((badge) => (
            <View key={badge.id} className="items-center gap-2">
              <View className="h-20 w-20 items-center justify-center rounded-full border-2 border-brand-primary bg-surface-high">
                <AppIcon
                  family="material-community"
                  name={badge.iconUrl ?? 'medal-outline'}
                  size={28}
                  color="#53E076"
                />
              </View>
              <Text
                className="font-uiBold max-w-[72px] text-center text-[10px] text-neutral-on-surface"
                numberOfLines={2}
              >
                {badge.name}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
