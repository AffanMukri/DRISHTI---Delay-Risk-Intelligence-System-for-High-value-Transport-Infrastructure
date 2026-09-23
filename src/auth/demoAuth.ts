import type { AuthProfile, AppRole } from './authorization';

export const DEMO_SESSION_KEY = 'dhristi-demo-session';
const DEMO_ACCESS_OVERRIDES_KEY = 'dhristi-demo-access-overrides';

export interface DemoAccount {
  id: string;
  email: string;
  password: string;
  fullName: string;
  role: AppRole;
  designation: string;
  isActive: boolean;
}

interface DemoAccessOverride {
  role: AppRole;
  isActive: boolean;
}

const configuredAccounts: Omit<DemoAccount, 'isActive'>[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    email: import.meta.env.VITE_DEMO_ADMIN_EMAIL || '',
    password: import.meta.env.VITE_DEMO_ADMIN_PASSWORD || '',
    fullName: 'DHRISTI Demo Administrator',
    role: 'administrator',
    designation: 'System Administrator',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    email: import.meta.env.VITE_DEMO_EXECUTIVE_EMAIL || '',
    password: import.meta.env.VITE_DEMO_EXECUTIVE_PASSWORD || '',
    fullName: 'DHRISTI Demo Executive',
    role: 'executive',
    designation: 'Portfolio Executive',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    email: import.meta.env.VITE_DEMO_OFFICER_EMAIL || '',
    password: import.meta.env.VITE_DEMO_OFFICER_PASSWORD || '',
    fullName: 'DHRISTI Demo Monitoring Officer',
    role: 'monitoring_officer',
    designation: 'Monitoring Officer',
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    email: import.meta.env.VITE_DEMO_ANALYST_EMAIL || '',
    password: import.meta.env.VITE_DEMO_ANALYST_PASSWORD || '',
    fullName: 'DHRISTI Demo Analyst',
    role: 'analyst',
    designation: 'Infrastructure Analyst',
  },
];

export const demoAuthEnabled = import.meta.env.DEV
  && import.meta.env.VITE_DEMO_AUTH === 'true'
  && import.meta.env.VITE_DATA_SOURCE === 'mock';

function readOverrides(): Record<string, DemoAccessOverride> {
  try {
    return JSON.parse(window.localStorage.getItem(DEMO_ACCESS_OVERRIDES_KEY) || '{}') as Record<string, DemoAccessOverride>;
  } catch {
    return {};
  }
}

export function getDemoAccounts(): DemoAccount[] {
  const overrides = readOverrides();
  return configuredAccounts
    .filter(account => account.email && account.password)
    .map(account => ({
      ...account,
      role: overrides[account.id]?.role ?? account.role,
      isActive: overrides[account.id]?.isActive ?? true,
    }));
}

export function findDemoAccount(email: string, password?: string): DemoAccount | null {
  const normalizedEmail = email.trim().toLowerCase();
  return getDemoAccounts().find(account => (
    account.email.toLowerCase() === normalizedEmail
    && (password === undefined || account.password === password)
  )) ?? null;
}

export function getStoredDemoAccount(): DemoAccount | null {
  const email = window.localStorage.getItem(DEMO_SESSION_KEY);
  return email ? findDemoAccount(email) : null;
}

export function storeDemoSession(account: DemoAccount): void {
  window.localStorage.setItem(DEMO_SESSION_KEY, account.email);
}

export function clearDemoSession(): void {
  window.localStorage.removeItem(DEMO_SESSION_KEY);
}

export function demoProfiles(): AuthProfile[] {
  const now = new Date().toISOString();
  return getDemoAccounts().map(account => ({
    id: account.id,
    email: account.email,
    full_name: account.fullName,
    role: account.role,
    ministry_id: null,
    agency_id: null,
    designation: account.designation,
    avatar_url: null,
    is_active: account.isActive,
    last_login_at: null,
    created_at: now,
    updated_at: now,
  }));
}

export function updateDemoAccess(userId: string, role: AppRole, isActive: boolean): void {
  const accounts = getDemoAccounts();
  const target = accounts.find(account => account.id === userId);
  if (!target) throw new Error('Demo profile was not found.');

  const activeAdministrators = accounts.filter(account => account.role === 'administrator' && account.isActive);
  if (target.role === 'administrator' && target.isActive && (role !== 'administrator' || !isActive) && activeAdministrators.length === 1) {
    throw new Error('The final active Administrator cannot be disabled or reassigned.');
  }

  const overrides = readOverrides();
  overrides[userId] = { role, isActive };
  window.localStorage.setItem(DEMO_ACCESS_OVERRIDES_KEY, JSON.stringify(overrides));
}
