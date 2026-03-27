import '../global.css';
import { useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import { Inter_500Medium, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import { BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold } from '@expo-google-fonts/barlow-condensed';
import { Epilogue_700Bold } from '@expo-google-fonts/epilogue';
import { DarkTheme, DefaultTheme, ThemeProvider, Theme } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import 'react-native-reanimated';
import { AppIntroSplash } from '@/components/AppIntroSplash';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { isProfileComplete } from '@/lib/auth-utils';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { UIProvider } from '../context/UIContext';

LogBox.ignoreLogs([
  '[Reanimated] Reading from `value` during component render',
]);

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigation() {
  const { session, profile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowIntro(false), 2300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (loading || showIntro) return;

    const inAuthGroup = segments[0] === 'login' || segments[0] === 'forgot-password';
    const inOnboarding = segments[0] === 'onboarding';

    if (!session) {
      if (!inAuthGroup) {
        router.replace('/login');
      }
    } else if (session && !isProfileComplete(profile)) {
      if (!inOnboarding) {
        router.replace('/onboarding');
      }
    } else if (session && isProfileComplete(profile)) {
      if (inAuthGroup || inOnboarding) {
        router.replace('/(tabs)');
      }
    }
  }, [session, profile, loading, segments, router, showIntro]);

  if (showIntro) {
    return <AppIntroSplash />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.dark.background } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="profile-stats" />
      <Stack.Screen name="team-create" />
      <Stack.Screen name="team-join" />
      <Stack.Screen name="team-requests" />
      <Stack.Screen name="team-manage" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="market-chats" />
      <Stack.Screen name="team-stats" />
      <Stack.Screen name="challenge-inbox" />
      <Stack.Screen name="(modals)" />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    Inter_500Medium,
    Inter_700Bold,
    Inter_900Black,
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold,
    Epilogue_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  const navigationTheme: Theme = colorScheme === 'dark'
    ? {
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        background: Colors.dark.background,
        card: Colors.dark.card,
        border: Colors.dark.border,
        text: Colors.dark.text,
        primary: Colors.dark.tint,
      },
    }
    : {
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        background: Colors.light.background,
        card: Colors.light.card,
        border: Colors.light.border,
        text: Colors.light.text,
        primary: Colors.light.tint,
      },
    };

  return (
    <ThemeProvider value={navigationTheme}>
      <AuthProvider>
        <UIProvider>
          <RootNavigation />
          <StatusBar style="light" />
        </UIProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}