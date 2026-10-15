'use client';

import type React from 'react';
import { LocationDto } from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { LocationMap } from '@/components/location-map';
import { Button, Empty, ErrorBox, Spinner } from '@/components/ui';
import { api } from '@/lib/api';

const WEEKDAYS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function Locations() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['locations', q, me],
    queryFn: () => api.get<LocationDto[]>('/locations', { query: { q: q || undefined, lat: me?.lat, lng: me?.lng } }),
  });
  const locations = list.data ?? [];
  const current = locations.find((l) => l.id === selected) ?? null;

  function locate() {
    setGeoError(null);
    if (!navigator.geolocation) return setGeoError('Tu navegador no permite obtener la ubicación.');
    navigator.geolocation.getCurrentPosition(
      (p) => setMe({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setGeoError('No hemos podido obtener tu ubicación. Busca por barrio o código postal.'),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Ubicaciones</h1>
          <p className="muted">Elige la oficina que mejor te venga.</p>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        <input className="input grow" style={{ maxWidth: 420 }} placeholder="Barrio, ciudad o código postal" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ubicaciones" />
        <Button onClick={locate}>Cerca de mí</Button>
      </div>
      {geoError ? <p className="small" style={{ color: 'var(--amber)' }}>{geoError}</p> : null}

      <div className="grid" style={{ '--min': '320px', alignItems: 'start' } as React.CSSProperties}>
        <LocationMap locations={locations} selectedId={selected} onSelect={setSelected} me={me} />
        <div className="stack">
          {list.isLoading ? <Spinner /> : <ErrorBox error={list.error} />}
          {!list.isLoading && !locations.length ? <Empty title="Sin resultados">Prueba con otra búsqueda.</Empty> : null}
          {current ? (
            <div className="card big stack">
              <div className="row between">
                <h2 style={{ margin: 0 }}>{current.name}</h2>
                <span className={`badge ${current.openNow ? 'ok' : ''}`}>{current.openNow ? 'Abierto ahora' : 'Cerrado ahora'}</span>
              </div>
              <div className="muted">
                {current.address}, {current.postalCode} {current.city}
              </div>
              <div>
                <h3 style={{ fontSize: 'var(--t-md)' }}>Horario</h3>
                <table className="small" style={{ borderCollapse: 'collapse' }}>
                  <tbody>
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                      const h = current.openingHours.filter((o) => o.weekday === d);
                      return (
                        <tr key={d}>
                          <td style={{ paddingRight: 16 }}>{WEEKDAYS[d]}</td>
                          <td className="mono">{h.length ? h.map((o) => `${o.opensAt}–${o.closesAt}`).join(', ') : <span className="muted">Cerrado</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 style={{ fontSize: 'var(--t-md)' }}>Gestiones</h3>
                <div className="row" style={{ gap: 6 }}>
                  {current.services.map((s) => (
                    <span key={s.id} className="badge">
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="row">
                <Link href={`/app/reservar?location=${current.id}`} className="btn primary">
                  Reservar aquí
                </Link>
                <Button variant="ghost" onClick={() => setSelected(null)}>
                  Ver todas
                </Button>
              </div>
            </div>
          ) : (
            locations.map((l) => (
              <button key={l.id} className="choice" onClick={() => setSelected(l.id)}>
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{l.name}</div>
                  <div className="small muted">
                    {l.address}
                    {l.distanceKm != null ? ` · ${l.distanceKm} km` : ''}
                  </div>
                </div>
                <span className={`badge ${l.openNow ? 'ok' : ''}`}>{l.openNow ? 'Abierto' : 'Cerrado'}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function LocationsPage() {
  return (
    <Suspense>
      <Locations />
    </Suspense>
  );
}
