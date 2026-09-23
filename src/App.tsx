// =============================================================================
// DHRISTI — Master Application Root
// Infrastructure Project Monitoring & Intelligence Platform (MoSPI)
// =============================================================================

import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import { Activity, LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import { canAccessPage } from './auth/authorization';
import { PragatiDataProvider } from './context/PragatiDataContext';

// Route Pages
import CommandCenter from './pages/CommandCenter';
import ProjectPortfolio from './pages/ProjectPortfolio';
import ProjectIntelligence from './pages/ProjectIntelligence';
import RiskIntelligence from './pages/RiskIntelligence';
import EarlyWarningCenter from './pages/EarlyWarningCenter';
import InterventionCenter from './pages/InterventionCenter';
import CostAnalytics from './pages/CostAnalytics';
import ScheduleAnalytics from './pages/ScheduleAnalytics';
import Benchmarking from './pages/Benchmarking';
import Reports from './pages/Reports';
import ProjectInsights from './pages/ProjectInsights';
import AuthPage from './pages/AuthPage';
import LandingPage from './pages/LandingPage';
import UserAdministration from './pages/UserAdministration';
import DataManagement from './pages/DataManagement';
import ModelMonitoring from './pages/ModelMonitoring';
import AuditTrail from './pages/AuditTrail';

const GeoIntelligence = lazy(() => import('./pages/GeoIntelligence'));
const PublicProjectEnquiry = lazy(() => import('./pages/PublicProjectEnquiry'));

function MainLayout() {
  const { currentPage, navigate, appRole } = useApp();

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing inside input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.shiftKey) {
        if (e.key === '1') { e.preventDefault(); navigate('command-center'); }
        else if (e.key === '2') { e.preventDefault(); navigate('project-portfolio'); }
        else if (e.key === '3') { e.preventDefault(); navigate('risk-intelligence'); }
        else if (e.key === '4') { e.preventDefault(); navigate('early-warning'); }
        else if (e.key === '5') { e.preventDefault(); navigate('intervention-center'); }
        else if (e.key === '6') { e.preventDefault(); navigate('cost-analytics'); }
        else if (e.key === '7') { e.preventDefault(); navigate('schedule-analytics'); }
        else if (e.key === '8') { e.preventDefault(); navigate('geo-intelligence'); }
        else if (e.key === '9') { e.preventDefault(); navigate('reports'); }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  // Page Switcher
  const renderPage = () => {
    if (!canAccessPage(appRole, currentPage)) {
      return (
        <div className="min-h-[70vh] flex items-center justify-center p-6">
          <div className="card max-w-md p-7 text-center">
            <ShieldAlert className="w-9 h-9 text-amber-600 mx-auto" />
            <h1 className="text-lg font-bold text-navy-900 mt-3">Access restricted</h1>
            <p className="text-sm text-slate-500 mt-2">
              Your assigned role does not permit access to this section.
            </p>
            <button onClick={() => navigate('command-center')} className="btn btn-primary mt-5">
              Return to Command Center
            </button>
          </div>
        </div>
      );
    }

    switch (currentPage) {
      case 'command-center':
        return <CommandCenter />;
      case 'project-portfolio':
        return <ProjectPortfolio />;
      case 'project-intelligence':
        return <ProjectIntelligence />;
      case 'risk-intelligence':
        return <RiskIntelligence />;
      case 'early-warning':
        return <EarlyWarningCenter />;
      case 'intervention-center':
        return <InterventionCenter />;
      case 'cost-analytics':
        return <CostAnalytics />;
      case 'schedule-analytics':
        return <ScheduleAnalytics />;
      case 'benchmarking':
        return <Benchmarking />;
      case 'geo-intelligence':
        return (
          <Suspense fallback={<div className="flex min-h-[70vh] items-center justify-center text-sm text-slate-500">Loading Geo Intelligence…</div>}>
            <GeoIntelligence />
          </Suspense>
        );
      case 'reports':
        return <Reports />;
      case 'project-insights':
        return <ProjectInsights />;
      case 'data-management':
        return <DataManagement />;
      case 'model-monitoring':
        return <ModelMonitoring />;
      case 'audit-trail':
        return <AuditTrail />;
      case 'user-administration':
        return <UserAdministration />;
      default:
        return <CommandCenter />;
    }
  };

  return (
    <div className="app-shell flex h-screen w-screen overflow-hidden select-none">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main View Area */}
      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <Header />

        {/* Dynamic Page Content */}
        <main className="app-main flex-1 overflow-y-auto focus:outline-none select-text">
          {renderPage()}

          {/* Institutional Statutory Footer */}
          <footer className="institutional-footer mt-8 border-t py-4 px-6 text-2xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold text-navy-900">
                <span className="w-1.5 h-1.5 rounded-full bg-gov-teal" />
                DHRISTI v2.4
              </span>
              <span>•</span>
              <span>Ministry of Statistics & Programme Implementation (MoSPI)</span>
              <span>•</span>
              <span>Infrastructure and Project Monitoring Division</span>
            </div>
            <div className="flex items-center gap-4 text-slate-400">
              <span>All deterministic formulas compliant with IPMD audit guidelines</span>
              <span>•</span>
              <span className="text-navy-700 font-medium">Government of India</span>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const { session, profile, loading, authMessage, refreshProfile, signOut } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const initialPublicProjectId = typeof window === 'undefined'
    ? null
    : new URLSearchParams(window.location.search).get('publicProject');
  const [showPublicEnquiry, setShowPublicEnquiry] = useState(Boolean(initialPublicProjectId));
  const [publicProjectId, setPublicProjectId] = useState<string | null>(initialPublicProjectId);

  const updatePublicUrl = useCallback((projectId: string | null) => {
    const url = new URL(window.location.href);
    if (projectId) url.searchParams.set('publicProject', projectId);
    else url.searchParams.delete('publicProject');
    window.history.replaceState({}, '', url);
  }, []);

  const openPublicEnquiry = useCallback((projectId: string | null = null) => {
    setPublicProjectId(projectId);
    setShowPublicEnquiry(true);
    updatePublicUrl(projectId);
  }, [updatePublicUrl]);

  const closePublicEnquiry = useCallback(() => {
    setShowPublicEnquiry(false);
    setPublicProjectId(null);
    updatePublicUrl(null);
  }, [updatePublicUrl]);

  const handlePublicProjectChange = useCallback((projectId: string | null) => {
    setPublicProjectId(projectId);
    updatePublicUrl(projectId);
  }, [updatePublicUrl]);

  if (showPublicEnquiry) {
    return (
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-semibold text-navy-800">Opening public project enquiry…</div>}>
        <PublicProjectEnquiry
          initialProjectId={publicProjectId ?? undefined}
          onProjectChange={handlePublicProjectChange}
          onBack={closePublicEnquiry}
          onSignIn={() => {
            closePublicEnquiry();
            setShowAuth(true);
          }}
        />
      </Suspense>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-navy-800">
          <Activity className="w-8 h-8 animate-pulse" />
          <p className="text-sm font-semibold">Restoring secure session...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return showAuth
      ? <AuthPage onBack={() => setShowAuth(false)} />
      : <LandingPage onSignIn={() => setShowAuth(true)} onPublicEnquiry={() => openPublicEnquiry()} />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="card max-w-md p-7 text-center">
          <ShieldAlert className="w-9 h-9 text-red-600 mx-auto" />
          <h1 className="text-lg font-bold text-navy-900 mt-3">Authorization profile unavailable</h1>
          <p className="text-sm text-slate-500 mt-2">
            {authMessage ?? 'Your access profile could not be loaded.'}
          </p>
          <div className="flex items-center justify-center gap-2 mt-5">
            <button onClick={() => void refreshProfile()} className="btn btn-primary">
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
            <button onClick={() => void signOut()} className="btn btn-secondary">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppProvider role={profile.role}>
      <PragatiDataProvider role={profile.role}>
        <MainLayout />
      </PragatiDataProvider>
    </AppProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}
