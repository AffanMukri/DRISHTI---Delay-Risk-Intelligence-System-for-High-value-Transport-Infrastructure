import { supabase } from './supabase';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000/api';
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');

interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
    requestId?: string;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(
    message: string,
    status: number,
    code = 'api_error',
    details?: unknown,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  get isRetryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  authenticated?: boolean;
  retries?: number;
}

export interface DownloadedFile {
  blob: Blob;
  fileName: string;
  contentType: string;
  reportId?: string;
  checksumSha256?: string;
  dataAsOf?: string;
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('The request was aborted.', 'AbortError'));
    }, { once: true });
  });
}

async function getAccessToken(refresh = false): Promise<string> {
  try {
    const result = refresh
      ? await supabase.auth.refreshSession()
      : await supabase.auth.getSession();
    const token = result.data.session?.access_token;
    if (token) return token;
  } catch {
    // ignore
  }

  try {
    const saved = localStorage.getItem('drishti_active_role_session');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.session?.access_token) return parsed.session.access_token;
    }
  } catch {
    // ignore
  }

  return 'drishti-demo-auth-bearer-token';
}

async function parseError(response: Response): Promise<ApiError> {
  let payload: ApiErrorEnvelope | undefined;
  try {
    payload = await response.json() as ApiErrorEnvelope;
  } catch {
    payload = undefined;
  }
  const error = payload?.error;
  return new ApiError(
    error?.message || `Request failed with status ${response.status}.`,
    response.status,
    error?.code || 'api_error',
    error?.details,
    error?.requestId || response.headers.get('x-request-id') || undefined,
  );
}

class ApiClient {
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const method = (options.method || 'GET').toUpperCase();
    const authenticated = options.authenticated !== false;
    const maxRetries = options.retries ?? (method === 'GET' ? 2 : 0);
    let refreshedSession = false;
    let attempt = 0;

    while (true) {
      try {
        const token = authenticated ? await getAccessToken(refreshedSession) : null;
        const headers = new Headers(options.headers);
        const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
        const requestBody: BodyInit | undefined = options.body === undefined
          ? undefined
          : isFormData
            ? options.body as FormData
            : JSON.stringify(options.body);
        headers.set('Accept', 'application/json');
        if (token) headers.set('Authorization', `Bearer ${token}`);
        if (options.body !== undefined && !isFormData) headers.set('Content-Type', 'application/json');

        const response = await fetch(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
          ...options,
          method,
          headers,
          body: requestBody,
        });

        if (response.status === 401 && authenticated && !refreshedSession) {
          refreshedSession = true;
          continue;
        }
        if (!response.ok) throw await parseError(response);
        if (response.status === 204) return undefined as T;
        return await response.json() as T;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        const apiError = error instanceof ApiError
          ? error
          : new ApiError('Unable to reach the DRISHTI API.', 0, 'network_error', error);
        if (!apiError.isRetryable || attempt >= maxRetries) throw apiError;
        await wait(250 * (2 ** attempt), options.signal ?? undefined);
        attempt += 1;
      }
    }
  }

  get<T>(path: string, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  patch<T>(path: string, body: unknown, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  delete<T = void>(path: string, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  async download(
    path: string,
    body: unknown,
    options: Omit<ApiRequestOptions, 'method' | 'body' | 'retries'> = {},
  ): Promise<DownloadedFile> {
    let refreshedSession = false;
    while (true) {
      try {
        const token = options.authenticated === false ? null : await getAccessToken(refreshedSession);
        const headers = new Headers(options.headers);
        headers.set('Accept', 'application/pdf, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv');
        headers.set('Content-Type', 'application/json');
        if (token) headers.set('Authorization', `Bearer ${token}`);
        const response = await fetch(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
          ...options,
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
        if (response.status === 401 && options.authenticated !== false && !refreshedSession) {
          refreshedSession = true;
          continue;
        }
        if (!response.ok) throw await parseError(response);
        const disposition = response.headers.get('content-disposition') || '';
        const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
        const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
        const encodedName = utf8Match?.[1] || plainMatch?.[1] || 'drishti-report';
        let fileName = encodedName;
        try {
          fileName = decodeURIComponent(encodedName);
        } catch {
          // The server also supplies an ASCII-safe fallback filename.
        }
        return {
          blob: await response.blob(),
          fileName,
          contentType: response.headers.get('content-type') || 'application/octet-stream',
          reportId: response.headers.get('x-report-id') || undefined,
          checksumSha256: response.headers.get('x-report-checksum-sha256') || undefined,
          dataAsOf: response.headers.get('x-data-as-of') || undefined,
        };
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        if (error instanceof ApiError) throw error;
        throw new ApiError('Unable to reach the DRISHTI API.', 0, 'network_error', error);
      }
    }
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
export { API_BASE_URL };
