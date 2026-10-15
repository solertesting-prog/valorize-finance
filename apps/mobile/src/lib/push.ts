import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

let currentToken: string | null = null;

/** Pide permiso y registra el token Expo Push del dispositivo en la API. */
export async function registerForPush(): Promise<void> {
  if (!Device.isDevice) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Citas y avisos',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#24cf8a',
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  currentToken = data;
  await api.post('/me/notifications/devices', { token: data, platform: Platform.OS === 'ios' ? 'ios' : 'android' }).catch(() => undefined);
}

export async function unregisterPush() {
  if (currentToken) await api.delete(`/me/notifications/devices/${encodeURIComponent(currentToken)}`);
  currentToken = null;
}
