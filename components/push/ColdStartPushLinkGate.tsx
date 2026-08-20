import type { ComponentType } from 'react';
import { IS_PUSH_UNSUPPORTED_ENV } from '@/lib/push-environment';

/**
 * Envoltorio de entorno para `ColdStartPushLink`.
 *
 * `ColdStartPushLink` importa `expo-notifications` en el top-level —
 * inevitable, porque `useLastNotificationResponse` es un hook y las reglas de
 * hooks prohíben llamarlo condicionalmente o después de un `await import()`.
 * Pero ese import estático crashea Expo Go en Android (SDK 53+).
 *
 * El `require()` de abajo resuelve las dos cosas a la vez: Metro lo evalúa en
 * RUNTIME, así que en un entorno no soportado el módulo —y con él
 * `expo-notifications`— nunca se llega a cargar; y donde sí corre, el
 * componente queda resuelto una sola vez a nivel de módulo, no por render.
 *
 * Es el mismo patrón defensivo que `lib/share-image.ts` usa con
 * `react-native-view-shot`, por la misma razón de fondo: un módulo nativo que
 * revienta al evaluarse se lleva puesta la app entera si se lo importa arriba.
 */
const ColdStartPushLinkImpl: ComponentType | null = IS_PUSH_UNSUPPORTED_ENV
  ? null
  : // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('./ColdStartPushLink') as typeof import('./ColdStartPushLink')).ColdStartPushLink;

/**
 * Montar esto en el `_layout` raíz es todo lo que hace falta para que un
 * arranque en frío por push termine ruteando: el componente deja la URL en
 * `deepLinkStore` y el guard de auth de `app/_layout.tsx` la consume cuando
 * corresponde. En Expo Go / web no renderiza nada.
 */
export function ColdStartPushLinkGate() {
  return ColdStartPushLinkImpl ? <ColdStartPushLinkImpl /> : null;
}
