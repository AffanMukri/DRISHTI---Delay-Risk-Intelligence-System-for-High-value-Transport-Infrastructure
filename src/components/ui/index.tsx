// =============================================================================
// DRISHTI — Reusable UI Components
// =============================================================================

import React from 'react';
import type { RiskLevel, WarningSeverity, ProjectStatus } from '../../types';

// ── Risk Badge ────────────────────────────────────────────────────────────────
interface RiskBadgeProps {
  level: RiskLevel;
  score?: number;
  className?: string;
}

const RISK_CLASSES: Record<RiskLevel, string> = {
  Healthy:    'badge-healthy',
  Watch:      'badge-watch',
  'High Risk':'badge-high',
  Critical:   'badge-critical',
};

const RISK_DOTS: Record<RiskLevel, string> = {
  Healthy:    'bg-green-600',
  Watch:      'bg-amber-500',
  'High Risk':'bg-orange-600',
  Critical:   'bg-red-600',
};

export function RiskBadge({ level, score, className = '' }: RiskBadgeProps) {
  return (
    <span className={`badge ${RISK_CLASSES[level]} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${RISK_DOTS[level]}`} aria-hidden="true" />
      {score !== undefined ? `${score} — ${level}` : level}
    </span>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────
interface StatusBadgeProps {
  status: ProjectStatus | string;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const cls =
    status === 'Active'       ? 'badge-info' :
    status === 'Completed'    ? 'badge-healthy' :
    status === 'On Hold'      ? 'badge-watch' :
    status === 'Under Review' ? 'badge-neutral' : 'badge-neutral';
  return <span className={`badge ${cls} ${className}`}>{status}</span>;
}

// ── Severity Badge ────────────────────────────────────────────────────────────
export function SeverityBadge({ severity, className = '' }: { severity: WarningSeverity; className?: string }) {
  const cls =
    severity === 'Critical' ? 'badge-critical' :
    severity === 'High'     ? 'badge-high' :
    severity === 'Moderate' ? 'badge-watch' : 'badge-info';
  return <span className={`badge ${cls} ${className}`}>{severity}</span>;
}

// ── Generic Badge ─────────────────────────────────────────────────────────────
export function Badge({
  children,
  variant = 'neutral',
  className = '',
}: {
  children: React.ReactNode;
  variant?: 'healthy' | 'watch' | 'high' | 'critical' | 'info' | 'neutral';
  className?: string;
}) {
  const map = {
    healthy: 'badge-healthy',
    watch: 'badge-watch',
    high: 'badge-high',
    critical: 'badge-critical',
    info: 'badge-info',
    neutral: 'badge-neutral',
  };
  return <span className={`badge ${map[variant] || 'badge-neutral'} ${className}`}>{children}</span>;
}

// ── Health Pill ───────────────────────────────────────────────────────────────
export function HealthPill({ score, level }: { score: number; level?: string }) {
  const cls =
    score >= 80 ? 'risk-pill-critical' :
    score >= 60 ? 'risk-pill-high' :
    score >= 35 ? 'risk-pill-watch' : 'risk-pill-healthy';
  return <span className={cls}>{score} {level ? `• ${level}` : ''}</span>;
}

// ── Card Container ────────────────────────────────────────────────────────────
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: string; direction: 'up' | 'down' | 'neutral'; isGood?: boolean };
  accent?: 'navy' | 'red' | 'amber' | 'green' | 'orange';
  status?: 'healthy' | 'warning' | 'danger' | 'neutral';
  icon?: React.ReactNode;
  onClick?: () => void;
}

const ACCENT_BORDER: Record<string, string> = {
  navy:   'border-t-navy-700',
  red:    'border-t-red-500',
  amber:  'border-t-amber-500',
  green:  'border-t-green-500',
  orange: 'border-t-orange-500',
};

const STATUS_ACCENT: Record<string, string> = {
  healthy: 'border-t-green-500',
  warning: 'border-t-amber-500',
  danger:  'border-t-red-500',
  neutral: 'border-t-navy-700',
};

export function KPICard({ title, value, subtitle, trend, accent = 'navy', status, icon, onClick }: KPICardProps) {
  const borderCls = status ? STATUS_ACCENT[status] : ACCENT_BORDER[accent];
  const accentName = status
    ? ({ healthy: 'green', warning: 'amber', danger: 'red', neutral: 'navy' } as const)[status]
    : accent;

  return (
    <div
      className={`card kpi-card kpi-accent-${accentName} border-t-2 ${borderCls} p-4 fade-in
        ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.08em] leading-4">{title}</p>
        {icon && <div className="kpi-icon shrink-0">{icon}</div>}
      </div>
      <p className="text-2xl font-bold text-navy-900 tabular-nums leading-none mb-1.5 tracking-tight">{value}</p>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
      {trend && (
        <p className={`text-xs font-medium mt-2 flex items-center gap-1 ${
          trend.direction === 'up'
            ? (trend.isGood ? 'text-green-600' : 'text-red-600')
            : trend.direction === 'down'
            ? (trend.isGood ? 'text-green-600' : 'text-red-600')
            : 'text-slate-500'
        }`}>
          {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'}
          {trend.value}
        </p>
      )}
    </div>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────
export function SectionHeader({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-4 gap-4">
      <div>
        <h2 className="text-base font-semibold text-navy-800">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────
interface ProgressProps {
  value: number;
  expected?: number;
  color?: string;
  showLabel?: boolean;
  height?: string;
}

export function ProgressBar({ value, expected, color, showLabel = false, height = 'h-1.5' }: ProgressProps) {
  const fillColor = color ?? (
    value >= 80 ? 'bg-green-500' :
    value >= 60 ? 'bg-blue-500' :
    value >= 40 ? 'bg-amber-500' : 'bg-red-500'
  );

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>{value}%</span>
          {expected !== undefined && <span>Expected: {expected}%</span>}
        </div>
      )}
      <div className={`progress-bar ${height} relative`}>
        <div
          className={`progress-fill ${fillColor}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
        {expected !== undefined && (
          <div
            className="absolute top-0 bottom-0 w-px bg-slate-500"
            style={{ left: `${Math.max(0, Math.min(100, expected))}%` }}
            title={`Expected: ${expected}%`}
          />
        )}
      </div>
    </div>
  );
}

// ── Risk Score Pill ───────────────────────────────────────────────────────────
export function RiskScorePill({ score }: { score: number }) {
  const cls =
    score >= 80 ? 'risk-pill-critical' :
    score >= 60 ? 'risk-pill-high' :
    score >= 35 ? 'risk-pill-watch' : 'risk-pill-healthy';
  return <span className={cls}>{score}</span>;
}

// ── Metric Row ────────────────────────────────────────────────────────────────
export function MetricRow({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold text-slate-800">{value}</span>
        {sub && <span className="text-xs text-slate-400 ml-1">{sub}</span>}
      </div>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
export function EmptyState({ title = 'No data available', description = '' }: { title?: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0H4" />
        </svg>
      </div>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {description && <p className="text-xs text-slate-400 mt-1 max-w-xs">{description}</p>}
    </div>
  );
}

// ── Loading State ─────────────────────────────────────────────────────────────
export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="flex items-center gap-3 text-slate-500">
        <div className="w-5 h-5 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">{message}</span>
      </div>
    </div>
  );
}

export function ErrorState({
  title = 'Unable to load data',
  description,
  onRetry,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-3 text-red-600 font-bold">!</div>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="text-xs text-slate-500 mt-1 max-w-md">{description}</p>
      {onRetry && <button type="button" onClick={onRetry} className="btn btn-primary btn-sm mt-4">Retry</button>}
    </div>
  );
}

// ── Tooltip wrapper ───────────────────────────────────────────────────────────
export function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  return (
    <span className="relative group inline-block">
      {children}
      <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap
        bg-navy-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100
        transition-opacity duration-150 z-50">
        {content}
      </span>
    </span>
  );
}

// ── Trend Indicator ───────────────────────────────────────────────────────────
export function TrendIndicator({ direction }: { direction: 'up' | 'down' | 'stable' }) {
  if (direction === 'up') return <span className="text-red-500 text-xs font-bold" title="Risk increasing">↑</span>;
  if (direction === 'down') return <span className="text-green-600 text-xs font-bold" title="Risk decreasing">↓</span>;
  return <span className="text-slate-400 text-xs font-bold" title="Risk stable">→</span>;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  if (!isOpen) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-lg shadow-xl w-full ${widths[size]} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-navy-800">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 text-slate-500"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
interface TabsProps {
  tabs: { id: string; label: string }[];
  activeTab: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div className="flex border-b border-slate-200 gap-0">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors duration-150
            ${activeTab === tab.id
              ? 'border-navy-700 text-navy-700'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ── Synthetic Data Disclaimer ─────────────────────────────────────────────────
export function DataDisclaimer({ label = 'Synthetic Demonstration Data' }: { label?: string }) {
  return (
    <span className="data-disclaimer inline-flex items-center gap-1.5 text-2xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-1 rounded-full">
      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {label}
    </span>
  );
}

// ── Contribution Bar ──────────────────────────────────────────────────────────
export function ContributionBar({ value, max = 100, color = 'bg-navy-600' }: { value: number; max?: number; color?: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-600 w-8 text-right">{value}</span>
    </div>
  );
}

// ── Format helpers ────────────────────────────────────────────────────────────
export function formatCrore(val: number): string {
  if (val >= 100000) return `₹${(val / 100000).toFixed(2)} L Cr`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K Cr`;
  return `₹${val.toLocaleString()} Cr`;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
