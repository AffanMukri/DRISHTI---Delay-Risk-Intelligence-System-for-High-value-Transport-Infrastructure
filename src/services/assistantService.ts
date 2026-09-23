import { apiClient } from '../lib/apiClient';

export type AssistantIntent =
  | 'cost_schedule_filter'
  | 'risk_explanation'
  | 'interventions'
  | 'project_comparison'
  | 'attention_required'
  | 'document_search'
  | 'project_overview'
  | 'unsupported';

export interface AssistantEvidence {
  id: string;
  sourceType: 'project_database' | 'calculated_analytics' | 'risk_assessment' | 'warning' | 'intervention' | 'peer_benchmark' | 'project_document';
  title: string;
  projectId?: string | null;
  documentId?: string | null;
  pageNumber?: number | null;
  observedAt?: string | null;
  excerpt?: string | null;
  facts: Record<string, unknown>;
  relevanceScore?: number | null;
}

export interface AssistantAnswer {
  answer: string;
  intent: AssistantIntent;
  route: 'structured' | 'documents' | 'hybrid' | 'none';
  grounded: boolean;
  insufficientEvidence: boolean;
  modelUsed?: string | null;
  synthesisStatus: 'ollama' | 'deterministic_fallback' | 'not_attempted';
  evidence: AssistantEvidence[];
  limitations: string[];
  generatedAt: string;
  disclaimer: string;
}

export interface AssistantDocument {
  id: string;
  projectId: string;
  title: string;
  documentType: string;
  originalFileName: string;
  pageCount: number;
  chunkCount: number;
  embeddingModel?: string | null;
  checksumSha256?: string;
  createdAt: string;
}

export const AssistantApi = {
  ask(question: string, projectId?: string, signal?: AbortSignal): Promise<AssistantAnswer> {
    return apiClient.post<AssistantAnswer>('/assistant/ask', {
      question,
      projectId,
      includeDocuments: true,
    }, { signal });
  },

  listDocuments(projectId: string, signal?: AbortSignal): Promise<AssistantDocument[]> {
    return apiClient.get<AssistantDocument[]>(`/assistant/documents/${encodeURIComponent(projectId)}`, { signal });
  },

  uploadDocument(
    projectId: string,
    title: string,
    documentType: string,
    file: File,
    signal?: AbortSignal,
  ): Promise<AssistantDocument> {
    const form = new FormData();
    form.set('project_id', projectId);
    form.set('title', title);
    form.set('document_type', documentType);
    form.set('file', file);
    return apiClient.post<AssistantDocument>('/assistant/documents', form, { signal });
  },
};
