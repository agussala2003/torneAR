import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface MarketTabsProps {
  activeTab: 'TEAMS_LOOKING' | 'PLAYERS_LOOKING';
  onTabChange: (tab: 'TEAMS_LOOKING' | 'PLAYERS_LOOKING') => void;
}

export function MarketTabs({ activeTab, onTabChange }: MarketTabsProps) {
  return (
    <View className="flex-row gap-2 p-1 bg-surface-low rounded-xl mx-6 mb-6">
      <TouchableOpacity
        className={`flex-1 py-3 items-center rounded-lg ${activeTab === 'TEAMS_LOOKING' ? 'bg-brand-primary shadow-lg' : ''}`}
        onPress={() => onTabChange('TEAMS_LOOKING')}
        activeOpacity={0.8}
      >
        <Text className={`font-uiBold text-sm ${activeTab === 'TEAMS_LOOKING' ? 'text-[#003914]' : 'text-neutral-on-surface-variant'}`}>
          Buscan Jugador
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        className={`flex-1 py-3 items-center rounded-lg ${activeTab === 'PLAYERS_LOOKING' ? 'bg-brand-primary shadow-lg' : ''}`}
        onPress={() => onTabChange('PLAYERS_LOOKING')}
        activeOpacity={0.8}
      >
        <Text className={`font-uiBold text-sm ${activeTab === 'PLAYERS_LOOKING' ? 'text-[#003914]' : 'text-neutral-on-surface-variant'}`}>
          Buscan Equipo
        </Text>
      </TouchableOpacity>
    </View>
  );
}
