import { Linking } from 'react-native';
import { Logger } from '@/lib/logger';
import { shareGeneric } from '@/lib/share-image';

/**
 * `react-native-share` NO se importa en el top-level a propósito.
 *
 * Su spec de TurboModule termina en `TurboModuleRegistry.getEnforcing('RNShare')`,
 * que corre al EVALUAR el módulo, no al llamar a una función. En un binario que
 * todavía no trae el módulo nativo (Expo Go, o un Dev Client anterior al último
 * rebuild con EAS) eso lanza un Invariant Violation en tiempo de import. La
 * excepción sube por toda la cadena — `instagram-stories` → `ShareMatchButton`
 * → `app/match-detail.tsx` — y aborta la evaluación de la pantalla, que
 * entonces nunca llega a registrar su `export default`. Expo Router lo reporta
 * como "Route is missing the required default export", que parece un bug de
 * routing y en realidad es este import.
 *
 * Con el require diferido de `loadShareModule`, un binario viejo ya no rompe
 * nada: la pantalla monta normal y el share degrada al genérico de
 * `expo-sharing`. En el Dev Client nuevo el require resuelve y el share a
 * Stories funciona completo.
 *
 * `typeof import(...)` es una construcción SÓLO de tipos: TypeScript la borra
 * en compilación y no emite ningún require, así que tipar contra el módulo no
 * reintroduce el import estático que estamos evitando.
 */
type ShareModule = typeof import('react-native-share');

/**
 * Meta exige un "Facebook App ID" registrado para compartir a Instagram
 * Stories vía `react-native-share` (aunque el destino sea Instagram, la
 * plataforma de attribution es la misma que Facebook). No hay uno todavía:
 * hasta que se registre uno en developers.facebook.com y se cargue acá,
 * `shareToInstagramStories` degrada al share genérico sin romper nada.
 */
const INSTAGRAM_APP_ID = process.env.EXPO_PUBLIC_INSTAGRAM_APP_ID;

/**
 * ¿Instagram parece estar instalado? Chequeo rápido, NO definitivo:
 *  - iOS: depende de `LSApplicationQueriesSchemes` (`app.json`) — sin esa
 *    entrada, `canOpenURL` devuelve `false` siempre por privacidad desde
 *    iOS 9, sin importar si Instagram está instalado.
 *  - Android 11+: el SO puede ocultar el paquete por las restricciones de
 *    visibilidad si no hay una declaración `<queries>` nativa.
 *
 * Por eso `shareToInstagramStories` no confía SÓLO en esto: es un fast-path
 * para no disparar un intent que casi seguro va a fallar, pero la red de
 * seguridad real es el try/catch alrededor de `Share.shareSingle`.
 */
async function canOpenInstagram(): Promise<boolean> {
  try {
    return await Linking.canOpenURL('instagram://');
  } catch {
    return false;
  }
}

/**
 * Carga `react-native-share` en runtime. Devuelve `null` en vez de propagar
 * cuando el módulo nativo no está en el binario: para el llamador eso es la
 * señal de "usá el fallback", no un error que haya que mostrarle al usuario.
 */
function loadShareModule(): ShareModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-share') as ShareModule;
  } catch (error) {
    Logger.warn('react-native-share no está en el binario nativo; se usa el share genérico', {
      scope: 'instagram-stories.loadShareModule',
      hint: 'Falta el rebuild del Dev Client con EAS para esta dependencia.',
      error,
    });
    return null;
  }
}

/**
 * Manda la imagen a Instagram Stories. Cae al share genérico (silencioso,
 * sin crashear) en cualquiera de estos casos: no hay `INSTAGRAM_APP_ID`
 * configurado, el chequeo rápido no encuentra Instagram, el módulo nativo
 * `RNShare` no existe en este binario, o el SDK nativo rechaza el intent
 * igual (el caso real que `canOpenInstagram` no puede garantizar del todo).
 */
export async function shareToInstagramStories(uri: string): Promise<void> {
  if (!INSTAGRAM_APP_ID) {
    Logger.info('EXPO_PUBLIC_INSTAGRAM_APP_ID no configurado; se usa el share genérico', {
      scope: 'instagram-stories.shareToInstagramStories',
    });
    return shareGeneric(uri);
  }

  if (!(await canOpenInstagram())) {
    Logger.info('Instagram no detectado; se usa el share genérico', {
      scope: 'instagram-stories.shareToInstagramStories',
    });
    return shareGeneric(uri);
  }

  const shareModule = loadShareModule();
  if (!shareModule) {
    return shareGeneric(uri);
  }

  try {
    await shareModule.default.shareSingle({
      social: shareModule.Social.InstagramStories,
      appId: INSTAGRAM_APP_ID,
      backgroundImage: uri,
    });
  } catch (error) {
    Logger.warn('Share a Instagram Stories falló; se usa el share genérico', {
      scope: 'instagram-stories.shareToInstagramStories',
      error,
    });
    await shareGeneric(uri);
  }
}
