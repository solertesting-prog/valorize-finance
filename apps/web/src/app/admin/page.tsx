'use client';

import type React from 'react';
import { addDaysIso, AnalyticsDto, LocationDto, todayIn } from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorBox, Spinner } from '@/components/ui';
import { api } from '@/lib/api';

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function Analytics() {
  const today = todayIn('Europe/Madrid');
  const [range, setRange] = useState({ from: addDaysIso(today, -29), to: today });
  const [locationId, setLocationId] = useState('');
  const locs = useQuery({ queryKey: ['admin', 'locations'], queryFn: () => api.get<LocationDto[]>('/admin/locations') });
  const q = useQuery({
    queryKey: ['admin', 'analytics', range, locationId],
    queryFn: () => api.get<AnalyticsDto>('/admin/analytics', { query: { ...range, locationId: locationId || undefined } }),
  });
  const d = q.data;
  const maxDay = Math.max(1, ...(d?.byDay.map((x) => x.bookings) ?? [1]));
  const maxHour = Math.max(1, ...(d?.byHour.map((x) => x.bookings) ?? [1]));
  const maxService = Math.max(1, ...(d?.byService.map((x) => x.bookings) ?? [1]));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Analítica</h1>
          <p className="muted">Demanda, ocupación y rendimiento de la red de oficinas.</p>
        </div>
        <div className="row">
          <select className="select" style={{ width: 'auto' }} value={locationId} onChange={(e) => setLocationId(e.target.value)} aria-label="Ubicación">
            <option value="">Todas las ubicaciones</option>
            {locs.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <input type="date" className="input" style={{ width: 'auto' }} value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} aria-label="Desde" />
          <input type="date" className="input" style={{ width: 'auto' }} value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} aria-label="Hasta" />
        </div>
      </div>
      {q.isLoading ? <Spinner /> : <ErrorBox error={q.error} />}
      {d ? (
        <div className="stack" style={{ '--gap': '24px' } as React.CSSProperties}>
          <div className="grid" style={{ '--min': '160px' } as React.CSSProperties}>
            <div className="stat"><div className="n">{d.totals.bookings}</div><div className="l">Citas reservadas</div></div>
            <div className="stat accent"><div className="n">{pct(d.totals.occupancyRate)}</div><div className="l">Ocupación</div></div>
            <div className="stat"><div className="n">{d.totals.completed}</div><div className="l">Atendidas</div></div>
            <div className="stat warn"><div className="n">{pct(d.totals.noShowRate)}</div><div className="l">No presentados</div></div>
            <div className="stat"><div className="n">{d.totals.avgLeadTimeHours} h</div><div className="l">Antelación media</div></div>
            <div className="stat"><div className="n">{d.totals.avgWaitMinutes ?? '–'}{d.totals.avgWaitMinutes != null ? ' min' : ''}</div><div className="l">Espera media en oficina</div></div>
          </div>

          <section className="card">
            <h2 style={{ fontSize: 'var(--t-lg)' }}>Citas por día</h2>
            <div className="bars" role="img" aria-label="Citas por día">
              {d.byDay.map((x) => (
                <div key={x.date} className="b" style={{ height: `${(x.bookings / maxDay) * 100}%` }} title={`${x.date}: ${x.bookings} citas, ${x.noShow} no presentados`} />
              ))}
            </div>
            <div className="row between xs muted" style={{ marginTop: 6 }}>
              <span>{d.range.from}</span>
              <span>{d.range.to}</span>
            </div>
          </section>

          <div className="grid" style={{ '--min': '320px' } as React.CSSProperties}>
            <section className="card">
              <h2 style={{ fontSize: 'var(--t-lg)' }}>Franjas con más demanda</h2>
              <div className="bars" style={{ height: 120 }} role="img" aria-label="Citas por hora del día">
                {Array.from({ length: 13 }, (_, i) => i + 8).map((h) => {
                  const v = d.byHour.find((x) => x.hour === h)?.bookings ?? 0;
                  return <div key={h} className="b" style={{ height: `${(v / maxHour) * 100}%` }} title={`${h}:00 · ${v} citas`} />;
                })}
              </div>
              <div className="row between xs muted" style={{ marginTop: 6 }}>
                <span>8:00</span>
                <span>14:00</span>
                <span>20:00</span>
              </div>
            </section>
            <section className="card stack">
              <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Por gestión</h2>
              {d.byService.map((s) => (
                <div key={s.serviceId} className="hbar">
                  <span>{s.name}</span>
                  <div className="track"><div className="fill" style={{ width: `${(s.bookings / maxService) * 100}%` }} /></div>
                  <span className="mono">{s.bookings}</span>
                </div>
              ))}
            </section>
          </div>

          <section>
            <h2 style={{ fontSize: 'var(--t-lg)' }}>Por ubicación</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Ubicación</th><th>Citas</th><th>Ocupación</th><th>No presentados</th></tr>
                </thead>
                <tbody>
                  {d.byLocation.map((l) => (
                    <tr key={l.locationId}>
                      <td>{l.name}</td>
                      <td className="mono">{l.bookings}</td>
                      <td>
                        <div className="hbar" style={{ gridTemplateColumns: '1fr auto' }}>
                          <div className="track"><div className="fill" style={{ width: pct(Math.min(1, l.occupancyRate)) }} /></div>
                          <span className="mono">{pct(l.occupancyRate)}</span>
                        </div>
                      </td>
                      <td className="mono">{pct(l.noShowRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
