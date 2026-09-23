import { apiClient } from '../lib/apiClient';

export interface CUFValidationIssue {
  field: string;
  code: string;
  message: string;
  value?: unknown;
}

export interface CUFTransformation {
  field: string;
  original?: unknown;
  normalized?: unknown;
  rule: string;
}

export interface CUFPreviewRow {
  rowNumber: number;
  projectCode?: string | null;
  reportingMonth?: string | null;
  validationStatus: 'valid' | 'invalid' | 'imported' | 'conflict';
  rawData: Record<string, unknown>;
  normalizedData: Record<string, unknown>;
  transformations: CUFTransformation[];
  validationErrors: CUFValidationIssue[];
  validationWarnings: CUFValidationIssue[];
  missingValueCount: number;
  isDuplicate: boolean;
  anomalyCount: number;
}

export interface CUFPreview {
  batchId: string;
  fileName: string;
  fileType: 'csv' | 'xlsx';
  fileSizeBytes: number;
  status: 'validated' | 'importing' | 'imported' | 'failed';
  detectedColumns: string[];
  fieldMapping: Record<string, string | null>;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  missingValues: number;
  duplicateRows: number;
  anomalyRows: number;
  qualityScore: number;
  validationSummary: Record<string, unknown>;
  uploadedAt: string;
  previewRows: CUFPreviewRow[];
  previewOffset: number;
  previewLimit: number;
  previewTruncated: boolean;
}

export interface CUFImportResult {
  batchId: string;
  status: 'imported';
  importedRows: number;
  skippedRows: number;
  invalidRows: number;
  downstreamAnalysisStatus: 'pending';
  message: string;
}

class CUFService {
  upload(file: File): Promise<CUFPreview> {
    const body = new FormData();
    body.append('file', file, file.name);
    return apiClient.post<CUFPreview>('/cuf/uploads', body);
  }

  preview(batchId: string, limit = 100, offset = 0, signal?: AbortSignal): Promise<CUFPreview> {
    return apiClient.get<CUFPreview>(`/cuf/imports/${encodeURIComponent(batchId)}/preview?limit=${limit}&offset=${offset}`, { signal });
  }

  confirm(batchId: string): Promise<CUFImportResult> {
    return apiClient.post<CUFImportResult>(`/cuf/imports/${encodeURIComponent(batchId)}/confirm`);
  }
}

export const cufService = new CUFService();
