'use client';

import type React from 'react';
import { errorMessage, registerSchema } from '@valorize/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Alert, Button, TextInput } from '@/components/ui';
import { useAuth } from '@/lib/auth';

type Errors = Partial<Record<string, string>>;

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '+34', password: '' });
  const [acceptTerms, setAccept] = useState(false);
  const [marketingOptIn, setMarketing] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const data = { ...form, phone: form.phone.replace(/\s/g, ''), acceptTerms, marketingOptIn, client: 'web' };
    const parsed = registerSchema.safeParse(data);
    if (!parsed.success) {
      const errs: Errors = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await register(data);
      router.replace('/verificar');
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
        <form className="card big stack" onSubmit={submit} noValidate>
          <h1 style={{ fontSize: 'var(--t-xl)' }}>Crea tu cuenta</h1>
          <div className="grid" style={{ '--min': '150px' } as React.CSSProperties}>
            <TextInput label="Nombre" autoComplete="given-name" value={form.firstName} onChange={set('firstName')} error={errors.firstName} />
            <TextInput label="Apellidos" autoComplete="family-name" value={form.lastName} onChange={set('lastName')} error={errors.lastName} />
          </div>
          <TextInput label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
          <TextInput
            label="Teléfono móvil"
            type="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={set('phone')}
            error={errors.phone}
            hint="Con prefijo internacional. Te enviaremos un SMS para verificarlo."
          />
          <TextInput
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
            error={errors.password}
            hint="Mínimo 10 caracteres, con mayúscula, minúscula y número."
          />
          <label className="check">
            <input type="checkbox" checked={acceptTerms} onChange={(e) => setAccept(e.target.checked)} />
            <span>
              Acepto las <a href="/legal/condiciones" target="_blank">condiciones de uso</a> y la{' '}
              <a href="/legal/privacidad" target="_blank">política de privacidad</a>.
            </span>
          </label>
          {errors.acceptTerms ? <span className="error xs" style={{ color: 'var(--coral)' }}>{errors.acceptTerms}</span> : null}
          <label className="check">
            <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketing(e.target.checked)} />
            <span>Quiero recibir novedades de Valorize por email.</span>
          </label>
          {error ? <Alert kind="error">{error}</Alert> : null}
          <Button variant="primary" size="lg" block loading={busy} type="submit">
            Crear cuenta
          </Button>
          <p className="small center muted" style={{ margin: 0 }}>
            ¿Ya tienes cuenta? <Link href="/login">Entra</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
