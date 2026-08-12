import type { ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from './AppIcon';

const HEADER_BREATHING_ROOM = 10;

interface SecondaryHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  rightSlot?: ReactNode;
}

export function SecondaryHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Volver',
  rightSlot,
}: SecondaryHeaderProps) {
  const insets = useSafeAreaInsets();
  const handleBack = onBack ?? (() => router.back());

  return (
    <View
      className="border-b border-neutral-outline/10 bg-surface-base px-5 pb-4"
      style={{ paddingTop: insets.top + HEADER_BREATHING_ROOM }}
    >
      {/* Top navigation row */}
      <View className="min-h-[28px] flex-row items-center justify-between">
        <TouchableOpacity
          onPress={handleBack}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          className="flex-row items-center gap-1"
        >
          <AppIcon
            family="material-icons"
            name="arrow-back-ios-new"
            size={17}
            color="#BCCBB9"
          />

          <Text className="font-ui text-[13px] font-medium text-neutral-on-surface-variant">
            {backLabel}
          </Text>
        </TouchableOpacity>

        {rightSlot ? (
          <View className="ml-3 shrink-0 flex-row items-center gap-2">
            {rightSlot}
          </View>
        ) : null}
      </View>

      {/* Title */}
      <View className="mt-3">
        <Text
          numberOfLines={1}
          className="font-displayBlack text-[23px] uppercase leading-[26px] tracking-tight text-neutral-on-surface"
        >
          {title}
        </Text>

        {subtitle ? (
          <Text
            numberOfLines={2}
            className="font-ui mt-1 text-[12px] leading-[17px] text-neutral-on-surface-variant"
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}