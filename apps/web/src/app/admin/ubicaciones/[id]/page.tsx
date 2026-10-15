'use client';

import type React from 'react';
import { errorMessage, LocationDto, locationSchema, ServiceDto } from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { Alert, Button, ErrorBox, Spinner, TextInput, useToast } from '@/components/ui';
import { api } from '@/lib/api';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
type Hours = { weekday: number; opensAt: string; closesAt: string }[];

const empty = {
  name: '', slug: '', address: '', city: 'Barcelona', postalCode: '', country: 'ES', latitude: 41.3874, longitude: 2.1686,
  timezone: 'Europe/Madrid', phone: '', email: '', slotIntervalMin: 15, defaultCapacity: 2, bookingHorizonDays: 60, minNoticeMin: 60, active: true,
};

export default function LocationEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'nueva';
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const loc = useQuery({ queryKey: ['admin', 'location', id], queryFn: () => api.get<LocationDto>(`/admin/locations/${id}`), enabled: !isNew });
  const services = useQuery({ queryKey: ['admin', 'services', 'all'], queryFn: () => api.get<ServiceDto[]>('/admin/services', { query: { all: 'true' } }) });
  const [form, setForm] = useState(empty);
  const [hours, setHours] = useState<Hours>([1, 2, 3, 4, 5].map((d) => ({ weekday: d, opensAt: '09:00', closesAt: '14:00' })));
  const [svc, setSvc] = useState<Record<string, { on: boolean; capacity: string }>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loc.data) return;
    const l = loc.data;
    setForm({ ...empty, ...l, postalCode: l.postalCode ?? '', phone: l.phone ?? '', email: l.email ?? '' });
    setHours(l.openingHours);
    setSvc(Object.fromEntries(l.services.map((s) => [s.id, { on: true, capacity: s.capacity?.toString() ?? '' }])));
  }, [loc.data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        postalCode: form.postalCode || null,
        phone: form.phone || null,
        email: form.email || null,
        openingHours: hours,
        services: Object.entries(svc).filter(([, v]) => v.on).map(([serviceId, v]) => ({ serviceId, capacity: v.capacity ? Number(v.capacity) : null })),
      };
      const parsed = locationSchema.safeParse(payload);
      if (!parsed.success) throw new Error(`${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}`);
      return isNew ? api.post<LocationDto>('/admin/locations', parsed.data) : api.patch<LocationDto>(`/admin/locations/${id}`, parsed.data);
    },
    onSuccess: (l) => {
      qc.invalidateQueries({ queryKey: ['admin'] });
      toast('Ubicación guardada');
      if (isNew) router.replace(`/admin/ubicaciones/${l.id}`);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (!isNew && loc.isLoading) return <Spinner />;
  if (!isNew && !loc.data) return <div className="page"><ErrorBox error={loc.error} /></div>;
  const set = (k: keyof typeof form, numeric = false) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: numeric ? Number(e.target.value) : e.target.value });

  return (
    <div className="page">
      <Link href="/admin/ubicaciones" className="btn ghost sm" style={{ paddingLeft: 0 }}>Ubicaciones</Link>
      <form
        onSubmit={(e: FormEvent) => { e.preventDefault(); setError(null); save.mutate(); }}
        className="stack"
        style={{ '--gap': '20px' } as React.CSSProperties}
      >
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h1>{isNew ? 'Nueva ubicación' : form.name}</h1>
          <Button variant="primary" type="submit" loading={save.isPending}>{isNew ? 'Crear ubicación' : 'Guardar cambios'}</Button>
        </div>
        {error ? <Alert kind="error">{error}</Alert> : null}

        <section className="card stack">
          <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Datos</h2>
          <div className="grid" style={{ '--min': '220px' } as React.CSSProperties}>
            <TextInput label="Nombre" value={form.name} onChange={set('name')} />
            <TextInput label="Identificador en la URL" value={form.slug} onChange={set('slug')} hint="Minúsculas y guiones: barcelona-centro" />
            <TextInput label="Dirección" value={form.address} onChange={set('address')} />
            <TextInput label="Ciudad" value={form.city} onChange={set('city')} />
            <TextInput label="Código postal" value={form.postalCode} onChange={set('postalCode')} />
            <TextInput label="Teléfono" value={form.phone} onChange={set('phone')} placeholder="+34932000000" />
            <TextInput label="Email" type="email" value={form.email} onChange={set('email')} />
            <TextInput label="Latitud" type="number" step="0.000001" value={form.latitude} onChange={set('latitude', true)} />
            <TextInput label="Longitud" type="number" step="0.000001" value={form.longitude} onChange={set('longitude', true)} />
          </div>
          <label className="check"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /><span>Visible y reservable para clientes</span></label>
        </section>

        <section className="card stack">
          <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Capacidad y reglas de reserva</h2>
          <div className="grid" style={{ '--min': '200px' } as React.CSSProperties}>
            <TextInput label="Puestos de atención" type="number" min={1} value={form.defaultCapacity} onChange={set('defaultCapacity', true)} hint="Citas que se pueden atender a la vez." />
            <TextInput label="Intervalo entre horas (min)" type="number" min={5} value={form.slotIntervalMin} onChange={set('slotIntervalMin', true)} />
            <TextInput label="Antelación mínima (min)" type="number" min={0} value={form.minNoticeMin} onChange={set('minNoticeMin', true)} />
            <TextInput label="Reservable hasta (días)" type="number" min={1} value={form.bookingHorizonDays} onChange={set('bookingHorizonDays', true)} />
          </div>
        </section>

        <section className="card stack">
          <div className="row between">
            <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Horario</h2>
            <Button type="button" size="sm" onClick={() => setHours([...hours, { weekday: 1, opensAt: '16:00', closesAt: '19:00' }])}>Añadir tramo</Button>
          </div>
          {[...hours].map((h, i) => (
            <div key={i} className="row">
              <select className="select" style={{ width: 160 }} value={h.weekday} onChange={(e) => setHours(hours.map((x, j) => (j === i ? { ...x, weekday: Number(e.target.value) } : x)))} aria-label="Día">
                {DAYS.map((d, k) => <option key={d} value={k + 1}>{d}</option>)}
              </select>
              <input type="time" className="input" style={{ width: 130 }} value={h.opensAt} onChange={(e) => setHours(hours.map((x, j) => (j === i ? { ...x, opensAt: e.target.value } : x)))} aria-label="Abre" />
              <span className="muted">a</span>
              <input type="time" className="input" style={{ width: 130 }} value={h.closesAt} onChange={(e) => setHours(hours.map((x, j) => (j === i ? { ...x, closesAt: e.target.value } : x)))} aria-label="Cierra" />
              <Button type="button" variant="ghost" size="sm" onClick={() => setHours(hours.filter((_, j) => j !== i))}>Quitar</Button>
            </div>
          ))}
        </section>

        <section className="card stack">
          <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Gestiones disponibles</h2>
          {services.data?.map((s) => {
            const v = svc[s.id] ?? { on: false, capacity: '' };
            return (
              <div key={s.id} className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                <label className="check">
                  <input type="checkbox" checked={v.on} onChange={(e) => setSvc({ ...svc, [s.id]: { ...v, on: e.target.checked } })} />
                  <span>{s.name} <span className="muted">({s.durationMin} min{s.active ? '' : ', inactiva'})</span></span>
                </label>
                <input
                  className="input" style={{ width: 170 }} type="number" min={1} placeholder="Máx. simultáneas"
                  aria-label={`Máximo simultáneo para ${s.name}`} disabled={!v.on} value={v.capacity}
                  onChange={(e) => setSvc({ ...svc, [s.id]: { ...v, capacity: e.target.value } })}
                />
              </div>
            );
          })}
        </section>
      </form>
      {!isNew ? <Closures locationId={id} /> : null}
    </div>
  );
}

function Closures({ locationId }: { locationId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: ['admin', 'closures', locationId], queryFn: () => api.get<{ id: string; date: string; reason: string | null }[]>(`/admin/locations/${locationId}/closures`) });
  const add = useMutation({
    mutationFn: () => api.post<{ affectedBookings: number }>(`/admin/locations/${locationId}/closures`, { date, reason: reason || undefined }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['admin', 'closures', locationId] });
      setDate('');
      setReason('');
      toast(r.affectedBookings ? `Cierre añadido. Hay ${r.affectedBookings} citas ese día que debes reprogramar.` : 'Cierre añadido', r.affectedBookings ? 'error' : 'ok');
    },
  });
  const remove = useMutation({
    mutationFn: (cid: string) => api.delete(`/admin/locations/${locationId}/closures/${cid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'closures', locationId] }),
  });
  return (
    <section className="card stack" style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Días cerrados</h2>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <TextInput label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="grow"><TextInput label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Festivo local" /></div>
        <Button onClick={() => add.mutate()} disabled={!date} loading={add.isPending}>Añadir cierre</Button>
      </div>
      {add.error ? <Alert kind="error">{errorMessage(add.error)}</Alert> : null}
      {q.data?.map((c) => (
        <div key={c.id} className="row between">
          <span className="mono">{c.date}</span>
          <span className="grow muted">{c.reason}</span>
          <Button size="sm" variant="ghost" onClick={() => remove.mutate(c.id)}>Quitar</Button>
        </div>
      ))}
    </section>
  );
}
