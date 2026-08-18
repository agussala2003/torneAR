import { Linking } from 'react-native';
import Share, { Social } from 'react-native-share';
import { Logger } from '@/lib/logger';
import { shareGeneric } from '@/lib/share-image';

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
 * Manda la imagen a Instagram Stories. Cae al share genérico (silencioso,
 * sin crashear) en cualquiera de estos casos: no hay `INSTAGRAM_APP_ID`
 * configurado, el chequeo rápido no encuentra Instagram, o el SDK nativo
 * rechaza el intent igual (el caso real que `canOpenInstagram` no puede
 * garantizar del todo).
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

  try {
    await Share.shareSingle({
      social: Social.InstagramStories,
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
