'use client';

import { errorMessage } from '@valorize/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { Alert, Button, TextInput } from '@/components/ui';
import { homeFor, useAuth } from '@/lib/auth';

function LoginForm() {
  const { login, loginMfa, user, ready } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : homeFor(user.role));
  }, [ready, user, next, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (challenge) {
        await loginMfa(challenge, code);
      } else {
        const r = await login(email, password);
        if ('mfaRequired' in r) setChallenge(r.challengeToken);
      }
    } catch (err) {
      setError(errorMessage(err));
      if (challenge) setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="box">
        <Link href="/" className="brand">
          <b>VALORIZE</b> FINANCE
        </Link>
        <form className="card big stack" onSubmit={submit} noValidate>
          {challenge ? (
            <>
              <h1 style={{ fontSize: 'var(--t-xl)' }}>Verificación en dos pasos</h1>
              <p className="muted small">Escribe el código de 6 dígitos de tu app de autenticación o uno de tus códigos de recuperación.</p>
              <TextInput
                label="Código"
                className="input otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.trim())}
                maxLength={12}
                required
              />
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 'var(--t-xl)' }}>Entra en tu cuenta</h1>
              <TextInput label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              <TextInput
                label="Contraseña"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </>
          )}
          {error ? <Alert kind="error">{error}</Alert> : null}
          <Button variant="primary" block size="lg" loading={busy} type="submit">
            {challenge ? 'Verificar' : 'Entrar'}
          </Button>
          {challenge ? (
            <Button type="button" variant="ghost" onClick={() => setChallenge(null)}>
              Volver
            </Button>
          ) : (
            <div className="row between small">
              <Link href="/recuperar">He olvidado mi contraseña</Link>
              <Link href="/registro">Crear cuenta</Link>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
