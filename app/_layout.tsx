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
import { GlobalLoader } from '@/components/GlobalLoader';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { isProfileComplete } from '@/lib/auth-utils';
import { AuthProvider, useAuth } from '../context/AuthContext';

LogBox.ignoreLogs([
  '[Reanimated] Reading from `value` during component render',
]);

export const unstable_settings = {
  anchor: '(tabs)',
};

// Separamos la lógica de enrutamiento en un componente interno
// para poder usar los hooks de Expo Router (useRouter, useSegments)
function RootLayoutNav() {
  const { session, profile, loading } = useAuth();
  const [showIntro, setShowIntro] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => setShowIntro(false), 2300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Si AuthContext todavía está cargando desde AsyncStorage/Supabase, no hacemos nada
    if (loading) return;

    const inAuthGroup = segments[0] === 'login' || segments[0] === 'forgot-password';
    const inOnboarding = segments[0] === 'onboarding';

    if (!session) {
      // 1. No hay sesión -> Forzar a Login
      if (!inAuthGroup) {
        router.replace('/login');
      }
    } else if (session && !isProfileComplete(profile)) {
      // 2. Hay sesión, pero no hay un perfil completo -> Forzar a Onboarding
      if (!inOnboarding) {
        router.replace('/onboarding');
      }
    } else if (session && isProfileComplete(profile)) {
      // 3. Hay sesión y el perfil está completo -> Ir adentro de la app
      if (inAuthGroup || inOnboarding) {
        router.replace('/(tabs)');
      }
    }
  }, [session, profile, loading, segments, router]);

  if (showIntro) {
    return <AppIntroSplash />;
  }

  if (loading) {
    return <GlobalLoader label="Cargando datos de cuenta" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
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
      <Stack.Screen name="(modals)" options={{ presentation: 'modal' }} />
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
    return <GlobalLoader label="Cargando tipografias" />;
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
        <RootLayoutNav />
        <StatusBar style="light" />
      </AuthProvider>
    </ThemeProvider>
  );
}