import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { Loader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { c } from '@/theme';

export default function Index() {
  const { user, ready } = useAuth();
  if (!ready)
    return (
      <View style={{ flex: 1, backgroundColor: c.ink, justifyContent: 'center' }}>
        <Loader />
      </View>
    );
  if (!user) return <Redirect href="/login" />;
  if (!user.emailVerified) return <Redirect href="/verify" />;
  return <Redirect href="/(tabs)" />;
}
