import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ChevronLeft, ChevronRight, Clock3, Database,
  FileSearch, Loader2, RefreshCw, Search, ShieldCheck, UserRound,
} from 'lucide-react';
import { Badge } from '../components/ui';
import {
  AuditService,
  type AuditFilterOptions,
  type AuditFilters,
  type AuditLogItem,
} from '../services/auditService';

const PAGE_SIZE = 50;
const USE_BACKEND_DATA = import.meta.env.VITE_DATA_SOURCE !== 'mock';

function label(value: string): string {
  return value.replace(/[._]/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function localDateBoundary(value: string, end = false): string | undefined {
  return value ? new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}`).toISOString() : undefined;
}

function JsonBlock({ title, value, empty }: {
  title: string;
  value?: Record<string, unknown> | null;
  empty: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-2xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{title}</p>
      <pre className="min-h-24 max-h-80 overflow-auto rounded border border-slate-200 bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-200 whitespace-pre-wrap break-words">
        {value && Object.keys(value).length ? JSON.stringify(value, null, 2) : empty}
      </pre>
    </div>
  );
}

export default function AuditTrail() {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [options, setOptions] = useState<AuditFilterOptions>({ actions: [], entityTypes: [], sources: [], actors: [] });
  const [filters, setFilters] = useState({ action: '', entityType: '', source: '', actorId: '', from: '', to: '', search: '' });
  const [applied, setApplied] = useState<typeof filters>(filters);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<AuditLogItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestFilters = useMemo<AuditFilters>(() => ({
    action: applied.action || undefined,
    entityType: applied.entityType || undefined,
    source: applied.source || undefined,
    actorId: applied.actorId || undefined,
    occurredFrom: localDateBoundary(applied.from),
    occurredTo: localDateBoundary(applied.to, true),
    search: applied.search.trim().length >= 2 ? applied.search.trim() : undefined,
    limit: PAGE_SIZE,
    offset,
  }), [applied, offset]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await AuditService.list(requestFilters, signal);
      setItems(response.items);
      setTotal(response.total);
      setSelected(current => current && response.items.some(item => item.id === current.id) ? current : null);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(caught instanceof Error ? caught.message : 'Unable to load the audit trail.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [requestFilters]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      load(controller.signal),
      AuditService.options(controller.signal).then(setOptions),
    ]).catch(caught => {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
        setError(caught instanceof Error ? caught.message : 'Unable to load audit filters.');
      }
    });
    return () => controller.abort();
  }, [load]);

  const applyFilters = () => {
    setOffset(0);
    setApplied(filters);
  };

  const clearFilters = () => {
    const empty = { action: '', entityType: '', source: '', actorId: '', from: '', to: '', search: '' };
    setFilters(empty);
    setApplied(empty);
    setOffset(0);
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-5 max-w-[1500px] mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-navy-900">Audit Trail</h1>
            <Badge variant="info">Administrator Only</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Immutable security, data, workflow, report, and model-execution events.
          </p>
        </div>
        <button className="btn btn-secondary text-xs" disabled={loading} onClick={() => void load()}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {!USE_BACKEND_DATA && (
        <div className="rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
          <strong>Synthetic demonstration audit:</strong> these append-oriented sample events exercise search, filters, pagination, and event details. They contain no real users, requests, imports, credentials, or security tokens.
        </div>
      )}

      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="relative xl:col-span-2">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              className="input w-full pl-9 text-xs"
              placeholder="Search action, project, actor, request or import reference"
              value={filters.search}
              onChange={event => setFilters(current => ({ ...current, search: event.target.value }))}
              onKeyDown={event => { if (event.key === 'Enter') applyFilters(); }}
            />
          </label>
          <select aria-label="Audit action filter" className="select text-xs" value={filters.action} onChange={event => setFilters(current => ({ ...current, action: event.target.value }))}>
            <option value="">All actions</option>
            {options.actions.map(value => <option key={value} value={value}>{label(value)}</option>)}
          </select>
          <select aria-label="Audit entity type filter" className="select text-xs" value={filters.entityType} onChange={event => setFilters(current => ({ ...current, entityType: event.target.value }))}>
            <option value="">All entity types</option>
            {options.entityTypes.map(value => <option key={value} value={value}>{label(value)}</option>)}
          </select>
          <select aria-label="Audit source filter" className="select text-xs" value={filters.source} onChange={event => setFilters(current => ({ ...current, source: event.target.value }))}>
            <option value="">All sources</option>
            {options.sources.map(value => <option key={value} value={value}>{label(value)}</option>)}
          </select>
          <select aria-label="Audit actor filter" className="select text-xs" value={filters.actorId} onChange={event => setFilters(current => ({ ...current, actorId: event.target.value }))}>
            <option value="">All actors</option>
            {options.actors.map(actor => <option key={actor.id} value={actor.id}>{actor.fullName || actor.email}</option>)}
          </select>
          <input type="date" aria-label="From date" className="input text-xs" value={filters.from} onChange={event => setFilters(current => ({ ...current, from: event.target.value }))} />
          <input type="date" aria-label="To date" className="input text-xs" value={filters.to} onChange={event => setFilters(current => ({ ...current, to: event.target.value }))} />
        </div>
        <div className="flex items-center justify-end gap-2">
          <button className="btn btn-secondary text-xs" onClick={clearFilters}>Clear</button>
          <button className="btn btn-primary text-xs" onClick={applyFilters}><FileSearch className="h-3.5 w-3.5" /> Apply filters</button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button className="ml-auto underline" onClick={() => void load()}>Retry</button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="card-header">
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-navy-700" /><h2 className="text-sm font-semibold text-navy-800">Recorded Events</h2></div>
          <span className="text-xs text-slate-500">{total.toLocaleString('en-IN')} events</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading audit events...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center"><Database className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-sm font-medium text-slate-600">No audit events match these filters.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[1050px]">
              <thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Entity</th><th>Project</th><th>Source / Reference</th></tr></thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} onClick={() => setSelected(item)} className={`cursor-pointer ${selected?.id === item.id ? 'bg-blue-50' : ''}`}>
                    <td><p className="text-xs text-slate-700">{new Date(item.occurredAt).toLocaleString('en-IN')}</p><p className="text-2xs text-slate-400">v{item.eventVersion}</p></td>
                    <td><p className="text-xs font-medium text-navy-900">{item.actor.fullName || item.actor.email || 'System'}</p><p className="text-2xs text-slate-400">{item.actor.role ? label(item.actor.role) : 'Automated process'}</p></td>
                    <td><Badge variant="info">{label(item.action)}</Badge></td>
                    <td><p className="text-xs text-slate-700">{label(item.entityType)}</p><p className="max-w-52 truncate text-2xs text-slate-400">{item.recordKey || item.entityId || '—'}</p></td>
                    <td className="text-xs text-slate-600">{item.project ? <><p className="font-medium text-navy-800">{item.project.projectCode}</p><p className="max-w-52 truncate text-2xs text-slate-400">{item.project.name}</p></> : '—'}</td>
                    <td><p className="text-xs text-slate-700">{label(item.source)}</p><p className="max-w-64 truncate text-2xs text-slate-400">{item.importReference || item.requestReference || 'No external reference'}</p></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <span className="text-xs text-slate-500">Page {page} of {pages}</span>
          <div className="flex gap-2">
            <button className="btn btn-secondary px-2 py-1 text-xs" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}><ChevronLeft className="h-3.5 w-3.5" /> Previous</button>
            <button className="btn btn-secondary px-2 py-1 text-xs" disabled={offset + PAGE_SIZE >= total || loading} onClick={() => setOffset(offset + PAGE_SIZE)}>Next <ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>

      {selected && (
        <div className="card p-5 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="text-sm font-semibold text-navy-900">{label(selected.action)}</p><p className="text-xs text-slate-500">Audit ID {selected.id}</p></div>
            <button className="text-xs font-medium text-slate-500 hover:text-slate-800" onClick={() => setSelected(null)}>Close details</button>
          </div>
          <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded bg-slate-50 p-3"><Clock3 className="mb-1 h-3.5 w-3.5 text-slate-400" /><p className="font-medium text-navy-900">{new Date(selected.occurredAt).toLocaleString('en-IN')}</p><p className="text-slate-400">Event timestamp</p></div>
            <div className="rounded bg-slate-50 p-3"><UserRound className="mb-1 h-3.5 w-3.5 text-slate-400" /><p className="truncate font-medium text-navy-900">{selected.actor.email || 'System process'}</p><p className="text-slate-400">Actor snapshot</p></div>
            <div className="rounded bg-slate-50 p-3"><Database className="mb-1 h-3.5 w-3.5 text-slate-400" /><p className="truncate font-medium text-navy-900">{selected.tableName || selected.entityType}</p><p className="text-slate-400">Source table/entity</p></div>
            <div className="rounded bg-slate-50 p-3"><FileSearch className="mb-1 h-3.5 w-3.5 text-slate-400" /><p className="truncate font-medium text-navy-900">{selected.requestReference || selected.importReference || 'Not applicable'}</p><p className="text-slate-400">Request/import reference</p></div>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <JsonBlock title="Old value" value={selected.oldValues} empty="No previous value (create or execution event)." />
            <JsonBlock title="New value / output" value={selected.newValues} empty="No new value recorded." />
          </div>
          {Object.keys(selected.metadata).length > 0 && <JsonBlock title="Event metadata" value={selected.metadata} empty="No metadata." />}
        </div>
      )}
    </div>
  );
}
