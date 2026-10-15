'use client';

import { ADMIN_ROLES, fullName, Role, ROLE_LABEL, STAFF_ROLES } from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth, useRequireRole } from '@/lib/auth';
import { Icon, Spinner } from './ui';

function isActive(pathname: string, href: string, exact = false) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

// ─────────────────────────── Cliente ───────────────────────────

const CUSTOMER_NAV = [
  { href: '/app', label: 'Inicio', icon: 'home', exact: true },
  { href: '/app/ubicaciones', label: 'Ubicaciones', icon: 'pin' },
  { href: '/app/reservas', label: 'Mis citas', icon: 'qr' },
  { href: '/app/perfil', label: 'Perfil', icon: 'user' },
];

export function CustomerShell({ children }: { children: ReactNode }) {
  const { ready } = useRequireRole(['CUSTOMER']);
  const pathname = usePathname();
  const unread = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get<{ count: number }>('/me/notifications/unread-count'),
    enabled: ready,
    refetchInterval: 60_000,
  });

  if (!ready) return <Spinner />;
  const count = unread.data?.count ?? 0;

  return (
    <>
      <a href="#contenido" className="sr-only">
        Saltar al contenido
      </a>
      <header className="app-top">
        <Link href="/app" className="brand">
          <b>VALORIZE</b> FINANCE
        </Link>
        <nav className="app-nav-desktop" aria-label="Principal">
          {CUSTOMER_NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={isActive(pathname, n.href, n.exact) ? 'page' : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/app/notificaciones"
          className="btn ghost bell"
          aria-label={count ? `Notificaciones, ${count} sin leer` : 'Notificaciones'}
        >
          <Icon name="bell" size={22} />
          {count > 0 ? <span className="dot">{count > 9 ? '9+' : count}</span> : null}
        </Link>
      </header>
      <main id="contenido">{children}</main>
      <nav className="tabbar" aria-label="Principal">
        {CUSTOMER_NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={isActive(pathname, n.href, n.exact) ? 'page' : undefined}>
            <Icon name={n.icon} />
            {n.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

// ─────────────────────────── Panel / backoffice ───────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
  roles?: Role[];
}

const STAFF_NAV: NavItem[] = [
  { href: '/panel', label: 'Hoy', icon: 'home', exact: true },
  { href: '/panel/escanear', label: 'Escanear QR', icon: 'scan' },
  { href: '/panel/agenda', label: 'Citas', icon: 'calendar' },
  { href: '/panel/incidencias', label: 'Incidencias', icon: 'alert' },
];

const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Analítica', icon: 'chart', exact: true },
  { href: '/admin/citas', label: 'Citas', icon: 'calendar' },
  { href: '/admin/clientes', label: 'Clientes', icon: 'users' },
  { href: '/admin/verificaciones', label: 'Verificaciones', icon: 'shield' },
  { href: '/admin/ubicaciones', label: 'Ubicaciones', icon: 'building' },
  { href: '/admin/servicios', label: 'Servicios', icon: 'tag' },
  { href: '/admin/equipo', label: 'Equipo y roles', icon: 'user' },
  { href: '/admin/requisitos-kyc', label: 'Requisitos KYC', icon: 'doc', roles: ['ADMIN'] },
  { href: '/admin/webhooks', label: 'Webhooks', icon: 'link', roles: ['ADMIN'] },
  { href: '/admin/auditoria', label: 'Auditoría', icon: 'log', roles: ['ADMIN'] },
];

export function OpsShell({ area, children, toolbar }: { area: 'panel' | 'admin'; children: ReactNode; toolbar?: ReactNode }) {
  const { ready, user } = useRequireRole(area === 'admin' ? ADMIN_ROLES : STAFF_ROLES);
  const { logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  if (!ready || !user) return <Spinner />;

  const nav = (area === 'admin' ? ADMIN_NAV : STAFF_NAV).filter((n) => !n.roles || n.roles.includes(user.role));
  const otherArea = area === 'admin' ? { href: '/panel', label: 'Ir al panel de atención' } : ADMIN_ROLES.includes(user.role) ? { href: '/admin', label: 'Ir al backoffice' } : null;

  return (
    <div className="ops">
      <aside className="ops-side" aria-label="Navegación">
        <Link href={area === 'admin' ? '/admin' : '/panel'} className="brand">
          VALORIZE
        </Link>
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className="nav" aria-current={isActive(pathname, n.href, n.exact) ? 'page' : undefined}>
            <Icon name={n.icon} />
            {n.label}
          </Link>
        ))}
        {otherArea ? (
          <>
            <div className="group">Otras áreas</div>
            <Link href={otherArea.href} className="nav">
              <Icon name="link" />
              {otherArea.label}
            </Link>
          </>
        ) : null}
        <div className="foot">
          <div style={{ color: 'var(--paper)', fontWeight: 600 }}>{fullName(user)}</div>
          <div>{ROLE_LABEL[user.role]}</div>
          <button
            className="btn ghost sm"
            style={{ paddingLeft: 0, marginTop: 8 }}
            onClick={async () => {
              await logout();
              router.replace('/login');
            }}
          >
            <Icon name="logout" size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>
      <div className="ops-main">
        <div className="ops-top">
          <Link href={area === 'admin' ? '/admin' : '/panel'} className="brand" style={{ color: 'var(--mint)', textDecoration: 'none' }}>
            <span className="ops-brand-mobile">VALORIZE</span>
          </Link>
          <div className="row">{toolbar}</div>
        </div>
        <nav className="ops-mobile-nav" aria-label="Navegación">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={isActive(pathname, n.href, n.exact) ? 'page' : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <main id="contenido">
          {!user.mfaEnabled ? (
            <div className="page" style={{ paddingBottom: 0 }}>
              <div className="alert warn">
                El personal debe tener activada la verificación en dos pasos.{' '}
                <Link href="/cuenta/seguridad">Actívala ahora</Link>.
              </div>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

// ─────────────────────────── Ubicación activa del empleado ───────────────────────────

interface StaffLocation {
  id: string;
  name: string;
  city: string;
  timezone: string;
}

const LocCtx = createContext<{ location: StaffLocation | null; locations: StaffLocation[]; setId: (id: string) => void }>({
  location: null,
  locations: [],
  setId: () => undefined,
});

const KEY = 'vf.staff.location';

export function StaffLocationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['staff', 'locations'],
    queryFn: () => api.get<StaffLocation[]>('/staff/locations'),
    enabled: !!user && STAFF_ROLES.includes(user.role),
  });
  const [id, setIdState] = useState<string | null>(null);

  useEffect(() => {
    try {
      setIdState(localStorage.getItem(KEY));
    } catch {
      /* almacenamiento no disponible */
    }
  }, []);

  const locations = q.data ?? [];
  const location = locations.find((l) => l.id === id) ?? locations[0] ?? null;
  const setId = (v: string) => {
    setIdState(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* noop */
    }
  };
  return <LocCtx.Provider value={{ location, locations, setId }}>{children}</LocCtx.Provider>;
}

export const useStaffLocation = () => useContext(LocCtx);

export function LocationSwitcher() {
  const { location, locations, setId } = useStaffLocation();
  if (locations.length <= 1) return location ? <span className="small muted">{location.name}</span> : null;
  return (
    <label className="row small" style={{ gap: 8 }}>
      <span className="muted">Ubicación</span>
      <select className="select" style={{ minHeight: 36, width: 'auto' }} value={location?.id} onChange={(e) => setId(e.target.value)}>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
