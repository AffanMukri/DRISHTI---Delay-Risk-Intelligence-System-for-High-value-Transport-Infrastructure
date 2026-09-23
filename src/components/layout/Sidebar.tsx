// =============================================================================
// DRISHTI — Sidebar Navigation
// =============================================================================

import React, { useState } from 'react';
import {
  LayoutDashboard, FolderKanban, Bell, Zap,
  BarChart2, Calendar, Layers, Map, FileText, Lightbulb,
  ChevronDown, ChevronLeft, ChevronRight, Database, Settings, User,
  Activity, Shield, LogOut, ScrollText
} from 'lucide-react';
import { useApp, type PageId } from '../../context/AppContext';
import { useAuth } from '../../hooks/useAuth';
import { canAccessPage } from '../../auth/authorization';
import { usePragatiData } from '../../context/PragatiDataContext';

interface NavigationItem {
  id: PageId;
  label: string;
  icon: React.ElementType;
}

interface NavigationGroup {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  activePages?: PageId[];
  items: NavigationItem[];
}

const NAV_GROUPS: NavigationGroup[] = [
  {
    id: 'portfolio',
    label: 'Portfolio',
    description: 'Overview and projects',
    icon: LayoutDashboard,
    activePages: ['project-intelligence'],
    items: [
      { id: 'command-center', label: 'Command Center', icon: LayoutDashboard },
      { id: 'project-portfolio', label: 'Project Portfolio', icon: FolderKanban },
    ],
  },
  {
    id: 'risk-action',
    label: 'Risk & Action',
    description: 'Risks, warnings and response',
    icon: Shield,
    items: [
      { id: 'risk-intelligence', label: 'Risk Intelligence', icon: Shield },
      { id: 'early-warning', label: 'Early Warnings', icon: Bell },
      { id: 'intervention-center', label: 'Intervention Center', icon: Zap },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    description: 'Performance and comparison',
    icon: BarChart2,
    items: [
      { id: 'cost-analytics', label: 'Cost Analytics', icon: BarChart2 },
      { id: 'schedule-analytics', label: 'Schedule Analytics', icon: Calendar },
      { id: 'benchmarking', label: 'Benchmarking', icon: Layers },
      { id: 'geo-intelligence', label: 'Geo Intelligence', icon: Map },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    description: 'Data and reporting',
    icon: Database,
    items: [
      { id: 'data-management', label: 'Data Management', icon: Database },
      { id: 'reports', label: 'Reports', icon: FileText },
    ],
  },
  {
    id: 'insights-models',
    label: 'Insights & Models',
    description: 'Insights and ML oversight',
    icon: Lightbulb,
    items: [
      { id: 'project-insights', label: 'Project Insights', icon: Lightbulb },
      { id: 'model-monitoring', label: 'Model Monitoring', icon: Activity },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    description: 'Audit and access control',
    icon: Settings,
    items: [
      { id: 'audit-trail', label: 'Audit Trail', icon: ScrollText },
      { id: 'user-administration', label: 'Master Access Portal', icon: Settings },
    ],
  },
];

function groupForPage(page: PageId): string {
  return NAV_GROUPS.find(group => (
    group.items.some(item => item.id === page) || group.activePages?.includes(page)
  ))?.id ?? 'portfolio';
}

export default function Sidebar() {
  const { currentPage, navigate, appRole, userRole, isSidebarCollapsed, toggleSidebar } = useApp();
  const { user, profile, signOut } = useAuth();
  const { projects } = usePragatiData();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [groupSelection, setGroupSelection] = useState(() => ({
    page: currentPage,
    group: groupForPage(currentPage),
  }));

  const displayName = profile?.full_name?.trim()
    ? profile.full_name
    : user?.email?.split('@')[0] ?? 'User';

  const handleSignOut = async () => {
    setIsSigningOut(true);
    const { error } = await signOut();
    if (error) {
      console.error('Unable to sign out:', error.message);
      setIsSigningOut(false);
    }
  };

  const visibleGroups = NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => canAccessPage(appRole, item.id)),
  })).filter(group => group.items.length > 0);
  const activeGroup = groupForPage(currentPage);
  const expandedGroup = groupSelection.page === currentPage
    ? groupSelection.group
    : activeGroup;

  const toggleGroup = (groupId: string) => {
    if (isSidebarCollapsed) {
      setGroupSelection({ page: currentPage, group: groupId });
      toggleSidebar();
      return;
    }
    setGroupSelection({
      page: currentPage,
      group: expandedGroup === groupId ? '' : groupId,
    });
  };

  return (
    <aside
      className={`gov-sidebar flex flex-col border-r border-white/10
        transition-all duration-300 ease-in-out h-screen shrink-0
        ${isSidebarCollapsed ? 'w-[68px]' : 'w-[228px]'}`}
      aria-label="Main navigation"
    >
      {/* Logo / Header */}
      <div className={`flex items-center justify-between h-16 border-b border-white/10 ${isSidebarCollapsed ? 'px-2' : 'px-3.5'}`}>
        {!isSidebarCollapsed && (
          <div className="flex items-center gap-2.5 min-w-0" title="Delay & Risk Intelligence System for High-value Transport & Infrastructure">
            <div className="institutional-mark w-9 h-9 rounded-lg shrink-0 text-2xs font-extrabold tracking-tight">
              D
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white tracking-[0.08em] leading-none">DRISHTI</div>
              <div className="text-[9px] text-teal-200/80 truncate leading-tight mt-1 uppercase tracking-[0.08em]">Delay · Risk · Action</div>
            </div>
          </div>
        )}
        {isSidebarCollapsed && (
          <div className="institutional-mark w-8 h-8 rounded-lg text-[9px] font-extrabold tracking-tight">
            D
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1 rounded text-navy-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto py-3.5 ${isSidebarCollapsed ? 'px-2 space-y-1.5' : 'px-2.5 space-y-1'}`}>
        {visibleGroups.map(group => {
          const GroupIcon = group.icon;
          const isExpanded = expandedGroup === group.id && !isSidebarCollapsed;
          const containsActivePage = activeGroup === group.id;
          return (
            <div key={group.id} className="space-y-0.5">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className={`w-full flex items-center rounded-md transition-colors duration-150 text-left
                  ${isSidebarCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-2.5 py-2'}
                  ${containsActivePage ? 'bg-white/[0.09] text-white ring-1 ring-white/[0.06]' : 'text-slate-300 hover:text-white hover:bg-white/[0.055]'}`}
                title={isSidebarCollapsed ? `${group.label} — ${group.description}` : undefined}
                aria-expanded={isExpanded}
                aria-controls={`sidebar-group-${group.id}`}
                aria-label={group.label}
              >
                <GroupIcon className={`w-4 h-4 shrink-0 ${containsActivePage ? 'text-sky-300' : 'text-slate-500'}`} />
                {!isSidebarCollapsed && (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold truncate tracking-[0.01em]">{group.label}</span>
                      <span className="block text-[9px] font-normal text-slate-500 truncate mt-0.5">{group.description}</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-navy-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </>
                )}
              </button>

              {isExpanded && (
                <div
                  id={`sidebar-group-${group.id}`}
                  className="animate-in fade-in slide-in-from-top-1 duration-150"
                >
                  <div className="ml-4 pl-3 py-1 border-l border-white/10 space-y-0.5">
                    {group.items.map(item => {
                      const ItemIcon = item.icon;
                      const isActive = currentPage === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => navigate(item.id)}
                          className={`w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs transition-colors
                            ${isActive ? 'bg-sky-400/15 text-white font-semibold ring-1 ring-sky-300/10' : 'text-slate-400 hover:text-white hover:bg-white/[0.055]'}`}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <ItemIcon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-sky-300' : 'text-slate-500'}`} />
                          <span className="truncate">{item.label}</span>
                          {isActive && <span className="ml-auto w-0.5 h-4 bg-orange-400 rounded-full shadow-[0_0_8px_rgba(251,146,60,.45)]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Data Status */}
      {!isSidebarCollapsed && (
        <div className="px-4 py-2.5 border-t border-navy-700/50">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-400" aria-hidden="true" />
            <div className="min-w-0">
              <span className="block text-2xs text-green-400 font-medium">Portfolio data ready</span>
              <span className="block text-2xs text-navy-400 truncate">{projects.length.toLocaleString()} projects · 30 Apr 2026</span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Controls */}
      <div className={`border-t border-navy-700/50 p-2 space-y-0.5`}>
        {/* Authenticated identity. Roles are assigned by an administrator. */}
        <div
          className="sidebar-link w-full text-left cursor-default"
          title={isSidebarCollapsed ? `Role: ${userRole}` : undefined}
        >
            <User className="w-4 h-4 shrink-0" />
            {!isSidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <div className="text-xs text-white truncate">{displayName}</div>
                <div className="text-2xs text-navy-400 truncate">{userRole}</div>
              </div>
            )}
        </div>

        <button
          onClick={() => void handleSignOut()}
          disabled={isSigningOut}
          className="sidebar-link w-full text-left disabled:opacity-50"
          title={isSidebarCollapsed ? 'Sign out' : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!isSidebarCollapsed && (isSigningOut ? 'Signing out...' : 'Sign out')}
        </button>
      </div>
    </aside>
  );
}
