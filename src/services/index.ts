import { ApiError } from '../lib/apiClient';
import type { ProjectDataService } from './contracts';
import { BackendProjectService } from './backendProjectService';
import { MockProjectService } from './mockProjectService';

const backendService = new BackendProjectService();
const mockService = new MockProjectService();
const useMockOnly = import.meta.env.VITE_DATA_SOURCE === 'mock';
const allowMockFallback = true;

function shouldFallback(error: unknown): boolean {
  return !(error instanceof ApiError) || error.isRetryable || error.status === 0 || error.code === 'network_error';
}

function withOptionalFallback(primary: ProjectDataService, fallback: ProjectDataService): ProjectDataService {
  return new Proxy(primary, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return async (...args: unknown[]) => {
        try {
          return await value.apply(target, args);
        } catch (error) {
          if (!shouldFallback(error)) throw error;
          const fallbackMethod = Reflect.get(fallback, property) as (...fallbackArgs: unknown[]) => unknown;
          return fallbackMethod.apply(fallback, args);
        }
      };
    },
  });
}

export const ProjectService: ProjectDataService = useMockOnly
  ? mockService
  : allowMockFallback
    ? withOptionalFallback(backendService, mockService)
    : backendService;

export { BackendProjectService } from './backendProjectService';
export { MockProjectService } from './mockProjectService';
export type { AnalyticsKind, ProjectDataService, ProjectFilters, ProjectsResult } from './contracts';

