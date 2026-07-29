import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Logger } from '@/lib/logger';

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
      
      token = (await Notifications.getExpoPushTokenAsync({
        projectId: projectId,
      })).data;
      
      return token;
    } else {
      return null;
    }
  } catch (error) {
    Logger.error('Error inicializando las notificaciones push', {
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
