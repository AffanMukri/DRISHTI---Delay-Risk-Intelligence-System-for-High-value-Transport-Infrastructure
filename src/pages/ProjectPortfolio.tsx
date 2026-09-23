// =============================================================================
// DHRISTI — Project Portfolio Page
// Enterprise data table with search, sort, filter, pagination
// =============================================================================

import React, { useState, useMemo } from 'react';
import { Search, Download, Eye, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { RiskBadge, StatusBadge, ProgressBar, formatCrore, EmptyState } from '../components/ui';
import { useApp } from '../context/AppContext';
import { usePragatiData } from '../context/PragatiDataContext';
import type { RiskLevel } from '../types';

type SortField = 'name' | 'approvedCost' | 'physicalProgress' | 'delayDays' | 'riskAssessment';
type SortDir = 'asc' | 'desc';

function SortIndicator({ field, activeField, direction }: { field: SortField; activeField: SortField; direction: SortDir }) {
  if (activeField !== field) return <ChevronUp className="w-3 h-3 text-slate-300" />;
  return direction === 'desc'
    ? <ChevronDown className="w-3 h-3 text-navy-600" />
    : <ChevronUp className="w-3 h-3 text-navy-600" />;
}

function csvCell(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export default function ProjectPortfolio() {
  const { navigate, portfolioFilter, setPortfolioFilter, sectorFilter, setSectorFilter } = useApp();
  const { projects } = usePragatiData();

  const [search, setSearch] = useState('');
  const [ministry, setMinistry] = useState('');
  const [sector, setSector] = useState(sectorFilter ?? '');
  const [riskLevel, setRiskLevel] = useState<RiskLevel | ''>(portfolioFilter as RiskLevel || '');
  const [status, setStatus] = useState('');
  const [sortField, setSortField] = useState<SortField>('riskAssessment');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const ministries = useMemo(() => [...new Set(projects.map(project => project.ministry))].sort(), [projects]);
  const sectors = useMemo(() => [...new Set(projects.map(project => project.sector))].sort(), [projects]);

  const allProjects = useMemo(() => {
    let data = [...projects];
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.ministry.toLowerCase().includes(q) ||
        p.state.toLowerCase().includes(q)
      );
    }
    if (ministry) data = data.filter(p => p.ministry === ministry);
    if (sector) data = data.filter(p => p.sector === sector);
    if (riskLevel) data = data.filter(p => p.riskAssessment.riskLevel === riskLevel);
    if (status) data = data.filter(p => p.status === status);

    data.sort((a, b) => {
      let av: number | string, bv: number | string;
      if (sortField === 'riskAssessment') {
        av = a.riskAssessment.overallScore;
        bv = b.riskAssessment.overallScore;
      } else {
        av = a[sortField] as string | number;
        bv = b[sortField] as string | number;
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return data;
  }, [projects, search, ministry, sector, riskLevel, status, sortField, sortDir]);

  const totalPages = Math.ceil(allProjects.length / PAGE_SIZE);
  const pageData = allProjects.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const clearFilters = () => {
    setSearch(''); setMinistry(''); setSector(''); setRiskLevel(''); setStatus('');
    setPortfolioFilter(null); setSectorFilter(null); setPage(1);
  };

  const hasFilters = search || ministry || sector || riskLevel || status;

  const handleExport = () => {
    const csv = [
      ['Project ID', 'Project Name', 'Ministry', 'Sector', 'State', 'Approved Cost', 'Progress%', 'Delay Days', 'Risk Level', 'Risk Score'],
      ...allProjects.map(p => [
        p.id, p.name, p.ministry, p.sector, p.state,
        p.approvedCost, p.physicalProgress, p.delayDays,
        p.riskAssessment.riskLevel, p.riskAssessment.overallScore
      ])
    ].map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dhristi_portfolio_export.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy-800">Project Portfolio</h1>
          <p className="text-sm text-slate-500 mt-0.5">Complete infrastructure project inventory · {allProjects.length} projects shown</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="btn-secondary btn-sm">
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-slate-500 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                className="input pl-8"
                placeholder="Project name, ID, ministry..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Ministry</label>
            <select className="select" value={ministry} onChange={e => { setMinistry(e.target.value); setPage(1); }}>
              <option value="">All Ministries</option>
              {ministries.map(m => <option key={m} value={m}>{m.replace('Ministry of ', '')}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Sector</label>
            <select className="select" value={sector} onChange={e => { setSector(e.target.value); setPage(1); }}>
              <option value="">All Sectors</option>
              {sectors.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Risk Level</label>
            <select className="select" value={riskLevel} onChange={e => { setRiskLevel(e.target.value as RiskLevel | ''); setPage(1); }}>
              <option value="">All Levels</option>
              <option value="Healthy">Healthy</option>
              <option value="Watch">Watch</option>
              <option value="High Risk">High Risk</option>
              <option value="Critical">Critical</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Status</label>
            <select className="select" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All Status</option>
              <option value="Active">Active</option>
              <option value="Completed">Completed</option>
              <option value="On Hold">On Hold</option>
              <option value="Under Review">Under Review</option>
            </select>
          </div>

          {hasFilters && (
            <button onClick={clearFilters} className="btn-secondary btn-sm self-end">
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {pageData.length === 0 ? (
          <EmptyState title="No projects match the selected filters." description="Try adjusting your search or filter criteria." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Project ID</th>
                    <th>
                      <button onClick={() => toggleSort('name')} className="flex items-center gap-1">
                        Project Name <SortIndicator field="name" activeField={sortField} direction={sortDir} />
                      </button>
                    </th>
                    <th>Ministry</th>
                    <th>Sector</th>
                    <th>State</th>
                    <th className="text-right">
                      <button onClick={() => toggleSort('approvedCost')} className="flex items-center gap-1 ml-auto">
                        Approved Cost <SortIndicator field="approvedCost" activeField={sortField} direction={sortDir} />
                      </button>
                    </th>
                    <th className="text-right">Revised Cost</th>
                    <th className="text-center">
                      <button onClick={() => toggleSort('physicalProgress')} className="flex items-center gap-1 mx-auto">
                        Progress <SortIndicator field="physicalProgress" activeField={sortField} direction={sortDir} />
                      </button>
                    </th>
                    <th className="text-right">
                      <button onClick={() => toggleSort('delayDays')} className="flex items-center gap-1 ml-auto">
                        Delay <SortIndicator field="delayDays" activeField={sortField} direction={sortDir} />
                      </button>
                    </th>
                    <th className="text-center">
                      <button onClick={() => toggleSort('riskAssessment')} className="flex items-center gap-1 mx-auto">
                        Risk Score <SortIndicator field="riskAssessment" activeField={sortField} direction={sortDir} />
                      </button>
                    </th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.map(p => (
                    <tr key={p.id} onClick={() => navigate('project-intelligence', p.id)}>
                      <td className="text-2xs font-mono text-slate-500">{p.id}</td>
                      <td>
                        <div className="font-medium text-xs text-navy-800 max-w-[200px] truncate">{p.name}</div>
                        <div className="text-2xs text-slate-400">{p.sector}</div>
                      </td>
                      <td className="text-xs text-slate-600 max-w-[120px] truncate">
                        {p.ministry.replace('Ministry of ', 'MoI: ').replace('MoI: ', '')}
                      </td>
                      <td className="text-xs text-slate-600">{p.sector}</td>
                      <td className="text-xs text-slate-600">{p.state.split(' / ')[0]}</td>
                      <td className="text-right text-xs tabular-nums">{formatCrore(p.approvedCost)}</td>
                      <td className="text-right text-xs tabular-nums">
                        <span className={p.revisedCost > p.approvedCost ? 'text-red-600 font-medium' : ''}>
                          {formatCrore(p.revisedCost)}
                        </span>
                      </td>
                      <td className="min-w-[140px]">
                        <ProgressBar value={p.physicalProgress} expected={p.expectedProgress} showLabel />
                      </td>
                      <td className="text-right text-xs tabular-nums">
                        <span className={p.delayDays > 180 ? 'text-red-600 font-medium' : p.delayDays > 90 ? 'text-amber-600' : 'text-slate-600'}>
                          {p.delayDays > 0 ? `+${p.delayDays}d` : 'On time'}
                        </span>
                      </td>
                      <td className="text-center">
                        <RiskBadge level={p.riskAssessment.riskLevel} score={p.riskAssessment.overallScore} />
                      </td>
                      <td><StatusBadge status={p.status} /></td>
                      <td>
                        <button className="btn-ghost btn-sm" onClick={e => { e.stopPropagation(); navigate('project-intelligence', p.id); }}>
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, allProjects.length)} of {allProjects.length} projects
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-secondary btn-sm disabled:opacity-50"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pn = i + 1;
                  return (
                    <button
                      key={pn}
                      onClick={() => setPage(pn)}
                      className={`btn-sm px-3 ${page === pn ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {pn}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn-secondary btn-sm disabled:opacity-50"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
