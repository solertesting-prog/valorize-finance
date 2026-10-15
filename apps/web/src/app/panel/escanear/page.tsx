'use client';

import type React from 'react';
import { BookingDto, errorMessage, formatTime, fullName, ScanResultDto } from '@valorize/shared';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useStaffLocation } from '@/components/shells';
import { useTransition } from '@/components/staff';
import { Alert, Button, KycBadge, StatusBadge, TextInput } from '@/components/ui';
import { api } from '@/lib/api';

const REASON: Record<NonNullable<ScanResultDto['reason']>, string> = {
  INVALID_TOKEN: 'QR no reconocido',
  NOT_FOUND: 'La cita no existe',
  WRONG_LOCATION: 'La cita es en otra oficina',
  WRONG_DAY: 'La cita no es para hoy',
  CANCELLED: 'La cita está cancelada',
  ALREADY_USED: 'Este QR ya se ha usado',
  EXPIRED: 'QR caducado',
};

type Scanner = { start: () => Promise<void>; stop: () => void; destroy: () => void };

/** Escáner de mostrador: cámara del dispositivo (o lector USB que teclea el código) + búsqueda manual. */
export default function ScanPage() {
  const { location } = useStaffLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<Scanner | null>(null);
  const busyRef = useRef(false);
  const [camera, setCamera] = useState<'idle' | 'on' | 'denied' | 'unavailable'>('idle');
  const [result, setResult] = useState<ScanResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const transition = useTransition();

  const validate = useCallback(
    async (token: string) => {
      if (!location || busyRef.current) return;
      busyRef.current = true;
      scannerRef.current?.stop();
      setError(null);
      try {
        const r = await api.post<ScanResultDto>('/staff/scan', { token, locationId: location.id });
        setResult(r);
        navigator.vibrate?.(r.valid ? 60 : [80, 60, 80]);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        busyRef.current = false;
      }
    },
    [location],
  );

  const startCamera = useCallback(async () => {
    setResult(null);
    setError(null);
    if (!videoRef.current) return;
    try {
      if (!scannerRef.current) {
        const QrScanner = (await import('qr-scanner')).default;
        if (!(await QrScanner.hasCamera())) return setCamera('unavailable');
        scannerRef.current = new QrScanner(videoRef.current, (r: { data: string }) => validate(r.data), {
          returnDetailedScanResult: true,
          preferredCamera: 'environment',
          maxScansPerSecond: 8,
        }) as unknown as Scanner;
      }
      await scannerRef.current.start();
      setCamera('on');
    } catch {
      setCamera('denied');
    }
  }, [validate]);

  useEffect(() => () => scannerRef.current?.destroy(), []);

  // Lectores USB/Bluetooth tipo teclado: escriben el token y pulsan Intro.
  useEffect(() => {
    let buf = '';
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const now = Date.now();
      if (now - last > 80) buf = '';
      last = now;
      if (e.key === 'Enter' && buf.startsWith('vf1.')) {
        void validate(buf);
        buf = '';
      } else if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [validate]);

  async function lookup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const b = await api.get<BookingDto>(`/staff/bookings/by-reference/${encodeURIComponent(manual.trim())}`);
      setResult({ valid: b.status === 'CONFIRMED' || b.status === 'PENDING', booking: b, warnings: ['Identificación manual: comprueba un documento oficial'] });
      scannerRef.current?.stop();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const b = result?.booking;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Escanear QR</h1>
          <p className="muted">{location ? `Validando citas de ${location.name}.` : 'Elige una ubicación.'}</p>
        </div>
      </div>
      <div className="grid" style={{ '--min': '320px', alignItems: 'start' } as React.CSSProperties}>
        <div className="stack">
          <div className="scanner">
            <video ref={videoRef} muted playsInline aria-label="Vista de la cámara" />
            {camera === 'on' && !result ? <div className="frame" aria-hidden /> : null}
            {camera !== 'on' ? (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
                {camera === 'denied' ? (
                  <p className="small">No tenemos permiso para usar la cámara. Actívalo en el navegador o identifica al cliente con su referencia.</p>
                ) : camera === 'unavailable' ? (
                  <p className="small">No hay cámara en este dispositivo. Usa un lector QR o la referencia de la cita.</p>
                ) : (
                  <Button variant="primary" size="lg" onClick={startCamera} disabled={!location}>
                    Activar cámara
                  </Button>
                )}
              </div>
            ) : null}
          </div>
          <form className="card stack" onSubmit={lookup}>
            <TextInput label="Buscar por referencia" placeholder="VF-2026-000458" value={manual} onChange={(e) => setManual(e.target.value.toUpperCase())} className="input mono" />
            <div>
              <Button type="submit" disabled={manual.trim().length < 6}>
                Buscar cita
              </Button>
            </div>
          </form>
        </div>

        <div className="stack" aria-live="assertive">
          {error ? <Alert kind="error">{error}</Alert> : null}
          {result ? (
            <div className={`verdict ${result.valid ? 'ok' : 'bad'}`}>
              <div className="head" style={{ color: result.valid ? 'var(--mint)' : 'var(--coral)' }}>
                {result.valid ? 'Reserva válida' : REASON[result.reason ?? 'INVALID_TOKEN']}
              </div>
              {b ? (
                <div className="stack" style={{ marginTop: 16, '--gap': '10px' } as React.CSSProperties}>
                  <div className="mono" style={{ fontSize: 'var(--t-xl)', fontWeight: 700 }}>
                    {b.reference}
                  </div>
                  <div className="row">
                    <strong>{b.customer ? fullName(b.customer) : ''}</strong>
                    {b.customer ? <KycBadge status={b.customer.kycStatus} /> : null}
                  </div>
                  <div className="small muted">
                    {b.service.name} · {b.location.name} · {formatTime(b.startsAt, b.location.timezone)}
                  </div>
                  <div>
                    <StatusBadge status={b.status} />
                  </div>
                </div>
              ) : null}
              {result.warnings.length ? (
                <ul className="small" style={{ margin: '16px 0 0', paddingLeft: 18, color: 'var(--amber)' }}>
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
              <div className="row" style={{ marginTop: 20 }}>
                {result.valid && b ? (
                  <Button
                    variant="primary"
                    size="lg"
                    loading={transition.isPending}
                    onClick={() =>
                      transition.mutate(
                        { id: b.id, status: 'CHECKED_IN' },
                        { onSuccess: (nb) => setResult({ ...result, valid: false, reason: 'ALREADY_USED', booking: nb, warnings: ['Check-in registrado'] }) },
                      )
                    }
                  >
                    Hacer check-in
                  </Button>
                ) : null}
                <Button onClick={startCamera}>Escanear siguiente</Button>
                {b ? (
                  <Link href={`/panel/citas/${b.id}`} className="btn ghost">
                    Ver cita
                  </Link>
                ) : null}
                {!result.valid && result.reason !== 'ALREADY_USED' ? (
                  <Link href={`/panel/incidencias?nueva=1${b ? `&booking=${b.id}` : ''}&tipo=INVALID_QR`} className="btn ghost">
                    Registrar incidencia
                  </Link>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="card flat empty">
              <h3>Listo para identificar al siguiente cliente</h3>
              <p style={{ margin: '0 auto' }}>Enfoca el QR del móvil del cliente, usa un lector o busca por referencia.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
