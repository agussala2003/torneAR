import { Tabs } from 'expo-router';
import { Colors } from '@/constants/theme';
import { AppIcon } from '@/components/ui/AppIcon';
import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Solo estilos visuales, sin tocar alturas ni paddings nativos
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'rgba(32, 31, 31, 1)', // surfaceContainer at 80%
          borderTopColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
        tabBarBackground: () => (
          <BlurView
            intensity={12}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        ),
        tabBarActiveTintColor: Colors.dark.tint,
        tabBarInactiveTintColor: Colors.dark.tabIconDefault,
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: 'BarlowCondensed_700Bold',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'INICIO',
          tabBarIcon: ({ color, focused }) => (
            <AppIcon family="material-community" name="home-variant-outline" size={focused ? 24 : 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ranking"
        options={{
          title: 'RANKING',
          tabBarIcon: ({ color, focused }) => (
            <AppIcon family="material-community" name="trophy-outline" size={focused ? 24 : 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: 'PARTIDOS',
          tabBarIcon: ({ color, focused }) => (
            <AppIcon family="material-community" name="soccer" size={focused ? 24 : 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: 'MERCADO',
          tabBarIcon: ({ color, focused }) => (
            <AppIcon family="ionicons" name="storefront-outline" size={focused ? 24 : 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'PERFIL',
          tabBarIcon: ({ color, focused }) => (
            <AppIcon family="material-community" name="account-outline" size={focused ? 24 : 22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}