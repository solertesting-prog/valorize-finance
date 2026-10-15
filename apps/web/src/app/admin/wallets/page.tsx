'use client';

import type React from 'react';
import { AdminWalletDto, ChainNetwork, errorMessage, NETWORK_LABEL, Paginated, relativeTime, WALLET_RISK_LABEL, WalletRiskStatus } from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { shortAddress, WalletRiskBadge } from '@/components/exchange';
import { Alert, Button, Empty, ErrorBox, Modal, Pager, Spinner, TextInput, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Tab = 'wallets' | 'blocklist';

export default function Wallets() {
  const [tab, setTab] = useState<Tab>('wallets');
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Wallets</h1>
          <p className="muted">Auditoría de las wallets de los clientes y lista de direcciones bloqueadas.</p>
        </div>
      </div>
      <div className="row" role="tablist" style={{ marginBottom: 16 }}>
        <button role="tab" aria-selected={tab === 'wallets'} className={`btn sm ${tab === 'wallets' ? 'primary' : ''}`} onClick={() => setTab('wallets')}>
          Wallets de clientes
        </button>
        <button role="tab" aria-selected={tab === 'blocklist'} className={`btn sm ${tab === 'blocklist' ? 'primary' : ''}`} onClick={() => setTab('blocklist')}>
          Direcciones bloqueadas
        </button>
      </div>
      {tab === 'wallets' ? <WalletList /> : <Blocklist />}
    </div>
  );
}

function WalletList() {
  const [f, setF] = useState({ q: '', riskStatus: '' as WalletRiskStatus | '', network: '' as ChainNetwork | '', page: 1 });
  const q = useQuery({
    queryKey: ['admin', 'wallets', f],
    queryFn: () => api.get<Paginated<AdminWalletDto>>('/admin/wallets', { query: { ...f, pageSize: 25 } }),
  });
  return (
    <>
      <div className="row" style={{ marginBottom: 16 }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Dirección, email o apellido" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} aria-label="Buscar" />
        <select className="select" style={{ width: 'auto' }} value={f.riskStatus} onChange={(e) => setF({ ...f, riskStatus: e.target.value as WalletRiskStatus, page: 1 })} aria-label="Estado">
          <option value="">Cualquier estado</option>
          {Object.entries(WALLET_RISK_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="select" style={{ width: 'auto' }} value={f.network} onChange={(e) => setF({ ...f, network: e.target.value as ChainNetwork, page: 1 })} aria-label="Red">
          <option value="">Todas las redes</option>
          {Object.entries(NETWORK_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {q.isLoading ? <Spinner /> : <ErrorBox error={q.error} />}
      {q.data && !q.data.items.length ? <Empty title="Sin wallets con estos filtros" /> : null}
      {q.data?.items.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Dirección</th>
                <th>Red</th>
                <th>Cliente</th>
                <th>Riesgo</th>
                <th>Operaciones</th>
                <th>Última auditoría</th>
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((w) => (
                <tr key={w.id}>
                  <td className="mono">
                    <Link href={`/admin/wallets/${w.id}`}>{shortAddress(w.address)}</Link>
                    {w.sharedWithOtherCustomers ? <span className="badge warn" style={{ marginLeft: 8 }}>Compartida</span> : null}
                  </td>
                  <td>{NETWORK_LABEL[w.network]}</td>
                  <td>
                    <Link href={`/admin/clientes/${w.owner.id}`}>{w.owner.name}</Link>
                  </td>
                  <td>
                    <WalletRiskBadge status={w.riskStatus} score={w.riskScore} />
                  </td>
                  <td className="mono">{w.exchangeCount}</td>
                  <td className="small muted">{w.lastScreenedAt ? relativeTime(w.lastScreenedAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {q.data ? <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => setF({ ...f, page: p })} /> : null}
    </>
  );
}

type BlockedPage = Paginated<{ id: string; address: string; reason: string | null; createdAt: string }> & {
  ofac: { count: number; updatedAt: string | null };
};

function Blocklist() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState('');
  const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: ['admin', 'blocked', page], queryFn: () => api.get<BlockedPage>('/admin/blocked-addresses', { query: { page } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'blocked'] });
  const add = useMutation({
    mutationFn: () => api.post<{ affectedWallets: number }>('/admin/blocked-addresses', { address, reason: reason || undefined }),
    onSuccess: (r) => {
      refresh();
      setOpen(false);
      setAddress('');
      setReason('');
      toast(r.affectedWallets ? `Dirección bloqueada. ${r.affectedWallets} wallet(s) de clientes pasan a bloqueadas.` : 'Dirección bloqueada');
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/admin/blocked-addresses/${id}`), onSuccess: refresh });
  const sync = useMutation({
    mutationFn: () => api.post<{ count: number }>('/admin/blocked-addresses/sync-ofac'),
    onSuccess: (r) => {
      refresh();
      toast(`Lista OFAC actualizada: ${r.count} direcciones`);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <div className="stack" style={{ '--gap': '20px' } as React.CSSProperties}>
      <div className="card row between">
        <div>
          <strong>Lista de sanciones OFAC</strong>
          <div className="small muted">
            {q.data?.ofac.count ? `${q.data.ofac.count} direcciones · actualizada ${relativeTime(q.data.ofac.updatedAt!)}` : 'Aún no importada'}. Se actualiza cada noche.
          </div>
        </div>
        {user?.role === 'ADMIN' ? (
          <Button onClick={() => sync.mutate()} loading={sync.isPending}>
            Actualizar ahora
          </Button>
        ) : null}
      </div>

      <div className="row between">
        <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Lista interna de Valorize</h2>
        <Button variant="primary" onClick={() => setOpen(true)}>
          Bloquear dirección
        </Button>
      </div>
      {q.isLoading ? <Spinner /> : <ErrorBox error={q.error} />}
      {q.data && !q.data.items.length ? <Empty title="No hay direcciones en la lista interna" /> : null}
      {q.data?.items.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Dirección</th>
                <th>Motivo</th>
                <th>Desde</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((b) => (
                <tr key={b.id}>
                  <td className="mono small" style={{ wordBreak: 'break-all' }}>
                    {b.address}
                  </td>
                  <td>{b.reason ?? '—'}</td>
                  <td className="small muted">{new Date(b.createdAt).toLocaleDateString('es-ES')}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(b.id)}>
                      Quitar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {q.data ? <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} /> : null}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Bloquear una dirección"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="danger" loading={add.isPending} disabled={address.trim().length < 10} onClick={() => add.mutate()}>
              Bloquear
            </Button>
          </>
        }
      >
        <div className="stack">
          <TextInput label="Dirección" className="input mono" value={address} onChange={(e) => setAddress(e.target.value.trim())} placeholder="T… o 0x…" />
          <TextInput label="Motivo (interno)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          <p className="xs muted" style={{ margin: 0 }}>
            Las wallets de clientes con esta dirección pasarán a bloqueadas y no se podrán aprobar operaciones con ellas.
          </p>
          {add.error ? <Alert kind="error">{errorMessage(add.error)}</Alert> : null}
        </div>
      </Modal>
    </div>
  );
}
