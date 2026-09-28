import React, { useState } from 'react';
import {
  AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, Mail, User,
  Landmark, ShieldCheck, UserRoundCog, Sparkles, Activity, FileSpreadsheet, ArrowRight,
  Shield, KeyRound
} from 'lucide-react';
import type { AuthError } from '@supabase/supabase-js';
import { useAuth } from '../hooks/useAuth';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type AppRole } from '../auth/authorization';
import { DEMO_PROFILES } from '../context/AuthContext';

type AuthMode = 'auto' | 'custom' | 'signup';

interface AuthPageProps {
  onBack?: () => void;
}

const ROLE_CARDS: Array<{
  role: AppRole;
  title: string;
  badge: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
  features: string[];
}> = [
  {
    role: 'administrator',
    title: 'Administrator',
    badge: 'Level 4 · Full Authority',
    description: 'Full administrative governance, user access management, model monitoring, and statutory audit oversight.',
    icon: <ShieldCheck className="w-5 h-5 text-indigo-400" />,
    accent: 'border-indigo-500 bg-indigo-50/70 text-indigo-900',
    features: ['User & Role Administration', 'Model Drift Telemetry', 'Full Statutory Audit Trail', 'All 40 Mega-Projects'],
  },
  {
    role: 'executive',
    title: 'Executive / Joint Secretary',
    badge: 'Level 3 · Strategic Oversight',
    description: 'Decision-level portfolio intelligence, high-priority interventions creation, and cross-ministerial oversight.',
    icon: <Landmark className="w-5 h-5 text-amber-500" />,
    accent: 'border-amber-500 bg-amber-50/70 text-amber-900',
    features: ['Portfolio S-Curves & Forensics', 'Create & Direct Interventions', 'Early Risk Warning Center', 'Benchmarking Radar'],
  },
  {
    role: 'monitoring_officer',
    title: 'Monitoring Officer',
    badge: 'Level 2 · Field Operations',
    description: 'Ground project monitoring, monthly progress verification, CUF data uploads, and milestone DAG execution.',
    icon: <Activity className="w-5 h-5 text-teal-500" />,
    accent: 'border-teal-500 bg-teal-50/70 text-teal-900',
    features: ['CUF Data Management & Ingestion', 'Milestone Dependency DAGs', 'Intervention Resolution', 'Slippage Action Plans'],
  },
  {
    role: 'analyst',
    title: 'Risk & Schedule Analyst',
    badge: 'Level 2 · Predictive Analytics',
    description: 'Predictive ML modeling, SHAP driver explainability, What-If simulation engine, and deep cost diagnostics.',
    icon: <Sparkles className="w-5 h-5 text-purple-500" />,
    accent: 'border-purple-500 bg-purple-50/70 text-purple-900',
    features: ['Cost Overrun ML Forecasts', 'Schedule Delay ML Models', 'What-If Parameter Simulator', 'Historical Similar-Project Intel'],
  },
];

const PRESET_PASSWORDS: Record<AppRole, string> = {
  administrator: 'DrishtiAdmin@2026',
  executive: 'DrishtiExec@2026',
  monitoring_officer: 'DrishtiOfficer@2026',
  analyst: 'DrishtiAnalyst@2026',
};

function formatAuthError(error: AuthError): string {
  if (error.code === 'invalid_credentials') return 'Email or password is incorrect.';
  if (error.code === 'email_not_confirmed') return 'Confirm your email address before signing in.';
  if (error.code === 'user_banned') return 'This account is disabled. Contact an administrator.';
  if (error.code === 'role_mismatch') return 'The selected role does not match the role assigned to this account.';
  if (error.code === 'profile_unavailable') return 'Your secure access profile could not be verified.';
  if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
    return 'Too many attempts. Please wait before trying again.';
  }
  return error.message || 'Unable to sign in with those credentials.';
}

export default function AuthPage({ onBack }: AuthPageProps) {
  const { signIn, signInAsRole, signUp, authMessage, clearAuthMessage } = useAuth();
  const signupEnabled = import.meta.env.VITE_ENABLE_SIGNUP !== 'false';
  const [mode, setMode] = useState<AuthMode>('auto');
  const [selectedRole, setSelectedRole] = useState<AppRole>('administrator');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(DEMO_PROFILES.administrator.email);
  const [password, setPassword] = useState(PRESET_PASSWORDS.administrator);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSelectRole = (role: AppRole) => {
    setSelectedRole(role);
    setEmail(DEMO_PROFILES[role].email);
    setPassword(PRESET_PASSWORDS[role]);
    setErrorMessage(null);
    clearAuthMessage();
  };

  const handleAutoLogin = async (roleToUse: AppRole = selectedRole) => {
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const { error } = await signInAsRole(roleToUse);
      if (error) {
        setErrorMessage(formatAuthError(error));
      }
    } catch {
      setErrorMessage('Unable to initialize instant role session.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCustomSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (password.length < 8) {
      setErrorMessage('Password must contain at least 8 characters.');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      if (mode === 'custom') {
        const { error } = await signIn(email.trim(), password, selectedRole);
        if (error) setErrorMessage(formatAuthError(error));
      } else {
        const { error, requiresEmailConfirmation } = await signUp(
          email.trim(),
          password,
          fullName,
          selectedRole,
          requestReason,
        );

        if (error) {
          setErrorMessage(formatAuthError(error));
        } else if (requiresEmailConfirmation) {
          setSuccessMessage(selectedRole === 'executive'
            ? 'Account created. Check your email to confirm your account, then sign in.'
            : `Account created. Your ${ROLE_LABELS[selectedRole]} request was sent to the Administrator for review.`);
          setPassword('');
          setConfirmPassword('');
        }
      }
    } catch {
      setErrorMessage('Unable to reach the authentication service. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentRoleCard = ROLE_CARDS.find(c => c.role === selectedRole) || ROLE_CARDS[0];

  return (
    <div className="auth-shell min-h-screen flex items-center justify-center p-4 sm:p-6 bg-slate-900/95">
      <div className="w-full max-w-5xl">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/90 px-3.5 py-2 text-xs font-bold text-slate-200 shadow-sm backdrop-blur transition hover:border-slate-500 hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </button>
        )}

        <div className="relative w-full min-h-[640px] bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden grid lg:grid-cols-[1fr_1.1fr]">
          {/* Institutional Sidebar Panel */}
          <section className="auth-panel hidden lg:flex overflow-hidden text-white p-9 flex-col justify-between bg-gradient-to-br from-navy-950 via-slate-900 to-teal-950">
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-8">
                <div className="institutional-mark w-11 h-11 rounded-xl bg-teal-500/20 border border-teal-400/40 text-teal-300 font-extrabold text-base flex items-center justify-center shadow-lg">
                  D
                </div>
                <div>
                  <p className="text-base font-bold tracking-wider text-white">DRISHTI</p>
                  <p className="text-[10px] uppercase tracking-widest text-teal-300/80 font-semibold">Infrastructure Risk Intelligence</p>
                </div>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-teal-200 border border-white/10 mb-4">
                <Landmark className="w-3.5 h-3.5" /> Ministry of Statistics &amp; Programme Implementation
              </div>

              <h1 className="text-3xl font-bold tracking-tight text-white leading-tight">
                Role-Based Government Portal
              </h1>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                National infrastructure monitoring, early cost &amp; schedule risk prediction, and institutional intervention workflows.
              </p>

              {/* Active Role Preview Card */}
              <div className="mt-7 rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-white/15 text-white">
                      {currentRoleCard.icon}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">{currentRoleCard.title}</p>
                      <p className="text-[10px] text-teal-200 font-medium">{currentRoleCard.badge}</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-400/20 text-teal-200 border border-teal-300/30">
                    Active Selection
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-3 leading-normal">
                  {currentRoleCard.description}
                </p>
                <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-1.5">
                  {currentRoleCard.features.map(f => (
                    <div key={f} className="flex items-center gap-1.5 text-[10px] text-slate-200">
                      <CheckCircle2 className="w-3 h-3 text-teal-300 shrink-0" />
                      <span className="truncate">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative z-10 border-t border-white/10 pt-4 flex items-center justify-between text-2xs text-slate-400">
              <span>Government of India · IPMD Division</span>
              <span className="font-mono text-teal-300">DRISHTI v2.4</span>
            </div>
          </section>

          {/* Form & Role Selector Area */}
          <section className="flex flex-col justify-between p-6 sm:p-8 lg:p-10 bg-slate-50/50 overflow-y-auto max-h-[90vh]">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-2xs uppercase tracking-widest text-teal-700 font-bold">Fast Access Workspace</p>
                  <h2 className="text-xl sm:text-2xl font-bold text-navy-900 tracking-tight mt-0.5">
                    {mode === 'auto' ? 'Select Your Access Role' : mode === 'custom' ? 'Custom Credentials Sign In' : 'Create Account'}
                  </h2>
                </div>
              </div>

              {/* Mode Switcher Tabs */}
              <div className="flex rounded-lg bg-slate-200/80 p-1 mb-5">
                <button
                  type="button"
                  onClick={() => { setMode('auto'); setErrorMessage(null); }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${mode === 'auto' ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  ⚡ 1-Click Role Login
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('custom'); setErrorMessage(null); }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${mode === 'custom' ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  <KeyRound className="w-3.5 h-3.5 inline mr-1" /> Custom Login
                </button>
                {signupEnabled && (
                  <button
                    type="button"
                    onClick={() => { setMode('signup'); setErrorMessage(null); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${mode === 'signup' ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    Register
                  </button>
                )}
              </div>

              {(errorMessage || authMessage) && (
                <div role="alert" className="mb-4 flex items-start gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
                  <span>{errorMessage ?? authMessage}</span>
                </div>
              )}

              {successMessage && (
                <div role="status" className="mb-4 flex items-start gap-2 p-3 rounded-lg border border-green-200 bg-green-50 text-xs text-green-800 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-green-600" />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* 1-Click Role Auto-Login Mode */}
              {mode === 'auto' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500">
                    Choose an institutional role to sign in instantly. Credentials are pre-configured:
                  </p>

                  {/* Role Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ROLE_CARDS.map(card => {
                      const isSelected = selectedRole === card.role;
                      return (
                        <button
                          key={card.role}
                          type="button"
                          onClick={() => handleSelectRole(card.role)}
                          className={`flex flex-col text-left p-3.5 rounded-xl border-2 transition-all relative ${
                            isSelected
                              ? `${card.accent} shadow-md ring-2 ring-teal-500/20 scale-[1.01]`
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full mb-1.5">
                            <div className="flex items-center gap-2">
                              {card.icon}
                              <span className="font-bold text-xs text-navy-900">{card.title}</span>
                            </div>
                            <input
                              type="radio"
                              name="role-selection"
                              checked={isSelected}
                              onChange={() => handleSelectRole(card.role)}
                              className="accent-teal-600 w-3.5 h-3.5"
                            />
                          </div>
                          <span className="text-[10px] font-semibold text-slate-500">{card.badge}</span>
                          <p className="text-[11px] text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                            {card.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Auto-filled Preview Bar */}
                  <div className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-2 mt-4 shadow-sm">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Auto-filled Identity:</span>
                      <span className="font-mono font-bold text-navy-900 text-2xs bg-slate-100 px-2 py-0.5 rounded">
                        {email}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Auto-filled Password:</span>
                      <span className="font-mono text-slate-500 text-2xs">
                        ••••••••••••••••
                      </span>
                    </div>
                  </div>

                  {/* Primary One-Click Action */}
                  <button
                    type="button"
                    onClick={() => void handleAutoLogin()}
                    disabled={submitting}
                    className="btn btn-primary w-full h-11 text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-teal-700/15"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Authenticating as {currentRoleCard.title}...
                      </>
                    ) : (
                      <>
                        <span>Enter DRISHTI as {currentRoleCard.title}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Custom / Signup Form Mode */}
              {(mode === 'custom' || mode === 'signup') && (
                <form onSubmit={handleCustomSubmit} className="space-y-3.5">
                  {mode === 'signup' && (
                    <div>
                      <label htmlFor="full-name" className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          id="full-name"
                          type="text"
                          autoComplete="name"
                          required
                          value={fullName}
                          onChange={event => setFullName(event.target.value)}
                          className="input pl-10 h-9 text-xs"
                          placeholder="Shri / Smt..."
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label htmlFor="email" className="block text-xs font-semibold text-slate-700 mb-1">Official Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={event => setEmail(event.target.value)}
                        className="input pl-10 h-9 text-xs"
                        placeholder="name@organization.gov.in"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="access-role" className="block text-xs font-semibold text-slate-700 mb-1">
                      {mode === 'custom' ? 'Account Role' : 'Requested Role'}
                    </label>
                    <div className="relative">
                      <UserRoundCog className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <select
                        id="access-role"
                        required
                        value={selectedRole}
                        onChange={event => handleSelectRole(event.target.value as AppRole)}
                        className="select pl-10 h-9 w-full text-xs"
                      >
                        {ROLE_CARDS.map(card => (
                          <option key={card.role} value={card.role}>{card.title}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {mode === 'signup' && selectedRole !== 'executive' && (
                    <div>
                      <label htmlFor="access-request-reason" className="block text-xs font-semibold text-slate-700 mb-1">Justification</label>
                      <textarea
                        id="access-request-reason"
                        required
                        maxLength={1000}
                        rows={2}
                        value={requestReason}
                        onChange={event => setRequestReason(event.target.value)}
                        className="input py-1.5 text-xs resize-y"
                        placeholder="State your department and reason for role elevation."
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="password" className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                    <div className="relative">
                      <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={mode === 'custom' ? 'current-password' : 'new-password'}
                        required
                        minLength={8}
                        value={password}
                        onChange={event => setPassword(event.target.value)}
                        className="input pl-10 pr-10 h-9 text-xs"
                        placeholder="Password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(value => !value)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {mode === 'signup' && (
                    <div>
                      <label htmlFor="confirm-password" className="block text-xs font-semibold text-slate-700 mb-1">Confirm Password</label>
                      <div className="relative">
                        <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          id="confirm-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          required
                          minLength={8}
                          value={confirmPassword}
                          onChange={event => setConfirmPassword(event.target.value)}
                          className="input pl-10 h-9 text-xs"
                          placeholder="Repeat password"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn btn-primary w-full h-10 text-xs font-bold flex items-center justify-center gap-2 mt-2"
                  >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {submitting ? 'Authenticating...' : mode === 'custom' ? `Sign In as ${currentRoleCard.title}` : 'Create Account'}
                  </button>
                </form>
              )}
            </div>

            {/* Statutory Security Disclaimer */}
            <div className="mt-6 pt-3 border-t border-slate-200/80 text-center">
              <p className="text-[10px] text-slate-500 leading-tight">
                Institutional access is logged and strictly audited in compliance with IPMD/MoSPI statutory directives.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
