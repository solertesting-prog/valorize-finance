'use client';

import { CryptoAsset, ExchangeDirection, formatEur, formatNum, QuoteDto, relativeTime } from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/** Retrasa un valor mientras el usuario escribe. */
function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useQuote(direction: ExchangeDirection, asset: CryptoAsset, amount: string) {
  const a = useDebounced(amount.replace(',', '.').trim());
  const valid = /^\d{1,12}(\.\d{1,6})?$/.test(a) && Number(a) > 0;
  return useQuery({
    queryKey: ['quote', direction, asset, a],
    queryFn: () => api.get<QuoteDto>('/exchange/quote', { query: { direction, asset, amount: a } }),
    enabled: valid,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });
}

/** Cotización orientativa: lo que recibe o paga el cliente, con el tipo aplicado. */
export function QuoteBox({ direction, asset, amount }: { direction: ExchangeDirection; asset: CryptoAsset; amount: string }) {
  const q = useQuote(direction, asset, amount);
  const selling = direction === 'SELL_CRYPTO';
  if (!amount.trim()) return null;
  if (q.isError) return <p className="small muted" style={{ margin: 0 }}>Ahora mismo no podemos calcular la cotización. Te la daremos en la oficina.</p>;
  const d = q.data;
  return (
    <div className="quote" aria-live="polite">
      <div className="xs muted">{selling ? 'Recibirás aproximadamente' : 'Pagarás aproximadamente'}</div>
      <div className="quote-amount mono">{d ? formatEur(d.fiatAmount) : '…'}</div>
      {d ? (
        <div className="xs muted">
          Tipo {formatNum(d.rate, 4)} € por {d.asset}
          {Number(d.fee) > 0 ? ` · comisión ${formatEur(d.fee)}` : ''} · {d.source === 'AUTO' ? `precio de mercado ${relativeTime(d.updatedAt)}` : 'tipo del día'}
        </div>
      ) : null}
      <div className="xs muted" style={{ marginTop: 6 }}>
        Orientativo: el importe final se confirma en la oficina.
      </div>
    </div>
  );
}
