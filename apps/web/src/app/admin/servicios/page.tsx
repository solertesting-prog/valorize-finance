'use client';

import type React from 'react';
import { errorMessage, ServiceDto, serviceSchema } from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Button, ErrorBox, Modal, Spinner, TextInput, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const blank = {
  code: '',
  name: '',
  description: '',
  durationMin: 15,
  bufferMin: 0,
  kind: 'GENERAL' as ServiceDto['kind'],
  requiresKyc: false,
  requiredKycLevel: 1,
  requiresApproval: false,
  active: true,
};

export default function Services() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'services', 'all'], queryFn: () => api.get<ServiceDto[]>('/admin/services', { query: { all: 'true' } }) });
  const [editing, setEditing] = useState<(typeof blank & { id?: string }) | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      const { id, ...rest } = editing!;
      const p = serviceSchema.safeParse({ ...rest, description: rest.description || null });
      if (!p.success) throw new Error(p.error.issues[0].message);
      return id ? api.patch(`/admin/services/${id}`, p.data) : api.post('/admin/services', p.data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'services'] }); setEditing(null); toast('Gestión guardada'); },
  });
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Servicios</h1><p className="muted">Gestiones que los clientes pueden reservar.</p></div>
        {isAdmin ? <Button variant="primary" onClick={() => setEditing({ ...blank })}>Nueva gestión</Button> : null}
      </div>
      {q.isLoading ? <Spinner /> : <ErrorBox error={q.error} />}
      {q.data ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Gestión</th><th>Código</th><th>Duración</th><th>Margen</th><th>Tipo</th><th>Requiere identidad</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {q.data.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong>{s.description ? <div className="xs muted">{s.description}</div> : null}</td>
                  <td className="mono">{s.code}</td>
                  <td className="mono">{s.durationMin} min</td>
                  <td className="mono">{s.bufferMin} min</td>
                  <td>{s.kind === 'CRYPTO_EXCHANGE' ? 'Cambio cripto' : 'General'}{s.requiresApproval ? ' · con aprobación' : ''}</td>
                  <td>{s.requiresKyc ? `Sí (nivel ${s.requiredKycLevel})` : 'No'}</td>
                  <td><span className={`badge ${s.active ? 'ok' : ''}`}>{s.active ? 'Activa' : 'Inactiva'}</span></td>
                  <td>{isAdmin ? <Button size="sm" onClick={() => setEditing({ ...s, description: s.description ?? '' })}>Editar</Button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Editar gestión' : 'Nueva gestión'}
        footer={<><Button onClick={() => setEditing(null)}>Cancelar</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Guardar</Button></>}
      >
        {editing ? (
          <div className="stack">
            <TextInput label="Nombre" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <TextInput label="Código interno" value={editing.code} disabled={!!editing.id} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} hint="Mayúsculas y guiones bajos. No se puede cambiar después." />
            <TextInput label="Descripción para el cliente" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            <div className="grid" style={{ '--min': '140px' } as React.CSSProperties}>
              <TextInput label="Duración (min)" type="number" min={5} value={editing.durationMin} onChange={(e) => setEditing({ ...editing, durationMin: Number(e.target.value) })} />
              <TextInput label="Margen tras la cita (min)" type="number" min={0} value={editing.bufferMin} onChange={(e) => setEditing({ ...editing, bufferMin: Number(e.target.value) })} />
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={editing.kind === 'CRYPTO_EXCHANGE'}
                onChange={(e) => setEditing({ ...editing, kind: e.target.checked ? 'CRYPTO_EXCHANGE' : 'GENERAL', ...(e.target.checked ? { requiresApproval: true, requiresKyc: true } : {}) })}
              />
              <span>Operación de cambio USDT/USDC (pide importe, red y wallet)</span>
            </label>
            <label className="check"><input type="checkbox" checked={editing.requiresApproval} onChange={(e) => setEditing({ ...editing, requiresApproval: e.target.checked })} /><span>Requiere aprobación antes de confirmar la cita</span></label>
            <label className="check"><input type="checkbox" checked={editing.requiresKyc} onChange={(e) => setEditing({ ...editing, requiresKyc: e.target.checked })} /><span>Requiere identidad verificada</span></label>
            {editing.requiresKyc ? <TextInput label="Nivel de verificación exigido" type="number" min={1} max={3} value={editing.requiredKycLevel} onChange={(e) => setEditing({ ...editing, requiredKycLevel: Number(e.target.value) })} /> : null}
            <label className="check"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /><span>Activa</span></label>
            {save.error ? <Alert kind="error">{errorMessage(save.error)}</Alert> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
