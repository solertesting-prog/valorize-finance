'use client';

import type React from 'react';
import { AdminUserDto, errorMessage, LocationDto, Paginated, Role, ROLE_LABEL } from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Button, ErrorBox, Modal, Pager, SelectInput, Spinner, TextInput, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Draft = { id?: string; email: string; firstName: string; lastName: string; phone: string; role: Role; locationIds: string[]; status?: string };

export default function Team() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [role, setRole] = useState<Role | ''>('');
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const locs = useQuery({ queryKey: ['admin', 'locations'], queryFn: () => api.get<LocationDto[]>('/admin/locations') });
  const q = useQuery({
    queryKey: ['admin', 'team', role, page],
    queryFn: async () => {
      // Equipo = todos los roles salvo cliente.
      const roles: Role[] = role ? [role] : ['EMPLOYEE', 'MANAGER', 'ADMIN'];
      const pages = await Promise.all(roles.map((r) => api.get<Paginated<AdminUserDto>>('/admin/users', { query: { role: r, page, pageSize: 50 } })));
      return { items: pages.flatMap((p) => p.items), total: pages.reduce((a, p) => a + p.total, 0) };
    },
  });
  const locName = (id: string) => locs.data?.find((l) => l.id === id)?.name ?? '';
  const assignable: Role[] = user?.role === 'ADMIN' ? ['EMPLOYEE', 'MANAGER', 'ADMIN'] : ['EMPLOYEE'];

  const save = useMutation({
    mutationFn: async () => {
      const d = draft!;
      if (d.id) return api.patch(`/admin/users/${d.id}`, { role: d.role, locationIds: d.locationIds });
      return api.post('/admin/users', { email: d.email, firstName: d.firstName, lastName: d.lastName, phone: d.phone || undefined, role: d.role, locationIds: d.locationIds });
    },
    onSuccess: () => {
      toast(draft?.id ? 'Cambios guardados' : 'Invitación enviada: recibirá un código por email para crear su contraseña');
      setDraft(null);
      qc.invalidateQueries({ queryKey: ['admin', 'team'] });
    },
  });
  const status = useMutation({
    mutationFn: (v: { id: string; status: 'ACTIVE' | 'SUSPENDED' }) => api.patch(`/admin/users/${v.id}`, { status: v.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'team'] }),
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Equipo y roles</h1><p className="muted">Quién trabaja en cada oficina y qué puede hacer.</p></div>
        <Button variant="primary" onClick={() => setDraft({ email: '', firstName: '', lastName: '', phone: '', role: 'EMPLOYEE', locationIds: [] })}>Añadir persona</Button>
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        <select className="select" style={{ width: 'auto' }} value={role} onChange={(e) => { setRole(e.target.value as Role); setPage(1); }} aria-label="Rol">
          <option value="">Todos los roles</option>
          {(['EMPLOYEE', 'MANAGER', 'ADMIN'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </div>
      <dl className="grid small" style={{ '--min': '220px', marginBottom: 20 } as React.CSSProperties}>
        <div className="card flat"><dt style={{ fontWeight: 700 }}>Empleado</dt><dd className="muted" style={{ margin: 0 }}>Panel de atención de sus oficinas: agenda, escáner, check-in e incidencias.</dd></div>
        <div className="card flat"><dt style={{ fontWeight: 700 }}>Responsable</dt><dd className="muted" style={{ margin: 0 }}>Además, backoffice: clientes, verificaciones, citas, horarios y empleados.</dd></div>
        <div className="card flat"><dt style={{ fontWeight: 700 }}>Administrador</dt><dd className="muted" style={{ margin: 0 }}>Acceso total, incluidos auditoría, webhooks y requisitos KYC.</dd></div>
      </dl>
      {q.isLoading ? <Spinner /> : <ErrorBox error={q.error} />}
      {q.data ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Persona</th><th>Rol</th><th>Oficinas</th><th>Dos pasos</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {q.data.items.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.firstName} {u.lastName}</strong><div className="xs muted">{u.email}</div></td>
                  <td>{ROLE_LABEL[u.role]}</td>
                  <td className="small">{u.role === 'ADMIN' ? 'Todas' : u.locationIds.map(locName).join(', ') || <span className="muted">Ninguna</span>}</td>
                  <td><span className={`badge ${u.mfaEnabled ? 'ok' : 'warn'}`}>{u.mfaEnabled ? 'Activo' : 'Pendiente'}</span></td>
                  <td><span className={`badge ${u.status === 'ACTIVE' ? 'ok' : 'bad'}`}>{u.status === 'ACTIVE' ? 'Activo' : 'Suspendido'}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    {u.id !== user?.id && (u.role !== 'ADMIN' || user?.role === 'ADMIN') ? (
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <Button size="sm" onClick={() => setDraft({ id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, phone: u.phone ?? '', role: u.role, locationIds: u.locationIds })}>Editar</Button>
                        <Button size="sm" variant="ghost" onClick={() => status.mutate({ id: u.id, status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}>
                          {u.status === 'ACTIVE' ? 'Suspender' : 'Reactivar'}
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {q.data ? <Pager page={page} pageSize={50} total={q.data.total} onPage={setPage} /> : null}

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? `Editar a ${draft.firstName}` : 'Añadir persona al equipo'}
        footer={<><Button onClick={() => setDraft(null)}>Cancelar</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>{draft?.id ? 'Guardar' : 'Enviar invitación'}</Button></>}
      >
        {draft ? (
          <div className="stack">
            {!draft.id ? (
              <>
                <div className="grid" style={{ '--min': '150px' } as React.CSSProperties}>
                  <TextInput label="Nombre" value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} />
                  <TextInput label="Apellidos" value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} />
                </div>
                <TextInput label="Email de trabajo" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </>
            ) : null}
            <SelectInput label="Rol" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
              {assignable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </SelectInput>
            {draft.role !== 'ADMIN' ? (
              <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, '--gap': '8px' } as React.CSSProperties}>
                <legend className="small" style={{ fontWeight: 600, marginBottom: 8 }}>Oficinas</legend>
                {locs.data?.map((l) => (
                  <label key={l.id} className="check">
                    <input
                      type="checkbox"
                      checked={draft.locationIds.includes(l.id)}
                      onChange={(e) => setDraft({ ...draft, locationIds: e.target.checked ? [...draft.locationIds, l.id] : draft.locationIds.filter((x) => x !== l.id) })}
                    />
                    <span>{l.name}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            {save.error ? <Alert kind="error">{errorMessage(save.error)}</Alert> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
