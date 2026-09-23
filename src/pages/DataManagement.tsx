import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Database, FileSpreadsheet, Info,
  RefreshCw, ShieldCheck, UploadCloud, XCircle,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { usePragatiData } from '../context/PragatiDataContext';
import { cufService, type CUFImportResult, type CUFPreview } from '../services/cufService';
import { Badge, ErrorState } from '../components/ui';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function DataManagement() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { hasPermission } = useAuth();
  const { reload } = usePragatiData();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CUFPreview | null>(null);
  const [result, setResult] = useState<CUFImportResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canImport = hasPermission('manage_project_updates');
  const validationItems = useMemo(() => preview?.previewRows.flatMap(row => [
    ...row.validationErrors.map(issue => ({ ...issue, row: row.rowNumber, level: 'error' as const })),
    ...row.validationWarnings.map(issue => ({ ...issue, row: row.rowNumber, level: 'warning' as const })),
  ]) ?? [], [preview]);
  const transformations = useMemo(() => preview?.previewRows.flatMap(row =>
    row.transformations.map(item => ({ ...item, row: row.rowNumber }))) ?? [], [preview]);

  const chooseFile = (selected: File | null) => {
    setError(null);
    setPreview(null);
    setResult(null);
    setConfirmed(false);
    if (!selected) {
      setFile(null);
      return;
    }
    const extension = selected.name.split('.').pop()?.toLowerCase();
    if (extension !== 'csv' && extension !== 'xlsx') {
      setFile(null);
      setError('Only CSV and XLSX CUF files are accepted.');
      return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      setFile(null);
      setError('The selected file exceeds the 10 MB upload limit.');
      return;
    }
    setFile(selected);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      setPreview(await cufService.upload(file));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'CUF validation failed.');
    } finally {
      setUploading(false);
    }
  };

  const importValidRows = async () => {
    if (!preview || !confirmed || !canImport) return;
    setImporting(true);
    setError(null);
    try {
      const imported = await cufService.confirm(preview.batchId);
      setResult(imported);
      setPreview(current => current ? { ...current, status: 'imported' } : current);
      reload();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'The confirmed import failed.');
    } finally {
      setImporting(false);
    }
  };

  const loadPreviewPage = async (offset: number) => {
    if (!preview) return;
    setLoadingPage(true);
    setError(null);
    try {
      setPreview(await cufService.preview(preview.batchId, preview.previewLimit, Math.max(0, offset)));
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Unable to load validation rows.');
    } finally {
      setLoadingPage(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setConfirmed(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-navy-900 tracking-tight">Data Management & CUF Ingestion</h1>
            <Badge variant="neutral">Controlled Import</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Validate monthly Central Unified Format submissions before certified portfolio data is updated.
          </p>
        </div>
        {(file || preview) && (
          <button onClick={reset} className="btn btn-secondary text-xs flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Start new validation
          </button>
        )}
      </div>

      <div className="p-3.5 bg-blue-50 border border-blue-200 rounded flex items-start gap-3 text-xs text-blue-900">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-gov-blue" />
        <div>
          <p className="font-semibold">Source values remain auditable</p>
          <p className="mt-0.5 text-blue-800">
            Original cells, normalized values, transformations, warnings, and failures are stored separately. Invalid rows are never silently corrected or imported.
          </p>
        </div>
      </div>

      {!preview && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="text-sm font-semibold text-navy-800">1. Upload monthly CUF file</h2>
              <p className="text-2xs text-slate-500 mt-0.5">CSV or XLSX · maximum 10 MB · maximum 10,000 data rows</p>
            </div>
          </div>
          <div className="card-body space-y-4">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={event => chooseFile(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full min-h-44 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-blue-50 hover:border-blue-300 transition-colors flex flex-col items-center justify-center p-6 text-center"
            >
              {file ? <FileSpreadsheet className="w-9 h-9 text-green-700" /> : <UploadCloud className="w-9 h-9 text-gov-blue" />}
              <p className="text-sm font-semibold text-navy-800 mt-3">{file ? file.name : 'Select a CUF file'}</p>
              <p className="text-xs text-slate-500 mt-1">{file ? formatBytes(file.size) : 'Choose an authorized monthly submission from your device'}</p>
            </button>
            <div className="flex items-center justify-between gap-4">
              <p className="text-2xs text-slate-500">Upload performs validation only. No project data is imported at this stage.</p>
              <button disabled={!file || uploading} onClick={() => void upload()} className="btn btn-primary disabled:opacity-50 min-w-40">
                {uploading ? 'Validating file…' : 'Upload & validate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="card"><ErrorState description={error} onRetry={file && !preview ? () => void upload() : undefined} /></div>}

      {preview && (
        <>
          <div className="card">
            <div className="card-header flex-wrap gap-3">
              <div>
                <h2 className="text-sm font-semibold text-navy-800">2. Validation preview</h2>
                <p className="text-2xs text-slate-500 mt-0.5">{preview.fileName} · {formatBytes(preview.fileSizeBytes)} · Batch {preview.batchId}</p>
              </div>
              <Badge variant={preview.status === 'imported' ? 'healthy' : 'info'}>{preview.status}</Badge>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                {[
                  ['Total rows', preview.totalRows, 'text-navy-900'],
                  ['Valid rows', preview.validRows, 'text-green-700'],
                  ['Invalid rows', preview.invalidRows, 'text-red-700'],
                  ['Missing values', preview.missingValues, 'text-amber-700'],
                  ['Duplicates', preview.duplicateRows, 'text-orange-700'],
                  ['Anomalies', preview.anomalyRows, 'text-purple-700'],
                  ['Quality score', `${preview.qualityScore.toFixed(1)}%`, preview.qualityScore >= 80 ? 'text-green-700' : 'text-amber-700'],
                ].map(([label, value, color]) => (
                  <div key={String(label)} className="p-3 bg-slate-50 border border-slate-200 rounded">
                    <p className="text-2xs text-slate-500">{label}</p>
                    <p className={`text-xl font-bold tabular-nums mt-1 ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-start gap-2 text-2xs text-slate-500">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>{String(preview.validationSummary.quality_formula ?? preview.validationSummary.qualityFormula ?? 'Quality is calculated from validity, completeness, uniqueness, and anomaly checks.')}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card overflow-hidden">
              <div className="card-header"><h2 className="text-sm font-semibold text-navy-800">Detected field mapping</h2></div>
              <div className="overflow-x-auto max-h-80">
                <table className="data-table">
                  <thead><tr><th>Incoming column</th><th>Canonical field</th><th>Status</th></tr></thead>
                  <tbody>
                    {Object.entries(preview.fieldMapping).map(([source, target]) => (
                      <tr key={source}>
                        <td className="font-medium text-slate-700">{source}</td>
                        <td className="font-mono text-xs">{target ?? '—'}</td>
                        <td>{target ? <Badge variant="healthy">Mapped</Badge> : <Badge variant="watch">Unmapped</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="card-header">
                <div>
                  <h2 className="text-sm font-semibold text-navy-800">Reported transformations</h2>
                  <p className="text-2xs text-slate-500 mt-0.5">Every changed representation is disclosed before import.</p>
                </div>
              </div>
              <div className="overflow-x-auto max-h-80">
                <table className="data-table">
                  <thead><tr><th>Row</th><th>Field</th><th>Original</th><th>Normalized</th></tr></thead>
                  <tbody>
                    {transformations.slice(0, 50).map((item, index) => (
                      <tr key={`${item.row}-${item.field}-${index}`}>
                        <td>{item.row}</td><td className="font-mono text-xs">{item.field}</td>
                        <td className="max-w-36 truncate" title={displayValue(item.original)}>{displayValue(item.original)}</td>
                        <td className="max-w-36 truncate" title={displayValue(item.normalized)}>{displayValue(item.normalized)}</td>
                      </tr>
                    ))}
                    {transformations.length === 0 && <tr><td colSpan={4} className="text-center text-slate-500 py-8">No transformations were required.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="card-header flex-wrap gap-3">
              <div>
                <h2 className="text-sm font-semibold text-navy-800">Row validation results</h2>
                <p className="text-2xs text-slate-500 mt-0.5">Invalid rows remain staged and will not be included in confirmation.</p>
              </div>
              <Badge variant="neutral">Rows {preview.previewOffset + 1}–{preview.previewOffset + preview.previewRows.length} of {preview.totalRows}</Badge>
            </div>
            <div className="overflow-x-auto max-h-[30rem]">
              <table className="data-table">
                <thead><tr><th>Source row</th><th>Project</th><th>Reporting month</th><th>Status</th><th>Missing</th><th>Errors / warnings</th></tr></thead>
                <tbody>
                  {preview.previewRows.map(row => (
                    <tr key={row.rowNumber}>
                      <td className="tabular-nums">{row.rowNumber}</td>
                      <td className="font-semibold text-navy-800">{row.projectCode || 'Unresolved'}</td>
                      <td>{row.reportingMonth || '—'}</td>
                      <td>
                        {row.validationStatus === 'valid' || row.validationStatus === 'imported'
                          ? <Badge variant="healthy">{row.validationStatus}</Badge>
                          : <Badge variant="critical">{row.validationStatus}</Badge>}
                      </td>
                      <td>{row.missingValueCount}</td>
                      <td className="min-w-72">
                        {row.validationErrors.map(issue => <div key={`${issue.code}-${issue.field}`} className="text-2xs text-red-700">{issue.field}: {issue.message}</div>)}
                        {row.validationWarnings.map(issue => <div key={`${issue.code}-${issue.field}`} className="text-2xs text-amber-700">{issue.field}: {issue.message}</div>)}
                        {!row.validationErrors.length && !row.validationWarnings.length && <span className="text-2xs text-green-700">No validation findings</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.totalRows > preview.previewLimit && (
              <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                <button
                  className="btn btn-secondary text-xs disabled:opacity-50"
                  disabled={loadingPage || preview.previewOffset === 0}
                  onClick={() => void loadPreviewPage(preview.previewOffset - preview.previewLimit)}
                >Previous rows</button>
                <span className="text-2xs text-slate-500">Invalid and conflict rows are listed before valid rows.</span>
                <button
                  className="btn btn-secondary text-xs disabled:opacity-50"
                  disabled={loadingPage || !preview.previewTruncated}
                  onClick={() => void loadPreviewPage(preview.previewOffset + preview.previewLimit)}
                >{loadingPage ? 'Loading…' : 'Next rows'}</button>
              </div>
            )}
          </div>

          {validationItems.length > 0 && (
            <div className="card">
              <div className="card-header"><h2 className="text-sm font-semibold text-navy-800">Validation findings register</h2></div>
              <div className="card-body space-y-2 max-h-72 overflow-y-auto">
                {validationItems.map((item, index) => (
                  <div key={`${item.row}-${item.code}-${index}`} className={`p-2.5 rounded border flex items-start gap-2 text-xs ${item.level === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                    {item.level === 'error' ? <XCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    <span><strong>Row {item.row} · {item.field}</strong> — {item.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header"><h2 className="text-sm font-semibold text-navy-800">3. Confirm certified import</h2></div>
            <div className="card-body space-y-4">
              {result ? (
                <div className="p-4 bg-green-50 border border-green-200 rounded flex items-start gap-3 text-green-900">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-green-700" />
                  <div>
                    <p className="text-sm font-semibold">Import completed</p>
                    <p className="text-xs mt-1">{result.importedRows} valid rows imported; {result.skippedRows} concurrent duplicates skipped; {result.invalidRows} invalid rows retained for audit.</p>
                    <p className="text-2xs mt-1">Prediction and early-warning analysis status: {result.downstreamAnalysisStatus}.</p>
                  </div>
                </div>
              ) : (
                <>
                  {!canImport && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                      Your Analyst role can upload and analyse CUF files. A Monitoring Officer or Administrator must confirm certified imports.
                    </div>
                  )}
                  <label className="flex items-start gap-2 text-xs text-slate-700">
                    <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={!canImport || preview.status !== 'validated'} className="mt-0.5" />
                    <span>I have reviewed the field mapping, transformations, and validation findings. Import only the <strong>{preview.validRows} valid rows</strong>; retain the {preview.invalidRows} invalid rows without modification.</span>
                  </label>
                  <div className="flex justify-end">
                    <button
                      onClick={() => void importValidRows()}
                      disabled={!canImport || !confirmed || importing || preview.validRows === 0 || preview.status !== 'validated'}
                      className="btn btn-primary disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Database className="w-4 h-4" /> {importing ? 'Importing validated rows…' : `Confirm import (${preview.validRows} rows)`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
