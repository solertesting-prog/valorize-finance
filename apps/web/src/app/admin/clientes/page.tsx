'use client';

import { AdminUserDto, KycStatus, KYC_STATUS_LABEL, Paginated } from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Empty, ErrorBox, KycBadge, Pager, Spinner } from '@/components/ui';
import { api } from '@/lib/api';

export default function Customers() {
  const [f, setF] = useState({ q: '', kycStatus: '' as KycStatus | '', page: 1 });
  const q = useQuery({
    queryKey: ['admin', 'customers', f],
    queryFn: () => api.get<Paginated<AdminUserDto>>('/admin/users', { query: { ...f, role: 'CUSTOMER', pageSize: 25 } }),
  });

  return (
    <div className="page">
      <div className="page-head"><h1>Clientes</h1></div>
      <div className="row" style={{ marginBottom: 16 }}>
        <input className="input" style={{ maxWidth: 300 }} placeholder="Nombre, email o teléfono" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} aria-label="Buscar" />
        <select className="select" style={{ width: 'auto' }} value={f.kycStatus} onChange={(e) => setF({ ...f, kycStatus: e.target.value as KycStatus, page: 1 })} aria-label="Verificación">
          <option value="">Cualquier verificación</option>
          {Object.entries(KYC_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {q.isLoading ? <Spinner /> : <ErrorBox error={q.error} />}
      {q.data && !q.data.items.length ? <Empty title="Sin resultados" /> : null}
      {q.data?.items.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Cliente</th><th>Email</th><th>Teléfono</th><th>Identidad</th><th>Citas</th><th>Alta</th></tr></thead>
            <tbody>
              {q.data.items.map((u) => (
                <tr key={u.id}>
                  <td><Link href={`/admin/clientes/${u.id}`}>{u.firstName} {u.lastName}</Link>{u.status !== 'ACTIVE' ? <span className="badge bad" style={{ marginLeft: 8 }}>Suspendido</span> : null}</td>
                  <td>{u.email} {u.emailVerified ? null : <span className="xs muted">(sin verificar)</span>}</td>
                  <td>{u.phone ?? '–'}</td>
                  <td><KycBadge status={u.kycStatus} /></td>
                  <td className="mono">{u.bookingCount ?? 0}</td>
                  <td>{new Date(u.createdAt).toLocaleDateString('es-ES')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {q.data ? <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => setF({ ...f, page: p })} /> : null}
    </div>
  );
}
