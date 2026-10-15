'use client';

import { NotificationDto, relativeTime } from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Empty, ErrorBox, Pager, Spinner } from '@/components/ui';
import { api } from '@/lib/api';

type Page = { items: NotificationDto[]; total: number; page: number; pageSize: number; unread: number };

export default function Inbox() {
  const qc = useQueryClient();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['notifications', page], queryFn: () => api.get<Page>('/me/notifications', { query: { page, pageSize: 20 } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const readAll = useMutation({ mutationFn: () => api.post('/me/notifications/read-all'), onSuccess: refresh });

  async function open(n: NotificationDto) {
    if (!n.readAt) await api.post(`/me/notifications/${n.id}/read`).then(refresh);
    const bookingId = n.data?.bookingId;
    if (typeof bookingId === 'string') router.push(`/app/reservas/${bookingId}`);
    else if (n.type === 'KYC_STATUS_CHANGED') router.push('/app/perfil/verificacion');
    else if (n.type === 'SECURITY') router.push('/cuenta/seguridad');
  }

  return (
    <div className="page narrow">
      <div className="page-head">
        <h1>Notificaciones</h1>
        {q.data?.unread ? (
          <Button size="sm" onClick={() => readAll.mutate()} loading={readAll.isPending}>
            Marcar todas como leídas
          </Button>
        ) : null}
      </div>
      {q.isLoading ? <Spinner /> : <ErrorBox error={q.error} />}
      {q.data && !q.data.items.length ? <Empty title="Sin notificaciones">Aquí verás confirmaciones, recordatorios y avisos de seguridad.</Empty> : null}
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {q.data?.items.map((n) => (
          <li key={n.id}>
            <button
              className="choice"
              onClick={() => open(n)}
              style={n.readAt ? { opacity: 0.72 } : { borderLeft: '3px solid var(--mint)' }}
            >
              <div className="grow">
                <div className="row between">
                  <strong>{n.title}</strong>
                  <span className="xs muted">{relativeTime(n.createdAt)}</span>
                </div>
                <div className="small muted" style={{ marginTop: 4 }}>
                  {n.body}
                </div>
              </div>
              {!n.readAt ? <span className="sr-only">Sin leer</span> : null}
            </button>
          </li>
        ))}
      </ul>
      {q.data ? <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} /> : null}
    </div>
  );
}
