'use client';

import { errorMessage, formatDateTime } from '@valorize/shared';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Alert, Button, TextInput } from '@/components/ui';
import { api } from '@/lib/api';

type Result = { valid: false } | { valid: true; reference: string; completedAt: string; operation: string; fiatAmount: string | null };

/** Comprobación pública de un justificante: referencia + código de verificación impreso. */
export default function VerifyReceipt() {
  const [reference, setReference] = useState('');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      setResult(await api.get<Result>('/receipts/verify', { query: { reference: reference.trim(), code: code.trim() }, skipAuthRetry: true }));
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
          <h1 style={{ fontSize: 'var(--t-xl)' }}>Comprobar un justificante</h1>
          <p className="muted small" style={{ margin: 0 }}>Introduce la referencia y el código de verificación que aparecen en el justificante.</p>
          <TextInput label="Referencia" className="input mono" placeholder="VF-2026-000458" value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} required />
          <TextInput label="Código de verificación" className="input mono" placeholder="XXXX-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required />
          <Button variant="primary" type="submit" loading={busy}>
            Comprobar
          </Button>
          {error ? <Alert kind="error">{error}</Alert> : null}
          {result?.valid ? (
          <Alert kind="ok">
            <strong>Justificante auténtico.</strong> {result.reference} · {result.operation}
            {result.fiatAmount ? ` · ${result.fiatAmount}` : ''} · completada el {formatDateTime(result.completedAt, 'Europe/Madrid')}.
          </Alert>
          ) : result ? (
            <Alert kind="error">No coincide ningún justificante con esa referencia y ese código.</Alert>
          ) : null}
        </form>
      </div>
    </div>
  );
}
