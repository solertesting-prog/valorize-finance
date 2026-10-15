'use client';

import { ADMIN_ROLES, AuthTokensDto, LoginResultDto, MeDto, Role, STAFF_ROLES } from '@valorize/shared';
import { useRouter } from 'next/navigation';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, onSessionChange, refreshSession, setAccessToken } from './api';

interface AuthState {
  user: MeDto | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<LoginResultDto>;
  loginMfa: (challengeToken: string, code: string) => Promise<void>;
  register: (data: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: MeDto) => void;
  reload: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeDto | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onSessionChange((s) => setUser(s?.user ?? null));
    refreshSession().finally(() => setReady(true));
  }, []);

  const accept = useCallback((s: AuthTokensDto) => {
    setAccessToken(s.accessToken);
    setUser(s.user);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      ready,
      setUser,
      async login(email, password) {
        const r = await api.post<LoginResultDto>('/auth/login', { email, password, client: 'web' }, { skipAuthRetry: true });
        if (!('mfaRequired' in r)) accept(r);
        return r;
      },
      async loginMfa(challengeToken, code) {
        accept(await api.post<AuthTokensDto>('/auth/login/mfa', { challengeToken, code, client: 'web' }, { skipAuthRetry: true }));
      },
      async register(data) {
        accept(await api.post<AuthTokensDto>('/auth/register', { ...data, client: 'web' }, { skipAuthRetry: true }));
      },
      async logout() {
        await api.post('/auth/logout', {}).catch(() => undefined);
        setAccessToken(null);
        setUser(null);
      },
      async reload() {
        setUser(await api.get<MeDto>('/me'));
      },
    }),
    [user, ready, accept],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fuera de AuthProvider');
  return c;
}

export function homeFor(role: Role): string {
  if (ADMIN_ROLES.includes(role)) return '/admin';
  if (STAFF_ROLES.includes(role)) return '/panel';
  return '/app';
}

/** Protege una zona: redirige a login o a la zona propia del rol. */
export function useRequireRole(roles: Role[] | 'any') {
  const { user, ready } = useAuth();
  const router = useRouter();
  const allowed = !!user && (roles === 'any' || roles.includes(user.role));
  useEffect(() => {
    if (!ready) return;
    if (!user) {
      const next = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/';
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    } else if (!allowed) {
      router.replace(homeFor(user.role));
    }
  }, [ready, user, allowed, router]);
  return { user, ready: ready && allowed };
}
