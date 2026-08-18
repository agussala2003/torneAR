import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Logger } from '@/lib/logger';

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

  return captureRef(viewRef, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
  });
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
