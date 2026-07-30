import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Logger } from '@/lib/logger';

/**
 * Techo duro para el registro del token.
 *
 * Sin FCM inicializado en el build (falta `google-services.json` + el plugin
 * `expo-notifications` en app.json), `getExpoPushTokenAsync` no siempre
 * rechaza: hay casos donde la promesa se queda colgada para siempre. Como el
 * llamante la espera con `await`, eso deja el registro pendiente de por vida.
 * Con el race, el peor caso es "sin token" y no "app esperando".
 */
const PUSH_TOKEN_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} superó los ${ms}ms`)), ms),
    ),
  ]);
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // En SDK 53+, expo-notifications crashea si se inicializa dentro de Expo Go en Android.
  // Bypass automático si el usuario está probando en Expo Go:
  if (Constants.appOwnership === 'expo') {
    return null;
  }

  try {
    // Importación dinámica para evitar que tire la excepción en la carga global del archivo
    const Notifications = await import('expo-notifications');

    let token = null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#53E076',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        // No es un error: el usuario dijo que no. Pero explica por qué ese
        // dispositivo nunca recibe un push, que es la consulta típica de soporte.
        Logger.info('Permiso de notificaciones denegado', {
          scope: 'push-notifications.register',
          platform: Platform.OS,
          previousStatus: existingStatus,
        });
        return null;
      }

      const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

      token = (
        await withTimeout(
          Notifications.getExpoPushTokenAsync({ projectId: projectId }),
          PUSH_TOKEN_TIMEOUT_MS,
          'getExpoPushTokenAsync',
        )
      ).data;

      return token;
    } else {
      return null;
    }
  } catch (error) {
    // `warn`, no `error`: quedarse sin push token degrada una funcionalidad
    // secundaria, no rompe la app. En el APK de producción esto se dispara
    // porque el entorno nativo de FCM no está inicializado (ver nota abajo),
    // y con `error` cada arranque disparaba una alarma por algo conocido.
    //
    // ⚠️ Arreglo de fondo pendiente: agregar el plugin `expo-notifications` y
    // `android.googleServicesFile` (google-services.json) en app.json. Hasta
    // entonces la app funciona pero NINGÚN dispositivo Android recibe pushes.
    Logger.warn('No se pudo inicializar el registro de push notifications', {
      scope: 'push-notifications.register',
      platform: Platform.OS,
      isDevice: Device.isDevice,
      error,
    });
    return null;
  }
}

export async function sendPushNotification(expoPushToken: string, title: string, body: string, data = {}) {
  const message = {
    to: expoPushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data,
  };

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    // El endpoint de Expo responde 200 con un `status: "error"` adentro para
    // los casos más comunes (DeviceNotRegistered, token inválido), así que un
    // `fetch` que no tira NO significa que el push haya salido. Sin mirar la
    // respuesta, un token muerto se ve exactamente igual que un envío exitoso.
    if (!response.ok) {
      Logger.warn('El endpoint de push respondió con error', {
        scope: 'push-notifications.send',
        status: response.status,
        title,
      });
    }
  } catch (error) {
    Logger.error('Error enviando la notificación push', {
      scope: 'push-notifications.send',
      title,
      error,
    });
  }
}
