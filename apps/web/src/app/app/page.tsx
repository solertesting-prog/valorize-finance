'use client';

import type React from 'react';
import { BookingDto, formatDateLong, formatTime, Paginated } from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Icon, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState('');
  const upcoming = useQuery({
    queryKey: ['bookings', 'upcoming', 1],
    queryFn: () => api.get<Paginated<BookingDto>>('/me/bookings', { query: { scope: 'upcoming', pageSize: 3 } }),
  });
  const next = upcoming.data?.items[0];

  function search(e: FormEvent) {
    e.preventDefault();
    router.push(`/app/ubicaciones${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  }

  const pending: { text: string; href: string }[] = [];
  if (user && !user.emailVerified) pending.push({ text: 'Verifica tu email para poder reservar', href: '/verificar' });
  if (user && !user.phoneVerified) pending.push({ text: 'Verifica tu teléfono para recibir avisos por SMS', href: '/verificar' });
  if (user && ['NOT_STARTED', 'PENDING', 'REJECTED', 'EXPIRED'].includes(user.kycStatus))
    pending.push({ text: 'Completa la verificación de identidad para acceder a todos los servicios', href: '/app/perfil/verificacion' });

  return (
    <div className="page narrow stack" style={{ '--gap': '24px' } as React.CSSProperties}>
      <div>
        <p className="muted" style={{ marginBottom: 4 }}>
          Hola, {user?.firstName}
        </p>
        <h1 style={{ fontSize: 'var(--t-3xl)', margin: 0 }}>¿Qué necesitas hacer hoy?</h1>
      </div>

      <form onSubmit={search} role="search">
        <label htmlFor="q" className="sr-only">
          Buscar una ubicación
        </label>
        <div className="row" style={{ gap: 8 }}>
          <input id="q" className="input grow" placeholder="Buscar una ubicación, barrio o código postal" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn" type="submit" aria-label="Buscar">
            <Icon name="pin" />
          </button>
        </div>
      </form>

      <Link href="/app/reservar" className="btn primary lg block">
        Reservar una visita
      </Link>

      {pending.map((p) => (
        <Link key={p.text} href={p.href} className="alert warn card-link">
          {p.text}
        </Link>
      ))}

      <section>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Tu próxima cita</h2>
          {upcoming.data && upcoming.data.total > 1 ? (
            <Link href="/app/reservas" className="small">
              Ver todas ({upcoming.data.total})
            </Link>
          ) : null}
        </div>
        {upcoming.isLoading ? (
          <Spinner />
        ) : next ? (
          <Link href={`/app/reservas/${next.id}`} className="card big card-link">
            <div className="row between">
              <StatusBadge status={next.status} />
              <span className="mono" style={{ color: 'var(--mint)' }}>
                {next.reference}
              </span>
            </div>
            <div className="mono" style={{ fontSize: 'var(--t-3xl)', fontWeight: 700, marginTop: 16 }}>
              {formatTime(next.startsAt, next.location.timezone)}
            </div>
            <div style={{ textTransform: 'capitalize' }}>{formatDateLong(next.startsAt, next.location.timezone)}</div>
            <div className="muted small" style={{ marginTop: 8 }}>
              {next.service.name} en {next.location.name}
            </div>
            <div className="row" style={{ marginTop: 16, color: 'var(--mint)', fontWeight: 600 }}>
              <Icon name="qr" /> Ver mi QR
            </div>
          </Link>
        ) : (
          <div className="card flat empty" style={{ padding: 28 }}>
            <p style={{ margin: '0 auto' }}>No tienes citas pendientes.</p>
          </div>
        )}
      </section>
    </div>
  );
}
