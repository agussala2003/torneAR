import { View, Text } from 'react-native';

interface Props {
  title: string;
  count?: number;
}

export function MatchSectionHeader({ title, count }: Props) {
  return (
    <View className="mb-3 flex-row items-center gap-3">
      <Text className="font-displayBlack text-[11px] uppercase tracking-widest text-neutral-on-surface-variant">
        {title}
      </Text>
      {count !== undefined && count > 0 && (
        <View className="rounded-full bg-surface-high px-2 py-0.5">
          <Text className="font-uiBold text-[10px] text-neutral-on-surface-variant">{count}</Text>
        </View>
      )}
      <View className="flex-1 border-t border-neutral-outline/20" />
    </View>
  );
}
