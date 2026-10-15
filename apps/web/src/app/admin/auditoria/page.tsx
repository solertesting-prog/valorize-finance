'use client';

import { AuditLogDto, Paginated, ROLE_LABEL } from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Empty, ErrorBox, Pager, Spinner } from '@/components/ui';
import { api } from '@/lib/api';

const ACTIONS = [
  ['', 'Todas las acciones'],
  ['auth.', 'Accesos y seguridad'],
  ['booking.', 'Citas y escaneos'],
  ['kyc.', 'Verificaciones'],
  ['file.', 'Acceso a documentos'],
  ['user.', 'Usuarios'],
  ['location.', 'Ubicaciones'],
  ['incident.', 'Incidencias'],
];

/** Registro inmutable: quién hizo qué, cuándo y desde dónde. */
export default function Audit() {
  const [f, setF] = useState({ action: '', entityId: '', page: 1 });
  const q = useQuery({
    queryKey: ['admin', 'audit', f],
    queryFn: () => api.get<Paginated<AuditLogDto>>('/admin/audit', { query: { ...f, pageSize: 50 } }),
  });

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Auditoría</h1><p className="muted">Registro inalterable de accesos, escaneos y cambios de estado.</p></div>
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        <select className="select" style={{ width: 'auto' }} value={f.action} onChange={(e) => setF({ ...f, action: e.target.value, page: 1 })} aria-label="Tipo de acción">
          {ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input className="input mono" style={{ maxWidth: 360 }} placeholder="ID de cita, usuario…" value={f.entityId} onChange={(e) => setF({ ...f, entityId: e.target.value.trim(), page: 1 })} aria-label="Identificador" />
      </div>
      {q.isLoading ? <Spinner /> : <ErrorBox error={q.error} />}
      {q.data && !q.data.items.length ? <Empty title="Sin registros" /> : null}
      {q.data?.items.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Cuándo</th><th>Acción</th><th>Quién</th><th>Sobre</th><th>Origen</th></tr></thead>
            <tbody>
              {q.data.items.map((a) => (
                <tr key={a.id}>
                  <td className="mono xs" style={{ whiteSpace: 'nowrap' }}>{new Date(a.createdAt).toLocaleString('es-ES')}</td>
                  <td className="mono">{a.action}</td>
                  <td>{a.actor ? <>{a.actor.name} <span className="xs muted">{ROLE_LABEL[a.actor.role]}</span></> : <span className="muted">Sistema</span>}</td>
                  <td className="mono xs">
                    {a.entityType ? `${a.entityType} ` : ''}
                    {a.entityId ? <button className="btn ghost sm mono" style={{ padding: 0, minHeight: 0 }} onClick={() => setF({ ...f, entityId: a.entityId!, page: 1 })}>{a.entityId.slice(0, 8)}</button> : null}
                  </td>
                  <td className="xs muted">{a.ip ?? ''}</td>
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
