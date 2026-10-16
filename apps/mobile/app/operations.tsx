import { DIRECTION_SHORT, errorMessage, formatDate, formatEur, formatNum, MyExchangesDto, NETWORK_LABEL } from '@valorize/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Linking, View } from 'react-native';
import { Body, Button, Card, Loader, Mono, Muted, Notice, Row, Screen, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { c, t } from '@/theme';

/** Historial de operaciones de cambio con totales del año y justificantes. */
export default function Operations() {
  const q = useQuery({ queryKey: ['me', 'exchanges', 1], queryFn: () => api.get<MyExchangesDto>('/me/exchanges', { query: { page: 1, pageSize: 50 } }) });
  const receipt = useMutation({
    mutationFn: (id: string) => api.post<{ url: string }>(`/me/bookings/${id}/receipt-link`),
    onSuccess: (r) => void Linking.openURL(r.url),
  });

  if (q.isLoading) return <Loader />;
  if (!q.data) return <Screen edges={['bottom']}><Notice kind="error">{errorMessage(q.error)}</Notice></Screen>;
  const tt = q.data.totals;

  return (
    <Screen edges={['bottom']} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Row style={{ flexWrap: 'nowrap', gap: 8 }}>
        <Stat label={`Operaciones ${tt.year}`} value={String(tt.completed)} />
        <Stat label="Recibido" value={formatEur(tt.soldEur)} />
        <Stat label="Pagado" value={formatEur(tt.boughtEur)} />
      </Row>
      {receipt.error ? <Notice kind="error">{errorMessage(receipt.error)}</Notice> : null}
      {!q.data.items.length ? (
        <Card>
          <Body>Aún no has hecho ninguna operación.</Body>
          <Button title="Solicitar un cambio" variant="primary" onPress={() => router.push('/book')} />
        </Card>
      ) : null}
      {q.data.items.map((b) => {
        const ex = b.exchange!;
        const eur = ex.fiatAmount ?? ex.quotedFiatAmount;
        return (
          <Card key={b.id} onPress={() => router.push(`/booking/${b.id}`)}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Mono style={{ color: c.mint }}>{b.reference}</Mono>
              <StatusBadge status={b.status} />
            </Row>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Mono style={{ fontSize: t.lg }}>
                  {DIRECTION_SHORT[ex.direction]} {formatNum(ex.amount)} {ex.asset}
                </Mono>
                <Muted style={{ fontSize: t.sm, textTransform: 'capitalize' }}>
                  {formatDate(b.startsAt, b.location.timezone)} · {NETWORK_LABEL[ex.network]}
                </Muted>
              </View>
              {eur ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Mono>{formatEur(eur)}</Mono>
                  <Muted style={{ fontSize: t.xs }}>{ex.fiatAmount ? (ex.direction === 'SELL_CRYPTO' ? 'recibidos' : 'pagados') : 'estimación'}</Muted>
                </View>
              ) : null}
            </Row>
            {b.status === 'COMPLETED' ? (
              <Button
                title="Justificante (PDF)"
                size="sm"
                loading={receipt.isPending && receipt.variables === b.id}
                onPress={() => receipt.mutate(b.id)}
              />
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: c.slate, borderColor: c.line, borderWidth: 1, borderRadius: 14, padding: 10 }}>
      <Muted style={{ fontSize: t.xs }}>{label}</Muted>
      <Mono style={{ fontSize: t.md }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Mono>
    </View>
  );
}
