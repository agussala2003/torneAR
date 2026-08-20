import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { OAUTH_CALLBACK_PATH } from '@/lib/deep-linking';
import { LEGAL_VERSIONS } from '@/constants/legal';
import { AuthError, User } from '@supabase/supabase-js';

export async function signIn(email: string, password: string): Promise<{ error: AuthError | null }> {
  return supabase.auth.signInWithPassword({ email, password });
}

/**
 * Prueba de aceptación legal que viaja con el alta de cuenta.
 *
 * Va en `options.data` (→ `auth.users.raw_user_meta_data`) y no en una tabla
 * propia porque tiene que quedar registrado en el MISMO acto que crea el
 * usuario: si fuese un INSERT posterior, un fallo de red entre ambos dejaría
 * una cuenta creada sin constancia de consentimiento — exactamente el agujero
 * que el requerimiento legal viene a cerrar.
 *
 * Las versiones se guardan además del booleano: "aceptó los TyC" no prueba
 * nada si no consta QUÉ texto estaba vigente cuando aceptó.
 */
export interface LegalAcceptance {
  accepted_tyc: true;
  accepted_privacy: true;
  legal_acceptance_date: string;
  tyc_version: string;
  privacy_version: string;
}

/**
 * Arma la constancia con la fecha del momento y las versiones VIGENTES.
 *
 * Existe para que los dos puntos de entrada —el alta por email (`app/login.tsx`)
 * y el onboarding de Google (`app/onboarding.tsx`)— no repitan el literal. Si
 * cada uno armara su propio objeto, alcanzaría con que a uno se le olvidara
 * `tyc_version` para que esas cuentas quedaran con una constancia que no prueba
 * contra qué texto se aceptó.
 */
export function buildLegalAcceptance(): LegalAcceptance {
  return {
    accepted_tyc: true,
    accepted_privacy: true,
    legal_acceptance_date: new Date().toISOString(),
    tyc_version: LEGAL_VERSIONS.terms,
    privacy_version: LEGAL_VERSIONS.privacy,
  };
}

/**
 * Escribe la constancia sobre una cuenta que YA existe.
 *
 * Es el caso de Google: el proveedor da de alta al usuario en el primer
 * consentimiento, y `signInWithGoogle()` no puede adjuntar `options.data` como
 * hace `signUp()` — el alta no pasa por nosotros. Sin esto, ninguna cuenta
 * creada por Google tenía `accepted_tyc`, fecha ni versión.
 *
 * El momento para llamarla es el onboarding: es el único punto por el que pasan
 * todas las altas de Google (el guard de `app/_layout.tsx` no deja entrar a la
 * app con el perfil incompleto), y ocurre antes de que exista fila en
 * `profiles`.
 *
 * `updateUser` dispara `USER_UPDATED`, así que el `AuthContext` recoge la
 * metadata nueva solo.
 */
export async function recordLegalAcceptance(): Promise<{ error: AuthError | null }> {
  const { error } = await supabase.auth.updateUser({ data: buildLegalAcceptance() });
  return { error };
}

/**
 * `true` si la cuenta todavía no tiene constancia de aceptación VIGENTE.
 *
 * Lee `user_metadata` (espejo de `auth.users.raw_user_meta_data`). Compara
 * `accepted_tyc` contra `true` estricto y no por truthiness: la metadata es
 * JSON libre y un `"false"` o un `1` no deben pasar por una aceptación.
 *
 * Además de la aceptación en sí, compara `tyc_version` contra
 * `LEGAL_VERSIONS.terms`: aceptar unos Términos viejos no cubre una versión
 * publicada después — sin esto, actualizar el documento no volvía a pedir
 * consentimiento a nadie que ya lo hubiera aceptado alguna vez (gap cerrado
 * en LegalVersionGate.tsx).
 *
 * Sin usuario devuelve `true` —hay que pedir el consentimiento— porque el error
 * barato es pedirlo de más y el caro es dar de alta sin él.
 */
export function needsLegalAcceptance(user: User | null): boolean {
  if (user?.user_metadata?.accepted_tyc !== true) return true;
  return user.user_metadata.tyc_version !== LEGAL_VERSIONS.terms;
}

export async function signUp(
  email: string,
  password: string,
  legalAcceptance: LegalAcceptance,
): Promise<{ error: AuthError | null }> {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: legalAcceptance },
  });
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
