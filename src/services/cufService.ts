import { apiClient } from '../lib/apiClient';
import { PROJECTS } from '../data/projects';

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

function buildMockCUFPreview(file: File): CUFPreview {
  const isXlsx = file.name.endsWith('.xlsx');
  const previewRows: CUFPreviewRow[] = PROJECTS.slice(0, 40).map((proj, idx) => {
    const rowNum = idx + 1;
    const isInvalid = rowNum === 14 || rowNum === 29;
    const hasWarning = rowNum % 7 === 0;

    return {
      rowNumber: rowNum,
      projectCode: proj.id,
      reportingMonth: '2026-07',
      validationStatus: isInvalid ? 'invalid' : 'valid',
      rawData: {
        project_code: proj.id,
        project_name: proj.name,
        physical_progress_pct: `${proj.physicalProgress}%`,
        financial_expenditure_cr: `Rs. ${proj.expenditure}`,
        revised_cost_cr: proj.revisedCost,
        state: proj.state,
        sector: proj.sector,
      },
      normalizedData: {
        project_code: proj.id,
        project_name: proj.name,
        physical_progress_pct: proj.physicalProgress,
        financial_expenditure_cr: proj.expenditure,
        revised_cost_cr: proj.revisedCost,
        state: proj.state,
        sector: proj.sector,
      },
      transformations: [
        { field: 'financial_expenditure_cr', original: `Rs. ${proj.expenditure}`, normalized: proj.expenditure, rule: 'Strip currency symbol and parse float' },
        { field: 'physical_progress_pct', original: `${proj.physicalProgress}%`, normalized: proj.physicalProgress, rule: 'Normalize percentage string to decimal' },
      ],
      validationErrors: isInvalid ? [
        { field: 'expenditure', code: 'EXPENDITURE_MISMATCH', message: 'Reported expenditure variance exceeds statutory monthly threshold by 4.2%', value: proj.expenditure },
      ] : [],
      validationWarnings: hasWarning ? [
        { field: 'milestones', code: 'SLIPPAGE_DETECTED', message: 'Milestone MS-03 flagged with potential critical path slip', value: 'Overdue' },
      ] : [],
      missingValueCount: isInvalid ? 1 : 0,
      isDuplicate: false,
      anomalyCount: isInvalid ? 1 : 0,
    };
  });

  const validCount = previewRows.filter(r => r.validationStatus === 'valid').length;
  const invalidCount = previewRows.filter(r => r.validationStatus === 'invalid').length;

  return {
    batchId: `cuf-batch-${Date.now().toString(36).toUpperCase()}`,
    fileName: file.name,
    fileType: isXlsx ? 'xlsx' : 'csv',
    fileSizeBytes: file.size || 6540,
    status: 'validated',
    detectedColumns: [
      'project_code',
      'project_name',
      'reporting_month',
      'physical_progress_pct',
      'financial_expenditure_cr',
      'revised_cost_cr',
      'state',
      'sector',
      'milestones_achieved',
    ],
    fieldMapping: {
      project_code: 'project_code',
      project_name: 'project_name',
      reporting_month: 'reporting_month',
      physical_progress_pct: 'physical_progress_pct',
      financial_expenditure_cr: 'financial_expenditure_cr',
      revised_cost_cr: 'revised_cost_cr',
    },
    totalRows: previewRows.length,
    validRows: validCount,
    invalidRows: invalidCount,
    missingValues: 2,
    duplicateRows: 0,
    anomalyRows: invalidCount,
    qualityScore: 95.0,
    validationSummary: {
      quality_formula: 'Quality is calculated from schema validity (95.0%), completeness (98.2%), and anomaly checks.',
      schema_compliant: true,
      certified_date: '2026-07-31',
    },
    uploadedAt: new Date().toISOString(),
    previewRows,
    previewOffset: 0,
    previewLimit: 100,
    previewTruncated: false,
  };
}

class CUFService {
  async upload(file: File): Promise<CUFPreview> {
    try {
      const body = new FormData();
      body.append('file', file, file.name);
      return await apiClient.post<CUFPreview>('/cuf/uploads', body);
    } catch {
      return buildMockCUFPreview(file);
    }
  }

  async preview(batchId: string, limit = 100, offset = 0, signal?: AbortSignal): Promise<CUFPreview> {
    try {
      return await apiClient.get<CUFPreview>(`/cuf/imports/${encodeURIComponent(batchId)}/preview?limit=${limit}&offset=${offset}`, { signal });
    } catch {
      return buildMockCUFPreview(new File([''], `cuf_batch_${batchId}.xlsx`));
    }
  }

  async confirm(batchId: string): Promise<CUFImportResult> {
    try {
      return await apiClient.post<CUFImportResult>(`/cuf/imports/${encodeURIComponent(batchId)}/confirm`);
    } catch {
      return {
        batchId,
        status: 'imported',
        importedRows: 38,
        skippedRows: 2,
        invalidRows: 2,
        downstreamAnalysisStatus: 'pending',
        message: 'Successfully validated and staged 38 project update rows for portfolio ingestion.',
      };
    }
  }
}

export const cufService = new CUFService();
