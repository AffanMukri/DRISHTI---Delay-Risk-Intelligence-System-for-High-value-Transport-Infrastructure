import type { UserRole } from '../types';

export type AppRole =
  | 'administrator'
  | 'executive'
  | 'monitoring_officer'
  | 'analyst';

export type AppPermission =
  | 'view_dashboard'
  | 'view_analytics'
  | 'view_predictions'
  | 'view_interventions'
  | 'create_interventions'
  | 'manage_interventions'
  | 'upload_cuf'
  | 'manage_project_updates'
  | 'manage_dependencies'
  | 'analyse_data'
  | 'monitor_models'
  | 'administer_users';

export interface AuthProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  ministry_id: string | null;
  agency_id: string | null;
  designation: string | null;
  avatar_url: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export const ROLE_LABELS: Record<AppRole, UserRole> = {
  administrator: 'Administrator',
  executive: 'Executive',
  monitoring_officer: 'Monitoring Officer',
  analyst: 'Analyst',
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  administrator: 'Full system and user-access administration',
  executive: 'Portfolio oversight, predictions, and intervention creation',
  monitoring_officer: 'Project monitoring, CUF ingestion, and intervention management',
  analyst: 'Analytics, predictions, and analytical data ingestion',
};

export interface RoleDataVisibility {
  tier: string;
  summary: string;
  visible: readonly string[];
  restricted: readonly string[];
}

export const ROLE_DATA_VISIBILITY: Record<AppRole, RoleDataVisibility> = {
  administrator: {
    tier: 'Level 4 - System authority',
    summary: 'Full platform visibility and controlled access administration.',
    visible: ['All portfolio and project records', 'Predictions and interventions', 'Audit and model-monitoring records', 'User roles and account status'],
    restricted: ['Service-role credentials and password material'],
  },
  executive: {
    tier: 'Level 3 - Strategic oversight',
    summary: 'Decision-level portfolio intelligence without system administration.',
    visible: ['Command Center and portfolio', 'Cost, schedule and benchmark analytics', 'Predictions and risk intelligence', 'Interventions, including creation'],
    restricted: ['User and role administration', 'Audit administration', 'CUF/project-update management', 'Model administration'],
  },
  monitoring_officer: {
    tier: 'Level 2 - Operational control',
    summary: 'Operational monitoring, source-data upkeep and intervention execution.',
    visible: ['Dashboard and project records', 'Analytics and early warnings', 'CUF upload and project updates', 'Intervention assignment and management'],
    restricted: ['User and role administration', 'Administrative audit viewer', 'Model-monitoring administration', 'Prediction-only insight workspace'],
  },
  analyst: {
    tier: 'Level 2 - Analytical access',
    summary: 'Analytical and prediction access without operational intervention authority.',
    visible: ['Dashboard and project records', 'Cost, schedule and peer analytics', 'Predictions and project insights', 'Data upload and analytical workflows'],
    restricted: ['Intervention records and actions', 'User and role administration', 'Administrative audit viewer', 'Model deployment administration'],
  },
};

const ROLE_PERMISSIONS: Record<AppRole, ReadonlySet<AppPermission>> = {
  administrator: new Set<AppPermission>([
    'view_dashboard',
    'view_analytics',
    'view_predictions',
    'view_interventions',
    'create_interventions',
    'manage_interventions',
    'upload_cuf',
    'manage_project_updates',
    'manage_dependencies',
    'analyse_data',
    'monitor_models',
    'administer_users',
  ]),
  executive: new Set<AppPermission>([
    'view_dashboard',
    'view_analytics',
    'view_predictions',
    'view_interventions',
    'create_interventions',
  ]),
  monitoring_officer: new Set<AppPermission>([
    'view_dashboard',
    'view_analytics',
    'view_interventions',
    'create_interventions',
    'manage_interventions',
    'upload_cuf',
    'manage_project_updates',
    'manage_dependencies',
  ]),
  analyst: new Set<AppPermission>([
    'view_dashboard',
    'view_analytics',
    'view_predictions',
    'upload_cuf',
    'analyse_data',
    'manage_dependencies',
  ]),
};

const PAGE_PERMISSIONS: Record<string, AppPermission> = {
  'command-center': 'view_dashboard',
  'project-portfolio': 'view_dashboard',
  'project-intelligence': 'view_dashboard',
  'risk-intelligence': 'view_analytics',
  'early-warning': 'view_analytics',
  'intervention-center': 'view_interventions',
  'cost-analytics': 'view_analytics',
  'schedule-analytics': 'view_analytics',
  benchmarking: 'view_analytics',
  'geo-intelligence': 'view_analytics',
  reports: 'view_analytics',
  'project-insights': 'view_predictions',
  'data-management': 'upload_cuf',
  'model-monitoring': 'monitor_models',
  'audit-trail': 'administer_users',
  'user-administration': 'administer_users',
};

export function hasPermission(role: AppRole | null, permission: AppPermission): boolean {
  return role ? ROLE_PERMISSIONS[role].has(permission) : false;
}

export function canAccessPage(role: AppRole | null, page: string): boolean {
  const permission = PAGE_PERMISSIONS[page];
  return permission ? hasPermission(role, permission) : false;
}
