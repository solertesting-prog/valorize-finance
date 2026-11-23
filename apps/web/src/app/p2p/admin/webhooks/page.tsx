'use client';

import type React from 'react';
import { errorMessage, Paginated, WEBHOOK_EVENTS, WebhookDeliveryDto, WebhookEndpointDto } from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Button, Empty, ErrorBox, Modal, Spinner, TextInput, useToast } from '@/components/ui';
import { api } from '@/lib/api';

/** Avisos automáticos a sistemas externos (CRM, contabilidad…) cuando ocurre algo en Valorize. */
export default function Webhooks() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'webhooks'], queryFn: () => api.get<WebhookEndpointDto[]>('/admin/webhooks') });
  const [draft, setDraft] = useState<{ url: string; description: string; events: string[] } | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [viewing, setViewing] = useState<WebhookEndpointDto | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'webhooks'] });

  const create = useMutation({
    mutationFn: () => api.post<WebhookEndpointDto & { secret: string }>('/admin/webhooks', { ...draft, description: draft?.description || undefined }),
    onSuccess: (r) => { setDraft(null); setSecret(r.secret); refresh(); },
  });
  const toggle = useMutation({ mutationFn: (w: WebhookEndpointDto) => api.patch(`/admin/webhooks/${w.id}`, { active: !w.active }), onSuccess: refresh });
  const test = useMutation({ mutationFn: (id: string) => api.post(`/admin/webhooks/${id}/test`), onSuccess: () => toast('Evento de prueba enviado') });
  const rotate = useMutation({ mutationFn: (id: string) => api.post<{ secret: string }>(`/admin/webhooks/${id}/rotate-secret`), onSuccess: (r) => { setSecret(r.secret); refresh(); } });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/admin/webhooks/${id}`), onSuccess: refresh });

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Webhooks</h1><p className="muted">Avisa a otros sistemas cuando se crea una cita, se hace check-in o cambia una verificación.</p></div>
        <Button variant="primary" onClick={() => setDraft({ url: 'https://', description: '', events: [] })}>Añadir destino</Button>
      </div>
      {q.isLoading ? <Spinner /> : <ErrorBox error={q.error} />}
      {q.data && !q.data.length ? <Empty title="No hay destinos configurados" /> : null}
      <div className="stack">
        {q.data?.map((w) => (
          <article key={w.id} className="card stack">
            <div className="row between">
              <div className="grow">
                <div className="mono" style={{ wordBreak: 'break-all' }}>{w.url}</div>
                {w.description ? <div className="small muted">{w.description}</div> : null}
              </div>
              <span className={`badge ${w.active ? 'ok' : ''}`}>{w.active ? 'Activo' : 'Pausado'}</span>
            </div>
            <div className="row" style={{ gap: 6 }}>{w.events.map((e) => <span key={e} className="badge mono">{e}</span>)}</div>
            <div className="row between">
              <span className="xs muted">
                Firma <span className="mono">{w.secretPreview}</span>
                {w.lastDelivery ? ` · Última entrega: ${w.lastDelivery.status === 'SUCCEEDED' ? 'correcta' : w.lastDelivery.status === 'FAILED' ? 'fallida' : 'pendiente'}${w.lastDelivery.responseCode ? ` (${w.lastDelivery.responseCode})` : ''}` : ''}
              </span>
              <div className="row">
                <Button size="sm" onClick={() => setViewing(w)}>Entregas</Button>
                <Button size="sm" onClick={() => test.mutate(w.id)}>Enviar prueba</Button>
                <Button size="sm" onClick={() => toggle.mutate(w)}>{w.active ? 'Pausar' : 'Activar'}</Button>
                <Button size="sm" onClick={() => rotate.mutate(w.id)}>Rotar secreto</Button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(w.id)}>Eliminar</Button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title="Nuevo destino"
        footer={<><Button onClick={() => setDraft(null)}>Cancelar</Button><Button variant="primary" loading={create.isPending} disabled={!draft?.events.length} onClick={() => create.mutate()}>Crear</Button></>}
      >
        {draft ? (
          <div className="stack">
            <TextInput label="URL (HTTPS)" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
            <TextInput label="Descripción" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="CRM comercial" />
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="small" style={{ fontWeight: 600, marginBottom: 8 }}>Eventos</legend>
              <div className="grid" style={{ '--min': '200px', gap: 8 } as React.CSSProperties}>
                {WEBHOOK_EVENTS.map((ev) => (
                  <label key={ev} className="check">
                    <input type="checkbox" checked={draft.events.includes(ev)} onChange={(e) => setDraft({ ...draft, events: e.target.checked ? [...draft.events, ev] : draft.events.filter((x) => x !== ev) })} />
                    <span className="mono">{ev}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {create.error ? <Alert kind="error">{errorMessage(create.error)}</Alert> : null}
          </div>
        ) : null}
      </Modal>

      <Modal open={!!secret} onClose={() => setSecret(null)} title="Secreto de firma" footer={<Button variant="primary" onClick={() => setSecret(null)}>Lo he guardado</Button>}>
        <div className="stack">
          <Alert kind="warn">Cópialo ahora: no se volverá a mostrar completo.</Alert>
          <pre className="card mono small" style={{ margin: 0, wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{secret}</pre>
          <p className="xs muted" style={{ margin: 0 }}>
            Cada envío incluye la cabecera <span className="mono">X-Valorize-Signature: t=…,v1=…</span>, un HMAC-SHA256 de <span className="mono">t.cuerpo</span> con este secreto.
          </p>
        </div>
      </Modal>

      {viewing ? <Deliveries endpoint={viewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}

function Deliveries({ endpoint, onClose }: { endpoint: WebhookEndpointDto; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'webhooks', endpoint.id, 'deliveries'],
    queryFn: () => api.get<Paginated<WebhookDeliveryDto>>(`/admin/webhooks/${endpoint.id}/deliveries`, { query: { pageSize: 30 } }),
    refetchInterval: 5000,
  });
  const redeliver = useMutation({
    mutationFn: (id: string) => api.post(`/admin/webhooks/deliveries/${id}/redeliver`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'webhooks', endpoint.id, 'deliveries'] }),
  });
  return (
    <Modal open onClose={onClose} title="Últimas entregas" footer={<Button onClick={onClose}>Cerrar</Button>}>
      {q.isLoading ? <Spinner /> : null}
      <div className="stack" style={{ '--gap': '8px', maxHeight: 420, overflowY: 'auto' } as React.CSSProperties}>
        {q.data?.items.map((d) => (
          <div key={d.id} className="row between small" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
            <span className="mono">{d.event}</span>
            <span className={`badge ${d.status === 'SUCCEEDED' ? 'ok' : d.status === 'FAILED' ? 'bad' : 'warn'}`}>
              {d.status === 'SUCCEEDED' ? 'Entregado' : d.status === 'FAILED' ? 'Fallido' : `Reintentando (${d.attempts})`}
            </span>
            <span className="xs muted">{d.responseCode ?? d.error ?? ''}</span>
            {d.status === 'FAILED' ? <Button size="sm" onClick={() => redeliver.mutate(d.id)}>Reintentar</Button> : null}
          </div>
        ))}
        {q.data && !q.data.items.length ? <p className="muted small">Aún no hay entregas.</p> : null}
      </div>
    </Modal>
  );
}
