import { Redirect, Tabs } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '@/lib/auth';
import { c, f } from '@/theme';

const ICONS: Record<string, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
};

const icon = (name: string) =>
  function TabIcon({ color }: { color: string }) {
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Path d={ICONS[name]} />
      </Svg>
    );
  };

export default function TabsLayout() {
  const { user, ready } = useAuth();
  if (ready && !user) return <Redirect href="/login" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: c.harbor, borderTopColor: c.line },
        tabBarActiveTintColor: c.mint,
        tabBarInactiveTintColor: c.fog,
        tabBarLabelStyle: { fontFamily: f.uiBold, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="locations" options={{ title: 'Ubicaciones', tabBarIcon: icon('pin') }} />
      <Tabs.Screen name="bookings" options={{ title: 'Mis citas', tabBarIcon: icon('qr') }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
