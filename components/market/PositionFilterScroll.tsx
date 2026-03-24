import React from 'react';
import { ScrollView, Text, TouchableOpacity } from 'react-native';
import { POSITIONS } from '../../lib/schemas/marketSchema';

interface PositionFilterScrollProps {
  selectedPosition: string;
  onPositionSelect: (position: string) => void;
}

export function PositionFilterScroll({ selectedPosition, onPositionSelect }: PositionFilterScrollProps) {
  return (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12, paddingHorizontal: 24, paddingBottom: 32 }}
    >
      {POSITIONS.map((pos) => {
        const isActive = selectedPosition === pos;
        return (
          <TouchableOpacity
            key={pos}
            onPress={() => onPositionSelect(pos)}
            activeOpacity={0.8}
            className={`px-5 py-2 rounded-full ${
              isActive 
                ? 'border border-primary/30 bg-primary/10' 
                : 'bg-surface-container-high'
            }`}
          >
            <Text 
              className={`text-xs font-display uppercase tracking-wider ${
                isActive ? 'text-primary' : 'text-on-surface-variant'
              }`}
            >
              {pos}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
