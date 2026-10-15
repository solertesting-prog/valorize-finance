'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { homeFor, useAuth } from '@/lib/auth';

const JOURNEY = [
  ['Regístrate', 'Tu cuenta y los datos que necesitamos, una sola vez.'],
  ['Elige oficina', 'La más cercana con hueco libre.'],
  ['Reserva', 'Día, hora y gestión desde el móvil.'],
  ['Recibe tu QR', 'Tu identificador único para esa cita.'],
  ['Escanea y entra', 'Check-in en segundos al llegar.'],
];

export default function Landing() {
  const { user, ready } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (ready && user) router.replace(homeFor(user.role));
  }, [ready, user, router]);

  return (
    <div className="landing">
      <div className="orb a" aria-hidden />
      <div className="orb b" aria-hidden />
      <header>
        <span className="brand" style={{ lineHeight: 1.3 }}>
          <b>VALORIZE</b>
          <br />
          FINANCE
        </span>
        <Link href="/login" className="btn ghost">
          Entrar
        </Link>
      </header>

      <section className="hero">
        <div>
          <h1>La experiencia presencial convertida en un proceso digital.</h1>
          <p className="lede">
            Reserva tu visita a una oficina de Valorize, lleva tu QR en el móvil y haz el check-in nada más llegar. Sin
            llamadas ni colas.
          </p>
          <div className="row" style={{ marginTop: 28 }}>
            <Link href="/registro" className="btn primary lg">
              Reservar una visita
            </Link>
            <Link href="/login" className="btn lg">
              Ya tengo cuenta
            </Link>
          </div>
          <ol className="journey" aria-label="Cómo funciona">
            {JOURNEY.map(([t, d]) => (
              <li key={t}>
                <strong>{t}</strong>
                <span>{d}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="phone" aria-hidden>
          <div className="screen">
            <div className="small" style={{ fontWeight: 700, marginBottom: 18 }}>
              Mi QR
            </div>
            <div style={{ background: '#fff', borderRadius: 16, padding: 16, lineHeight: 0 }}>
              <DemoQr />
            </div>
            <div className="center" style={{ marginTop: 18, fontWeight: 700 }}>
              Reserva confirmada
            </div>
            <div className="center mono" style={{ color: 'var(--mint)', marginTop: 6 }}>
              VF-2026-000458
            </div>
            <div className="center xs muted" style={{ marginTop: 6 }}>
              Barcelona Centro, 11:30
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/** QR decorativo (no codifica nada real) para la maqueta del hero. */
function DemoQr() {
  const n = 21;
  const cells: [number, number][] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const finder = (x: number, y: number) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (finder(x, y)) continue;
      if (rnd() > 0.52) cells.push([x, y]);
    }
  const Finder = ({ x, y }: { x: number; y: number }) => (
    <g>
      <rect x={x} y={y} width={7} height={7} fill="#07111c" />
      <rect x={x + 1} y={y + 1} width={5} height={5} fill="#fff" />
      <rect x={x + 2} y={y + 2} width={3} height={3} fill="#07111c" />
    </g>
  );
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width="100%" shapeRendering="crispEdges">
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#07111c" />
      ))}
      <Finder x={0} y={0} />
      <Finder x={n - 7} y={0} />
      <Finder x={0} y={n - 7} />
    </svg>
  );
}
