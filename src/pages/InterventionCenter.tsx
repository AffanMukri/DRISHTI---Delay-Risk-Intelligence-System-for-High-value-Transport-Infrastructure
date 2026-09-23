// =============================================================================
// DHRISTI — Intervention Center Page
// Inter-Ministerial Coordination, Escalations, and Action Item Governance
// =============================================================================

import React, { useEffect, useState, useMemo } from 'react';
import {
  Zap, AlertTriangle, CheckCircle2, Clock, Search, Plus,
  FileText, UserCheck, MessageSquare,
  Send, ShieldAlert, Sparkles, ExternalLink
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../hooks/useAuth';
import { usePragatiData } from '../context/PragatiDataContext';
import type { Intervention, InterventionOfficer, InterventionPriority, InterventionStatus, InterventionUpdate } from '../types';
import { ProjectService } from '../services';
import { Badge, KPICard, Modal } from '../components/ui';

const STATUS_TRANSITIONS: Record<InterventionStatus, InterventionStatus[]> = {
  Open: ['Assigned', 'In Progress', 'Escalated', 'Resolved'],
  Assigned: ['Open', 'In Progress', 'Escalated', 'Resolved'],
  'In Progress': ['Assigned', 'Escalated', 'Resolved'],
  Escalated: ['In Progress', 'Resolved'],
  Overdue: ['Assigned', 'In Progress', 'Escalated', 'Resolved'],
  Resolved: [],
};

export default function InterventionCenter() {
  const { navigate, interventionWarningId, clearInterventionWarning } = useApp();
  const { hasPermission } = useAuth();
  const { projects, warnings, interventions, createIntervention, updateIntervention, reload } = usePragatiData();
  const canCreateInterventions = hasPermission('create_interventions');
  const canManageInterventions = hasPermission('manage_interventions');

  const [selectedStatus, setSelectedStatus] = useState<InterventionStatus | 'All'>('All');
  const [selectedPriority, setSelectedPriority] = useState<InterventionPriority | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIntervention, setActiveIntervention] = useState<Intervention | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAgendaModal, setShowAgendaModal] = useState(false);

  // New intervention form state
  const [newProjectName, setNewProjectName] = useState('');
  const [newMinistry, setNewMinistry] = useState('');
  const [newIssue, setNewIssue] = useState('');
  const [newAction, setNewAction] = useState('');
  const [newPriority, setNewPriority] = useState<InterventionPriority>('High');
  const [newAssignee, setNewAssignee] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState('');
  const [newWarningId, setNewWarningId] = useState('');
  const [newDueDate, setNewDueDate] = useState(() => {
    const due = new Date();
    due.setDate(due.getDate() + 14);
    return due.toISOString().slice(0, 10);
  });

  // New note on modal
  const [noteInput, setNoteInput] = useState('');
  const [resolutionInput, setResolutionInput] = useState('');
  const [escalationInput, setEscalationInput] = useState('');
  const [officers, setOfficers] = useState<InterventionOfficer[]>([]);
  const [history, setHistory] = useState<InterventionUpdate[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editAssigneeId, setEditAssigneeId] = useState('');
  const [editAssigneeName, setEditAssigneeName] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editPriority, setEditPriority] = useState<InterventionPriority>('High');
  const [editAction, setEditAction] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const closeCreateModal = () => {
    setShowAddModal(false);
    setNewWarningId('');
  };

  useEffect(() => {
    const controller = new AbortController();
    void ProjectService.getInterventionOfficers(controller.signal)
      .then(setOfficers)
      .catch(() => setOfficers([]));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!interventionWarningId) return;
    const warning = warnings.find(item => item.id === interventionWarningId);
    if (warning) {
      setNewWarningId(warning.id);
      setNewProjectName(warning.projectId);
      setNewMinistry(warning.ministry);
      setNewIssue(`${warning.title}: ${warning.description}`);
      setNewAction(warning.recommendedAction || 'Review warning evidence and implement a time-bound corrective action plan.');
      setNewPriority(warning.severity === 'Critical' ? 'Critical' : warning.severity === 'High' ? 'High' : 'Moderate');
      setShowAddModal(true);
    }
    clearInterventionWarning();
  }, [clearInterventionWarning, interventionWarningId, warnings]);

  useEffect(() => {
    if (!activeIntervention) {
      setHistory([]);
      return;
    }
    setEditAssigneeId(activeIntervention.assignedToId || '');
    setEditAssigneeName(activeIntervention.assignedTo || '');
    setEditDueDate(activeIntervention.dueDate || '');
    setEditPriority(activeIntervention.priority);
    setEditAction(activeIntervention.recommendedAction);
    setResolutionInput(activeIntervention.resolutionSummary || '');
    setEscalationInput(activeIntervention.escalationReason || '');
    setHistoryLoading(true);
    const controller = new AbortController();
    void ProjectService.getInterventionHistory(activeIntervention.id, controller.signal)
      .then(setHistory)
      .catch(error => setActionError(error instanceof Error ? error.message : 'Unable to load intervention history.'))
      .finally(() => setHistoryLoading(false));
    return () => controller.abort();
  }, [activeIntervention]);

  // Filtering
  const filteredInterventions = useMemo(() => {
    return interventions.filter(item => {
      if (selectedStatus !== 'All' && item.status !== selectedStatus) return false;
      if (selectedPriority !== 'All' && item.priority !== selectedPriority) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !item.projectName.toLowerCase().includes(q) &&
          !item.issue.toLowerCase().includes(q) &&
          !item.ministry.toLowerCase().includes(q) &&
          !(item.assignedTo?.toLowerCase().includes(q) ?? false)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [interventions, selectedStatus, selectedPriority, searchQuery]);

  // Aggregate stats
  const stats = useMemo(() => {
    return {
      total: interventions.length,
      critical: interventions.filter(i => i.priority === 'Critical' || i.priority === 'High').length,
      open: interventions.filter(i => i.status === 'Open').length,
      inProgress: interventions.filter(i => i.status === 'In Progress').length,
      escalated: interventions.filter(i => i.status === 'Escalated').length,
      overdue: interventions.filter(i => i.status === 'Overdue').length,
      resolved: interventions.filter(i => i.status === 'Resolved').length,
    };
  }, [interventions]);

  // Handle status update
  const handleUpdateStatus = async (id: string, newStatus: InterventionStatus) => {
    if (!canManageInterventions) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await updateIntervention(id, {
        status: newStatus,
        resolutionSummary: newStatus === 'Resolved' ? resolutionInput.trim() : undefined,
        escalationReason: newStatus === 'Escalated' ? escalationInput.trim() : undefined,
      });
      if (activeIntervention?.id === id) setActiveIntervention(updated);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to update the intervention.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveGovernance = async (id: string) => {
    if (!canManageInterventions) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const selectedOfficer = officers.find(officer => officer.id === editAssigneeId);
      const updated = await updateIntervention(id, {
        assignedTo: editAssigneeId || null,
        assignedToName: selectedOfficer?.fullName || editAssigneeName.trim() || null,
        dueDate: editDueDate || null,
        priority: editPriority,
        recommendedAction: editAction.trim(),
      });
      setActiveIntervention(updated);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to save intervention ownership and deadline.');
    } finally {
      setActionLoading(false);
    }
  };

  // Add note
  const handleAddNote = async (id: string) => {
    if (!canManageInterventions) return;
    if (!noteInput.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await updateIntervention(id, { remark: noteInput.trim() });
      if (activeIntervention?.id === id) setActiveIntervention(updated);
      setNoteInput('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to add the intervention note.');
    } finally {
      setActionLoading(false);
    }
  };

  // Add new intervention
  const handleCreateIntervention = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateInterventions) return;
    if (!newProjectName || !newIssue) return;
    const project = projects.find(item => item.id === newProjectName || item.name === newProjectName);
    if (!project) {
      setActionError('Select a project from the current portfolio before creating an intervention.');
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      await createIntervention({
        projectId: project.id,
        warningId: newWarningId || undefined,
        issue: newIssue,
        recommendedAction: newAction || 'Expedite joint inter-ministerial review',
        priority: newPriority,
        assignedTo: newAssigneeId || undefined,
        assignedToName: newAssignee || undefined,
        dueDate: newDueDate || undefined,
        notes: 'Logged during current monitoring cycle.',
      });
      setShowAddModal(false);
      setNewProjectName('');
      setNewMinistry('');
      setNewIssue('');
      setNewAction('');
      setNewAssignee('');
      setNewAssigneeId('');
      setNewWarningId('');
      reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to create the intervention.');
    } finally {
      setActionLoading(false);
    }
  };

  const getPriorityBadge = (p: InterventionPriority) => {
    if (p === 'Critical') return <Badge variant="critical">Critical</Badge>;
    if (p === 'High') return <Badge variant="high">High</Badge>;
    return <Badge variant="watch">Medium</Badge>;
  };

  const getStatusBadge = (s: InterventionStatus) => {
    if (s === 'Resolved') return <Badge variant="healthy">Resolved</Badge>;
    if (s === 'In Progress') return <Badge variant="info">In Progress</Badge>;
    if (s === 'Escalated') return <Badge variant="critical">Escalated to PMO</Badge>;
    if (s === 'Overdue') return <Badge variant="critical">Overdue</Badge>;
    if (s === 'Assigned') return <Badge variant="info">Assigned</Badge>;
    return <Badge variant="watch">Open</Badge>;
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {actionError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded">{actionError}</div>}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-navy-900 tracking-tight">Intervention Center</h1>
            <Badge variant="info">Governance & Resolution</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Tracking inter-ministerial roadblocks, Secretary-level escalations, and PRAGATI action directives.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAgendaModal(true)}
            className="btn btn-secondary text-xs flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5 text-navy-700" />
            Generate PRAGATI Agenda
          </button>
          {canCreateInterventions && (
            <button
              onClick={() => { setNewWarningId(''); setShowAddModal(true); }}
              className="btn btn-primary text-xs flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Log New Action Item
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard
          title="Active Directives"
          value={stats.total - stats.resolved}
          subtitle={`${stats.overdue} overdue across ministries`}
          status="warning"
          icon={<Zap className="w-5 h-5 text-amber-600" />}
        />
        <KPICard
          title="Escalated to PMO"
          value={stats.escalated}
          subtitle="Awaiting Cabinet decision"
          status="danger"
          icon={<ShieldAlert className="w-5 h-5 text-red-600" />}
        />
        <KPICard
          title="High/Critical Priority"
          value={stats.critical}
          subtitle="Urgent delivery risk"
          status="danger"
          icon={<AlertTriangle className="w-5 h-5 text-orange-600" />}
        />
        <KPICard
          title="In Active Execution"
          value={stats.inProgress}
          subtitle="Assigned to joint task forces"
          status="neutral"
          icon={<Clock className="w-5 h-5 text-blue-600" />}
        />
        <KPICard
          title="Resolved This Cycle"
          value={stats.resolved}
          subtitle="Clearances unlocked"
          status="healthy"
          icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
        />
      </div>

      {/* Main Table Card */}
      <div className="card">
        <div className="card-header flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-navy-800">Inter-Agency Action Directives</h2>
            <span className="text-xs text-slate-500">({filteredInterventions.length} items)</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search issue or project..."
                className="input pl-8 py-1 text-xs w-48"
              />
            </div>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value as any)}
              className="select py-1 text-xs w-32"
            >
              <option value="All">All Statuses</option>
              <option value="Open">Open</option>
              <option value="Assigned">Assigned</option>
              <option value="In Progress">In Progress</option>
              <option value="Escalated">Escalated</option>
              <option value="Overdue">Overdue</option>
              <option value="Resolved">Resolved</option>
            </select>

            {/* Priority Filter */}
            <select
              value={selectedPriority}
              onChange={e => setSelectedPriority(e.target.value as any)}
              className="select py-1 text-xs w-32"
            >
              <option value="All">All Priorities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Project & Ministry</th>
                <th>Core Bottleneck / Issue</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Assigned Nodal Officer</th>
                <th>Target Due Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredInterventions.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-slate-400 text-sm">No interventions match the selected filters.</td></tr>
              )}
              {filteredInterventions.map(item => (
                <tr
                  key={item.id}
                  onClick={() => setActiveIntervention(item)}
                  className="hover:bg-blue-50/50 transition-colors cursor-pointer"
                >
                  <td>
                    <span className="text-2xs font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                      {item.id}
                    </span>
                  </td>
                  <td>
                    <div className="max-w-xs">
                      <span className="text-xs font-semibold text-navy-900 block truncate">{item.projectName}</span>
                      <span className="text-2xs text-slate-500 block truncate">{item.ministry}</span>
                    </div>
                  </td>
                  <td>
                    <div className="max-w-md">
                      <span className="text-xs text-slate-800 line-clamp-1">{item.issue}</span>
                      <span className="text-2xs text-slate-500 line-clamp-1 italic">{item.recommendedAction}</span>
                    </div>
                  </td>
                  <td>{getPriorityBadge(item.priority)}</td>
                  <td>{getStatusBadge(item.status)}</td>
                  <td>
                    <div className="flex items-center gap-1.5 text-xs text-slate-700">
                      <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate max-w-[130px]">{item.assignedTo || 'Unassigned'}</span>
                    </div>
                  </td>
                  <td>
                    <span className="text-xs text-slate-600 tabular-nums">{item.dueDate || '—'}</span>
                  </td>
                  <td>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveIntervention(item);
                      }}
                      className="btn btn-secondary btn-sm"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Intervention Detail Drawer / Modal */}
      {activeIntervention && (
        <Modal
          title={`Intervention Action: ${activeIntervention.id}`}
          isOpen={Boolean(activeIntervention)}
          onClose={() => setActiveIntervention(null)}
        >
          <div className="space-y-4 text-xs">
            {/* Status & Priority Ribbon */}
            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded">
              <div className="flex items-center gap-2">
                {getPriorityBadge(activeIntervention.priority)}
                {getStatusBadge(activeIntervention.status)}
              </div>
              {canManageInterventions && <div className="flex items-center gap-2">
                <span className="text-slate-500">Change Status:</span>
                <select
                  value={activeIntervention.status}
                  onChange={e => handleUpdateStatus(activeIntervention.id, e.target.value as InterventionStatus)}
                  disabled={actionLoading || activeIntervention.status === 'Resolved'}
                  className="select py-0.5 px-2 text-xs w-auto bg-white"
                >
                  <option value={activeIntervention.status}>{activeIntervention.status}</option>
                  {STATUS_TRANSITIONS[activeIntervention.status].map(nextStatus => (
                    <option key={nextStatus} value={nextStatus}>
                      {nextStatus === 'Escalated' ? 'Escalate to PMO' : nextStatus}
                    </option>
                  ))}
                </select>
              </div>}
            </div>

            {canManageInterventions && activeIntervention.status !== 'Resolved' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 border border-slate-200 rounded bg-white">
                <div>
                  <label className="block text-slate-500 text-2xs mb-1">Registered Responsible Officer</label>
                  <select
                    value={editAssigneeId}
                    onChange={event => {
                      const id = event.target.value;
                      const officer = officers.find(item => item.id === id);
                      setEditAssigneeId(id);
                      if (officer) setEditAssigneeName(officer.fullName || officer.email);
                    }}
                    className="select text-xs w-full"
                  >
                    <option value="">External/manual officer</option>
                    {officers.map(officer => (
                      <option key={officer.id} value={officer.id}>
                        {officer.fullName || officer.email}{officer.designation ? ` — ${officer.designation}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 text-2xs mb-1">Officer / Authority Name</label>
                  <input value={editAssigneeName} onChange={event => setEditAssigneeName(event.target.value)} className="input text-xs" />
                </div>
                <div>
                  <label className="block text-slate-500 text-2xs mb-1">Deadline</label>
                  <input type="date" value={editDueDate} onChange={event => setEditDueDate(event.target.value)} className="input text-xs" />
                </div>
                <div>
                  <label className="block text-slate-500 text-2xs mb-1">Priority</label>
                  <select value={editPriority} onChange={event => setEditPriority(event.target.value as InterventionPriority)} className="select text-xs w-full">
                    <option>Critical</option><option>High</option><option>Moderate</option><option>Low</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-slate-500 text-2xs mb-1">Action Description</label>
                  <textarea rows={2} value={editAction} onChange={event => setEditAction(event.target.value)} className="input text-xs" />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <button onClick={() => void handleSaveGovernance(activeIntervention.id)} disabled={actionLoading} className="btn btn-primary text-xs">
                    Save Assignment & Deadline
                  </button>
                </div>
              </div>
            )}

            {canManageInterventions && activeIntervention.status !== 'Resolved' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 text-2xs mb-1">Escalation Reason</label>
                  <textarea rows={2} value={escalationInput} onChange={event => setEscalationInput(event.target.value)} placeholder="Required before escalation" className="input text-xs" />
                </div>
                <div>
                  <label className="block text-slate-500 text-2xs mb-1">Resolution Notes</label>
                  <textarea rows={2} value={resolutionInput} onChange={event => setResolutionInput(event.target.value)} placeholder="Required before resolution" className="input text-xs" />
                </div>
              </div>
            )}

            {/* Project Details */}
            <div>
              <p className="text-slate-400 text-2xs uppercase tracking-wide font-semibold">Affected Project</p>
              <p className="text-sm font-bold text-navy-900 mt-0.5">{activeIntervention.projectName}</p>
              <p className="text-xs text-slate-600">{activeIntervention.ministry}</p>
              {activeIntervention.warningId && (
                <button
                  onClick={() => { setActiveIntervention(null); navigate('early-warning'); }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold mt-1"
                >
                  Originating warning: {activeIntervention.warningId} →
                </button>
              )}
            </div>

            {/* Issue Description */}
            <div className="p-3 bg-red-50 border border-red-100 rounded">
              <p className="text-red-900 font-semibold mb-1 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                Roadblock Description
              </p>
              <p className="text-slate-700 leading-relaxed">{activeIntervention.issue}</p>
            </div>

            {/* Recommended Course of Action */}
            <div className="p-3 bg-blue-50 border border-blue-100 rounded">
              <p className="text-blue-900 font-semibold mb-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                Prescribed Executive Action
              </p>
              <p className="text-slate-700 leading-relaxed">{activeIntervention.recommendedAction}</p>
            </div>

            {/* Assignee & Dates Grid */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded border border-slate-100">
              <div>
                <p className="text-slate-500 text-2xs">Designated Officer</p>
                <p className="font-semibold text-slate-800 mt-0.5">{activeIntervention.assignedTo || 'Unassigned'}</p>
              </div>
              <div>
                <p className="text-slate-500 text-2xs">Resolution Deadline</p>
                <p className="font-semibold text-slate-800 mt-0.5">{activeIntervention.dueDate}</p>
              </div>
              <div>
                <p className="text-slate-500 text-2xs">Logged On</p>
                <p className="font-semibold text-slate-800 mt-0.5">{activeIntervention.createdDate}</p>
              </div>
              <div>
                <p className="text-slate-500 text-2xs">Resolution Date</p>
                <p className="font-semibold text-slate-800 mt-0.5">{activeIntervention.resolvedDate || 'Pending'}</p>
              </div>
            </div>

            {/* Notes & Activity Log */}
            <div>
              <p className="font-semibold text-slate-800 mb-1 flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                Inter-Departmental Coordination Notes
              </p>
              <div className="p-2.5 bg-slate-50 rounded border border-slate-200 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-2xs text-slate-700">
                {activeIntervention.notes || 'No notes logged yet.'}
              </div>

              {/* Add Note Input */}
              {canManageInterventions && <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  placeholder="Add note or update on clearances..."
                  className="input py-1 text-xs flex-1"
                  onKeyDown={e => e.key === 'Enter' && handleAddNote(activeIntervention.id)}
                />
                <button
                  onClick={() => handleAddNote(activeIntervention.id)}
                  className="btn btn-secondary text-xs flex items-center gap-1"
                >
                  <Send className="w-3 h-3" />
                  Post
                </button>
              </div>}
            </div>

            <div>
              <p className="font-semibold text-slate-800 mb-2 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" /> Persisted Activity History
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {historyLoading && <p className="text-slate-400">Loading workflow history…</p>}
                {!historyLoading && history.length === 0 && <p className="text-slate-400">No history entries available.</p>}
                {history.map(update => (
                  <div key={update.id} className="border-l-2 border-blue-200 pl-3 py-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-700">{update.updateType}</span>
                      <span className="text-2xs text-slate-400">{new Date(update.occurredAt).toLocaleString('en-IN')}</span>
                    </div>
                    {update.note && <p className="text-slate-600 mt-0.5">{update.note}</p>}
                    <p className="text-2xs text-slate-400 mt-0.5">
                      {update.createdByName || (update.metadata.source === 'overdue_engine' ? 'Automated overdue engine' : 'System')}
                      {update.status ? ` · ${update.status}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer buttons */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => {
                  const pid = activeIntervention.projectId;
                  setActiveIntervention(null);
                  if (pid && pid !== 'PRJ-NEW') navigate('project-intelligence', pid);
                }}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
              >
                Go to Project Intelligence <ExternalLink className="w-3 h-3" />
              </button>

              <button
                onClick={() => setActiveIntervention(null)}
                className="btn btn-secondary text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create New Intervention Modal */}
      {showAddModal && canCreateInterventions && (
        <Modal
          title="Log New Inter-Ministerial Action Directive"
          isOpen={showAddModal}
          onClose={closeCreateModal}
        >
          <form onSubmit={handleCreateIntervention} className="space-y-3 text-xs">
            {newWarningId && (
              <div className="p-2.5 rounded border border-amber-200 bg-amber-50 text-amber-900">
                Creating from warning <span className="font-mono font-semibold">{newWarningId}</span>. The intervention will retain a permanent link to this warning and its project.
              </div>
            )}
            <div>
              <label className="block font-medium text-slate-700 mb-1">Project Name *</label>
              <input
                type="text"
                list="intervention-project-options"
                required
                value={newProjectName}
                onChange={e => {
                  setNewProjectName(e.target.value);
                  const project = projects.find(item => item.name === e.target.value || item.id === e.target.value);
                  if (project) setNewMinistry(project.ministry);
                }}
                placeholder="e.g. Dedicated Freight Corridor (Western)"
                className="input text-xs"
              />
              <datalist id="intervention-project-options">
                {projects.map(project => <option key={project.id} value={project.name}>{project.id}</option>)}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Ministry</label>
                <input
                  type="text"
                  value={newMinistry}
                  onChange={e => setNewMinistry(e.target.value)}
                  placeholder="e.g. Ministry of Railways"
                  className="input text-xs"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Priority</label>
                <select
                  value={newPriority}
                  onChange={e => setNewPriority(e.target.value as any)}
                  className="select text-xs"
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Bottleneck / Roadblock Description *</label>
              <textarea
                required
                rows={2}
                value={newIssue}
                onChange={e => setNewIssue(e.target.value)}
                placeholder="Detail the specific issue (e.g. Forest clearance stage II pending in Palghar district)..."
                className="input text-xs"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Prescribed Action / Resolution Plan</label>
              <textarea
                rows={2}
                value={newAction}
                onChange={e => setNewAction(e.target.value)}
                placeholder="Recommended action directive for the concerned nodal body..."
                className="input text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Designated Officer / Authority</label>
                <select
                  value={newAssigneeId}
                  onChange={event => {
                    const id = event.target.value;
                    const officer = officers.find(item => item.id === id);
                    setNewAssigneeId(id);
                    setNewAssignee(officer?.fullName || officer?.email || '');
                  }}
                  className="select text-xs w-full mb-2"
                >
                  <option value="">Manual/external officer</option>
                  {officers.map(officer => (
                    <option key={officer.id} value={officer.id}>
                      {officer.fullName || officer.email}{officer.designation ? ` — ${officer.designation}` : ''}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newAssignee}
                  onChange={e => setNewAssignee(e.target.value)}
                  placeholder="e.g. Principal Chief Conservator of Forests"
                  className="input text-xs"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Resolution Due Date</label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={e => setNewDueDate(e.target.value)}
                  className="input text-xs"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeCreateModal}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary text-xs"
              >
                Submit Action Directive
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* PRAGATI Agenda Generator Modal */}
      {showAgendaModal && (
        <Modal
          title="PRAGATI Review Meeting — Proposed Agenda"
          isOpen={showAgendaModal}
          onClose={() => setShowAgendaModal(false)}
        >
          <div className="space-y-4 text-xs text-slate-700">
            <div className="p-3 bg-navy-50 border border-navy-200 rounded">
              <p className="font-bold text-navy-900 text-sm">Cabinet Secretariat / PMO Review Agenda</p>
              <p className="text-2xs text-navy-600 mt-0.5">Session: May 2026 High-Level Inter-Ministerial Infrastructure Review</p>
            </div>

            <p className="text-xs text-slate-600">
              The following {interventions.filter(i => i.priority === 'Critical' || i.status === 'Escalated').length} projects have been auto-compiled for executive review based on severe inter-ministerial gridlock:
            </p>

            <div className="space-y-2.5 max-h-64 overflow-y-auto">
              {interventions
                .filter(i => i.priority === 'Critical' || i.status === 'Escalated')
                .map((item, idx) => (
                  <div key={item.id} className="p-2.5 rounded border border-slate-200 bg-white space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-navy-900">
                        {idx + 1}. {item.projectName}
                      </span>
                      {getPriorityBadge(item.priority)}
                    </div>
                    <p className="text-slate-600">{item.issue}</p>
                    <div className="flex items-center justify-between text-2xs text-slate-500 pt-1 border-t border-slate-100">
                      <span>Ministry: {item.ministry}</span>
                      <span>Target: {item.dueDate}</span>
                    </div>
                  </div>
                ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => {
                  window.print();
                }}
                className="btn btn-secondary text-xs flex items-center gap-1"
              >
                <FileText className="w-3.5 h-3.5" />
                Print / Export PDF
              </button>
              <button
                onClick={() => setShowAgendaModal(false)}
                className="btn btn-primary text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
