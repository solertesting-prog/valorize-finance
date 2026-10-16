'use client';

import type React from 'react';
import {
  ApiError,
  BookingDto,
  CHANNEL_LABEL,
  errorMessage,
  formatDateLong,
  formatEur,
  formatTime,
  fullName,
  LocationDto,
  PendingApprovalDto,
  relativeTime,
} from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ExchangeSummary, ScreeningChecks, ScreeningHeader } from '@/components/exchange';
import { OpenScanViewer } from '@/components/openscan';
import { Alert, Button, Empty, ErrorBox, KycBadge, Modal, Spinner, TextArea, TextInput, useToast } from '@/components/ui';
import { api } from '@/lib/api';

/** Bandeja de solicitudes pendientes de aprobación (visitas con cambio USDT/USDC u otras que la requieran). */
export default function Approvals() {
  const [locationId, setLocationId] = useState('');
  const [approving, setApproving] = useState<PendingApprovalDto | null>(null);
  const [rejecting, setRejecting] = useState<BookingDto | null>(null);
  const locs = useQuery({ queryKey: ['admin', 'locations'], queryFn: () => api.get<LocationDto[]>('/admin/locations') });
  const q = useQuery({
    queryKey: ['admin', 'approvals', locationId],
    queryFn: () => api.get<PendingApprovalDto[]>('/admin/approvals', { query: { locationId: locationId || undefined } }),
    refetchInterval: 30_000,
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Solicitudes</h1>
          <p className="muted">Visitas pendientes de aprobación, las más próximas primero.</p>
        </div>
        <select className="select" style={{ width: 'auto' }} value={locationId} onChange={(e) => setLocationId(e.target.value)} aria-label="Ubicación">
          <option value="">Todas las ubicaciones</option>
          {locs.data?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      {q.isLoading ? <Spinner /> : <ErrorBox error={q.error} />}
      {q.data && !q.data.length ? <Empty title="No hay solicitudes pendientes">Las nuevas aparecerán aquí automáticamente.</Empty> : null}

      <div className="stack" style={{ '--gap': '20px' } as React.CSSProperties}>
        {q.data?.map((item) => {
          const b = item.booking;
          const tz = b.location.timezone;
          return (
            <article key={b.id} className="card big stack">
              <div className="row between">
                <div>
                  <div className="row" style={{ gap: 10 }}>
                    <Link href={`/admin/citas/${b.id}`} className="mono" style={{ fontWeight: 700, fontSize: 'var(--t-lg)', color: 'var(--mint)' }}>
                      {b.reference}
                    </Link>
                    <span className="xs muted">
                      solicitada {relativeTime(b.createdAt)} desde {CHANNEL_LABEL[b.channel]}
                    </span>
                  </div>
                  <div className="small" style={{ textTransform: 'capitalize', marginTop: 4 }}>
                    {formatDateLong(b.startsAt, tz)}, <span className="mono">{formatTime(b.startsAt, tz)}</span> · {b.location.name}
                  </div>
                </div>
                <div className="row">
                  <Button variant="danger" onClick={() => setRejecting(b)}>
                    Rechazar
                  </Button>
                  <Button variant="primary" onClick={() => setApproving(item)}>
                    Revisar y aprobar
                  </Button>
                </div>
              </div>

              <div className="grid" style={{ '--min': '300px', alignItems: 'start' } as React.CSSProperties}>
                <div className="stack" style={{ '--gap': '12px' } as React.CSSProperties}>
                  {b.customer ? (
                    <div className="row between card flat" style={{ padding: 12 }}>
                      <div>
                        <Link href={`/admin/clientes/${b.customer.id}`} style={{ fontWeight: 600 }}>
                          {fullName(b.customer)}
                        </Link>
                        <div className="xs muted">{b.customer.email}</div>
                      </div>
                      <KycBadge status={b.customer.kycStatus} />
                    </div>
                  ) : null}
                  {b.exchange ? <ExchangeSummary ex={b.exchange} staff /> : <p className="small muted">{b.service.name}</p>}
                  {item.autoApproveBlockers?.length ? (
                    <p className="xs muted" style={{ margin: 0 }}>
                      No se aprobó sola: {item.autoApproveBlockers.join(' · ')}.
                    </p>
                  ) : null}
                  {b.notes ? <p className="small" style={{ margin: 0 }}>“{b.notes}”</p> : null}
                </div>
                {item.screening ? (
                  <div className="card flat stack" style={{ padding: 14 }}>
                    <div className="row between">
                      <strong className="small">Auditoría de la wallet</strong>
                      {b.exchange ? (
                        <Link className="xs" href={`/admin/wallets/${b.exchange.wallet.id}`}>
                          Ver ficha
                        </Link>
                      ) : null}
                    </div>
                    <ScreeningHeader screening={item.screening} />
                    <ScreeningChecks screening={item.screening} />
                  </div>
                ) : b.exchange ? (
                  <Alert kind="warn">La wallet aún no tiene auditoría.</Alert>
                ) : null}
              </div>
              {b.exchange ? <OpenScanViewer network={b.exchange.network} kind="address" value={b.exchange.wallet.address} title="Revisar la wallet en OpenScan" /> : null}
            </article>
          );
        })}
      </div>

      {approving ? <ApproveModal item={approving} onClose={() => setApproving(null)} /> : null}
      {rejecting ? <RejectModal booking={rejecting} onClose={() => setRejecting(null)} /> : null}
    </div>
  );
}

function ApproveModal({ item, onClose }: { item: PendingApprovalDto; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const b = item.booking;
  const ex = b.exchange;
  const risk = ex?.wallet.riskStatus;
  // Se parte de la cotización que vio el cliente; la oficina la ajusta si hace falta.
  const [f, setF] = useState({ agreedRate: ex?.quotedRate ?? '', fiatAmount: '', feeAmount: '', note: '', override: false });
  const fiat = f.agreedRate && ex ? (Number(ex.amount) * Number(f.agreedRate.replace(',', '.'))).toFixed(2) : '';

  const m = useMutation({
    mutationFn: () =>
      api.post(`/admin/bookings/${b.id}/approve`, {
        agreedRate: f.agreedRate || undefined,
        fiatAmount: f.fiatAmount || fiat || undefined,
        feeAmount: f.feeAmount || undefined,
        note: f.note || undefined,
        overrideWalletReview: f.override,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] });
      toast(`${b.reference} aprobada. Hemos enviado el QR al cliente.`);
      onClose();
    },
  });
  const blockedByRisk = risk === 'BLOCKED' || risk === 'PENDING' || (risk === 'REVIEW' && !f.override);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Aprobar ${b.reference}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={m.isPending} disabled={blockedByRisk} onClick={() => m.mutate()}>
            Aprobar y enviar QR
          </Button>
        </>
      }
    >
      <div className="stack">
        {risk === 'BLOCKED' ? <Alert kind="error">La wallet está bloqueada. Esta solicitud solo se puede rechazar.</Alert> : null}
        {risk === 'PENDING' ? <Alert kind="warn">La wallet no tiene auditoría. Lánzala desde su ficha antes de aprobar.</Alert> : null}
        {risk === 'REVIEW' ? (
          <Alert kind="warn">
            La wallet tiene avisos pendientes de revisar. Lo recomendable es revisarla en su ficha. Si apruebas igualmente, quedará registrado.
            <label className="check" style={{ marginTop: 10 }}>
              <input type="checkbox" checked={f.override} onChange={(e) => setF({ ...f, override: e.target.checked })} />
              <span>Aprobar como excepción, bajo mi responsabilidad</span>
            </label>
          </Alert>
        ) : null}
        {ex ? (
          <>
            <p className="small muted" style={{ margin: 0 }}>
              Condiciones acordadas (opcionales). El cliente las verá en su cita.
              {ex.quotedFiatAmount ? ` Al pedirla se le mostró ${formatEur(ex.quotedFiatAmount)} (tipo ${ex.quotedRate}).` : ''}
            </p>
            <div className="grid" style={{ '--min': '140px' } as React.CSSProperties}>
              <TextInput label="Tipo (EUR por unidad)" inputMode="decimal" value={f.agreedRate} onChange={(e) => setF({ ...f, agreedRate: e.target.value })} placeholder="0,92" />
              <TextInput
                label="Importe en euros"
                inputMode="decimal"
                value={f.fiatAmount}
                onChange={(e) => setF({ ...f, fiatAmount: e.target.value })}
                placeholder={fiat || '—'}
                hint={fiat && !f.fiatAmount ? `Se usará ${fiat} €` : undefined}
              />
              <TextInput label="Comisión (EUR)" inputMode="decimal" value={f.feeAmount} onChange={(e) => setF({ ...f, feeAmount: e.target.value })} />
            </div>
          </>
        ) : null}
        <TextArea label="Nota interna (no la ve el cliente)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={1000} />
        {m.error ? <Alert kind="error">{errorMessage(m.error)}</Alert> : null}
      </div>
    </Modal>
  );
}

function RejectModal({ booking, onClose }: { booking: BookingDto; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => api.post(`/admin/bookings/${booking.id}/reject`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] });
      toast(`${booking.reference} rechazada. Hemos avisado al cliente.`);
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Rechazar ${booking.reference}`}
      footer={
        <>
          <Button onClick={onClose}>Volver</Button>
          <Button variant="danger" loading={m.isPending} disabled={reason.trim().length < 3} onClick={() => m.mutate()}>
            Rechazar solicitud
          </Button>
        </>
      }
    >
      <div className="stack">
        <TextInput
          label="Motivo que verá el cliente"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          placeholder="No tenemos disponibilidad para ese importe ese día"
          hint="Si el motivo es la auditoría de la wallet, no detalles el resultado: indica que no podemos operar con ella."
        />
        {m.error ? <Alert kind="error">{m.error instanceof ApiError ? m.error.message : errorMessage(m.error)}</Alert> : null}
      </div>
    </Modal>
  );
}
