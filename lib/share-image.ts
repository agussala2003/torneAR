import type { RefObject } from 'react';
import type { View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { Logger } from '@/lib/logger';

/**
 * Mismo problema que `react-native-share` (ver `lib/instagram-stories.native.ts`
 * para la explicación larga): el spec de `react-native-view-shot` termina en
 * `TurboModuleRegistry.getEnforcing('RNViewShot')`, que corre al evaluar el
 * módulo. Como `share-image` lo importaba en el top-level y `ShareMatchButton`
 * importa `share-image`, un binario sin el módulo nativo tiraba en tiempo de
 * import y se llevaba puesta la pantalla entera.
 *
 * Ojo: el chequeo blando que la librería trae en su propio `index.js`
 * (`if (!RNViewShot) console.warn(...)`) es código muerto bajo la New
 * Architecture — `getEnforcing` explota antes de que ese `if` llegue a correr.
 * Por eso el require diferido acá es la única defensa real.
 *
 * `expo-sharing`, en cambio, SÍ se importa arriba a propósito: viene incluido
 * en Expo Go y tiene shim de web, así que no depende del rebuild del Dev
 * Client. Es justamente el módulo al que degradamos.
 */
type ViewShotModule = typeof import('react-native-view-shot');

/**
 * El binario nativo no puede capturar la vista a imagen. A diferencia del share
 * a Stories, esto NO tiene fallback posible: sin captura no hay imagen que
 * compartir. Se modela como error propio para que la UI distinga "falta el
 * rebuild del Dev Client" (reintentar nunca va a funcionar) de un fallo
 * transitorio de captura (reintentar tiene sentido).
 */
export class NativeCaptureUnavailableError extends Error {
  constructor() {
    super('La captura de imagen no está disponible en esta versión de la app.');
    this.name = 'NativeCaptureUnavailableError';
  }
}

/**
 * Captura la vista referenciada a un PNG en el cache de la app.
 *
 * El `transform: scale(...)` que usa el preview de `ShareMatchButton` para
 * mostrar la tarjeta achicada en pantalla NO afecta esto: `transform` es
 * puramente visual, la caja de layout que mide `captureRef` sigue siendo el
 * tamaño real de `MatchShareCard` (`SHARE_CARD_WIDTH` x `SHARE_CARD_HEIGHT`),
 * no el tamaño escalado en pantalla.
 */
export async function captureViewToUri(viewRef: RefObject<View | null>): Promise<string> {
  if (!viewRef.current) {
    throw new Error('captureViewToUri: la vista todavía no está montada');
  }

  let captureRef: ViewShotModule['captureRef'];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ({ captureRef } = require('react-native-view-shot') as ViewShotModule);
  } catch (error) {
    Logger.warn('react-native-view-shot no está en el binario nativo', {
      scope: 'share-image.captureViewToUri',
      hint: 'Falta el rebuild del Dev Client con EAS para esta dependencia.',
      error,
    });
    throw new NativeCaptureUnavailableError();
  }

  try {
    return await captureRef(viewRef, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
    });
  } catch (error) {
    // Bajo la arquitectura vieja el require SÍ resuelve, pero
    // `NativeModules.RNViewShot` queda undefined y la librería recién tira acá,
    // desde su `ensureModuleIsLoaded()`. Es la misma causa raíz que el catch de
    // arriba, así que se normaliza al mismo error para que la UI muestre un
    // solo mensaje en vez de dos según la arquitectura del binario.
    if (error instanceof Error && error.message.includes('RNViewShot is undefined')) {
      Logger.warn('react-native-view-shot presente en JS pero sin módulo nativo linkeado', {
        scope: 'share-image.captureViewToUri',
        hint: 'Falta el rebuild del Dev Client con EAS para esta dependencia.',
        error,
      });
      throw new NativeCaptureUnavailableError();
    }
    throw error;
  }
}

/**
 * Share nativo genérico (WhatsApp, Telegram, guardar en archivos, etc.) vía
 * `expo-sharing` — cross-platform de verdad (tiene shim de web), a
 * diferencia de `react-native-share` (ver `lib/instagram-stories.native.ts`
 * / `.web.ts`). Es el fallback de Instagram Stories y también el botón "de
 * respaldo" propio en la UI.
 */
export async function shareGeneric(uri: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    Logger.warn('Sharing no disponible en este dispositivo', {
      scope: 'share-image.shareGeneric',
    });
    return;
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'image/png',
    dialogTitle: 'Compartir resultado',
  });
}
