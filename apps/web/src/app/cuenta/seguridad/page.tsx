'use client';

import type React from 'react';
import { errorMessage, MfaSetupDto, passwordSchema, SessionDto } from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Alert, Button, ErrorBox, Modal, Spinner, TextInput, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { homeFor, useAuth, useRequireRole } from '@/lib/auth';

/** Seguridad de la cuenta: común a clientes y personal. */
export default function SecurityPage() {
  const { ready, user } = useRequireRole('any');
  if (!ready || !user) return <Spinner />;
  const back = user.role === 'CUSTOMER' ? '/app/perfil' : homeFor(user.role);

  return (
    <div className="page narrow">
      <Link href={back} className="btn ghost sm" style={{ paddingLeft: 0 }}>
        Volver
      </Link>
      <div className="page-head">
        <div>
          <h1>Seguridad</h1>
          <p className="muted">Contraseña, verificación en dos pasos y dispositivos con sesión abierta.</p>
        </div>
      </div>
      <div className="stack" style={{ '--gap': '20px' } as React.CSSProperties}>
        <MfaCard />
        <PasswordCard />
        <SessionsCard />
        {user.role === 'CUSTOMER' ? <PrivacyCard /> : null}
      </div>
    </div>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => api.post('/auth/password/change', { currentPassword, newPassword }),
    onSuccess: () => {
      setCurrent('');
      setNew('');
      toast('Contraseña cambiada. Hemos cerrado tus otras sesiones.');
    },
    onError: (e) => setError(errorMessage(e)),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const p = passwordSchema.safeParse(newPassword);
    if (!p.success) return setError(p.error.issues[0].message);
    m.mutate();
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Contraseña</h2>
      <TextInput label="Contraseña actual" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required />
      <TextInput
        label="Nueva contraseña"
        type="password"
        autoComplete="new-password"
        value={newPassword}
        onChange={(e) => setNew(e.target.value)}
        hint="Mínimo 10 caracteres, con mayúscula, minúscula y número."
        required
      />
      {error ? <Alert kind="error">{error}</Alert> : null}
      <div>
        <Button variant="primary" type="submit" loading={m.isPending}>
          Cambiar contraseña
        </Button>
      </div>
    </form>
  );
}

function MfaCard() {
  const { user, reload } = useAuth();
  const toast = useToast();
  const [setup, setSetup] = useState<MfaSetupDto | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const isStaff = user?.role !== 'CUSTOMER';

  return (
    <section className="card stack">
      <div className="row between">
        <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Verificación en dos pasos</h2>
        <span className={`badge ${user?.mfaEnabled ? 'ok' : 'warn'}`}>{user?.mfaEnabled ? 'Activada' : 'Desactivada'}</span>
      </div>

      {recovery ? (
        <>
          <Alert kind="ok">Activada. Guarda estos códigos de recuperación en un lugar seguro: cada uno sirve una sola vez si pierdes el móvil.</Alert>
          <pre className="card mono" style={{ margin: 0, columns: 2, background: 'var(--slate-2)' }}>
            {recovery.join('\n')}
          </pre>
          <div className="row">
            <Button onClick={() => navigator.clipboard?.writeText(recovery.join('\n')).then(() => toast('Códigos copiados'))}>Copiar códigos</Button>
            <Button variant="primary" onClick={() => setRecovery(null)}>
              Ya los he guardado
            </Button>
          </div>
        </>
      ) : user?.mfaEnabled ? (
        <>
          <p className="muted small" style={{ margin: 0 }}>
            Al iniciar sesión te pediremos un código de tu app de autenticación.
          </p>
          {!isStaff ? (
            <div>
              <Button variant="danger" onClick={() => setDisableOpen(true)}>
                Desactivar
              </Button>
            </div>
          ) : (
            <p className="xs muted" style={{ margin: 0 }}>
              Obligatoria para el personal de Valorize.
            </p>
          )}
        </>
      ) : setup ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await api.post<{ recoveryCodes: string[] }>('/auth/mfa/enable', { code });
              setRecovery(r.recoveryCodes);
              setSetup(null);
              setCode('');
              await reload();
            });
          }}
        >
          <p className="small" style={{ margin: 0 }}>
            Escanea este código con Google Authenticator, 1Password, Authy u otra app compatible, y escribe el código que te muestre.
          </p>
          <div style={{ background: '#fff', borderRadius: 16, padding: 12, width: 'fit-content', lineHeight: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qrDataUrl} alt="Código QR para tu app de autenticación" width={200} height={200} />
          </div>
          <details>
            <summary className="small">No puedo escanearlo</summary>
            <p className="mono small" style={{ wordBreak: 'break-all', marginTop: 8 }}>
              {setup.secret}
            </p>
          </details>
          <TextInput label="Código de 6 dígitos" className="input otp" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <div className="row">
            <Button variant="primary" type="submit" loading={busy} disabled={code.length !== 6}>
              Activar
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSetup(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p className="muted small" style={{ margin: 0 }}>
            Añade un segundo paso al iniciar sesión: aunque alguien conozca tu contraseña, no podrá entrar sin tu móvil.
          </p>
          <div>
            <Button variant="primary" loading={busy} onClick={() => run(async () => setSetup(await api.post<MfaSetupDto>('/auth/mfa/setup')))}>
              Configurar
            </Button>
          </div>
        </>
      )}
      {error ? <Alert kind="error">{error}</Alert> : null}

      <Modal
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        title="Desactivar verificación en dos pasos"
        footer={
          <>
            <Button onClick={() => setDisableOpen(false)}>Cancelar</Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() =>
                run(async () => {
                  await api.post('/auth/mfa/disable', { password, code });
                  setDisableOpen(false);
                  setPassword('');
                  setCode('');
                  await reload();
                  toast('Verificación en dos pasos desactivada');
                })
              }
            >
              Desactivar
            </Button>
          </>
        }
      >
        <div className="stack">
          <TextInput label="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <TextInput label="Código actual de tu app" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        </div>
      </Modal>
    </section>
  );
}

function SessionsCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<SessionDto[]>('/auth/sessions') });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      toast('Sesión cerrada');
    },
  });

  return (
    <section className="card stack">
      <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Sesiones abiertas</h2>
      {q.isLoading ? <Spinner /> : <ErrorBox error={q.error} />}
      {(q.data ?? []).map((s) => (
        <div key={s.id} className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <div className="grow">
            <div className="small" style={{ fontWeight: 600 }}>
              {describeAgent(s.userAgent)} {s.current ? <span className="badge ok">Esta sesión</span> : null}
            </div>
            <div className="xs muted">
              {s.ip ?? 'IP desconocida'} · desde {new Date(s.createdAt).toLocaleDateString('es-ES')}
            </div>
          </div>
          {!s.current ? (
            <Button size="sm" onClick={() => revoke.mutate(s.id)} loading={revoke.isPending && revoke.variables === s.id}>
              Cerrar sesión
            </Button>
          ) : null}
        </div>
      ))}
    </section>
  );
}

function PrivacyCard() {
  const { logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function exportData() {
    const data = await api.get('/me/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mis-datos-valorize.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section className="card stack">
      <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Tus datos</h2>
      <div className="row">
        <Button onClick={exportData}>Descargar mis datos</Button>
        <Button variant="danger" onClick={() => setOpen(true)}>
          Eliminar cuenta
        </Button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Eliminar tu cuenta"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await api.post('/me/delete', { password });
                  await logout();
                  router.replace('/');
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Eliminar cuenta
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="small">
            Cancelaremos tus citas pendientes y borraremos tus datos personales y documentos. Esta acción no se puede deshacer.
          </p>
          <TextInput label="Escribe tu contraseña para confirmar" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error ? <Alert kind="error">{error}</Alert> : null}
        </div>
      </Modal>
    </section>
  );
}

function describeAgent(ua: string | null) {
  if (!ua) return 'Dispositivo desconocido';
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  const app = /Expo|okhttp|CFNetwork|Darwin/.test(ua) ? 'App Valorize' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  return [app, os].filter(Boolean).join(' en ');
}
