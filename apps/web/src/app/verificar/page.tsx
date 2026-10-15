'use client';

import { errorMessage, MeDto } from '@valorize/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Alert, Button, Spinner, TextInput, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { homeFor, useAuth, useRequireRole } from '@/lib/auth';

/** Verificación de email y teléfono con código de un solo uso. */
export default function VerifyPage() {
  const { ready } = useRequireRole('any');
  const { user, setUser } = useAuth();
  const router = useRouter();
  if (!ready || !user) return <Spinner />;
  const done = user.emailVerified && user.phoneVerified;

  return (
    <div className="auth">
      <div className="box stack">
        <Link href="/" className="brand">
          <b>VALORIZE</b> FINANCE
        </Link>
        <div className="card big stack">
          <h1 style={{ fontSize: 'var(--t-xl)' }}>Verifica tus datos de contacto</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Los usamos para enviarte la confirmación de tus citas y avisos de seguridad.
          </p>
          <ChannelVerifier channel="EMAIL" target={user.email} verified={user.emailVerified} onVerified={setUser} autoSent />
          <ChannelVerifier channel="PHONE" target={user.phone ?? ''} verified={user.phoneVerified} onVerified={setUser} />
          <Button variant={done ? 'primary' : 'ghost'} block size={done ? 'lg' : undefined} onClick={() => router.replace(homeFor(user.role))}>
            {done ? 'Continuar' : 'Hacerlo más tarde'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChannelVerifier({
  channel,
  target,
  verified,
  onVerified,
  autoSent = false,
}: {
  channel: 'EMAIL' | 'PHONE';
  target: string;
  verified: boolean;
  onVerified: (u: MeDto) => void;
  autoSent?: boolean;
}) {
  const toast = useToast();
  const [sent, setSent] = useState(autoSent);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = channel === 'EMAIL' ? 'Email' : 'Teléfono';

  if (verified) {
    return (
      <div className="row between card flat" style={{ padding: 14 }}>
        <div>
          <div className="small muted">{label}</div>
          <div>{target}</div>
        </div>
        <span className="badge ok">Verificado</span>
      </div>
    );
  }

  async function send() {
    setError(null);
    setBusy(true);
    try {
      await api.post('/auth/verify/send', { channel });
      setSent(true);
      toast(channel === 'EMAIL' ? 'Código enviado a tu email' : 'Código enviado por SMS');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onVerified(await api.post<MeDto>('/auth/verify/confirm', { channel, code }));
      toast(`${label} verificado`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card flat stack" style={{ padding: 14 }} onSubmit={confirm}>
      <div className="row between">
        <div>
          <div className="small muted">{label}</div>
          <div>{target || 'Sin teléfono'}</div>
        </div>
        <Button type="button" size="sm" onClick={send} loading={busy && !sent} disabled={!target}>
          {sent ? 'Reenviar código' : 'Enviar código'}
        </Button>
      </div>
      {sent ? (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="grow">
            <TextInput label="Código de 6 dígitos" className="input otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </div>
          <Button variant="primary" type="submit" loading={busy} disabled={code.length !== 6}>
            Verificar
          </Button>
        </div>
      ) : null}
      {error ? <Alert kind="error">{error}</Alert> : null}
    </form>
  );
}
