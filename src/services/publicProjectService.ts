import { PROJECTS } from '../data/projects';
import { apiClient } from '../lib/apiClient';
import type { Project, ProjectStatus } from '../types';

export interface PublicProjectMilestone {
  name: string;
  plannedDate: string;
}

export interface PublicProject {
  id: string;
  name: string;
  ministry: string;
  implementingAgency: string | null;
  sector: string;
  projectType: string | null;
  state: string;
  description: string | null;
  status: ProjectStatus;
  currency: string;
  approvedCost: number;
  revisedCost: number;
  physicalProgress: number;
  originalCompletionDate: string | null;
  revisedCompletionDate: string | null;
  lastReportedAt: string | null;
  milestones: PublicProjectMilestone[];
}

interface ApiPublicProject extends Omit<PublicProject, 'status'> {
  status: 'active' | 'completed' | 'on_hold' | 'under_review';
}

interface ApiPublicProjectListResponse {
  items: ApiPublicProject[];
  total: number;
  limit: number;
  offset: number;
}

interface PublicProjectListResponse {
  items: PublicProject[];
  total: number;
  limit: number;
  offset: number;
}

function sanitizeMockProject(project: Project): PublicProject {
  return {
    id: project.id,
    name: project.name,
    ministry: project.ministry,
    implementingAgency: project.implementingAgency || null,
    sector: project.sector,
    projectType: project.projectType || null,
    state: project.state,
    description: project.description || null,
    status: project.status,
    currency: 'INR',
    approvedCost: project.approvedCost,
    revisedCost: project.revisedCost,
    physicalProgress: project.physicalProgress,
    originalCompletionDate: project.originalCompletionDate || null,
    revisedCompletionDate: project.revisedCompletionDate || null,
    lastReportedAt: project.lastUpdated || null,
    milestones: (project.milestones || []).map(milestone => ({
      name: milestone.name,
      plannedDate: milestone.plannedDate,
    })),
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function fromApi(project: ApiPublicProject): PublicProject {
  const projectStatuses: Record<ApiPublicProject['status'], ProjectStatus> = {
    active: 'Active',
    completed: 'Completed',
    on_hold: 'On Hold',
    under_review: 'Under Review',
  };
  return {
    ...project,
    status: projectStatuses[project.status] || 'Active',
  };
}

function getMockSearchResults(search = ''): PublicProjectListResponse {
  const term = normalize(search);
  const items = PROJECTS
    .map(sanitizeMockProject)
    .filter(project => !term || normalize([
      project.id,
      project.name,
      project.state,
      project.sector,
      project.ministry,
      project.implementingAgency || '',
    ].join(' ')).includes(term))
    .slice(0, 20);
  return { items, total: items.length, limit: 20, offset: 0 };
}

export function publicProjectUrl(projectId: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('publicProject', projectId);
  return url.toString();
}

export function projectIdFromQrPayload(payload: string): string | null {
  const value = payload.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    const candidate = url.searchParams.get('publicProject');
    if (candidate && /^[a-z0-9_-]{2,100}$/i.test(candidate)) return candidate;
  } catch {
    // Plain project identifiers and DRISHTI payloads are accepted below.
  }

  const prefixed = value.match(/^DRISHTI:PROJECT:([a-z0-9_-]{2,100})$/i)?.[1];
  if (prefixed) return prefixed;
  return /^[a-z0-9_-]{2,100}$/i.test(value) ? value : null;
}

export const PublicProjectService = {
  async search(search = '', signal?: AbortSignal): Promise<PublicProjectListResponse> {
    try {
      const query = new URLSearchParams({ limit: '20' });
      if (search.trim()) query.set('search', search.trim());
      const response = await apiClient.get<ApiPublicProjectListResponse>(`/public/projects?${query}`, {
        authenticated: false,
        signal,
      });
      if (response?.items?.length) {
        return { ...response, items: response.items.map(fromApi) };
      }
      return getMockSearchResults(search);
    } catch {
      return getMockSearchResults(search);
    }
  },

  async get(projectId: string, signal?: AbortSignal): Promise<PublicProject | null> {
    try {
      const project = await apiClient.get<ApiPublicProject>(`/public/projects/${encodeURIComponent(projectId)}`, {
        authenticated: false,
        signal,
      });
      if (project?.id) return fromApi(project);
    } catch {
      // ignore
    }

    const mock = PROJECTS.find(item => item.id.toLowerCase() === projectId.toLowerCase());
    return mock ? sanitizeMockProject(mock) : null;
  },
};
