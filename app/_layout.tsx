import '../global.css';
import { useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import { Inter_500Medium, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import { BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold } from '@expo-google-fonts/barlow-condensed';
import { Epilogue_700Bold } from '@expo-google-fonts/epilogue';
import { DarkTheme, ThemeProvider, Theme } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
import { AppIntroSplash } from '@/components/AppIntroSplash';
import { AppUpdateModal } from '@/components/AppUpdateModal';
import { LegalVersionGate } from '@/components/LegalVersionGate';
import { Colors } from '@/constants/theme';
import { useForceUpdate } from '@/hooks/useForceUpdate';
import { isProfileComplete } from '@/lib/auth-utils';
import { needsLegalAcceptance } from '@/lib/auth-data';
import { deepLinkToHref, resolveDeepLink } from '@/lib/deep-linking';
import { initLogger } from '@/lib/logger';
import { useDeepLinkStore } from '@/stores/deepLinkStore';
import { useSignupGateStore } from '@/stores/signupGateStore';
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

/** Cuánto se ve el intro animado, ya con el splash nativo fuera de pantalla. */
const INTRO_DURATION_MS = 2300;

/**
 * Pantallas de `(modals)` legibles en cualquier estado de sesión.
 *
 * Los Términos y la Política se aceptan ANTES de tener cuenta: el checkbox de
 * registro (`LegalConsentCheckbox`) y el del onboarding enlazan acá. Como el
 * guard de abajo sólo miraba `segments[0]`, tocar «Términos y Condiciones»
 * llevaba a `(modals)` —que no figuraba entre las rutas públicas— y el usuario
 * terminaba pateado de vuelta al login sin haber leído nada. El consentimiento
 * versionado que guardamos en el alta quedaba registrado contra un texto que
 * era imposible de abrir.
 *
 * Es el grupo `(modals)` completo lo que NO se abre: ahí también viven `chat` y
 * `market-create`, que son privadas. Sólo estas dos rutas quedan exentas.
 */
const PUBLIC_MODAL_ROUTES = new Set(['terms', 'privacy']);

/**
 * torneAR es dark-only.
 *
 * No existe un solo estilo con variantes `dark:` / `light:` en la app: todos los
 * tokens de color son oscuros e incondicionales. Por eso el tema de navegacion es
 * una constante de modulo y no deriva de ningun estado — antes se hidrataba desde
 * `AsyncStorage('app-theme')`, y un valor 'light' persistido dejaba la navegacion
 * en tema claro sin ninguna UI para revertirlo.
 */
const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.dark.background,
    card: Colors.dark.card,
    border: Colors.dark.border,
    text: Colors.dark.text,
    primary: Colors.dark.tint,
  },
};

function RootNavigation({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { session, user, profile, loading, hydrated } = useAuth();
  // Suscripción reactiva (y no `getState()` como el deep link, que se consume de
  // forma atómica): soltar la retención tiene que volver a correr el guard.
  const isHoldingOnboardingRedirect = useSignupGateStore((s) => s.isHoldingOnboardingRedirect);
  const segments = useSegments();
  const router = useRouter();
  const [showIntro, setShowIntro] = useState(true);

  // Push notifications: configura handler, ataja el tap (→ deepLinkStore / Auth
  // Gating) y refresca el expo_push_token del perfil. Se auto-gatea por sesión.
  usePushNotifications();

  // El intro se cuenta desde que el splash NATIVO se fue, no desde el montaje.
  //
  // Antes arrancaba al montar, pero hasta `hydrated` la pantalla la seguía
  // ocupando el splash nativo: los 2,3 s corrían por debajo, invisibles. Sin
  // sesión eso no se notaba (hidratar es inmediato), pero con sesión guardada
  // hay que leer AsyncStorage y traer el perfil, así que la hidratación se comía
  // el intro — o entero, si tardaba más que la cuenta. De ahí el «a veces no
  // aparece, sobre todo con la sesión iniciada» del módulo 1.1.
  useEffect(() => {
    if (!hydrated) return;

    const timer = setTimeout(() => setShowIntro(false), INTRO_DURATION_MS);
    return () => clearTimeout(timer);
  }, [hydrated]);

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
      // TODO(debug): temporal, sacar antes de mergear a main. Confirma que el
      // intent se lee ANTES de que el guard de auth toque la navegación.
      // `__DEV__` lo deja fuera de cualquier build de release.
      if (__DEV__) {
        console.log('[deep-link][cold-start] url cruda:', url);
      }

      if (!url) return;

      // En cold-start la sesión todavía no se hidrató: tratamos como no-auth,
      // así una ruta protegida se difiere y el guard la consume tras el login.
      const action = resolveDeepLink(url, false);

      // TODO(debug): temporal, sacar junto con el log de arriba.
      if (__DEV__) {
        console.log('[deep-link][cold-start] accion resuelta:', JSON.stringify(action));
      }

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

    // Los documentos legales se leen en cualquier estado de sesión, así que se
    // resuelven antes que nada y con un `return`: no alcanza con sumarlos al
    // conjunto público de abajo, porque el usuario de Google los abre DESDE el
    // onboarding —donde `!isProfileComplete(profile)` es verdadero— y la rama
    // de esa condición lo devolvería a `/onboarding` igual que la de `!session`
    // lo devuelve a `/login`. Salir temprano los exime de las tres ramas.
    if (segments[0] === '(modals)' && PUBLIC_MODAL_ROUTES.has(segments[1] ?? '')) {
      return;
    }

    // `auth` (app/auth/callback.tsx) cuenta como grupo público a propósito: al
    // volver de Google la sesión tarda unos ms en escribirse, y sin esto el
    // guard vería `session === null` y patearía a /login en el medio del canje.
    // La propia pantalla de callback hace el replace cuando ya hay certeza.
    const inAuthGroup =
      segments[0] === 'login' || segments[0] === 'forgot-password' || segments[0] === 'auth';
    const inOnboarding = segments[0] === 'onboarding';

    if (!session) {
      if (!inAuthGroup) {
        router.replace('/login');
      }
    } else if (session && !isProfileComplete(profile)) {
      // `isHoldingOnboardingRedirect`: recién registrado, la sesión ya existe y
      // sin esta espera el guard mandaba a /onboarding por detrás del modal de
      // bienvenida, que se desmontaba con la pantalla de login antes de que el
      // usuario pudiera tocar «Aceptar». Ver stores/signupGateStore.ts.
      if (!inOnboarding && !isHoldingOnboardingRedirect) {
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
  }, [session, profile, loading, segments, router, showIntro, hydrated, isHoldingOnboardingRedirect]);

  // El overlay tapa la pantalla mientras corre el intro o mientras faltan las
  // fuentes. Lo que YA no hace es sustituir al navegador (ver comentario abajo).
  const showOverlay = showIntro || !fontsLoaded;

  // Sólo para sesión completa (autenticado + perfil completo): un usuario
  // recién registrado ya pasa por su propia aceptación en el onboarding, y
  // uno sin sesión no tiene nada que re-aceptar. `!showIntro` evita que el
  // modal aparezca detrás/encima de la animación de arranque — un `Modal`
  // de RN se monta en su propia capa nativa por encima de todo, sin
  // importar dónde esté en el árbol de JS.
  const mustReacceptLegal =
    hydrated && !showIntro && !!session && isProfileComplete(profile) && needsLegalAcceptance(user);

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.dark.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="profile-stats" />
        <Stack.Screen name="faq" />
        <Stack.Screen name="censo" />
        <Stack.Screen name="team-create" />
        <Stack.Screen name="team-join" />
        <Stack.Screen name="team-requests" />
        <Stack.Screen name="team-manage" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="market-chats" />
        <Stack.Screen name="market-my-applications" />
        <Stack.Screen name="team-stats" />
        <Stack.Screen name="challenge-inbox" />
        <Stack.Screen name="match-detail" />
        <Stack.Screen name="match-checkin" />
        <Stack.Screen name="admin/wo-review" />
        <Stack.Screen name="(modals)" />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <LegalVersionGate visible={mustReacceptLegal} />
      {/* El intro va SUPERPUESTO, no en lugar del navegador.

          Antes esto era un `return <AppIntroSplash />` antes del <Stack>: durante
          esos ~2,3 s el árbol de navegación directamente no existía, así que la
          URL inicial no tenía contra qué resolverse y cualquier `router.replace()`
          de los efectos de deep link corría sin navegador montado.

          Como hermano absoluto, el <Stack> existe desde el primer frame y el
          intro sólo lo tapa. La View a pantalla completa además captura los
          toques (pointerEvents por defecto), así que nadie interactúa con las
          pantallas de abajo mientras el intro se ve.

          Se mantiene también mientras faltan las fuentes: eso permite montar el
          navegador ya (ver RootLayout) sin que se llegue a ver texto con la
          tipografía de fallback. */}
      {showOverlay && (
        <View style={StyleSheet.absoluteFill}>
          <AppIntroSplash />
        </View>
      )}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_500Medium,
    Inter_700Bold,
    Inter_900Black,
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold,
    Epilogue_700Bold,
  });

  // Telemetria: engancha excepciones globales y unhandled rejections a app_logs.
  // Va lo más arriba posible del árbol para cubrir también los errores que
  // ocurren mientras la app todavía no pintó nada.
  useEffect(() => initLogger(), []);

  // Force update. Va acá y no dentro de RootNavigation por dos motivos:
  //   · Se evalúa sin sesión. Un build bloqueado tiene que frenarse también en
  //     el login: si sólo cubriera las pantallas autenticadas, alguien con la
  //     sesión vencida entraría, no podría actualizar y quedaría en un limbo.
  //   · El modal queda como hermano de <RootNavigation />, o sea por encima de
  //     cualquier ruta, incluido el splash de intro.
  // El hook nunca suspende el render: si la consulta falla o no hay red,
  // devuelve `required: false` y la app abre normal.
  const forceUpdate = useForceUpdate();

  // Acá había un `if (!fontsLoaded) return null`. Era el MISMO problema que el
  // intro: mientras las fuentes cargaban, el layout raíz no rendereaba ningún
  // navegador, y expo-router exige que el root layout monte uno para poder
  // resolver rutas. Ahora el árbol se monta siempre y `fontsLoaded` viaja a
  // RootNavigation, que se limita a dejar el overlay puesto hasta que estén.
  return (
    /**
     * `SafeAreaProvider` es el que habilita `useSafeAreaInsets()` en toda la app
     * (lo consume `GlobalHeader` para no meterse debajo de la barra de estado).
     *
     * `initialWindowMetrics` no es opcional: sin él, el provider arranca sin
     * conocer los insets, el primer frame se renderiza con `top: 0` y el header
     * SALTA hacia abajo apenas llega la medición nativa. Con las métricas
     * iniciales, el primer frame ya sale en su lugar definitivo.
     *
     * Va por fuera del ThemeProvider a propósito: los modales y las pantallas
     * que se montan antes de que el AuthContext hidrate (splash, login) también
     * necesitan insets.
     */
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ThemeProvider value={navigationTheme}>
        <AuthProvider>
          <UIProvider>
            <RootNavigation fontsLoaded={fontsLoaded} />
            <AppUpdateModal
              visible={forceUpdate.required}
              currentVersion={forceUpdate.currentVersion}
              latestVersion={forceUpdate.latestVersion}
              updateUrl={forceUpdate.updateUrl}
            />
            <StatusBar style="light" />
          </UIProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}