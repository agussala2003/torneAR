import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

/**
 * Pantalla-puente del callback de OAuth (`tornear://auth/callback`).
 *
 * NO canjea tokens: eso ya lo hace `signInWithGoogle()` (lib/auth-data.ts) con
 * la URL que devuelve `WebBrowser.openAuthSessionAsync`. Esta ruta existe por
 * un motivo distinto: en Android el SO entrega igual el intent del deep link a
 * la app, y el linking interno de expo-router intenta matchear el path `/auth/
 * callback` ANTES de que corra cualquier listener nuestro. Sin un archivo acá,
 * ese match falla y el usuario ve "Unmatched Route" al volver de Google.
 *
 * `resolveDeepLink` (lib/deep-linking.ts) sigue ignorando esta URL para que el
 * listener del `_layout` no navegue ni la difiera — las dos defensas conviven:
 * una tapa el router interno, la otra el gating de deep links.
 *
 * Su único trabajo es sacar al usuario de esta URL apenas la sesión esté
 * hidratada. No decide el destino final: manda a `/` (o a `/login` si no hay
 * sesión) y el guard de `app/_layout.tsx` resuelve onboarding vs. tabs según
 * el estado del perfil.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const { session, hydrated } = useAuth();

  useEffect(() => {
    // Esperamos a `hydrated` para no rebotar a /login en la ventana en la que
    // Supabase todavía está escribiendo la sesión recién canjeada.
    if (!hydrated) return;

    router.replace(session ? '/' : '/login');
  }, [hydrated, session, router]);

  return (
    <View className="flex-1 items-center justify-center bg-surface-base">
      <ActivityIndicator size="large" color={Colors.dark.tint} />
    </View>
  );
}
