import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { registerForPushNotificationsAsync } from '@/lib/push-notifications';
import { extractDeepLinkUrl, resolveDeepLink } from '@/lib/deep-linking';
import { useDeepLinkStore } from '@/stores/deepLinkStore';
import { useAuth } from '@/context/AuthContext';

// Entornos donde expo-notifications no aplica y el hook queda inerte:
//  - Expo Go (Android, SDK 53+) crashea al inicializar el módulo.
//  - Web: varios métodos nativos (getLastNotificationResponseAsync, listeners de
//    push token) no están implementados y lanzan UnavailabilityError.
// Los push tokens solo tienen sentido en un dev client / build real, que es
// donde se prueba esta fase.
const isUnsupportedEnv = Constants.appOwnership === 'expo' || Platform.OS === 'web';

/**
 * Orquesta las push notifications del lado del cliente:
 *  - configura el handler de presentación en foreground,
 *  - ataja el tap sobre la notificación (cold + warm) y lo enruta a través del
 *    mismo Auth Gating de deep links (deepLinkStore + guard de `_layout`),
 *  - registra/refresca el `expo_push_token` del perfil autenticado, de modo que
 *    el dispositivo más reciente siempre pise al anterior.
 *
 * Se llama sin argumentos desde `app/_layout.tsx`; internamente se activa solo
 * cuando la sesión ya está hidratada y hay un usuario logueado.
 */
export function usePushNotifications(): void {
  const { session, profile, hydrated } = useAuth();
  const router = useRouter();

  // Guardamos la sesión en un ref para que el listener de taps (registrado una
  // sola vez) siempre lea el estado de auth actual sin re-suscribirse.
  const sessionRef = useRef<Session | null>(session);
  sessionRef.current = session;

  // Enruta una URL entrante reutilizando la decisión de gating compartida:
  // si es protegida y no hay sesión la difiere (pending) y el guard la consume
  // tras el login; si no, navega directo.
  const routeIncomingUrl = useCallback(
    (url: string) => {
      const action = resolveDeepLink(url, Boolean(sessionRef.current));
      if (action.kind === 'defer') {
        useDeepLinkStore.getState().setPendingDeepLink(action.url);
      } else if (action.kind === 'navigate') {
        router.replace(action.href);
      }
    },
    [router],
  );

  // ─── Handler de presentación + listener de taps (una vez, si no es Expo Go) ──
  useEffect(() => {
    if (isUnsupportedEnv) return;

    let responseSubscription: { remove: () => void } | undefined;
    let cancelled = false;

    void (async () => {
      // Import dinámico: evita que la carga del módulo explote en Expo Go.
      const Notifications = await import('expo-notifications');

      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });

      // Cold start: la app se abrió tocando una push estando cerrada.
      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      if (!cancelled && lastResponse) {
        const url = extractDeepLinkUrl(lastResponse);
        if (url) routeIncomingUrl(url);
      }

      if (cancelled) return;

      // Warm: taps mientras la app está viva (foreground/background).
      responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const url = extractDeepLinkUrl(response);
        if (url) routeIncomingUrl(url);
      });
    })();

    return () => {
      cancelled = true;
      responseSubscription?.remove();
    };
  }, [routeIncomingUrl]);

  // ─── Registro / refresco del expo_push_token del perfil autenticado ─────────
  useEffect(() => {
    if (isUnsupportedEnv) return;
    if (!hydrated || !session || !profile?.id) return;

    let cancelled = false;

    void (async () => {
      const token = await registerForPushNotificationsAsync();
      if (cancelled || !token) return;

      // Evitamos el write si el token ya es el guardado (evita UPDATE por launch).
      if (token === profile.expo_push_token) return;

      const { error } = await supabase
        .from('profiles')
        .update({ expo_push_token: token })
        .eq('id', profile.id);

      if (error) {
        console.error('No se pudo guardar el expo_push_token:', error.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, session, profile?.id, profile?.expo_push_token]);
}
