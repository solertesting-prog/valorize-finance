import { CourierPrime_400Regular, CourierPrime_700Bold } from '@expo-google-fonts/courier-prime';
import { IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans';
import { ApiError } from '@valorize/shared';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/lib/auth';
import { c, f } from '@/theme';

void SplashScreen.preventAutoHideAsync();

// Refresca datos al volver la app a primer plano.
AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    CourierPrime_400Regular,
    CourierPrime_700Bold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
  });
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 } },
      }),
  );

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  // Al tocar una notificación, abre la cita correspondiente.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const data = r.notification.request.content.data as { bookingId?: string; type?: string };
      if (data?.bookingId) router.push(`/booking/${data.bookingId}`);
      else if (data?.type === 'KYC_STATUS_CHANGED') router.push('/kyc');
      else router.push('/notifications');
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: c.ink },
              headerTintColor: c.paper,
              headerTitleStyle: { fontFamily: f.brand },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: c.ink },
              headerBackTitle: 'Atrás',
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="book" options={{ title: 'Nueva reserva', presentation: 'modal' }} />
            <Stack.Screen name="booking/[id]" options={{ title: 'Mi QR' }} />
            <Stack.Screen name="notifications" options={{ title: 'Notificaciones' }} />
            <Stack.Screen name="kyc" options={{ title: 'Verificación' }} />
            <Stack.Screen name="operations" options={{ title: 'Mis operaciones' }} />
            <Stack.Screen name="security" options={{ title: 'Seguridad' }} />
          </Stack>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
