'use client';

import type React from 'react';
import { errorMessage, KycFieldType, KycRequirementDto, kycRequirementSchema } from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Button, ErrorBox, Modal, SelectInput, Spinner, TextInput, useToast } from '@/components/ui';
import { api } from '@/lib/api';

const TYPE_LABEL: Record<KycFieldType, string> = {
  TEXT: 'Texto', NUMBER: 'Número', DATE: 'Fecha', SELECT: 'Lista de opciones', COUNTRY: 'País', DOCUMENT: 'Documento (subida)', BOOLEAN: 'Casilla sí/no',
};
type Draft = Omit<KycRequirementDto, 'id' | 'options'> & { id?: string; options: string };
const blank: Draft = { key: '', label: '', helpText: '', type: 'TEXT', required: true, options: '', sortOrder: 100, active: true, level: 1 };

/** Qué datos se piden a los clientes para verificar su identidad. */
export default function KycRequirements() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'kyc-reqs'], queryFn: () => api.get<KycRequirementDto[]>('/admin/kyc/requirements', { query: { all: 'true' } }) });
  const [draft, setDraft] = useState<Draft | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      const { id, ...d } = draft!;
      const p = kycRequirementSchema.safeParse({ ...d, helpText: d.helpText || null, options: d.options.split('\n').map((s) => s.trim()).filter(Boolean) });
      if (!p.success) throw new Error(p.error.issues[0].message);
      return id ? api.patch(`/admin/kyc/requirements/${id}`, p.data) : api.post('/admin/kyc/requirements', p.data);
    },
    onSuccess: () => { setDraft(null); qc.invalidateQueries({ queryKey: ['admin', 'kyc-reqs'] }); toast('Requisito guardado'); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete<{ deactivated?: boolean }>(`/admin/kyc/requirements/${id}`),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['admin', 'kyc-reqs'] }); toast(r?.deactivated ? 'Tiene datos guardados: lo hemos desactivado' : 'Requisito eliminado'); },
  });

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Requisitos KYC</h1><p className="muted">Los campos que verá el cliente en su verificación de identidad.</p></div>
        <Button variant="primary" onClick={() => setDraft({ ...blank })}>Añadir campo</Button>
      </div>
      {q.isLoading ? <Spinner /> : <ErrorBox error={q.error} />}
      {q.data ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Orden</th><th>Campo</th><th>Tipo</th><th>Nivel</th><th>Obligatorio</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {q.data.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.sortOrder}</td>
                  <td><strong>{r.label}</strong><div className="xs muted mono">{r.key}</div></td>
                  <td>{TYPE_LABEL[r.type]}</td>
                  <td className="mono">{r.level}</td>
                  <td>{r.required ? 'Sí' : 'No'}</td>
                  <td><span className={`badge ${r.active ? 'ok' : ''}`}>{r.active ? 'Activo' : 'Inactivo'}</span></td>
                  <td>
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <Button size="sm" onClick={() => setDraft({ ...r, helpText: r.helpText ?? '', options: r.options.join('\n') })}>Editar</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)}>Quitar</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar campo' : 'Nuevo campo'}
        footer={<><Button onClick={() => setDraft(null)}>Cancelar</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Guardar</Button></>}
      >
        {draft ? (
          <div className="stack">
            <TextInput label="Nombre visible" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            <TextInput label="Clave técnica" value={draft.key} disabled={!!draft.id} onChange={(e) => setDraft({ ...draft, key: e.target.value })} hint="snake_case, no se puede cambiar: p. ej. tax_id" />
            <TextInput label="Ayuda para el cliente" value={draft.helpText ?? ''} onChange={(e) => setDraft({ ...draft, helpText: e.target.value })} />
            <SelectInput label="Tipo" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as KycFieldType })}>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectInput>
            {draft.type === 'SELECT' ? (
              <div className="field">
                <label htmlFor="opts">Opciones (una por línea)</label>
                <textarea id="opts" className="textarea" value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} />
              </div>
            ) : null}
            <div className="grid" style={{ '--min': '120px' } as React.CSSProperties}>
              <TextInput label="Nivel" type="number" min={1} max={3} value={draft.level} onChange={(e) => setDraft({ ...draft, level: Number(e.target.value) })} />
              <TextInput label="Orden" type="number" min={0} value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} />
            </div>
            <label className="check"><input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} /><span>Obligatorio para enviar a revisión</span></label>
            <label className="check"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /><span>Activo</span></label>
            {save.error ? <Alert kind="error">{errorMessage(save.error)}</Alert> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
