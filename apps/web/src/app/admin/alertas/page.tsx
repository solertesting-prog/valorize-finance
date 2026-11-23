'use client';

import type React from 'react';
import {
  ALERT_RESOLUTION_LABEL,
  ALERT_RULE_LABEL,
  ALERT_SEVERITY_LABEL,
  ALERT_STATUS_LABEL,
  AlertRule,
  AlertStatus,
  ComplianceAlertDto,
  errorMessage,
  Paginated,
  relativeTime,
} from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, Empty, ErrorBox, Modal, Pager, SelectInput, Spinner, TextArea, useToast } from '@/components/ui';
import { api } from '@/lib/api';

const SEVERITY_TONE = { HIGH: 'bad', MEDIUM: 'warn', LOW: 'info' } as const;

/** Explicación legible de los datos de cada alerta. */
function describe(a: ComplianceAlertDto): string {
  const d = a.details as Record<string, any>;
  switch (a.rule) {
    case 'STRUCTURING':
      return `${d.requests?.length ?? '?'} solicitudes en ${d.days} días justo por debajo de ${d.threshold}: ${(d.requests ?? []).map((r: any) => `${r.reference} (${r.amount})`).join(', ')}`;
    case 'VELOCITY':
      return `${d.requests} solicitudes en ${d.hours} horas`;
    case 'MANY_WALLETS':
      return `${d.wallets} wallets distintas en ${d.days} días`;
    case 'SHARED_WALLET':
      return `La wallet ${d.address} (${d.network}) también está registrada por ${d.otherCustomers?.length ?? 'otro'} cliente(s)`;
    case 'BLOCKED_WALLET_ATTEMPT':
      return `Intentó operar con la wallet bloqueada ${d.address} (${d.network})`;
    case 'REPEATED_REJECTIONS':
      return `${d.rejected} solicitudes rechazadas en ${d.days} días`;
    default:
      return JSON.stringify(d);
  }
}

/**
 * Alertas de cumplimiento: patrones sospechosos detectados automáticamente.
 * Mientras un cliente tenga alertas abiertas, sus solicitudes no se aprueban solas.
 */
export default function Alerts() {
  const [f, setF] = useState<{ status: AlertStatus | ''; rule: AlertRule | ''; page: number }>({ status: '', rule: '', page: 1 });
  const [closing, setClosing] = useState<ComplianceAlertDto | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['admin', 'alerts', f],
    queryFn: () => api.get<Paginated<ComplianceAlertDto>>('/admin/alerts', { query: { status: f.status || undefined, rule: f.rule || undefined, page: f.page, pageSize: 25 } }),
  });
  const review = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/alerts/${id}`, { status: 'IN_REVIEW' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'alerts'] });
      toast('Alerta en revisión');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Alertas de cumplimiento</h1>
          <p className="muted">
            Patrones sospechosos detectados automáticamente. Revisa cada una y ciérrala con una nota. Mientras haya alertas abiertas, las solicitudes del cliente no
            se aprueban solas.
          </p>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        <select className="select" style={{ width: 'auto' }} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as AlertStatus, page: 1 })} aria-label="Estado">
          <option value="">Abiertas y en revisión</option>
          {Object.entries(ALERT_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="select" style={{ width: 'auto' }} value={f.rule} onChange={(e) => setF({ ...f, rule: e.target.value as AlertRule, page: 1 })} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {Object.entries(ALERT_RULE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {q.isLoading ? <Spinner /> : <ErrorBox error={q.error} />}
      {q.data && !q.data.items.length ? <Empty title="No hay alertas con estos filtros">Las nuevas aparecerán aquí automáticamente.</Empty> : null}
      <div className="stack">
        {q.data?.items.map((a) => (
          <article key={a.id} className="card stack" style={{ '--gap': '8px' } as React.CSSProperties}>
            <div className="row between">
              <div className="row" style={{ gap: 8 }}>
                <span className={`badge ${SEVERITY_TONE[a.severity]}`}>{ALERT_SEVERITY_LABEL[a.severity]}</span>
                <strong>{ALERT_RULE_LABEL[a.rule]}</strong>
                <span className="badge">{ALERT_STATUS_LABEL[a.status]}</span>
              </div>
              <span className="xs muted">{relativeTime(a.createdAt)}</span>
            </div>
            <div className="small">
              <Link href={`/admin/clientes/${a.customer.id}`} style={{ fontWeight: 600 }}>
                {a.customer.name}
              </Link>{' '}
              <span className="muted">{a.customer.email}</span>
            </div>
            <p className="small" style={{ margin: 0, overflowWrap: 'anywhere' }}>
              {describe(a)}
            </p>
            <div className="row" style={{ gap: 8 }}>
              {a.bookingId ? (
                <Link className="btn sm" href={`/admin/citas/${a.bookingId}`}>
                  Ver solicitud
                </Link>
              ) : null}
              {a.walletId ? (
                <Link className="btn sm" href={`/admin/wallets/${a.walletId}`}>
                  Ver wallet
                </Link>
              ) : null}
              {a.status === 'OPEN' ? (
                <Button size="sm" loading={review.isPending && review.variables === a.id} onClick={() => review.mutate(a.id)}>
                  Marcar en revisión
                </Button>
              ) : null}
              {a.status !== 'CLOSED' ? (
                <Button size="sm" variant="primary" onClick={() => setClosing(a)}>
                  Cerrar
                </Button>
              ) : null}
            </div>
            {a.status === 'CLOSED' ? (
              <p className="xs muted" style={{ margin: 0 }}>
                {a.resolution ? ALERT_RESOLUTION_LABEL[a.resolution] : 'Cerrada'} por {a.reviewedBy ?? '—'}
                {a.reviewedAt ? ` · ${relativeTime(a.reviewedAt)}` : ''}
                {a.note ? ` · «${a.note}»` : ''}
              </p>
            ) : a.reviewedBy ? (
              <p className="xs muted" style={{ margin: 0 }}>
                En revisión por {a.reviewedBy}
              </p>
            ) : null}
          </article>
        ))}
      </div>
      {q.data ? <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => setF({ ...f, page: p })} /> : null}
      {closing ? <CloseModal alert={closing} onClose={() => setClosing(null)} /> : null}
    </div>
  );
}

function CloseModal({ alert, onClose }: { alert: ComplianceAlertDto; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [resolution, setResolution] = useState<'FALSE_POSITIVE' | 'ACTION_TAKEN' | 'REPORTED'>('FALSE_POSITIVE');
  const [note, setNote] = useState('');
  const m = useMutation({
    mutationFn: () => api.patch(`/admin/alerts/${alert.id}`, { status: 'CLOSED', resolution, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] });
      toast('Alerta cerrada');
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Cerrar: ${ALERT_RULE_LABEL[alert.rule]}`}
      footer={
        <>
          <Button onClick={onClose}>Volver</Button>
          <Button variant="primary" loading={m.isPending} disabled={note.trim().length < 3} onClick={() => m.mutate()}>
            Cerrar alerta
          </Button>
        </>
      }
    >
      <div className="stack">
        <SelectInput label="Resolución" value={resolution} onChange={(e) => setResolution(e.target.value as typeof resolution)}>
          {Object.entries(ALERT_RESOLUTION_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </SelectInput>
        <TextArea label="Nota (queda en el registro de auditoría)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Qué se ha comprobado y por qué se cierra" />
        {resolution === 'REPORTED' ? (
          <Alert kind="info">La comunicación al regulador (SEPBLAC) se hace por su canal oficial; aquí solo se deja constancia.</Alert>
        ) : null}
        {m.error ? <Alert kind="error">{errorMessage(m.error)}</Alert> : null}
      </div>
    </Modal>
  );
}
