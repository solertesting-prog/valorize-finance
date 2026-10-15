'use client';

import { STAFF_ROLES } from '@valorize/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/**
 * Destino del QR de una cita.
 *  - Personal con sesión: abre el escáner con la cita ya validada.
 *  - Cualquier otra persona: solo ve que es un pase de Valorize (sin datos de la cita ni del cliente).
 */
export default function QrLanding() {
  const { token } = useParams<{ token: string }>();
  const { user, ready } = useAuth();
  const router = useRouter();
  const staff = !!user && STAFF_ROLES.includes(user.role);

  useEffect(() => {
    if (ready && staff) router.replace(`/panel/escanear?t=${encodeURIComponent(decodeURIComponent(token))}`);
  }, [ready, staff, token, router]);

  if (!ready || staff) return <Spinner label="Abriendo el escáner" />;

  return (
    <main className="page narrow" style={{ paddingTop: 64 }}>
      <div className="card big stack center">
        <span className="brand">
          <b>VALORIZE</b> FINANCE
        </span>
        <h1 style={{ fontSize: 'var(--t-xl)' }}>Pase de cita</h1>
        <p className="muted" style={{ margin: 0 }}>
          Este código identifica una cita en una oficina de Valorize. Muéstralo en el mostrador al llegar: lo leerá nuestro personal.
        </p>
        {user ? (
          <Link href="/app/reservas" className="btn primary">
            Ver mis citas
          </Link>
        ) : (
          <Link href={`/login?next=${encodeURIComponent(`/q/${token}`)}`} className="btn">
            Soy personal de Valorize
          </Link>
        )}
      </div>
    </main>
  );
}
