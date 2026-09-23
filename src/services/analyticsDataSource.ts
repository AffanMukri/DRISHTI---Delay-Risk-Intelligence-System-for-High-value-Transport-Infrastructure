import { ApiError } from '../lib/apiClient';

const USE_MOCK_DATA = import.meta.env.VITE_DATA_SOURCE === 'mock';
const ALLOW_MOCK_FALLBACK = import.meta.env.VITE_ENABLE_MOCK_FALLBACK === 'true';

export function analyticsRequest<T>(
  signal: AbortSignal | undefined,
  mockFactory: () => T,
  backendFactory: () => Promise<T>,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(new DOMException('The request was aborted.', 'AbortError'));
  if (USE_MOCK_DATA) return Promise.resolve().then(mockFactory);

  const request = backendFactory();
  if (!ALLOW_MOCK_FALLBACK) return request;
  return request.catch(error => {
    if (error instanceof ApiError && !error.isRetryable) throw error;
    return mockFactory();
  });
}
