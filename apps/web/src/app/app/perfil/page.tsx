'use client';

import type React from 'react';
import { errorMessage, MeDto, NETWORK_LABEL, updateProfileSchema, WalletDto } from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { Alert, Button, KycBadge, SelectInput, TextInput, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', locale: 'es', marketingOptIn: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) setForm({ firstName: user.firstName, lastName: user.lastName, phone: user.phone ?? '', locale: user.locale, marketingOptIn: user.marketingOptIn });
  }, [user]);
  if (!user) return null;

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = updateProfileSchema.safeParse({ ...form, phone: form.phone.replace(/\s/g, '') || undefined });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setBusy(true);
    try {
      setUser(await api.patch<MeDto>('/me', parsed.data));
      toast('Datos guardados');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow stack" style={{ '--gap': '20px' } as React.CSSProperties}>
      <h1 style={{ margin: 0 }}>Perfil</h1>

      <Link href="/app/perfil/verificacion" className="card card-link row between">
        <div>
          <div style={{ fontWeight: 700 }}>Verificación de identidad</div>
          <div className="small muted">Necesaria para algunas gestiones presenciales.</div>
        </div>
        <KycBadge status={user.kycStatus} />
      </Link>

      <div className="card stack">
        <div className="row between">
          <div>
            <div className="small muted">Email</div>
            <div>{user.email}</div>
          </div>
          {user.emailVerified ? <span className="badge ok">Verificado</span> : <Link href="/verificar" className="badge warn">Verificar</Link>}
        </div>
        <div className="row between">
          <div>
            <div className="small muted">Teléfono</div>
            <div>{user.phone ?? 'Sin teléfono'}</div>
          </div>
          {user.phoneVerified ? <span className="badge ok">Verificado</span> : <Link href="/verificar" className="badge warn">Verificar</Link>}
        </div>
      </div>

      <form className="card stack" onSubmit={save}>
        <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Datos personales</h2>
        <div className="grid" style={{ '--min': '180px' } as React.CSSProperties}>
          <TextInput label="Nombre" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} autoComplete="given-name" />
          <TextInput label="Apellidos" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} autoComplete="family-name" />
        </div>
        <TextInput
          label="Teléfono móvil"
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          hint="Si lo cambias, tendrás que verificarlo de nuevo."
          autoComplete="tel"
        />
        <SelectInput label="Idioma" value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })}>
          <option value="es">Español</option>
          <option value="ca">Català</option>
          <option value="en">English</option>
        </SelectInput>
        <label className="check">
          <input type="checkbox" checked={form.marketingOptIn} onChange={(e) => setForm({ ...form, marketingOptIn: e.target.checked })} />
          <span>Quiero recibir novedades de Valorize por email.</span>
        </label>
        {error ? <Alert kind="error">{error}</Alert> : null}
        <div>
          <Button variant="primary" type="submit" loading={busy}>
            Guardar cambios
          </Button>
        </div>
      </form>

      <MyWallets />

      <Link href="/cuenta/seguridad" className="card card-link row between">
        <div>
          <div style={{ fontWeight: 700 }}>Seguridad y privacidad</div>
          <div className="small muted">Contraseña, verificación en dos pasos, sesiones y tus datos.</div>
        </div>
        <span className={`badge ${user.mfaEnabled ? 'ok' : ''}`}>{user.mfaEnabled ? '2 pasos activo' : '2 pasos inactivo'}</span>
      </Link>

      <Button
        variant="ghost"
        onClick={async () => {
          await logout();
          router.replace('/');
        }}
      >
        Cerrar sesión
      </Button>
    </div>
  );
}

function MyWallets() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me', 'wallets', 'all'], queryFn: () => api.get<WalletDto[]>('/me/wallets') });
  const archive = useMutation({
    mutationFn: (id: string) => api.delete(`/me/wallets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'wallets'] }),
  });
  if (!q.data?.length) return null;
  return (
    <section className="card stack">
      <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Mis wallets</h2>
      {q.data.map((w) => (
        <div key={w.id} className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: 10, flexWrap: 'nowrap' }}>
          <div style={{ minWidth: 0 }}>
            <div className="small" style={{ fontWeight: 600 }}>
              {w.label ?? 'Wallet'} · {NETWORK_LABEL[w.network]}
            </div>
            <div className="xs muted mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {w.address}
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => archive.mutate(w.id)}>
            Quitar
          </Button>
        </div>
      ))}
      <p className="xs muted" style={{ margin: 0 }}>
        Puedes añadir otra wallet al solicitar un cambio.
      </p>
    </section>
  );
}
