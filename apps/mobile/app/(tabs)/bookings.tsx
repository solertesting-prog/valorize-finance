import { BookingDto, bookingSteps, formatDate, formatTime, Paginated } from '@valorize/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, Card, H1, Loader, Mono, Muted, Row, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { c, t } from '@/theme';

export default function Bookings() {
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const q = useInfiniteQuery({
    queryKey: ['bookings', scope, 'infinite'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.get<Paginated<BookingDto>>('/me/bookings', { query: { scope, page: pageParam, pageSize: 15 } }),
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ink }} edges={['top']}>
      <FlatList
        data={items}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
        onRefresh={() => q.refetch()}
        refreshing={q.isRefetching}
        onEndReached={() => q.hasNextPage && q.fetchNextPage()}
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 6 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <H1>Mis citas</H1>
              <Button title="Nueva" variant="primary" size="sm" onPress={() => router.push('/book')} />
            </Row>
            <Row>
              <Button title="Próximas" size="sm" variant={scope === 'upcoming' ? 'primary' : 'default'} onPress={() => setScope('upcoming')} />
              <Button title="Historial" size="sm" variant={scope === 'past' ? 'primary' : 'default'} onPress={() => setScope('past')} />
            </Row>
          </View>
        }
        ListEmptyComponent={q.isLoading ? <Loader /> : <Muted style={{ textAlign: 'center', padding: 32 }}>{scope === 'upcoming' ? 'No tienes citas pendientes.' : 'Aún no tienes historial.'}</Muted>}
        ListFooterComponent={q.isFetchingNextPage ? <Loader /> : null}
        renderItem={({ item: b }) => (
          <Card onPress={() => router.push(`/booking/${b.id}`)}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row style={{ gap: 14 }}>
                <Mono style={{ fontSize: t.xl }}>{formatTime(b.startsAt, b.location.timezone)}</Mono>
                <View>
                  <Body style={{ textTransform: 'capitalize', fontWeight: '600' }}>{formatDate(b.startsAt, b.location.timezone)}</Body>
                  <Muted style={{ fontSize: t.sm }}>
                    {b.service.name} · {b.location.name}
                  </Muted>
                  {(() => {
                    const step = bookingSteps(b).find((s) => s.state === 'current' || s.state === 'failed');
                    return step && b.status !== 'CONFIRMED' ? (
                      <Muted style={{ fontSize: t.xs, color: step.state === 'failed' ? c.coral : c.amber }}>{step.label}</Muted>
                    ) : null;
                  })()}
                </View>
              </Row>
              <StatusBadge status={b.status} />
            </Row>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}
