'use client';

import type React from 'react';
import { errorMessage, KycProfileDto, KycRequirementDto } from '@valorize/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, ErrorBox, Field, KycBadge, Spinner, useToast } from '@/components/ui';
import { api, uploadFile } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Values = Partial<Record<string, { value: string | null; fileId: string | null; fileName: string | null }>>;

const COUNTRIES = ['ES', 'AD', 'FR', 'PT', 'IT', 'DE', 'GB', 'IE', 'NL', 'BE', 'CH', 'US', 'MX', 'AR', 'CO', 'VE', 'PE', 'CL', 'EC', 'BR', 'MA', 'RO', 'CN', 'PK', 'IN', 'UA'];
const countryName = (c: string) => new Intl.DisplayNames(['es'], { type: 'region' }).of(c) ?? c;

/** Formulario KYC dinámico: los campos los define el backoffice. */
export default function KycPage() {
  const { reload } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['kyc'], queryFn: () => api.get<KycProfileDto>('/me/kyc') });
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);

  useEffect(() => {
    if (q.data) setValues(Object.fromEntries(q.data.fields.map((f) => [f.key, f])));
  }, [q.data]);

  const editable = q.data && ['NOT_STARTED', 'PENDING', 'REJECTED', 'EXPIRED'].includes(q.data.status);
  // Cliente ya verificado que puede completar la verificación ampliada (niveles superiores).
  const upgrading = !!q.data && q.data.status === 'APPROVED' && !q.data.upgradeRequestedAt && q.data.level < q.data.maxLevel;
  const levels = useMemo(() => {
    const m = new Map<number, KycRequirementDto[]>();
    q.data?.requirements.forEach((r) => m.set(r.level, [...(m.get(r.level) ?? []), r]));
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [q.data]);

  async function persist(submit: boolean) {
    if (!q.data) return;
    setError(null);
    setErrors({});
    setBusy(submit ? 'submit' : 'save');
    try {
      const fields = q.data.requirements
        .filter((r) => values[r.key] && (!upgrading || r.level > q.data!.level))
        .map((r) => ({ key: r.key, value: values[r.key]?.value ?? null, fileId: values[r.key]?.fileId ?? null }));
      const r = await api.put<KycProfileDto>('/me/kyc', { fields, submit });
      qc.setQueryData(['kyc'], r);
      await reload();
      toast(submit ? 'Enviado a revisión. Te avisaremos cuando esté listo.' : 'Borrador guardado');
      if (submit) qc.invalidateQueries({ queryKey: ['kyc'] });
    } catch (e) {
      const details = (e as { details?: { path: string; message: string }[] }).details;
      if (Array.isArray(details)) setErrors(Object.fromEntries(details.map((d) => [d.path, d.message])));
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (q.isLoading) return <Spinner />;
  if (!q.data) return <div className="page narrow"><ErrorBox error={q.error} /></div>;
  const p = q.data;

  return (
    <div className="page narrow stack" style={{ '--gap': '20px' } as React.CSSProperties}>
      <Link href="/app/perfil" className="btn ghost sm" style={{ paddingLeft: 0, alignSelf: 'flex-start' }}>
        Perfil
      </Link>
      <div className="row between">
        <h1 style={{ margin: 0 }}>Verificación de identidad</h1>
        <KycBadge status={p.status} />
      </div>

      {p.status === 'IN_REVIEW' ? <Alert kind="info">Estamos revisando tus datos. Normalmente tardamos menos de 24 horas laborables.</Alert> : null}
      {p.status === 'APPROVED' ? (
        <Alert kind="ok">
          Tu identidad está verificada{p.level >= 2 ? ' con la verificación ampliada' : ''}
          {p.expiresAt ? ` hasta el ${new Date(p.expiresAt).toLocaleDateString('es-ES')}` : ''}.
        </Alert>
      ) : null}
      {p.status === 'APPROVED' && p.upgradeRequestedAt ? (
        <Alert kind="info">Estamos revisando tu verificación ampliada. Mientras tanto puedes seguir reservando con tu verificación actual.</Alert>
      ) : null}
      {p.status === 'APPROVED' && p.rejectionReason && !p.upgradeRequestedAt ? (
        <Alert kind="error">No hemos podido aprobar la verificación ampliada: {p.rejectionReason}. Corrige los datos y envíalos de nuevo.</Alert>
      ) : null}
      {upgrading ? (
        <p className="muted small" style={{ margin: 0 }}>
          Para operaciones de importe alto necesitamos la verificación ampliada: completa los datos de abajo y envíalos. Tus datos básicos no cambian.
        </p>
      ) : null}
      {p.status === 'REJECTED' ? <Alert kind="error">No hemos podido verificarte: {p.rejectionReason}. Corrige los datos y envíalos de nuevo.</Alert> : null}
      {p.status === 'EXPIRED' ? <Alert kind="warn">Tu verificación ha caducado. Actualiza tu documento y envíalo de nuevo.</Alert> : null}
      {editable ? (
        <p className="muted small" style={{ margin: 0 }}>
          Tus datos se guardan cifrados y solo los ve el equipo de verificación de Valorize. Puedes guardar un borrador y terminar más tarde.
        </p>
      ) : null}

      {levels.map(([level, reqs]) => (
        <fieldset key={level} className="card stack" disabled={!(editable || (upgrading && level > p.level))} style={{ margin: 0 }}>
          <legend className="small muted" style={{ padding: '0 8px' }}>
            {level === 1 ? 'Datos básicos' : `Verificación ampliada (nivel ${level})`}
          </legend>
          {reqs.map((r) => (
            <KycField
              key={r.key}
              req={r}
              value={values[r.key]}
              error={errors[r.key]}
              onChange={(v) => setValues((s) => ({ ...s, [r.key]: { value: null, fileId: null, fileName: null, ...s[r.key], ...v } }))}
            />
          ))}
        </fieldset>
      ))}

      {error ? <Alert kind="error">{error}</Alert> : null}
      {upgrading ? (
        <div className="row">
          <Button variant="primary" size="lg" loading={busy === 'submit'} onClick={() => persist(true)}>
            Solicitar verificación ampliada
          </Button>
          <Button loading={busy === 'save'} onClick={() => persist(false)}>
            Guardar borrador
          </Button>
        </div>
      ) : null}
      {editable ? (
        <div className="row">
          <Button variant="primary" size="lg" loading={busy === 'submit'} onClick={() => persist(true)}>
            Enviar a revisión
          </Button>
          <Button loading={busy === 'save'} onClick={() => persist(false)}>
            Guardar borrador
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function KycField({
  req,
  value,
  error,
  onChange,
}: {
  req: KycRequirementDto;
  value?: { value: string | null; fileId: string | null; fileName: string | null };
  error?: string;
  onChange: (v: Partial<{ value: string | null; fileId: string | null; fileName: string | null }>) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const label = `${req.label}${req.level > 1 ? ' (verificación ampliada)' : req.required ? '' : ' (opcional)'}`;
  const v = value?.value ?? '';

  if (req.type === 'BOOLEAN') {
    return (
      <label className="check">
        <input type="checkbox" checked={v === 'true'} onChange={(e) => onChange({ value: String(e.target.checked) })} />
        <span>{label}</span>
      </label>
    );
  }

  return (
    <Field label={label} hint={req.helpText ?? undefined} error={error ?? uploadError}>
      {(id, d) => {
        switch (req.type) {
          case 'SELECT':
            return (
              <select id={id} className="select" aria-describedby={d} value={v} onChange={(e) => onChange({ value: e.target.value })}>
                <option value="">Elige una opción</option>
                {req.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            );
          case 'COUNTRY':
            return (
              <select id={id} className="select" aria-describedby={d} value={v} onChange={(e) => onChange({ value: e.target.value })}>
                <option value="">Elige un país</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {countryName(c)}
                  </option>
                ))}
              </select>
            );
          case 'DOCUMENT':
            return (
              <div className="row">
                <input
                  id={id}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  aria-describedby={d}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 10 * 1024 * 1024) return setUploadError('El fichero supera 10 MB');
                    setUploadError(null);
                    setUploading(true);
                    try {
                      const fileId = await uploadFile(f, 'KYC_DOCUMENT');
                      onChange({ fileId, fileName: f.name });
                    } catch (err) {
                      setUploadError(errorMessage(err));
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
                {uploading ? <span className="spinner" aria-label="Subiendo" /> : value?.fileName ? <span className="badge ok">{value.fileName}</span> : null}
              </div>
            );
          default:
            return (
              <input
                id={id}
                className="input"
                aria-describedby={d}
                type={req.type === 'DATE' ? 'date' : req.type === 'NUMBER' ? 'number' : 'text'}
                value={v}
                onChange={(e) => onChange({ value: e.target.value })}
              />
            );
        }
      }}
    </Field>
  );
}
