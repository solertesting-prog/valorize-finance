'use client';

import { LocationDto } from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ErrorBox, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function AdminLocations() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['admin', 'locations'], queryFn: () => api.get<LocationDto[]>('/admin/locations') });
  return (
    <div className="page">
      <div className="page-head">
        <h1>Ubicaciones</h1>
        {user?.role === 'ADMIN' ? <Link href="/admin/ubicaciones/nueva" className="btn primary">Nueva ubicación</Link> : null}
      </div>
      {q.isLoading ? <Spinner /> : <ErrorBox error={q.error} />}
      {q.data ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nombre</th><th>Dirección</th><th>Puestos</th><th>Gestiones</th><th>Estado</th></tr></thead>
            <tbody>
              {q.data.map((l) => (
                <tr key={l.id}>
                  <td><Link href={`/admin/ubicaciones/${l.id}`}>{l.name}</Link></td>
                  <td>{l.address}, {l.city}</td>
                  <td className="mono">{l.defaultCapacity}</td>
                  <td>{l.services.length}</td>
                  <td><span className={`badge ${l.active ? 'ok' : ''}`}>{l.active ? 'Activa' : 'Inactiva'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
