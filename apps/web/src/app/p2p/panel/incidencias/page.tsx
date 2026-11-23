'use client';

import type React from 'react';
import { errorMessage, IncidentDto, IncidentStatus, IncidentType, Paginated, relativeTime } from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useStaffLocation } from '@/components/shells';
import { Alert, Button, Empty, ErrorBox, Modal, Pager, SelectInput, Spinner, TextArea, useToast } from '@/components/ui';
import { api } from '@/lib/api';

const TYPE_LABEL: Record<IncidentType, string> = {
  INVALID_QR: 'QR no válido',
  IDENTITY_MISMATCH: 'La identidad no coincide',
  CUSTOMER_COMPLAINT: 'Queja del cliente',
  TECHNICAL: 'Problema técnico',
  OTHER: 'Otra',
};
const STATUS_LABEL: Record<IncidentStatus, string> = { OPEN: 'Abierta', IN_PROGRESS: 'En curso', RESOLVED: 'Resuelta' };
const TONE: Record<IncidentStatus, string> = { OPEN: 'bad', IN_PROGRESS: 'warn', RESOLVED: 'ok' };

function Incidents() {
  const params = useSearchParams();
  const { location } = useStaffLocation();
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<IncidentStatus | ''>('OPEN');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(params.get('nueva') === '1');
  const [type, setType] = useState<IncidentType>((params.get('tipo') as IncidentType) ?? 'OTHER');
  const [description, setDescription] = useState('');
  const [resolving, setResolving] = useState<IncidentDto | null>(null);
  const [resolution, setResolution] = useState('');

  const q = useQuery({
    queryKey: ['staff', 'incidents', location?.id, status, page],
    queryFn: () => api.get<Paginated<IncidentDto>>('/staff/incidents', { query: { locationId: location?.id, status, page } }),
    enabled: !!location,
  });
  const create = useMutation({
    mutationFn: () => api.post('/staff/incidents', { locationId: location!.id, bookingId: params.get('booking') || null, type, description }),
    onSuccess: () => {
      setOpen(false);
      setDescription('');
      qc.invalidateQueries({ queryKey: ['staff', 'incidents'] });
      toast('Incidencia registrada');
    },
  });
  const update = useMutation({
    mutationFn: (v: { id: string; status: IncidentStatus; resolution?: string }) => api.patch(`/staff/incidents/${v.id}`, v),
    onSuccess: () => {
      setResolving(null);
      setResolution('');
      qc.invalidateQueries({ queryKey: ['staff', 'incidents'] });
    },
  });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Incidencias</h1>
        <Button variant="primary" onClick={() => setOpen(true)}>
          Registrar incidencia
        </Button>
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        {(['OPEN', 'IN_PROGRESS', 'RESOLVED', ''] as const).map((s) => (
          <button key={s || 'all'} className={`btn sm ${status === s ? 'primary' : ''}`} onClick={() => { setStatus(s); setPage(1); }}>
            {s ? STATUS_LABEL[s] : 'Todas'}
          </button>
        ))}
      </div>
      {q.isLoading ? <Spinner /> : <ErrorBox error={q.error} />}
      {q.data && !q.data.items.length ? <Empty title="No hay incidencias" /> : null}
      <div className="stack">
        {q.data?.items.map((i) => (
          <article key={i.id} className="card stack" style={{ '--gap': '8px' } as React.CSSProperties}>
            <div className="row between">
              <strong>{TYPE_LABEL[i.type]}</strong>
              <span className={`badge ${TONE[i.status]}`}>{STATUS_LABEL[i.status]}</span>
            </div>
            <p style={{ margin: 0 }}>{i.description}</p>
            {i.resolution ? <p className="small muted" style={{ margin: 0 }}>Resolución: {i.resolution}</p> : null}
            <div className="row between">
              <span className="xs muted">
                {i.reportedBy.name} · {relativeTime(i.createdAt)}
                {i.bookingReference ? ` · ${i.bookingReference}` : ''}
              </span>
              {i.status !== 'RESOLVED' ? (
                <div className="row">
                  {i.status === 'OPEN' ? (
                    <Button size="sm" onClick={() => update.mutate({ id: i.id, status: 'IN_PROGRESS' })}>
                      Atender
                    </Button>
                  ) : null}
                  <Button size="sm" variant="primary" onClick={() => setResolving(i)}>
                    Resolver
                  </Button>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {q.data ? <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} /> : null}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Registrar incidencia"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="primary" loading={create.isPending} disabled={description.trim().length < 3} onClick={() => create.mutate()}>
              Registrar
            </Button>
          </>
        }
      >
        <div className="stack">
          <SelectInput label="Tipo" value={type} onChange={(e) => setType(e.target.value as IncidentType)}>
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </SelectInput>
          <TextArea label="Qué ha pasado" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
          {create.error ? <Alert kind="error">{errorMessage(create.error)}</Alert> : null}
        </div>
      </Modal>

      <Modal
        open={!!resolving}
        onClose={() => setResolving(null)}
        title="Resolver incidencia"
        footer={
          <>
            <Button onClick={() => setResolving(null)}>Cancelar</Button>
            <Button variant="primary" loading={update.isPending} onClick={() => update.mutate({ id: resolving!.id, status: 'RESOLVED', resolution })}>
              Marcar como resuelta
            </Button>
          </>
        }
      >
        <TextArea label="Cómo se ha resuelto" value={resolution} onChange={(e) => setResolution(e.target.value)} maxLength={2000} />
      </Modal>
    </div>
  );
}

export default function IncidentsPage() {
  return (
    <Suspense>
      <Incidents />
    </Suspense>
  );
}
