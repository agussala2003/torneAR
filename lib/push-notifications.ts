import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // En SDK 53+, expo-notifications crashea si se inicializa dentro de Expo Go en Android.
  // Bypass automático si el usuario está probando en Expo Go:
  if (Constants.appOwnership === 'expo') {
    console.log('Push notifications are not supported in Expo Go. Returning null token.');
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
        return null;
      }
      
      const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
      
      token = (await Notifications.getExpoPushTokenAsync({
        projectId: projectId,
      })).data;
      
      return token;
    } else {
      console.log('Must use physical device for Push Notifications');
      return null;
    }
  } catch (error) {
    console.log('Error initializing push notifications:', error);
    return null;
  }
}
