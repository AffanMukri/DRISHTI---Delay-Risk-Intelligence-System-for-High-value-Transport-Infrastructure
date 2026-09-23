import { apiClient, type DownloadedFile } from '../lib/apiClient';

export type ReportType =
  | 'monthly_flash'
  | 'sector'
  | 'ministry'
  | 'critical_projects'
  | 'pragati_review_dossier'
  | 'intervention';

export type ReportFormat = 'pdf' | 'xlsx' | 'csv';

export interface ReportTypeOption {
  value: ReportType;
  label: string;
  description: string;
  formats: ReportFormat[];
  requires: 'sector' | 'ministry' | 'project' | null;
}

export interface ReportLookupOption {
  value: string;
  label: string;
}

export interface ReportProjectOption extends ReportLookupOption {
  sector: string;
  ministryId: string;
}

export interface ReportOptions {
  reportTypes: ReportTypeOption[];
  reportingMonths: string[];
  sectors: string[];
  ministries: ReportLookupOption[];
  projects: ReportProjectOption[];
}

export interface ReportGenerateInput {
  reportType: ReportType;
  outputFormat: ReportFormat;
  reportingMonth: string;
  sector?: string;
  ministryId?: string;
  projectId?: string;
  includeResolvedInterventions?: boolean;
}

class ReportService {
  options(signal?: AbortSignal): Promise<ReportOptions> {
    return apiClient.get<ReportOptions>('/reports/options', { signal });
  }

  generate(input: ReportGenerateInput, signal?: AbortSignal): Promise<DownloadedFile> {
    return apiClient.download('/reports/generate', input, { signal });
  }
}

export const reportService = new ReportService();

export function saveDownloadedReport(file: DownloadedFile): void {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

