import { AuthTokensDto, LoginResultDto, MeDto } from '@valorize/shared';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { acceptSession, api, clearSession, getRefreshToken, onSessionChange, refreshSession } from './api';
import { registerForPush, unregisterPush } from './push';

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

  // Al iniciar sesión, registra el dispositivo para notificaciones push.
  useEffect(() => {
    if (user) void registerForPush();
  }, [user?.id]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      ready,
      setUser,
      async login(email, password) {
        const r = await api.post<LoginResultDto>('/auth/login', { email, password, client: 'mobile' }, { skipAuthRetry: true });
        if (!('mfaRequired' in r)) await acceptSession(r);
        return r;
      },
      async loginMfa(challengeToken, code) {
        await acceptSession(await api.post<AuthTokensDto>('/auth/login/mfa', { challengeToken, code, client: 'mobile' }, { skipAuthRetry: true }));
      },
      async register(data) {
        await acceptSession(await api.post<AuthTokensDto>('/auth/register', { ...data, client: 'mobile' }, { skipAuthRetry: true }));
      },
      async logout() {
        await unregisterPush().catch(() => undefined);
        const refreshToken = await getRefreshToken();
        await api.post('/auth/logout', { refreshToken }).catch(() => undefined);
        await clearSession();
      },
      async reload() {
        setUser(await api.get<MeDto>('/me'));
      },
    }),
    [user, ready],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fuera de AuthProvider');
  return c;
}
