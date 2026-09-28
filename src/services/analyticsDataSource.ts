const USE_MOCK_DATA = import.meta.env.VITE_DATA_SOURCE === 'mock';
const ALLOW_MOCK_FALLBACK = true;

export function analyticsRequest<T>(
  signal: AbortSignal | undefined,
  mockFactory: () => T,
  backendFactory: () => Promise<T>,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(new DOMException('The request was aborted.', 'AbortError'));
  if (USE_MOCK_DATA) return Promise.resolve().then(mockFactory);

  const request = backendFactory();
  if (!ALLOW_MOCK_FALLBACK) return request;
  return request.catch((error) => {
    console.warn('Backend analytics request failed, using demo intelligence fallback:', error);
    return mockFactory();
  });
}
