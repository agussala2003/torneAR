import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { POSITIONS } from '@/lib/schemas/marketSchema';
import { AppIcon } from '@/components/ui/AppIcon';

interface PositionFilterScrollProps {
  selectedPosition: string;
  onPositionSelect: (position: string) => void;
  hasActiveFilters: boolean;
  onOpenFilters: () => void;
}

export function PositionFilterScroll({ selectedPosition, onPositionSelect, hasActiveFilters, onOpenFilters }: PositionFilterScrollProps) {
  return (
    <View className="flex-row">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingBottom: 32 }}
        className="flex-1"
      >
        {POSITIONS.map((pos) => {
          const isActive = selectedPosition === pos;
          return (
            <TouchableOpacity
              key={pos}
              onPress={() => onPositionSelect(pos)}
              activeOpacity={0.8}
              className={`px-5 py-2 rounded-full ${isActive
                ? 'border border-brand-primary/30 bg-brand-primary/10'
                : 'bg-surface-high'
                }`}
            >
              <Text
                className={`text-xs font-display uppercase tracking-wider ${isActive ? 'text-brand-primary' : 'text-neutral-on-surface-variant'
                  }`}
              >
                {pos}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <TouchableOpacity
        onPress={onOpenFilters}
        activeOpacity={0.8}
        style={{ width: 40 }}
        className="items-center justify-center"
      >
        <AppIcon
          family="material-community"
          name="filter-variant"
          size={20}
          color={hasActiveFilters ? '#53E076' : '#BCCBB9'}
        />
        {hasActiveFilters && (
          <View className="absolute top-0 right-0 w-2 h-2 rounded-full bg-[#53E076]" />
        )}
      </TouchableOpacity>
    </View>
  );
}
