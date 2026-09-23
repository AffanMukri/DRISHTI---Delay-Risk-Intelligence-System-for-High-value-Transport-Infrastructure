// =============================================================================
// DRISHTI - authenticated backend report generation and dossier preview
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Layers,
  Loader2,
  Printer,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { usePragatiData } from '../context/PragatiDataContext';
import { ApiError } from '../lib/apiClient';
import {
  reportService,
  saveDownloadedReport,
  type ReportFormat,
  type ReportGenerateInput,
  type ReportOptions,
  type ReportType,
  type ReportTypeOption,
} from '../services/reportService';
import { Badge } from '../components/ui';

const FALLBACK_REPORT_TYPES: ReportTypeOption[] = [
  { value: 'monthly_flash', label: 'Monthly Flash Report', description: 'Portfolio KPIs, cost and schedule performance, risks and emerging warnings.', formats: ['pdf', 'xlsx'], requires: null },
  { value: 'sector', label: 'Sector Report', description: 'Performance and risk review for a selected infrastructure sector.', formats: ['pdf', 'xlsx', 'csv'], requires: 'sector' },
  { value: 'ministry', label: 'Ministry Report', description: 'Portfolio performance for projects owned by a selected ministry.', formats: ['pdf', 'xlsx', 'csv'], requires: 'ministry' },
  { value: 'critical_projects', label: 'Critical Project Report', description: 'High and Critical risk projects with warnings, drivers and required attention.', formats: ['pdf', 'xlsx', 'csv'], requires: null },
  { value: 'pragati_review_dossier', label: 'PRAGATI Review Dossier', description: 'Project-specific evidence, warnings and intervention status for review.', formats: ['pdf', 'xlsx'], requires: 'project' },
  { value: 'intervention', label: 'Intervention Report', description: 'Assigned, overdue, escalated and resolved intervention workflow records.', formats: ['pdf', 'xlsx', 'csv'], requires: null },
];

const EMPTY_OPTIONS: ReportOptions = {
  reportTypes: FALLBACK_REPORT_TYPES,
  reportingMonths: [],
  sectors: [],
  ministries: [],
  projects: [],
};

function formatMonth(value: string): string {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

function messageFrom(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Your assigned role cannot generate this report type.';
    if (error.status === 422) return 'The selected report scope is incomplete or invalid.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'The report could not be generated.';
}

export default function Reports() {
  const { projects: allProjects } = usePragatiData();
  const mockMode = import.meta.env.VITE_DATA_SOURCE === 'mock';
  const [options, setOptions] = useState<ReportOptions>(EMPTY_OPTIONS);
  const [optionsLoading, setOptionsLoading] = useState(!mockMode);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsVersion, setOptionsVersion] = useState(0);
  const [selectedReport, setSelectedReport] = useState<ReportType>('monthly_flash');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedSector, setSelectedSector] = useState('');
  const [selectedMinistry, setSelectedMinistry] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [includeResolved, setIncludeResolved] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [generationFormat, setGenerationFormat] = useState<ReportFormat | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<ReportGenerateInput | null>(null);

  useEffect(() => {
    if (mockMode) return;
    const controller = new AbortController();
    void (async () => {
      await Promise.resolve();
      setOptionsLoading(true);
      setOptionsError(null);
      try {
        const result = await reportService.options(controller.signal);
        setOptions(result);
        setSelectedMonth(current => current || result.reportingMonths[0] || '');
        setSelectedSector(current => current || result.sectors[0] || '');
        setSelectedMinistry(current => current || result.ministries[0]?.value || '');
        setSelectedProject(current => current || result.projects[0]?.value || '');
        setSelectedReport(current => result.reportTypes.some(option => option.value === current)
          ? current
          : result.reportTypes[0]?.value || 'monthly_flash');
      } catch (error) {
        if (controller.signal.aborted) return;
        setOptionsError(messageFrom(error));
      } finally {
        if (!controller.signal.aborted) setOptionsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [mockMode, optionsVersion]);

  const activeDefinition = options.reportTypes.find(option => option.value === selectedReport)
    || FALLBACK_REPORT_TYPES.find(option => option.value === selectedReport)
    || FALLBACK_REPORT_TYPES[0];

  const stats = useMemo(() => {
    const approved = allProjects.reduce((sum, project) => sum + project.approvedCost, 0);
    const revised = allProjects.reduce((sum, project) => sum + project.revisedCost, 0);
    const expenditure = allProjects.reduce((sum, project) => sum + project.expenditure, 0);
    const delayed = allProjects.filter(project => project.delayDays > 0).length;
    const escalated = allProjects.filter(project => project.revisedCost > project.approvedCost).length;
    return {
      totalProjects: allProjects.length,
      approved,
      revised,
      expenditure,
      netEscalation: revised - approved,
      escalationPct: approved > 0 ? ((revised - approved) / approved) * 100 : null,
      expenditurePct: revised > 0 ? (expenditure / revised) * 100 : null,
      delayed,
      escalated,
      costAndSchedule: allProjects.filter(project => project.delayDays > 0 && project.revisedCost > project.approvedCost).length,
      critical: allProjects.filter(project => project.riskAssessment.riskLevel === 'Critical').length,
    };
  }, [allProjects]);

  const priorityProjects = useMemo(() => allProjects
    .filter(project => ['Critical', 'High Risk'].includes(project.riskAssessment.riskLevel))
    .sort((left, right) => right.riskAssessment.overallScore - left.riskAssessment.overallScore)
    .slice(0, 8), [allProjects]);

  const buildRequest = (format: ReportFormat): ReportGenerateInput | null => {
    if (!selectedMonth) return null;
    if (activeDefinition.requires === 'sector' && !selectedSector) return null;
    if (activeDefinition.requires === 'ministry' && !selectedMinistry) return null;
    if (activeDefinition.requires === 'project' && !selectedProject) return null;
    return {
      reportType: selectedReport,
      outputFormat: format,
      reportingMonth: selectedMonth,
      sector: activeDefinition.requires === 'sector' ? selectedSector : undefined,
      ministryId: activeDefinition.requires === 'ministry' ? selectedMinistry : undefined,
      projectId: activeDefinition.requires === 'project' ? selectedProject : undefined,
      includeResolvedInterventions: selectedReport === 'intervention' ? includeResolved : undefined,
    };
  };

  const generate = async (request: ReportGenerateInput) => {
    setIsExporting(true);
    setGenerationFormat(request.outputFormat);
    setGenerationError(null);
    setNotification(null);
    setLastRequest(request);
    try {
      const file = await reportService.generate(request);
      saveDownloadedReport(file);
      setNotification(`${file.fileName} downloaded successfully${file.dataAsOf ? ` (data as of ${file.dataAsOf})` : ''}.`);
    } catch (error) {
      setGenerationError(messageFrom(error));
    } finally {
      setIsExporting(false);
      setGenerationFormat(null);
    }
  };

  const handleExport = (format: ReportFormat) => {
    if (mockMode) {
      setGenerationError('Backend-generated reports are unavailable while the explicit mock data source is active. Start FastAPI and use VITE_DATA_SOURCE=backend.');
      return;
    }
    const request = buildRequest(format);
    if (!request) {
      setGenerationError('Select the reporting period and required report scope before generating the file.');
      return;
    }
    void generate(request);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-navy-900 tracking-tight">Reports & Cabinet Dossiers</h1>
            <Badge variant="neutral">Authenticated exports</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Generate traceable PDF, Excel and CSV files from stored project, analytics, warning and intervention records.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeDefinition.formats.includes('pdf') && (
            <button onClick={() => handleExport('pdf')} disabled={isExporting || optionsLoading} className="btn btn-secondary text-xs flex items-center gap-1.5">
              {generationFormat === 'pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-slate-600" />}
              Generate PDF
            </button>
          )}
          {activeDefinition.formats.includes('xlsx') && (
            <button onClick={() => handleExport('xlsx')} disabled={isExporting || optionsLoading} className="btn btn-secondary text-xs flex items-center gap-1.5">
              {generationFormat === 'xlsx' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5 text-green-700" />}
              Generate XLSX
            </button>
          )}
          {activeDefinition.formats.includes('csv') && (
            <button onClick={() => handleExport('csv')} disabled={isExporting || optionsLoading} className="btn btn-secondary text-xs flex items-center gap-1.5">
              {generationFormat === 'csv' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5 text-blue-700" />}
              Generate CSV
            </button>
          )}
          <button onClick={() => window.print()} className="btn btn-primary text-xs flex items-center gap-1.5">
            <Printer className="w-3.5 h-3.5" /> Print preview
          </button>
        </div>
      </div>

      {isExporting && (
        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 text-xs rounded" role="status">
          <div className="flex items-center gap-2 font-semibold">
            <Loader2 className="w-4 h-4 animate-spin" />
            The backend is collecting as-of records and compiling the {generationFormat?.toUpperCase()} file...
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded bg-blue-100"><div className="h-full w-1/2 animate-pulse rounded bg-blue-600" /></div>
        </div>
      )}

      {notification && (
        <div className="p-3 bg-green-50 border border-green-200 text-green-800 text-xs rounded flex items-center justify-between">
          <span className="flex items-center gap-2 font-medium"><CheckCircle2 className="w-4 h-4 text-green-600" />{notification}</span>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600" aria-label="Dismiss notification">×</button>
        </div>
      )}

      {generationError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded flex items-center justify-between gap-4" role="alert">
          <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{generationError}</span>
          {lastRequest && !mockMode && <button onClick={() => void generate(lastRequest)} disabled={isExporting} className="btn btn-secondary text-xs shrink-0"><RefreshCw className="w-3.5 h-3.5" /> Retry</button>}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {options.reportTypes.map(option => (
          <button
            key={option.value}
            onClick={() => { setSelectedReport(option.value); setGenerationError(null); }}
            className={`p-3.5 rounded border text-left transition-all ${selectedReport === option.value ? 'bg-navy-800 text-white border-navy-800 shadow-md' : 'bg-white hover:bg-slate-50 border-slate-200'}`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-xs font-bold ${selectedReport === option.value ? 'text-white' : 'text-navy-900'}`}>{option.label}</span>
              {option.value === 'critical_projects' || option.value === 'pragati_review_dossier'
                ? <AlertTriangle className={`w-4 h-4 ${selectedReport === option.value ? 'text-amber-300' : 'text-slate-400'}`} />
                : option.value === 'sector' || option.value === 'ministry'
                  ? <Layers className={`w-4 h-4 ${selectedReport === option.value ? 'text-blue-300' : 'text-slate-400'}`} />
                  : <FileText className={`w-4 h-4 ${selectedReport === option.value ? 'text-blue-300' : 'text-slate-400'}`} />}
            </div>
            <p className={`text-2xs ${selectedReport === option.value ? 'text-slate-300' : 'text-slate-500'}`}>{option.description}</p>
          </button>
        ))}
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-bold text-navy-900">Report parameters</h2>
          <div className="flex items-center gap-1.5 text-2xs text-slate-500"><ShieldCheck className="w-3.5 h-3.5 text-green-700" />Role and RLS policies are enforced by FastAPI and PostgreSQL.</div>
        </div>
        {optionsLoading ? (
          <div className="flex items-center gap-2 text-xs text-slate-500 py-4"><Loader2 className="w-4 h-4 animate-spin" />Loading reporting periods and permitted scopes...</div>
        ) : optionsError ? (
          <div className="flex items-center justify-between gap-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800">
            <span>{optionsError}</span>
            <button onClick={() => setOptionsVersion(version => version + 1)} className="btn btn-secondary text-xs"><RefreshCw className="w-3.5 h-3.5" />Retry</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <label className="text-xs text-slate-600">Reporting month
              <select value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)} className="input mt-1 w-full" aria-label="Reporting month">
                {options.reportingMonths.map(month => <option key={month} value={month}>{formatMonth(month)}</option>)}
              </select>
            </label>
            {activeDefinition.requires === 'sector' && <label className="text-xs text-slate-600">Sector
              <select value={selectedSector} onChange={event => setSelectedSector(event.target.value)} className="input mt-1 w-full" aria-label="Report sector">
                {options.sectors.map(sector => <option key={sector} value={sector}>{sector}</option>)}
              </select>
            </label>}
            {activeDefinition.requires === 'ministry' && <label className="text-xs text-slate-600">Ministry
              <select value={selectedMinistry} onChange={event => setSelectedMinistry(event.target.value)} className="input mt-1 w-full" aria-label="Report ministry">
                {options.ministries.map(ministry => <option key={ministry.value} value={ministry.value}>{ministry.label}</option>)}
              </select>
            </label>}
            {activeDefinition.requires === 'project' && <label className="text-xs text-slate-600 xl:col-span-2">Project
              <select value={selectedProject} onChange={event => setSelectedProject(event.target.value)} className="input mt-1 w-full" aria-label="Report project">
                {options.projects.map(project => <option key={project.value} value={project.value}>{project.label}</option>)}
              </select>
            </label>}
            {selectedReport === 'intervention' && <label className="flex items-center gap-2 text-xs text-slate-600 self-end h-9">
              <input type="checkbox" checked={includeResolved} onChange={event => setIncludeResolved(event.target.checked)} />Include interventions resolved by the cut-off
            </label>}
          </div>
        )}
      </div>

      <div className="card bg-white border border-slate-300 shadow-lg p-8 max-w-5xl mx-auto printable-dossier">
        <div className="border-b-2 border-navy-800 pb-4 text-center space-y-1">
          <div className="inline-block px-3 py-1 bg-navy-800 text-white text-2xs font-bold uppercase tracking-widest rounded mb-1">Government of India</div>
          <h2 className="text-base font-bold text-navy-900 tracking-tight">MINISTRY OF STATISTICS AND PROGRAMME IMPLEMENTATION</h2>
          <p className="text-xs text-slate-600 font-medium">INFRASTRUCTURE AND PROJECT MONITORING DIVISION (IPMD)</p>
          <p className="text-2xs text-slate-500 italic">{activeDefinition.label} - Reference Period: {selectedMonth ? formatMonth(selectedMonth) : 'Select a reporting month'}</p>
        </div>

        <div className="my-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-navy-800 border-b border-slate-200 pb-1 mb-3">1. Current portfolio preview</h3>
          <p className="text-2xs text-slate-500 mb-3">The downloaded report is recalculated by the backend at the selected historical cut-off. This preview reflects the currently loaded portfolio.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded"><span className="text-2xs text-slate-500 block">Monitored Projects</span><span className="text-base font-bold text-navy-900">{stats.totalProjects.toLocaleString()}</span></div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded"><span className="text-2xs text-slate-500 block">Original Approved Cost</span><span className="text-base font-bold text-navy-900">₹{(stats.approved / 1000).toFixed(1)}k Cr</span></div>
            <div className="p-3 bg-red-50 border border-red-200 rounded"><span className="text-2xs text-red-700 block">Latest Revised Cost</span><span className="text-base font-bold text-red-950">₹{(stats.revised / 1000).toFixed(1)}k Cr</span><span className="text-2xs text-red-700 block mt-0.5">{stats.escalationPct === null ? 'Not available' : `+${stats.escalationPct.toFixed(1)}%`}</span></div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded"><span className="text-2xs text-blue-700 block">Cumulative Expenditure</span><span className="text-base font-bold text-blue-950">₹{(stats.expenditure / 1000).toFixed(1)}k Cr</span><span className="text-2xs text-blue-700 block mt-0.5">{stats.expenditurePct === null ? 'Not available' : `${stats.expenditurePct.toFixed(1)}% of revised cost`}</span></div>
          </div>
        </div>

        <div className="my-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-navy-800 border-b border-slate-200 pb-1 mb-3">2. Delivery status</h3>
          <table className="w-full text-xs border border-slate-200">
            <thead className="bg-slate-100 text-slate-700"><tr><th className="py-1.5 px-3 text-left">Category</th><th className="py-1.5 px-3 text-right">Projects</th><th className="py-1.5 px-3 text-right">Portfolio share</th><th className="py-1.5 px-3 text-right">Evidence</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              <tr><td className="py-1.5 px-3">Schedule delay</td><td className="py-1.5 px-3 text-right font-semibold text-red-700">{stats.delayed}</td><td className="py-1.5 px-3 text-right">{stats.totalProjects ? ((stats.delayed / stats.totalProjects) * 100).toFixed(1) : '0.0'}%</td><td className="py-1.5 px-3 text-right">Positive recorded delay days</td></tr>
              <tr><td className="py-1.5 px-3">Cost escalation</td><td className="py-1.5 px-3 text-right font-semibold text-orange-700">{stats.escalated}</td><td className="py-1.5 px-3 text-right">{stats.totalProjects ? ((stats.escalated / stats.totalProjects) * 100).toFixed(1) : '0.0'}%</td><td className="py-1.5 px-3 text-right">₹{stats.netEscalation.toLocaleString()} Cr net change</td></tr>
              <tr><td className="py-1.5 px-3">Both cost and schedule overrun</td><td className="py-1.5 px-3 text-right font-semibold text-red-800">{stats.costAndSchedule}</td><td className="py-1.5 px-3 text-right">{stats.totalProjects ? ((stats.costAndSchedule / stats.totalProjects) * 100).toFixed(1) : '0.0'}%</td><td className="py-1.5 px-3 text-right">Calculated from loaded project facts</td></tr>
              <tr><td className="py-1.5 px-3">Critical risk</td><td className="py-1.5 px-3 text-right font-semibold text-red-800">{stats.critical}</td><td className="py-1.5 px-3 text-right">{stats.totalProjects ? ((stats.critical / stats.totalProjects) * 100).toFixed(1) : '0.0'}%</td><td className="py-1.5 px-3 text-right">Latest stored risk assessment</td></tr>
            </tbody>
          </table>
        </div>

        <div className="my-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-navy-800 border-b border-slate-200 pb-1 mb-3">3. Priority projects</h3>
          {priorityProjects.length ? <table className="w-full text-xs border border-slate-200">
            <thead className="bg-slate-100 text-slate-700"><tr><th className="py-1.5 px-2 text-left">ID & Name</th><th className="py-1.5 px-2 text-left">Ministry</th><th className="py-1.5 px-2 text-right">Approved</th><th className="py-1.5 px-2 text-right">Revised</th><th className="py-1.5 px-2 text-right">Delay</th><th className="py-1.5 px-2 text-right">Risk</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{priorityProjects.map(project => <tr key={project.id}><td className="py-1.5 px-2 font-medium text-navy-900">{project.id} - {project.name}</td><td className="py-1.5 px-2 text-slate-600">{project.ministry}</td><td className="py-1.5 px-2 text-right">₹{project.approvedCost.toLocaleString()}</td><td className="py-1.5 px-2 text-right font-semibold text-red-700">₹{project.revisedCost.toLocaleString()}</td><td className="py-1.5 px-2 text-right text-red-700 font-bold">{project.delayDays > 0 ? `+${project.delayDays} d` : `${project.delayDays} d`}</td><td className="py-1.5 px-2 text-right font-semibold">{project.riskAssessment.riskLevel} ({project.riskAssessment.overallScore.toFixed(0)})</td></tr>)}</tbody>
          </table> : <div className="p-4 bg-slate-50 border border-slate-200 rounded text-xs text-slate-500">No High or Critical risk projects are present in the currently loaded portfolio.</div>}
        </div>

        <div className="pt-8 border-t border-slate-300 mt-8 flex items-end justify-between text-2xs text-slate-500">
          <div><p>Generated files use authenticated DRISHTI database records.</p><p>Numerical recommendations are labelled as analytical or workflow rule outputs.</p></div>
          <div className="text-right"><div className="w-32 border-b border-slate-400 ml-auto mb-1" /><p className="font-semibold text-slate-700">Authorized Reviewing Officer</p><p>Infrastructure and Project Monitoring Division</p></div>
        </div>
      </div>
    </div>
  );
}
