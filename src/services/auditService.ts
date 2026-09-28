import { apiClient } from '../lib/apiClient';
import { listMockAuditLogs, mockAuditOptions, recordMockSecurityEvent } from './mockAudit';

const USE_MOCK_AUDIT = import.meta.env.VITE_DATA_SOURCE === 'mock';

export interface AuditActor {
  id?: string | null;
  email?: string | null;
  fullName?: string | null;
  role?: string | null;
}

export interface AuditProject {
  id: string;
  projectCode: string;
  name: string;
}

export interface AuditLogItem {
  id: string;
  actor: AuditActor;
  project?: AuditProject | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  tableName?: string | null;
  recordKey?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  source: string;
  requestReference?: string | null;
  importReference?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata: Record<string, unknown>;
  eventVersion: number;
  occurredAt: string;
}

export interface AuditLogResponse {
  items: AuditLogItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditFilterOptions {
  actions: string[];
  entityTypes: string[];
  sources: string[];
  actors: Array<{ id: string; email: string; fullName?: string | null }>;
}

export interface AuditFilters {
  action?: string;
  entityType?: string;
  source?: string;
  actorId?: string;
  occurredFrom?: string;
  occurredTo?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

function queryString(filters: AuditFilters): string {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === '') return;
    const apiKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    query.set(apiKey, String(value));
  });
  const value = query.toString();
  return value ? `?${value}` : '';
}

export const AuditService = {
  async list(filters: AuditFilters, signal?: AbortSignal): Promise<AuditLogResponse> {
    if (USE_MOCK_AUDIT) return listMockAuditLogs(filters);
    try {
      return await apiClient.get<AuditLogResponse>(`/audit/logs${queryString(filters)}`, { signal });
    } catch {
      return listMockAuditLogs(filters);
    }
  },

  async options(signal?: AbortSignal): Promise<AuditFilterOptions> {
    if (USE_MOCK_AUDIT) return mockAuditOptions();
    try {
      return await apiClient.get<AuditFilterOptions>('/audit/options', { signal });
    } catch {
      return mockAuditOptions();
    }
  },

  async securityEvent(action: 'login_success' | 'logout_requested'): Promise<void> {
    if (USE_MOCK_AUDIT) {
      recordMockSecurityEvent(action);
      return;
    }
    try {
      await apiClient.post('/audit/security-events', {
        action,
        metadata: { client: 'drishti-web' },
      });
    } catch {
      recordMockSecurityEvent(action);
    }
  },
};
