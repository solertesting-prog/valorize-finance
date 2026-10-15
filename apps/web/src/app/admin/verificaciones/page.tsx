'use client';

import { KycStatus, KYC_STATUS_LABEL, relativeTime } from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Empty, ErrorBox, KycBadge, Pager, Spinner } from '@/components/ui';
import { api } from '@/lib/api';

type Row = { userId: string; name: string; email: string; status: KycStatus; level: number; submittedAt: string | null };

export default function KycQueue() {
  const [status, setStatus] = useState<KycStatus>('IN_REVIEW');
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['admin', 'kyc-queue', status, page],
    queryFn: () => api.get<{ items: Row[]; total: number; page: number; pageSize: number }>('/admin/kyc/queue', { query: { status, page } }),
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Verificaciones</h1>
          <p className="muted">Las más antiguas primero.</p>
        </div>
        <select className="select" style={{ width: 'auto' }} value={status} onChange={(e) => { setStatus(e.target.value as KycStatus); setPage(1); }} aria-label="Estado">
          {(['IN_REVIEW', 'REJECTED', 'APPROVED', 'EXPIRED', 'PENDING'] as KycStatus[]).map((s) => <option key={s} value={s}>{KYC_STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      {q.isLoading ? <Spinner /> : <ErrorBox error={q.error} />}
      {q.data && !q.data.items.length ? <Empty title={status === 'IN_REVIEW' ? 'No hay verificaciones pendientes' : 'Sin resultados'} /> : null}
      <div className="stack">
        {q.data?.items.map((r) => (
          <Link key={r.userId} href={`/admin/clientes/${r.userId}#kyc`} className="card card-link row between">
            <div>
              <strong>{r.name}</strong>
              <div className="small muted">{r.email}</div>
            </div>
            <div className="row">
              {r.submittedAt ? <span className="small muted">Enviada {relativeTime(r.submittedAt)}</span> : null}
              <KycBadge status={r.status} />
            </div>
          </Link>
        ))}
      </div>
      {q.data ? <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} /> : null}
    </div>
  );
}
