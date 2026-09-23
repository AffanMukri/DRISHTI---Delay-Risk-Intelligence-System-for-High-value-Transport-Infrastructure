// =============================================================================
// DRISHTI — Early Warning Center
// =============================================================================

import React, { useState, useMemo } from 'react';
import { Eye, CheckCircle, RefreshCw, GitBranch } from 'lucide-react';
import { SeverityBadge, formatDate, Modal, DataDisclaimer } from '../components/ui';
import { useApp } from '../context/AppContext';
import { usePragatiData } from '../context/PragatiDataContext';
import { useAuth } from '../hooks/useAuth';
import type { Warning, WarningStatus } from '../types';
import { EvidenceChainModal } from '../components/EvidenceChainModal';

export default function EarlyWarningCenter() {
  const { navigate, startInterventionFromWarning } = useApp();
  const { hasPermission } = useAuth();
  const { warnings, acknowledgeWarning, updateWarning, reload } = usePragatiData();
  const canAcknowledge = hasPermission('manage_project_updates');
  const canCreateInterventions = hasPermission('create_interventions');
  const [severity, setSeverity] = useState('');
  const [ministry, setMinistry] = useState('');
  const [sector, setSector] = useState('');
  const [status, setStatus] = useState('');
  const [alertType, setAlertType] = useState('');
  const [selectedWarning, setSelectedWarning] = useState<Warning | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [evidenceProjectId, setEvidenceProjectId] = useState('');
  const [evidenceWarningId, setEvidenceWarningId] = useState('');

  const ministries = [...new Set(warnings.map(w => w.ministry))].sort();
  const sectors = [...new Set(warnings.map(w => w.sector))].sort();
  const types = [...new Set(warnings.map(w => w.alertType))].sort();

  const filtered = useMemo(() => {
    return warnings.filter(w => {
      const ws = w.status;
      if (severity && w.severity !== severity) return false;
      if (ministry && w.ministry !== ministry) return false;
      if (sector && w.sector !== sector) return false;
      if (status && ws !== status) return false;
      if (alertType && w.alertType !== alertType) return false;
      return true;
    });
  }, [warnings, severity, ministry, sector, status, alertType]);

  const updateStatus = async (id: string, newStatus: Exclude<WarningStatus, 'New'>) => {
    setActionError(null);
    if (!canAcknowledge) return;
    setActionLoading(true);
    try {
      const updated = newStatus === 'Acknowledged'
        ? await acknowledgeWarning(id)
        : await updateWarning(id, { status: newStatus });
      setSelectedWarning(current => current?.id === id ? updated : current);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to acknowledge the warning.');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatus = (w: Warning) => w.status;

  const STATUS_CLASS: Record<WarningStatus, string> = {
    'New':          'badge-critical',
    'Acknowledged': 'badge-high',
    'Assigned':     'badge-watch',
    'Under Review': 'badge-info',
    'Resolved':     'badge-healthy',
  };

  const counts = {
    Critical: warnings.filter(w => w.severity === 'Critical').length,
    High: warnings.filter(w => w.severity === 'High').length,
    Moderate: warnings.filter(w => w.severity === 'Moderate').length,
    New: warnings.filter(w => w.status === 'New').length,
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy-800">Early Warning Center</h1>
          <p className="text-sm text-slate-500 mt-0.5">Prioritised signals requiring monitoring or intervention</p>
          <p className="text-xs text-slate-400 mt-0.5">Automated deterministic, hybrid-risk and registered-model signals</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reload} className="btn-secondary btn-sm" title="Refresh warnings">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <DataDisclaimer label="Automated Warning Engine" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Critical Alerts', value: counts.Critical, cls: 'border-t-red-500 text-red-600' },
          { label: 'High Priority', value: counts.High, cls: 'border-t-orange-500 text-orange-600' },
          { label: 'Moderate', value: counts.Moderate, cls: 'border-t-amber-500 text-amber-600' },
          { label: 'Unacknowledged', value: counts.New, cls: 'border-t-navy-700 text-navy-700' },
        ].map(c => (
          <div key={c.label} className={`card p-4 border-t-2 ${c.cls}`}>
            <p className="text-2xs font-semibold text-slate-500 uppercase tracking-wide">{c.label}</p>
            <p className={`text-2xl font-bold tabular-nums mt-1 ${c.cls.split(' ')[1]}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Severity</label>
            <select className="select" value={severity} onChange={e => setSeverity(e.target.value)}>
              <option value="">All Severities</option>
              <option>Critical</option><option>High</option><option>Moderate</option><option>Low</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Ministry</label>
            <select className="select" value={ministry} onChange={e => setMinistry(e.target.value)}>
              <option value="">All Ministries</option>
              {ministries.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Sector</label>
            <select className="select" value={sector} onChange={e => setSector(e.target.value)}>
              <option value="">All Sectors</option>
              {sectors.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Alert Type</label>
            <select className="select" value={alertType} onChange={e => setAlertType(e.target.value)}>
              <option value="">All Types</option>
              {types.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Status</label>
            <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option>New</option><option>Acknowledged</option><option>Assigned</option>
              <option>Under Review</option><option>Resolved</option>
            </select>
          </div>
          {(severity || ministry || sector || alertType || status) && (
            <button onClick={() => { setSeverity(''); setMinistry(''); setSector(''); setAlertType(''); setStatus(''); }} className="btn-secondary btn-sm self-end">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Warnings Table */}
      {actionError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded">{actionError}</div>}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Project</th>
                <th>Warning</th>
                <th>Alert Type</th>
                <th>Detected</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400 text-sm">No warnings match the selected filters.</td>
                </tr>
              ) : filtered.map(w => {
                const ws = getStatus(w);
                return (
                  <tr key={w.id}>
                    <td><SeverityBadge severity={w.severity} /></td>
                    <td>
                      <div className="text-xs font-medium text-navy-800 max-w-[160px] truncate">{w.projectName}</div>
                      <div className="text-2xs text-slate-400">{w.ministry.replace('Ministry of ', '')}</div>
                    </td>
                    <td>
                      <div className="text-xs text-slate-700 max-w-[220px]">{w.title}</div>
                      <div className="text-2xs text-slate-400 mt-0.5 truncate max-w-[220px]">{w.description.slice(0, 80)}…</div>
                    </td>
                    <td>
                      <span className="badge badge-neutral text-2xs">{w.alertType}</span>
                    </td>
                    <td className="text-2xs text-slate-500 whitespace-nowrap">{formatDate(w.detectedDate)}</td>
                    <td>
                      <span className={`badge text-2xs ${STATUS_CLASS[ws]}`}>{ws}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setSelectedWarning(w)}
                          className="btn-secondary btn-sm text-2xs"
                          title="View Details"
                        >
                          <Eye className="w-3 h-3" />
                          Details
                        </button>
                        <button
                          onClick={() => navigate('project-intelligence', w.projectId)}
                          className="btn-ghost btn-sm text-2xs"
                          title="View Project"
                        >
                          Project →
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      <Modal isOpen={!!selectedWarning} onClose={() => setSelectedWarning(null)} title="Warning Details" size="lg">
        {selectedWarning && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <SeverityBadge severity={selectedWarning.severity} />
              <span className={`badge text-xs ${STATUS_CLASS[getStatus(selectedWarning)]}`}>{getStatus(selectedWarning)}</span>
              <span className="badge badge-neutral text-xs">{selectedWarning.alertType}</span>
              {selectedWarning.sourceType && <span className="badge badge-info text-xs">{selectedWarning.sourceType}</span>}
            </div>

            <div>
              <h4 className="font-semibold text-slate-800">{selectedWarning.title}</h4>
              <p className="text-sm text-slate-600 mt-1">{selectedWarning.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div><span className="text-slate-500">Project:</span> <span className="font-medium text-navy-800">{selectedWarning.projectName}</span></div>
              <div><span className="text-slate-500">Ministry:</span> <span className="font-medium">{selectedWarning.ministry}</span></div>
              <div><span className="text-slate-500">Trigger Rule:</span> <span className="font-medium">{selectedWarning.trigger}</span></div>
              <div><span className="text-slate-500">Detected:</span> <span className="font-medium">{formatDate(selectedWarning.detectedDate)}</span></div>
              <div><span className="text-slate-500">Last Seen:</span> <span className="font-medium">{formatDate(selectedWarning.lastDetectedDate || selectedWarning.detectedDate)}</span></div>
              <div><span className="text-slate-500">Occurrences:</span> <span className="font-medium">{selectedWarning.occurrenceCount || 1}</span></div>
              <div><span className="text-slate-500">Current / Previous:</span> <span className="font-medium">{String(selectedWarning.currentValue ?? '—')} / {String(selectedWarning.previousValue ?? '—')}</span></div>
              {selectedWarning.assignedTo && (
                <div><span className="text-slate-500">Assigned To:</span> <span className="font-medium">{selectedWarning.assignedTo}</span></div>
              )}
            </div>

            {selectedWarning.recommendedAction && (
              <div className="rounded border border-blue-100 bg-blue-50 p-3">
                <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide mb-1">Recommended Next Action</p>
                <p className="text-sm text-blue-900">{selectedWarning.recommendedAction}</p>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Supporting Evidence</p>
              <ul className="space-y-1">
                {selectedWarning.evidence.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-navy-400 shrink-0" />
                    {e}
                  </li>
                ))}
              </ul>
            </div>

            {/* Status Actions */}
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Update Status</p>
              <div className="flex flex-wrap gap-2">
                {(['Acknowledged', 'Assigned', 'Under Review', 'Resolved'] as Exclude<WarningStatus, 'New'>[]).map(s => (
                  <button
                    key={s}
                    onClick={() => void updateStatus(selectedWarning.id, s)}
                    disabled={actionLoading || !canAcknowledge}
                    className={`btn-sm ${getStatus(selectedWarning) === s ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {getStatus(selectedWarning) === s && <CheckCircle className="w-3 h-3" />}
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              {(selectedWarning.severity === 'Critical' || selectedWarning.severity === 'High') && (
                <button
                  onClick={() => { setEvidenceProjectId(selectedWarning.projectId); setEvidenceWarningId(selectedWarning.id); setSelectedWarning(null); }}
                  className="btn-secondary btn-sm"
                >
                  <GitBranch className="w-3.5 h-3.5" /> View Evidence
                </button>
              )}
              <button onClick={() => { navigate('project-intelligence', selectedWarning.projectId); setSelectedWarning(null); }} className="btn-primary btn-sm">
                View Project
              </button>
              <button onClick={() => { navigate('intervention-center'); setSelectedWarning(null); }} className="btn-secondary btn-sm">
                View Interventions
              </button>
              {canCreateInterventions && (
                <button
                  onClick={() => { startInterventionFromWarning(selectedWarning.id); setSelectedWarning(null); }}
                  className="btn-primary btn-sm"
                >
                  Create Intervention
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
      <EvidenceChainModal
        isOpen={Boolean(evidenceProjectId)}
        projectId={evidenceProjectId}
        preferredSubject="warning"
        preferredSubjectId={evidenceWarningId}
        backendEnabled={import.meta.env.VITE_DATA_SOURCE !== 'mock'}
        onClose={() => { setEvidenceProjectId(''); setEvidenceWarningId(''); }}
      />
    </div>
  );
}
