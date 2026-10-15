import { AuthTokensDto, createApiClient } from '@valorize/shared';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

/**
 * Sesión móvil:
 *  - access token en memoria
 *  - refresh token en el llavero del sistema (Keychain / Android Keystore) vía SecureStore
 */
export const API_URL: string = (Constants.expoConfig?.extra?.apiUrl as string) ?? 'http://localhost:4000/v1';
const RT_KEY = 'vf.refresh';

let accessToken: string | null = null;
let listener: ((s: AuthTokensDto | null) => void) | null = null;
let inflight: Promise<AuthTokensDto | null> | null = null;

export function onSessionChange(fn: (s: AuthTokensDto | null) => void) {
  listener = fn;
}

export async function acceptSession(s: AuthTokensDto) {
  accessToken = s.accessToken;
  if (s.refreshToken) await SecureStore.setItemAsync(RT_KEY, s.refreshToken, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  listener?.(s);
}

export async function clearSession() {
  accessToken = null;
  await SecureStore.deleteItemAsync(RT_KEY);
  listener?.(null);
}

export function refreshSession(): Promise<AuthTokensDto | null> {
  inflight ??= (async () => {
    const rt = await SecureStore.getItemAsync(RT_KEY);
    if (!rt) return null;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt, client: 'mobile' }),
      });
      if (res.status === 401) {
        await clearSession();
        return null;
      }
      if (!res.ok) return null; // error de red/servidor: conservamos la sesión para reintentar
      const s = (await res.json()) as AuthTokensDto;
      await acceptSession(s);
      return s;
    } catch {
      return null;
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export const api = createApiClient({
  baseUrl: API_URL,
  getAccessToken: () => accessToken,
  refresh: async () => (await refreshSession())?.accessToken ?? null,
  onUnauthorized: () => void clearSession(),
});

export async function getRefreshToken() {
  return SecureStore.getItemAsync(RT_KEY);
}
