'use client';

import type React from 'react';
import {
  AdminWalletDetailDto,
  BOOKING_STATUS_LABEL,
  DIRECTION_SHORT,
  errorMessage,
  NETWORK_LABEL,
  WalletScreeningDto,
} from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ScreeningChecks, ScreeningHeader, WalletRiskBadge } from '@/components/exchange';
import { ExplorerButtons, OpenScanViewer, TxCheckBadge } from '@/components/openscan';
import { Alert, Button, ErrorBox, Modal, Spinner, TextArea, useToast } from '@/components/ui';
import { api } from '@/lib/api';

export default function WalletDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const [review, setReview] = useState<'CLEAR' | 'BLOCKED' | null>(null);
  const [note, setNote] = useState('');
  const q = useQuery({ queryKey: ['admin', 'wallet', id], queryFn: () => api.get<AdminWalletDetailDto>(`/admin/wallets/${id}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });
  const rescreen = useMutation({
    mutationFn: () => api.post<WalletScreeningDto>(`/admin/wallets/${id}/screen`),
    onSuccess: () => {
      refresh();
      toast('Auditoría completada');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const decide = useMutation({
    mutationFn: () => api.post(`/admin/wallets/${id}/review`, { decision: review, note }),
    onSuccess: () => {
      refresh();
      setReview(null);
      setNote('');
      toast(review === 'CLEAR' ? 'Wallet aceptada' : 'Wallet bloqueada');
    },
  });

  if (q.isLoading) return <Spinner />;
  if (!q.data) return <div className="page"><ErrorBox error={q.error} /></div>;
  const { wallet: w, screenings, exchanges } = q.data;
  const latest = screenings[0];

  return (
    <div className="page">
      <Link href="/admin/wallets" className="btn ghost sm" style={{ paddingLeft: 0 }}>
        Wallets
      </Link>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="mono" style={{ fontSize: 'var(--t-lg)', wordBreak: 'break-all' }}>
            {w.address}
          </h1>
          <p className="muted">
            {NETWORK_LABEL[w.network]}
            {w.label ? ` · ${w.label}` : ''} · de <Link href={`/admin/clientes/${w.owner.id}`}>{w.owner.name}</Link>
          </p>
        </div>
        <div className="row">
          <WalletRiskBadge status={w.riskStatus} score={w.riskScore} />
          <ExplorerButtons network={w.network} kind="address" value={w.address} />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <OpenScanViewer network={w.network} kind="address" value={w.address} title="Actividad de la wallet en OpenScan" />
      </div>

      {w.sharedWithOtherCustomers ? (
        <Alert kind="warn">Esta dirección también la han registrado otros {w.sharedWithOtherCustomers} cliente(s). Comprueba que no se trata de una wallet de terceros.</Alert>
      ) : null}

      <div className="grid" style={{ '--min': '340px', alignItems: 'start', marginTop: 16 } as React.CSSProperties}>
        <section className="card stack">
          <div className="row between">
            <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Última auditoría</h2>
            <Button size="sm" onClick={() => rescreen.mutate()} loading={rescreen.isPending}>
              Auditar de nuevo
            </Button>
          </div>
          {latest ? (
            <>
              <ScreeningHeader screening={latest} />
              <ScreeningChecks screening={latest} />
              {latest.snapshot ? <Snapshot data={latest.snapshot} /> : null}
              {latest.reviewNote ? (
                <Alert kind="info">
                  Revisión de {latest.reviewedBy?.name}: {latest.reviewNote}
                </Alert>
              ) : null}
              <div className="row">
                <Button variant="primary" onClick={() => setReview('CLEAR')}>
                  Aceptar wallet
                </Button>
                <Button variant="danger" onClick={() => setReview('BLOCKED')}>
                  Bloquear wallet
                </Button>
              </div>
            </>
          ) : (
            <p className="muted small">Sin auditorías todavía.</p>
          )}
        </section>

        <div className="stack">
          <section className="card">
            <h2 style={{ fontSize: 'var(--t-lg)' }}>Operaciones</h2>
            {exchanges.length ? (
              <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, '--gap': '8px' } as React.CSSProperties}>
                {exchanges.map((e) => (
                  <li key={e.bookingId} className="row between small">
                    <Link href={`/admin/citas/${e.bookingId}`} className="mono">
                      {e.reference}
                    </Link>
                    <span>
                      {DIRECTION_SHORT[e.direction]} {e.amount} {e.asset}
                    </span>
                    <span className="muted">{BOOKING_STATUS_LABEL[e.status]}</span>
                    {e.txHash ? (
                      <span className="row" style={{ gap: 6 }}>
                        <TxCheckBadge status={e.txCheckStatus} />
                        <ExplorerButtons network={w.network} kind="tx" value={e.txHash} />
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                Sin operaciones.
              </p>
            )}
          </section>
          <section className="card">
            <h2 style={{ fontSize: 'var(--t-lg)' }}>Historial de auditorías</h2>
            <ol className="timeline">
              {screenings.map((s) => (
                <li key={s.id}>
                  <ScreeningHeader screening={s} />
                  <div className="xs muted">Proveedores: {s.providers.join(', ')}</div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <Modal
        open={!!review}
        onClose={() => setReview(null)}
        title={review === 'CLEAR' ? 'Aceptar la wallet' : 'Bloquear la wallet'}
        footer={
          <>
            <Button onClick={() => setReview(null)}>Cancelar</Button>
            <Button variant={review === 'CLEAR' ? 'primary' : 'danger'} loading={decide.isPending} disabled={note.trim().length < 3} onClick={() => decide.mutate()}>
              {review === 'CLEAR' ? 'Aceptar wallet' : 'Bloquear wallet'}
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="small" style={{ margin: 0 }}>
            {review === 'CLEAR'
              ? 'Los avisos actuales quedarán aceptados durante 90 días: si una nueva auditoría solo repite estos avisos, la wallet seguirá aceptada.'
              : 'No se podrán aprobar operaciones con esta wallet. El cliente no verá el motivo.'}
          </p>
          <TextArea label="Justificación (queda en la auditoría)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          {decide.error ? <Alert kind="error">{errorMessage(decide.error)}</Alert> : null}
        </div>
      </Modal>
    </div>
  );
}

function Snapshot({ data }: { data: Record<string, unknown> }) {
  const rows: [string, unknown][] = [
    ['Saldo del token', data.tokenBalance],
    ['Saldo nativo', data.nativeBalance],
    ['Transacciones enviadas', data.outgoingTxCount],
    ['Primera actividad', data.firstSeenAt ? new Date(String(data.firstSeenAt)).toLocaleDateString('es-ES') : data.firstSeenAt === null ? 'Ninguna' : undefined],
    ['Es un contrato', data.isContract === undefined ? undefined : data.isContract ? 'Sí' : 'No'],
  ];
  return (
    <dl className="grid" style={{ '--min': '150px', gap: 8, margin: 0 } as React.CSSProperties}>
      {rows
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => (
          <div key={k}>
            <dt className="xs muted">{k}</dt>
            <dd className="mono small" style={{ margin: 0 }}>
              {String(v)}
            </dd>
          </div>
        ))}
    </dl>
  );
}
