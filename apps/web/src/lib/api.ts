'use client';

import { AuthTokensDto, createApiClient } from '@valorize/shared';

/**
 * Sesión web:
 *  - access token solo en memoria (no localStorage → no expuesto a XSS persistente)
 *  - refresh token en cookie httpOnly SameSite=Strict, gestionada por la API
 */
let accessToken: string | null = null;
let onSession: ((s: AuthTokensDto | null) => void) | null = null;

export function setAccessToken(t: string | null) {
  accessToken = t;
}

export function onSessionChange(fn: (s: AuthTokensDto | null) => void) {
  onSession = fn;
}

let inflight: Promise<AuthTokensDto | null> | null = null;

/** Renueva la sesión con la cookie. Deduplica llamadas concurrentes. */
export function refreshSession(): Promise<AuthTokensDto | null> {
  inflight ??= fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client: 'web' }),
  })
    .then(async (r) => {
      if (!r.ok) return null;
      const s = (await r.json()) as AuthTokensDto;
      accessToken = s.accessToken;
      onSession?.(s);
      return s;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export const api = createApiClient({
  baseUrl: '/api/v1',
  withCredentials: true,
  getAccessToken: () => accessToken,
  refresh: async () => (await refreshSession())?.accessToken ?? null,
  onUnauthorized: () => {
    accessToken = null;
    onSession?.(null);
  },
});

/** fetch autenticado para respuestas no JSON (ficheros). */
export async function authFetch(path: string): Promise<Response> {
  const go = () => fetch(`/api/v1${path}`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  let r = await go();
  if (r.status === 401 && (await refreshSession())) r = await go();
  if (!r.ok) throw new Error('No se pudo descargar el fichero');
  return r;
}

/** Sube un fichero directamente a S3 con URL firmada y lo confirma en la API. */
export async function uploadFile(file: File, purpose: 'KYC_DOCUMENT' | 'AVATAR' | 'INCIDENT_ATTACHMENT'): Promise<string> {
  const ticket = await api.post<{ fileId: string; uploadUrl: string; headers: Record<string, string> }>('/files/upload-url', {
    purpose,
    contentType: file.type,
    size: file.size,
    fileName: file.name,
  });
  const put = await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: file });
  if (!put.ok) throw new Error('No se pudo subir el fichero. Inténtalo de nuevo.');
  await api.post(`/files/${ticket.fileId}/complete`);
  return ticket.fileId;
}
