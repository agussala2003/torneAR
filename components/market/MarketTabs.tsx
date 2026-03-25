import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface MarketTabsProps {
  activeTab: 'TEAMS_LOOKING' | 'PLAYERS_LOOKING';
  onTabChange: (tab: 'TEAMS_LOOKING' | 'PLAYERS_LOOKING') => void;
}

export function MarketTabs({ activeTab, onTabChange }: MarketTabsProps) {
  return (
    <View className="flex-row gap-2 p-1 bg-surface-low rounded-xl">
      <TouchableOpacity
        className="flex-1 py-3 items-center rounded-lg"
        style={activeTab === 'TEAMS_LOOKING' ? { backgroundColor: '#53E076' } : undefined}
        onPress={() => onTabChange('TEAMS_LOOKING')}
        activeOpacity={0.8}
      >
        <Text
          className="font-uiBold text-sm"
          style={{ color: activeTab === 'TEAMS_LOOKING' ? '#003914' : '#BCCBB9' }}
        >
          Buscan Jugador
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        className="flex-1 py-3 items-center rounded-lg"
        style={activeTab === 'PLAYERS_LOOKING' ? { backgroundColor: '#53E076' } : undefined}
        onPress={() => onTabChange('PLAYERS_LOOKING')}
        activeOpacity={0.8}
      >
        <Text
          className="font-uiBold text-sm"
          style={{ color: activeTab === 'PLAYERS_LOOKING' ? '#003914' : '#BCCBB9' }}
        >
          Buscan Equipo
        </Text>
      </TouchableOpacity>
    </View>
  );
}
