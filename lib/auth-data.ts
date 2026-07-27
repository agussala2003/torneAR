import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { OAUTH_CALLBACK_PATH } from '@/lib/deep-linking';
import { AuthError } from '@supabase/supabase-js';

export async function signIn(email: string, password: string): Promise<{ error: AuthError | null }> {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email: string, password: string): Promise<{ error: AuthError | null }> {
  return supabase.auth.signUp({ email, password });
}

export async function sendPasswordReset(email: string): Promise<{ error: AuthError | null }> {
  return supabase.auth.resetPasswordForEmail(email);
}

/**
 * Resultado de un login federado. `cancelled` distingue "el usuario cerró la
 * ventana de Google" (no es un error: no hay que mostrar alerta) de un fallo
 * real del proveedor o del canje de tokens.
 */
export type OAuthResult = { error: AuthError | null; cancelled: boolean };

function oauthError(message: string): AuthError {
  return { name: 'AuthError', message, status: 0 } as AuthError;
}

/**
 * Lee los parámetros que Supabase cuelga de la URL de callback. El lugar
 * depende del `flowType` del cliente:
 *   · implicit (default de supabase-js) → fragment: `#access_token=…&refresh_token=…`
 *   · pkce                              → query:    `?code=…`
 * Soportamos los dos para que cambiar `flowType` en lib/supabase.ts no rompa
 * este flujo.
 */
function parseCallbackParams(url: string): URLSearchParams {
  const hashIndex = url.indexOf('#');
  const fragment = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = beforeHash.indexOf('?');
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '';

  return new URLSearchParams(fragment || query);
}

async function completeOAuthSession(url: string): Promise<{ error: AuthError | null }> {
  const params = parseCallbackParams(url);

  // Google/Supabase reportan el rechazo por la propia URL de vuelta, no por una
  // excepción: si no lo miramos, terminaríamos con un "sesión inválida" opaco.
  const providerError = params.get('error_description') ?? params.get('error');
  if (providerError) {
    return { error: oauthError(providerError) };
  }

  const code = params.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return { error };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return { error };
  }

  return { error: oauthError('El proveedor no devolvió una sesión válida.') };
}

/**
 * Login con Google vía el proveedor OAuth de Supabase.
 *
 * Nativo: abrimos la URL de consentimiento en una custom tab / ASWebAuthentication
 * Session con `openAuthSessionAsync`, que devuelve el control a la app en la
 * `redirectTo` (`tornear://auth/callback`) sin dejar pestañas colgadas. De ahí
 * sacamos los tokens y armamos la sesión a mano — `detectSessionInUrl` está
 * apagado en nativo porque no hay `window.location`.
 *
 * Web: no hay AuthSession nativa; dejamos que supabase-js redirija la pestaña y
 * `detectSessionInUrl` (lib/supabase.ts) levante la sesión al volver.
 *
 * En ningún caso navegamos: al escribir la sesión, `onAuthStateChange` despierta
 * al AuthContext y el guard de `app/_layout.tsx` decide el destino (onboarding
 * si el perfil está incompleto — el caso normal en el primer login con Google —
 * o el deep link pendiente / `/(tabs)` si ya está completo).
 */
export async function signInWithGoogle(): Promise<OAuthResult> {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    return { error, cancelled: false };
  }

  const redirectTo = Linking.createURL(OAUTH_CALLBACK_PATH);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      // Abrimos nosotros el navegador (abajo): sin esto supabase-js intentaría
      // redirigir un `window` que en nativo no existe.
      skipBrowserRedirect: true,
      // Sin esto Google entra directo con la última cuenta usada y el usuario
      // no puede elegir con cuál de sus mails jugar.
      queryParams: { prompt: 'select_account' },
    },
  });

  if (error) {
    return { error, cancelled: false };
  }

  if (!data?.url) {
    return { error: oauthError('No se pudo abrir el login de Google.'), cancelled: false };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  // 'cancel' (usuario cerró) y 'dismiss' (volvió con el gesto/back) no son
  // errores: se vuelve al login sin alerta.
  if (result.type !== 'success') {
    return { error: null, cancelled: true };
  }

  const { error: sessionError } = await completeOAuthSession(result.url);
  return { error: sessionError, cancelled: false };
}
