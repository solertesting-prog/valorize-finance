'use client';

import { errorMessage, passwordSchema } from '@valorize/shared';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Alert, Button, TextInput } from '@/components/ui';
import { api } from '@/lib/api';

export default function RecoverPage() {
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (step === 'email') {
        await api.post('/auth/password/forgot', { email }, { skipAuthRetry: true });
        setStep('code');
      } else {
        const p = passwordSchema.safeParse(password);
        if (!p.success) throw new Error(p.error.issues[0].message);
        await api.post('/auth/password/reset', { email, code, password }, { skipAuthRetry: true });
        setStep('done');
      }
    } catch (err) {
      setError(errorMessage(err));
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
        <form className="card big stack" onSubmit={submit}>
          <h1 style={{ fontSize: 'var(--t-xl)' }}>{step === 'done' ? 'Contraseña cambiada' : 'Restablecer contraseña'}</h1>
          {step === 'email' ? (
            <>
              <p className="muted small">Te enviaremos un código de 6 dígitos a tu email.</p>
              <TextInput label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </>
          ) : step === 'code' ? (
            <>
              <Alert kind="info">Si existe una cuenta con {email}, te hemos enviado un código. Caduca en 10 minutos.</Alert>
              <TextInput label="Código" className="input otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
              <TextInput label="Nueva contraseña" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="Mínimo 10 caracteres, con mayúscula, minúscula y número." required />
            </>
          ) : (
            <Alert kind="ok">Ya puedes entrar con tu nueva contraseña. Hemos cerrado el resto de sesiones abiertas.</Alert>
          )}
          {error ? <Alert kind="error">{error}</Alert> : null}
          {step === 'done' ? (
            <Link href="/login" className="btn primary lg block">
              Entrar
            </Link>
          ) : (
            <Button variant="primary" size="lg" block loading={busy} type="submit">
              {step === 'email' ? 'Enviar código' : 'Cambiar contraseña'}
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
