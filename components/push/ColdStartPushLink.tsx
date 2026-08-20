import { useEffect, useRef } from 'react';
import { clearLastNotificationResponse, useLastNotificationResponse } from 'expo-notifications';
import { Logger } from '@/lib/logger';
import { extractDeepLinkUrl, isProtectedDeepLink } from '@/lib/deep-linking';
import { useDeepLinkStore } from '@/stores/deepLinkStore';

/**
 * ⚠️ ESTE ARCHIVO IMPORTA `expo-notifications` EN EL TOP-LEVEL.
 *
 * Eso es incompatible con Expo Go en Android (SDK 53+, ver
 * `lib/push-environment.ts`), así que NUNCA se importa directo: se llega acá
 * sólo a través de `ColdStartPushLinkGate`, que hace el `require()` detrás de
 * la guarda de entorno. Importar este módulo desde otro lado reintroduce
 * exactamente el crash de arranque que el gate evita.
 *
 * ── El bug que resuelve ──────────────────────────────────────────────────────
 * Abrir la app tocando una push con la app MUERTA (killed state) a veces no
 * ruteaba al detalle. Dos causas, ambas en el mismo camino:
 *
 *  1. `getLastNotificationResponseAsync()` es una lectura ONE-SHOT. En
 *     `usePushNotifications` se la llama después de un `await import(...)`, y
 *     para cuando resuelve, en Android el módulo nativo puede no haber
 *     recibido todavía el intent que abrió la app: devuelve `null` y no hay
 *     segunda oportunidad — el deep link se pierde en silencio.
 *     `useLastNotificationResponse()` es la contraparte REACTIVA: arranca en
 *     `undefined` y re-renderiza cuando la respuesta aparece, sin importar
 *     cuánto tarde el nativo.
 *
 *  2. Aun cuando la URL llegaba, se navegaba con `router.replace()` de una.
 *     En cold start eso compite con el guard de auth de `app/_layout.tsx`, que
 *     está haciendo sus propios `replace` mientras hidrata la sesión, muestra
 *     el intro de 2,3 s y decide entre /login, /onboarding y /(tabs). El que
 *     llega último gana, y no hay forma de saber cuál es.
 *
 * ── La decisión de diseño ────────────────────────────────────────────────────
 * Este componente NO navega. Deja la URL en `deepLinkStore` y deja que la
 * consuma el guard de `_layout`, que es el único punto de la app que sabe si
 * ya se puede navegar y a dónde. O sea: el cold start por push usa exactamente
 * el mismo carril que el cold start por deep link (`Linking.getInitialURL`),
 * en vez de un segundo camino con su propia carrera contra el guard.
 *
 * Para un link PÚBLICO (`login`, `forgot-password`) también difiere: el guard
 * consume el pendiente ni bien la sesión queda resuelta, y llegar unos ms más
 * tarde a una pantalla pública es infinitamente mejor que un `replace` que el
 * guard pisa medio segundo después.
 *
 * Renderiza `null`: es un efecto con forma de componente. Se hizo componente y
 * no hook porque `useLastNotificationResponse` obliga a un import estático
 * (las reglas de hooks impiden llamarlo condicionalmente o tras un `await
 * import`), y un componente sí se puede montar de forma condicional.
 */
export function ColdStartPushLink(): null {
  // `undefined` = todavía no se resolvió; `null` = no hubo notificación.
  const lastResponse = useLastNotificationResponse();

  /**
   * Este componente sólo atiende el ARRANQUE EN FRÍO. Los taps con la app
   * viva ya los toma `addNotificationResponseReceivedListener` en
   * `usePushNotifications`, que navega directo (ahí sí hay certeza de que la
   * navegación está montada y la sesión hidratada).
   *
   * `useLastNotificationResponse` también se actualiza con esos taps calientes,
   * así que sin este candado el mismo tap se procesaría dos veces: una
   * navegando y otra dejando un pendiente que el guard dispararía después,
   * mandando al usuario a la misma pantalla dos veces.
   */
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    // Todavía cargando: NO marcar como manejado, hay que esperar el valor real.
    // Ésta es la diferencia concreta con la lectura one-shot que fallaba.
    if (lastResponse === undefined) return;

    handledRef.current = true;

    if (lastResponse === null) return;

    const url = extractDeepLinkUrl(lastResponse);
    if (!url) return;

    useDeepLinkStore.getState().setPendingDeepLink(url);

    Logger.info('Cold start por push: deep link diferido al guard', {
      scope: 'ColdStartPushLink',
      url,
      isProtected: isProtectedDeepLink(url),
    });

    /**
     * La "última respuesta" PERSISTE entre arranques: sin limpiarla, la próxima
     * vez que el usuario abra la app normalmente (sin tocar ninguna push)
     * volveríamos a rutear al mismo partido de la semana pasada. Se limpia
     * recién después de haberla consumido.
     *
     * `clearLastNotificationResponse` (sync) y no `...Async`: la variante
     * asíncrona está marcada `@deprecated` en expo-notifications 0.32.
     *
     * En try/catch porque la limpieza no vale un crash: el deep link de este
     * arranque ya se procesó, lo único que se arriesga es la repetición.
     */
    try {
      clearLastNotificationResponse();
    } catch (error) {
      Logger.warn('No se pudo limpiar la última respuesta de notificación', {
        scope: 'ColdStartPushLink',
        error,
      });
    }
  }, [lastResponse]);

  return null;
}
