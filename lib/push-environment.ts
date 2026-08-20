import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Entornos donde `expo-notifications` no aplica y todo lo que dependa de él
 * tiene que quedar inerte:
 *
 *  - **Expo Go (Android, SDK 53+)**: crashea al INICIALIZAR el módulo. Esto es
 *    lo que obliga a que nadie importe `expo-notifications` en el top-level de
 *    un archivo que Expo Go vaya a evaluar — de ahí el `require()` diferido de
 *    `components/push/ColdStartPushLinkGate.tsx` y el `await import()` de
 *    `hooks/usePushNotifications.ts`.
 *  - **Web**: varios métodos nativos (`getLastNotificationResponseAsync`,
 *    listeners de push token) no están implementados y lanzan
 *    `UnavailabilityError`.
 *
 * Los push tokens sólo tienen sentido en un dev client o en una build real.
 *
 * Vive en `lib/` y no como constante privada de un hook porque ahora hay DOS
 * consumidores (`usePushNotifications` y el gate de cold start) y duplicar la
 * condición es garantía de que un día se corrijan de a uno.
 */
export const IS_PUSH_UNSUPPORTED_ENV: boolean =
  Constants.appOwnership === 'expo' || Platform.OS === 'web';
