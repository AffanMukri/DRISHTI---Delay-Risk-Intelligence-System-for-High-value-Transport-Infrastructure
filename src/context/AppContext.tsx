// =============================================================================
// DRISHTI — Application Context
// Global state management for navigation, role, filters, and search.
// =============================================================================

import React, { createContext, useContext, useState, useCallback } from 'react';
import { ROLE_LABELS, type AppRole } from '../auth/authorization';
import type { UserRole } from '../types';

export type PageId =
  | 'command-center'
  | 'project-portfolio'
  | 'project-intelligence'
  | 'risk-intelligence'
  | 'early-warning'
  | 'intervention-center'
  | 'cost-analytics'
  | 'schedule-analytics'
  | 'benchmarking'
  | 'geo-intelligence'
  | 'reports'
  | 'project-insights'
  | 'data-management'
  | 'model-monitoring'
  | 'audit-trail'
  | 'user-administration';

interface AppState {
  currentPage: PageId;
  selectedProjectId: string | null;
  interventionWarningId: string | null;
  appRole: AppRole;
  userRole: UserRole;
  isSidebarCollapsed: boolean;
  isSearchOpen: boolean;
  portfolioFilter: string | null; // risk level filter from command center
  sectorFilter: string | null;
  navigate: (page: PageId, projectId?: string) => void;
  startInterventionFromWarning: (warningId: string) => void;
  clearInterventionWarning: () => void;
  toggleSidebar: () => void;
  setSearchOpen: (open: boolean) => void;
  setPortfolioFilter: (filter: string | null) => void;
  setSectorFilter: (filter: string | null) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children, role }: { children: React.ReactNode; role: AppRole }) {
  const [currentPage, setCurrentPage] = useState<PageId>('command-center');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [interventionWarningId, setInterventionWarningId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1100,
  );
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [portfolioFilter, setPortfolioFilter] = useState<string | null>(null);
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);

  const navigate = useCallback((page: PageId, projectId?: string) => {
    setCurrentPage(page);
    if (projectId !== undefined) setSelectedProjectId(projectId);
    if (page !== 'project-intelligence' && projectId === undefined) {
      setSelectedProjectId(null);
    }
  }, []);

  const startInterventionFromWarning = useCallback((warningId: string) => {
    setInterventionWarningId(warningId);
    setCurrentPage('intervention-center');
    setSelectedProjectId(null);
  }, []);

  return (
    <AppContext.Provider value={{
      currentPage,
      selectedProjectId,
      interventionWarningId,
      appRole: role,
      userRole: ROLE_LABELS[role],
      isSidebarCollapsed,
      isSearchOpen,
      portfolioFilter,
      sectorFilter,
      navigate,
      startInterventionFromWarning,
      clearInterventionWarning: () => setInterventionWarningId(null),
      toggleSidebar: () => setIsSidebarCollapsed(s => !s),
      setSearchOpen: setIsSearchOpen,
      setPortfolioFilter,
      setSectorFilter,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
