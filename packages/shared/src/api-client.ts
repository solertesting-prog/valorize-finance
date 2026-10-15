import type { ApiErrorBody } from './types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  /** URL base de la API, p. ej. "/api/v1" en web o "https://api.valorize.finance/v1" en móvil. */
  baseUrl: string;
  /** Devuelve el access token actual (en memoria). */
  getAccessToken: () => string | null | undefined;
  /**
   * Renueva la sesión y devuelve el nuevo access token, o null si no es posible.
   * Se llama una sola vez por petición fallida con 401.
   */
  refresh: () => Promise<string | null>;
  /** Se invoca cuando la sesión no se puede renovar. */
  onUnauthorized?: () => void;
  /** Envía cookies (web). */
  withCredentials?: boolean;
  fetchImpl?: typeof fetch;
  /** Cabeceras fijas (p. ej. X-Client: mobile). */
  headers?: Record<string, string>;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  /** No intentar refresh ante 401 (p. ej. en el propio login). */
  skipAuthRetry?: boolean;
}

export function buildQuery(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.append(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function createApiClient(opts: ApiClientOptions) {
  const doFetch = opts.fetchImpl ?? fetch;
  let refreshing: Promise<string | null> | null = null;

  async function raw<T>(method: string, path: string, ro: RequestOptions = {}, retried = false): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers ?? {}) };
    const token = opts.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    let body: string | undefined;
    if (ro.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(ro.body);
    }
    const res = await doFetch(`${opts.baseUrl}${path}${buildQuery(ro.query)}`, {
      method,
      headers,
      body,
      signal: ro.signal,
      credentials: opts.withCredentials ? 'include' : 'omit',
    });

    if (res.status === 401 && !ro.skipAuthRetry && !retried) {
      refreshing ??= opts.refresh().finally(() => {
        refreshing = null;
      });
      const newToken = await refreshing;
      if (newToken) return raw<T>(method, path, ro, true);
      opts.onUnauthorized?.();
    }

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const data = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const err = (data ?? {}) as Partial<ApiErrorBody>;
      throw new ApiError(res.status, err.code ?? 'HTTP_ERROR', err.message ?? res.statusText, err.details);
    }
    return data as T;
  }

  return {
    get: <T>(path: string, ro?: RequestOptions) => raw<T>('GET', path, ro),
    post: <T>(path: string, body?: unknown, ro?: RequestOptions) => raw<T>('POST', path, { ...ro, body }),
    patch: <T>(path: string, body?: unknown, ro?: RequestOptions) => raw<T>('PATCH', path, { ...ro, body }),
    put: <T>(path: string, body?: unknown, ro?: RequestOptions) => raw<T>('PUT', path, { ...ro, body }),
    delete: <T>(path: string, ro?: RequestOptions) => raw<T>('DELETE', path, ro),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

/** Mensaje legible para mostrar en UI. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Ha ocurrido un error inesperado';
}
