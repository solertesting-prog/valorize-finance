import { Stack } from 'expo-router';
import { c } from '@/theme';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.ink } }} />;
}
