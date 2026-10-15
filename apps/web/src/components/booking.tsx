'use client';

import {
  AvailabilityDto,
  BookingDto,
  BookingQrDto,
  formatDateLong,
  formatTime,
  todayIn,
} from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import type { CSSProperties } from 'react';
import { api } from '@/lib/api';
import { Alert, Empty, ErrorBox, Spinner, StatusBadge } from './ui';

/** El pase: QR firmado sobre baldosa blanca, referencia y datos de la cita. */
export function QrPass({ booking }: { booking: BookingDto }) {
  const usable = booking.status === 'CONFIRMED';
  const awaiting = booking.status === 'PENDING';
  const qr = useQuery({
    queryKey: ['booking', booking.id, 'qr'],
    queryFn: () => api.get<BookingQrDto>(`/me/bookings/${booking.id}/qr`),
    enabled: usable,
    staleTime: 60_000,
  });
  const tz = booking.location.timezone;

  return (
    <article className={`pass ${usable ? '' : 'void'}`} aria-label={`Pase de la cita ${booking.reference}`}>
      <div className="row between" style={{ marginBottom: 18 }}>
        <span className="brand" style={{ fontSize: 'var(--t-sm)' }}>
          <b>VALORIZE</b>
        </span>
        <StatusBadge status={booking.status} />
      </div>
      <div className="qr-tile" aria-hidden={!usable}>
        {qr.data ? (
          <QRCodeSVG value={qr.data.token} size={208} level="M" bgColor="#ffffff" fgColor="#07111c" />
        ) : (
          <div style={{ width: 208, height: 208, display: 'grid', placeItems: 'center' }}>{usable ? <span className="spinner" /> : null}</div>
        )}
      </div>
      <div className="ref">{booking.reference}</div>
      {usable ? (
        <p className="small muted" style={{ margin: '8px auto 0' }}>
          Muéstralo al llegar. Si cambias la cita, este código se actualiza solo.
        </p>
      ) : awaiting ? (
        <p className="small" style={{ margin: '8px auto 0', color: 'var(--amber)' }}>
          Estamos revisando tu solicitud. El QR aparecerá aquí en cuanto la aprobemos y te avisaremos.
        </p>
      ) : (
        <p className="small muted" style={{ margin: '8px auto 0' }}>
          Esta cita ya no tiene un QR válido.
        </p>
      )}
      <div className="tear" />
      <dl className="meta">
        <div>
          <dt>Fecha</dt>
          <dd style={{ textTransform: 'capitalize' }}>{formatDateLong(booking.startsAt, tz)}</dd>
        </div>
        <div>
          <dt>Hora</dt>
          <dd className="mono" style={{ fontSize: 'var(--t-lg)' }}>
            {formatTime(booking.startsAt, tz)}
          </dd>
        </div>
        <div>
          <dt>Ubicación</dt>
          <dd>{booking.location.name}</dd>
        </div>
        <div>
          <dt>Gestión</dt>
          <dd>{booking.service.name}</dd>
        </div>
      </dl>
      {qr.error ? (
        <div style={{ marginTop: 12 }}>
          <ErrorBox error={qr.error} />
        </div>
      ) : null}
    </article>
  );
}

/** Selector de día y hora contra la disponibilidad real del booking engine. */
export function SlotPicker({
  locationId,
  serviceId,
  timezone,
  date,
  onDate,
  value,
  onChange,
}: {
  locationId: string;
  serviceId: string;
  timezone: string;
  date: string;
  onDate: (d: string) => void;
  value: string | null;
  onChange: (startsAt: string) => void;
}) {
  const from = todayIn(timezone);
  const days = useQuery({
    queryKey: ['availability-days', locationId, serviceId, from],
    queryFn: () =>
      api.get<{ date: string; available: number; closed: boolean }[]>('/availability/days', {
        query: { locationId, serviceId, from, days: 21 },
      }),
  });
  const slots = useQuery({
    queryKey: ['availability', locationId, serviceId, date],
    queryFn: () => api.get<AvailabilityDto>('/availability', { query: { locationId, serviceId, date } }),
    refetchInterval: 30_000, // los huecos cambian mientras el cliente decide
  });

  return (
    <div className="stack" style={{ '--gap': '20px' } as CSSProperties}>
      <div>
        <h3 style={{ fontSize: 'var(--t-md)' }}>Día</h3>
        {days.isLoading ? (
          <Spinner />
        ) : (
          <div className="days" role="group" aria-label="Elige un día">
            {(days.data ?? []).map((d) => {
              const dt = new Date(`${d.date}T12:00:00Z`);
              const wd = new Intl.DateTimeFormat('es-ES', { weekday: 'short', timeZone: 'UTC' }).format(dt);
              const mo = new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' }).format(dt);
              const disabled = d.closed || d.available === 0;
              return (
                <button
                  key={d.date}
                  type="button"
                  className="day"
                  aria-pressed={d.date === date}
                  disabled={disabled}
                  onClick={() => onDate(d.date)}
                  aria-label={`${wd} ${dt.getUTCDate()} de ${mo}${disabled ? ', sin huecos' : `, ${d.available} horas libres`}`}
                >
                  <div className="wd">{wd}</div>
                  <div className="dn">{dt.getUTCDate()}</div>
                  <div className="wd">{mo}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div>
        <h3 style={{ fontSize: 'var(--t-md)' }}>Hora</h3>
        {slots.isLoading ? (
          <Spinner />
        ) : slots.error ? (
          <ErrorBox error={slots.error} />
        ) : slots.data?.closed ? (
          <Alert kind="info">{slots.data.closedReason ?? 'Cerrado este día'}</Alert>
        ) : !slots.data?.slots.length ? (
          <Empty title="No quedan horas este día">Prueba con otro día.</Empty>
        ) : (
          <div className="slots" role="group" aria-label="Elige una hora">
            {slots.data.slots.map((s) => (
              <button
                key={s.startsAt}
                type="button"
                className="slot"
                aria-pressed={s.startsAt === value}
                disabled={s.available <= 0}
                onClick={() => onChange(s.startsAt)}
                aria-label={`${s.label}${s.available <= 0 ? ', completo' : ''}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
