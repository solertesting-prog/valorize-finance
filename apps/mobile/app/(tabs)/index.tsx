import { BookingDto, formatDateLong, formatTime, Paginated } from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, H1, H2, Loader, Mono, Muted, Notice, Row, Screen, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { c, t } from '@/theme';

export default function Home() {
  const { user } = useAuth();
  const upcoming = useQuery({
    queryKey: ['bookings', 'upcoming', 1],
    queryFn: () => api.get<Paginated<BookingDto>>('/me/bookings', { query: { scope: 'upcoming', pageSize: 3 } }),
  });
  const unread = useQuery({ queryKey: ['notifications', 'unread'], queryFn: () => api.get<{ count: number }>('/me/notifications/unread-count'), refetchInterval: 60_000 });
  const next = upcoming.data?.items[0];

  const nudges: { text: string; to: '/verify' | '/kyc' }[] = [];
  if (user && (!user.emailVerified || !user.phoneVerified)) nudges.push({ text: 'Verifica tu email y teléfono', to: '/verify' });
  if (user && ['NOT_STARTED', 'PENDING', 'REJECTED', 'EXPIRED'].includes(user.kycStatus)) nudges.push({ text: 'Completa la verificación de identidad para todas las gestiones', to: '/kyc' });

  return (
    <Screen refreshing={upcoming.isRefetching} onRefresh={() => upcoming.refetch()}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Muted>Hola, {user?.firstName}</Muted>
        <Pressable onPress={() => router.push('/notifications')} accessibilityRole="button" accessibilityLabel={`Notificaciones${unread.data?.count ? `, ${unread.data.count} sin leer` : ''}`} hitSlop={12}>
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: unread.data?.count ? c.mint : c.slate }}>
            <Text style={{ color: unread.data?.count ? c.mintInk : c.fog, fontWeight: '700' }}>{unread.data?.count ? `${unread.data.count} nuevas` : 'Avisos'}</Text>
          </View>
        </Pressable>
      </Row>
      <H1 style={{ fontSize: t.x3, lineHeight: t.x3 * 1.1 }}>¿Qué necesitas hacer hoy?</H1>
      <Pressable onPress={() => router.push('/(tabs)/locations')} accessibilityRole="search" style={{ backgroundColor: c.slate2, borderRadius: 10, borderWidth: 1, borderColor: c.line, padding: 14 }}>
        <Muted>Buscar una ubicación</Muted>
      </Pressable>
      <Button title="Reservar una visita" variant="primary" size="lg" onPress={() => router.push('/book')} />
      {nudges.map((n) => (
        <Pressable key={n.text} onPress={() => router.push(n.to)}>
          <Notice kind="warn">{n.text}</Notice>
        </Pressable>
      ))}
      <H2>Tu próxima cita</H2>
      {upcoming.isLoading ? (
        <Loader />
      ) : next ? (
        <Card big onPress={() => router.push(`/booking/${next.id}`)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <StatusBadge status={next.status} />
            <Mono style={{ color: c.mint }}>{next.reference}</Mono>
          </Row>
          <Mono style={{ fontSize: t.x3, marginTop: 8 }}>{formatTime(next.startsAt, next.location.timezone)}</Mono>
          <Body style={{ textTransform: 'capitalize' }}>{formatDateLong(next.startsAt, next.location.timezone)}</Body>
          <Muted>
            {next.service.name} en {next.location.name}
          </Muted>
          <Body style={{ color: c.mint, fontWeight: '600', marginTop: 8 }}>Ver mi QR</Body>
        </Card>
      ) : (
        <Card>
          <Muted>No tienes citas pendientes.</Muted>
        </Card>
      )}
    </Screen>
  );
}
