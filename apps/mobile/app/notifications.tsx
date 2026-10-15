import { NotificationDto, relativeTime } from '@valorize/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Body, Button, Loader, Muted, Row } from '@/components/ui';
import { api } from '@/lib/api';
import { c, r } from '@/theme';

type Page = { items: NotificationDto[]; total: number; page: number; pageSize: number; unread: number };

export default function Inbox() {
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ['notifications', 'infinite'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.get<Page>('/me/notifications', { query: { page: pageParam, pageSize: 20 } }),
    getNextPageParam: (l) => (l.page * l.pageSize < l.total ? l.page + 1 : undefined),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const readAll = useMutation({ mutationFn: () => api.post('/me/notifications/read-all'), onSuccess: refresh });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = q.data?.pages[0]?.unread ?? 0;

  useEffect(() => {
    void Notifications.setBadgeCountAsync(unread).catch(() => undefined);
  }, [unread]);

  async function open(n: NotificationDto) {
    if (!n.readAt) await api.post(`/me/notifications/${n.id}/read`).then(refresh);
    const bookingId = n.data?.bookingId;
    if (typeof bookingId === 'string') router.push(`/booking/${bookingId}`);
    else if (n.type === 'KYC_STATUS_CHANGED') router.push('/kyc');
    else if (n.type === 'SECURITY') router.push('/security');
  }

  return (
    <FlatList
      style={{ backgroundColor: c.ink }}
      data={items}
      keyExtractor={(n) => n.id}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      onRefresh={() => q.refetch()}
      refreshing={q.isRefetching}
      onEndReached={() => q.hasNextPage && q.fetchNextPage()}
      ListHeaderComponent={unread ? <Button title="Marcar todas como leídas" size="sm" onPress={() => readAll.mutate()} loading={readAll.isPending} /> : null}
      ListEmptyComponent={q.isLoading ? <Loader /> : <Muted style={{ textAlign: 'center', padding: 32 }}>Aquí verás confirmaciones, recordatorios y avisos de seguridad.</Muted>}
      renderItem={({ item: n }) => (
        <Pressable
          onPress={() => open(n)}
          accessibilityRole="button"
          accessibilityHint={n.readAt ? undefined : 'Sin leer'}
          style={{ backgroundColor: c.slate, borderRadius: r.md, borderWidth: 1, borderColor: c.line, borderLeftColor: n.readAt ? c.line : c.mint, borderLeftWidth: 3, padding: 14, opacity: n.readAt ? 0.75 : 1 }}
        >
          <Row style={{ justifyContent: 'space-between' }}>
            <Body style={{ fontWeight: '700', flex: 1 }}>{n.title}</Body>
            <Muted style={{ fontSize: 12 }}>{relativeTime(n.createdAt)}</Muted>
          </Row>
          <View style={{ marginTop: 4 }}>
            <Muted style={{ fontSize: 14 }}>{n.body}</Muted>
          </View>
        </Pressable>
      )}
    />
  );
}
