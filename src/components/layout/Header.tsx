// =============================================================================
// DRISHTI — Top Header with Global Search
// =============================================================================

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Bell, HelpCircle, ChevronRight, X, Landmark, ShieldCheck } from 'lucide-react';
import { useApp, type PageId } from '../../context/AppContext';
import { usePragatiData } from '../../context/PragatiDataContext';
import { formatDate, RiskBadge } from '../ui';

const PAGE_LABELS: Record<PageId, string> = {
  'command-center':     'Command Center',
  'project-portfolio':  'Project Portfolio',
  'project-intelligence': 'Project Intelligence',
  'risk-intelligence':  'Risk Intelligence',
  'early-warning':      'Early Warning Center',
  'intervention-center':'Intervention Center',
  'cost-analytics':     'Cost Analytics',
  'schedule-analytics': 'Schedule Analytics',
  'benchmarking':       'Benchmarking',
  'geo-intelligence':   'Geo Intelligence',
  'reports':            'Reports',
  'project-insights':   'Project Insights',
  'data-management':    'Data Management & CUF Ingestion',
  'model-monitoring':   'ML Model Monitoring',
  'audit-trail':        'Audit Trail',
  'user-administration': 'Master Access Portal',
};

export default function Header() {
  const { currentPage, selectedProjectId, navigate } = useApp();
  const { projects, warnings } = usePragatiData();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const searchResults = useMemo(() => {
    if (searchQuery.length < 2) return [];
    const query = searchQuery.toLowerCase();
    return projects.filter(project => [
      project.name,
      project.id,
      project.ministry,
      project.sector,
      project.state,
      project.implementingAgency,
    ].some(value => value.toLowerCase().includes(query))).slice(0, 8);
  }, [projects, searchQuery]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const breadcrumb = selectedProjectId && currentPage === 'project-intelligence'
    ? 'Project Portfolio / Project Intelligence'
    : `Portfolio Overview / ${PAGE_LABELS[currentPage]}`;

  return (
    <header className="gov-header h-16 border-b border-slate-200/80 flex items-center justify-between px-5 shrink-0 z-20">
      {/* Institutional context */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="institutional-mark w-8 h-8 rounded-lg shrink-0" aria-hidden="true">
          <Landmark className="w-4 h-4" />
        </div>
        <div className="header-context min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-navy-900 tracking-tight">{PAGE_LABELS[currentPage]}</span>
            <span className="hidden xl:inline-flex items-center gap-1 text-2xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
              <ShieldCheck className="w-3 h-3" /> Secure workspace
            </span>
          </div>
          <div className="flex items-center gap-1 text-2xs text-slate-500 min-w-0 mt-0.5">
            <span className="font-semibold text-navy-600">DRISHTI Intelligence Grid</span>
            <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
            <span className="truncate">{breadcrumb}</span>
          </div>
        </div>
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-3">
        {/* Global Search */}
        <div ref={searchRef} className="relative">
          <div className={`header-search flex items-center gap-2 border rounded-lg px-3 py-2 transition-all duration-200
            ${isSearchFocused ? 'border-navy-400 w-72' : 'w-52'}`}>
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Search projects, IDs, ministries..."
              className="flex-1 text-xs bg-transparent outline-none text-slate-700 placeholder-slate-400 min-w-0"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              aria-label="Global search"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {isSearchFocused && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded shadow-card-md z-50 max-h-80 overflow-y-auto">
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="text-2xs font-semibold text-slate-500 uppercase tracking-wide">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                </p>
              </div>
              {searchResults.map(project => (
                <button
                  key={project.id}
                  onClick={() => {
                    navigate('project-intelligence', project.id);
                    setSearchQuery('');
                    setIsSearchFocused(false);
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-800 truncate">{project.name}</p>
                      <p className="text-2xs text-slate-400">{project.id} · {project.ministry} · {project.state}</p>
                    </div>
                    <RiskBadge level={project.riskAssessment.riskLevel} />
                  </div>
                </button>
              ))}
            </div>
          )}

          {isSearchFocused && searchQuery.length >= 2 && searchResults.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded shadow-card-md z-50 px-3 py-3">
              <p className="text-xs text-slate-500 text-center">No projects match "{searchQuery}"</p>
            </div>
          )}
        </div>

        {/* Last Updated */}
        <div className="text-xs text-slate-400 hidden lg:block whitespace-nowrap">
          Data: <span className="text-slate-600 font-medium">30 Apr 2026</span>
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setNotifOpen(o => !o)}
            className="relative p-2 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full" aria-label="New notifications" />
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded shadow-card-md z-50">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Notifications</p>
                <span className="badge badge-critical">{warnings.filter(warning => warning.status === 'New').length} New</span>
              </div>
              {warnings.slice(0, 3).map(warning => (
                <div key={warning.id} className="px-4 py-3 border-b border-slate-50 hover:bg-slate-50 cursor-pointer">
                  <p className="text-xs text-slate-700">{warning.projectId}: {warning.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`badge ${warning.severity === 'Critical' ? 'badge-critical' : 'badge-high'} text-2xs`}>{warning.severity}</span>
                    <span className="text-2xs text-slate-400">{formatDate(warning.detectedDate)}</span>
                  </div>
                </div>
              ))}
              <button
                onClick={() => { navigate('early-warning'); setNotifOpen(false); }}
                className="w-full text-center text-xs text-navy-600 font-medium py-2.5 hover:bg-slate-50"
              >
                View all warnings →
              </button>
            </div>
          )}
        </div>

        {/* Help */}
        <button className="p-2 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors" aria-label="Help">
          <HelpCircle className="w-4 h-4" />
        </button>

        {/* System Status Dot */}
        <div className="flex items-center gap-1.5 hidden xl:flex text-xs text-slate-500">
          <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" aria-hidden="true" />
          <span>Operational</span>
        </div>
      </div>
    </header>
  );
}
