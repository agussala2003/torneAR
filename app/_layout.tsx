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
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
import { AppIntroSplash } from '@/components/AppIntroSplash';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isProfileComplete } from '@/lib/auth-utils';
import { deepLinkToHref, resolveDeepLink } from '@/lib/deep-linking';
import { useDeepLinkStore } from '@/stores/deepLinkStore';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { UIProvider } from '../context/UIContext';

LogBox.ignoreLogs([
  '[Reanimated] Reading from `value` during component render',
]);

// Retenemos el splash nativo apenas carga el módulo; lo soltamos manualmente
// una vez que el AuthContext terminó de hidratar la sesión (ver efecto abajo).
void SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigation() {
  const { session, profile, loading, hydrated } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [showIntro, setShowIntro] = useState(true);

  // Push notifications: configura handler, ataja el tap (→ deepLinkStore / Auth
  // Gating) y refresca el expo_push_token del perfil. Se auto-gatea por sesión.
  usePushNotifications();

  useEffect(() => {
    const timer = setTimeout(() => setShowIntro(false), 2300);
    return () => clearTimeout(timer);
  }, []);

  // Soltamos el splash nativo recién cuando leímos la sesión inicial. Para ese
  // momento este componente ya está montado renderizando <AppIntroSplash />,
  // así que la transición no muestra flash en blanco.
  useEffect(() => {
    if (hydrated) {
      void SplashScreen.hideAsync();
    }
  }, [hydrated]);

  // Deep link de arranque en frío (`Linking.getInitialURL`): la sesión todavía
  // no se hidrató, así que si apunta a una ruta protegida lo dejamos pendiente
  // y el guard lo consume al quedar autenticado. Los links públicos navegan ya.
  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (!url) return;

      // En cold-start la sesión todavía no se hidrató: tratamos como no-auth,
      // así una ruta protegida se difiere y el guard la consume tras el login.
      const action = resolveDeepLink(url, false);
      if (action.kind === 'defer') {
        useDeepLinkStore.getState().setPendingDeepLink(action.url);
      } else if (action.kind === 'navigate') {
        router.replace(action.href);
      }
    });
  }, [router]);

  // Deep links en caliente (app ya abierta): acá la sesión sí es confiable.
  // Si es protegido y no hay sesión lo guardamos como pendiente; si no, navega.
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const action = resolveDeepLink(url, !!session);
      if (action.kind === 'defer') {
        useDeepLinkStore.getState().setPendingDeepLink(action.url);
      } else if (action.kind === 'navigate') {
        router.replace(action.href);
      }
    });

    return () => subscription.remove();
  }, [session, router]);

  useEffect(() => {
    // El guard espera a la hidratación inicial antes de tocar la navegación,
    // para no redirigir a /login mientras todavía leemos la sesión guardada.
    if (!hydrated || loading || showIntro) return;

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
      // Autenticado y con perfil completo: es el único punto donde sabemos que
      // el usuario puede acceder a rutas protegidas, así que acá consumimos el
      // deep link pendiente (post-login o cold-start ya logueado). El consumo
      // es atómico, por lo que solo dispara en la primera pasada.
      const pendingDeepLink = useDeepLinkStore.getState().consumePendingDeepLink();
      if (pendingDeepLink) {
        const href = deepLinkToHref(pendingDeepLink);
        if (href) {
          router.replace(href);
          return;
        }
      }

      if (inAuthGroup || inOnboarding) {
        router.replace('/(tabs)');
      }
    }
  }, [session, profile, loading, segments, router, showIntro, hydrated]);

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
      <Stack.Screen name="match-detail" />
      <Stack.Screen name="match-checkin" />
      <Stack.Screen name="admin/wo-review" />
      <Stack.Screen name="(modals)" />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [fontsLoaded] = useFonts({
    Inter_500Medium,
    Inter_700Bold,
    Inter_900Black,
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold,
    Epilogue_700Bold,
  });

  useEffect(() => {
    async function loadTheme() {
      try {
        const savedTheme = await AsyncStorage.getItem('app-theme');
        if (savedTheme) {
          setColorScheme(savedTheme as any);
        }
      } catch {
        // Ignored
      }
    }
    void loadTheme();
  }, [setColorScheme]);

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