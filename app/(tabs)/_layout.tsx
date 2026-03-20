import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { View, ActivityIndicator } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '../../context/AuthContext';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#131313]">
        <ActivityIndicator color="#53e076" size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  if (!profile?.username || !profile?.full_name || !profile?.preferred_position) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#53e076', // TorneAR Primary Green
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: '#131313',
          borderTopColor: '#3d4a3d',
        }
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color }) => <Feather size={28} name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="ranking"
        options={{
          title: 'Ranking',
          tabBarIcon: ({ color }) => <Feather size={28} name="list" color={color} />,
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: 'Partidos',
          tabBarIcon: ({ color }) => <Feather size={28} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: 'Mercado',
          tabBarIcon: ({ color }) => <Feather size={28} name="shopping-cart" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color }) => <Feather size={28} name="user" color={color} />,
        }}
      />
    </Tabs>
  );
}
