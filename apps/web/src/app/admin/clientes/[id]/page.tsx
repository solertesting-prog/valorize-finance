'use client';

import type React from 'react';
import { AdminUserDto, BookingDto, errorMessage, formatDate, formatTime, KycProfileDto, Paginated } from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, ErrorBox, KycBadge, Modal, Spinner, StatusBadge, TextInput, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Detail = { user: AdminUserDto; sessions: { id: string; client: string; userAgent: string | null; ip: string | null; createdAt: string }[] };

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const d = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => api.get<Detail>(`/admin/users/${id}`) });
  const bookings = useQuery({
    queryKey: ['admin', 'user', id, 'bookings'],
    queryFn: () => api.get<Paginated<BookingDto>>('/admin/bookings', { query: { userId: id, pageSize: 20, scope: 'past' } }),
  });
  const kyc = useQuery({ queryKey: ['admin', 'user', id, 'kyc'], queryFn: () => api.get<KycProfileDto>(`/admin/kyc/users/${id}`) });
  const [reject, setReject] = useState(false);
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'user', id] });
  const review = useMutation({
    mutationFn: (decision: 'APPROVED' | 'REJECTED') =>
      api.post(`/admin/kyc/users/${id}/review`, {
        decision,
        reason: decision === 'REJECTED' ? reason : undefined,
        expiresAt: decision === 'APPROVED' && expiresAt ? new Date(`${expiresAt}T23:59:59Z`).toISOString() : undefined,
      }),
    onSuccess: (_, decision) => {
      invalidate();
      setReject(false);
      toast(decision === 'APPROVED' ? 'Identidad verificada' : 'Verificación rechazada');
    },
  });
  const status = useMutation({
    mutationFn: (s: 'ACTIVE' | 'SUSPENDED') => api.patch(`/admin/users/${id}`, { status: s }),
    onSuccess: () => { invalidate(); toast('Estado actualizado'); },
  });
  const revoke = useMutation({
    mutationFn: () => api.post(`/admin/users/${id}/revoke-sessions`),
    onSuccess: () => { invalidate(); toast('Sesiones cerradas'); },
  });

  async function openFile(fileId: string) {
    const r = await api.get<{ url: string }>(`/files/${fileId}/url`);
    window.open(r.url, '_blank', 'noopener');
  }

  if (d.isLoading) return <Spinner />;
  if (!d.data) return <div className="page"><ErrorBox error={d.error} /></div>;
  const u = d.data.user;
  const k = kyc.data;
  const exp = (e: string) => k?.requirements.find((r) => r.key === e);

  return (
    <div className="page">
      <Link href="/admin/clientes" className="btn ghost sm" style={{ paddingLeft: 0 }}>Clientes</Link>
      <div className="page-head">
        <div>
          <h1>{u.firstName} {u.lastName}</h1>
          <p className="muted">{u.email} · {u.phone ?? 'sin teléfono'}</p>
        </div>
        <div className="row">
          {u.status === 'ACTIVE' ? (
            <Button variant="danger" onClick={() => status.mutate('SUSPENDED')} loading={status.isPending}>Suspender cuenta</Button>
          ) : (
            <Button onClick={() => status.mutate('ACTIVE')} loading={status.isPending}>Reactivar cuenta</Button>
          )}
        </div>
      </div>

      <div className="grid" style={{ '--min': '340px', alignItems: 'start' } as React.CSSProperties}>
        <section className="card stack" id="kyc">
          <div className="row between">
            <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Verificación de identidad</h2>
            {k ? <KycBadge status={k.status} /> : null}
          </div>
          {kyc.isLoading ? <Spinner /> : <ErrorBox error={kyc.error} />}
          {k ? (
            <>
              <p className="xs muted" style={{ margin: 0 }}>Tu acceso a estos datos queda registrado en la auditoría.</p>
              <dl className="stack" style={{ '--gap': '10px', margin: 0 } as React.CSSProperties}>
                {k.fields.map((f) => (
                  <div key={f.key} className="row between" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
                    <dt className="small muted">{exp(f.key)?.label ?? f.key}</dt>
                    <dd style={{ margin: 0, textAlign: 'right' }}>
                      {f.fileId ? <Button size="sm" onClick={() => openFile(f.fileId!)}>Ver {f.fileName}</Button> : f.value ?? '–'}
                    </dd>
                  </div>
                ))}
              </dl>
              {k.rejectionReason ? <Alert kind="error">Último rechazo: {k.rejectionReason}</Alert> : null}
              {k.status === 'IN_REVIEW' ? (
                <div className="stack">
                  <TextInput label="Caducidad de la verificación (opcional)" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} hint="Normalmente, la fecha de caducidad del documento." />
                  <div className="row">
                    <Button variant="primary" loading={review.isPending} onClick={() => review.mutate('APPROVED')}>Aprobar</Button>
                    <Button variant="danger" onClick={() => setReject(true)}>Rechazar</Button>
                  </div>
                  {review.error ? <Alert kind="error">{errorMessage(review.error)}</Alert> : null}
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <div className="stack">
          <section className="card stack">
            <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Cuenta</h2>
            <div className="row between small"><span className="muted">Email</span><span className={`badge ${u.emailVerified ? 'ok' : 'warn'}`}>{u.emailVerified ? 'Verificado' : 'Sin verificar'}</span></div>
            <div className="row between small"><span className="muted">Teléfono</span><span className={`badge ${u.phoneVerified ? 'ok' : 'warn'}`}>{u.phoneVerified ? 'Verificado' : 'Sin verificar'}</span></div>
            <div className="row between small"><span className="muted">Dos pasos</span><span>{u.mfaEnabled ? 'Activado' : 'No'}</span></div>
            <div className="row between small"><span className="muted">Último acceso</span><span>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('es-ES') : '–'}</span></div>
            <div className="row between small"><span className="muted">Sesiones abiertas</span><span>{d.data.sessions.length}</span></div>
            {d.data.sessions.length && me?.id !== u.id ? <div><Button size="sm" onClick={() => revoke.mutate()} loading={revoke.isPending}>Cerrar todas sus sesiones</Button></div> : null}
          </section>

          <section className="card">
            <h2 style={{ fontSize: 'var(--t-lg)' }}>Citas</h2>
            {bookings.data?.items.length ? (
              <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, '--gap': '8px' } as React.CSSProperties}>
                {bookings.data.items.map((b) => (
                  <li key={b.id} className="row between">
                    <Link href={`/admin/citas/${b.id}`} className="mono">{b.reference}</Link>
                    <span className="small" style={{ textTransform: 'capitalize' }}>{formatDate(b.startsAt, b.location.timezone)} {formatTime(b.startsAt, b.location.timezone)}</span>
                    <StatusBadge status={b.status} />
                  </li>
                ))}
              </ul>
            ) : <p className="muted small" style={{ margin: 0 }}>Sin citas.</p>}
          </section>
        </div>
      </div>

      <Modal
        open={reject}
        onClose={() => setReject(false)}
        title="Rechazar verificación"
        footer={<><Button onClick={() => setReject(false)}>Volver</Button><Button variant="danger" disabled={reason.trim().length < 3} loading={review.isPending} onClick={() => review.mutate('REJECTED')}>Rechazar</Button></>}
      >
        <TextInput label="Motivo que verá el cliente" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="El documento está caducado" />
      </Modal>
    </div>
  );
}
