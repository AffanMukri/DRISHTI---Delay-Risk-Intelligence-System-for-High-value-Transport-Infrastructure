import React, { useState } from 'react';
import {
  AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, Mail, User,
  Landmark, Network, ShieldCheck, UserRoundCog,
} from 'lucide-react';
import type { AuthError } from '@supabase/supabase-js';
import { useAuth } from '../hooks/useAuth';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type AppRole } from '../auth/authorization';

type AuthMode = 'login' | 'signup';
const LOGIN_ROLES = Object.keys(ROLE_LABELS) as AppRole[];

interface AuthPageProps {
  onBack?: () => void;
}

function formatAuthError(error: AuthError, mode: AuthMode): string {
  if (error.code === 'invalid_credentials') return 'Email or password is incorrect.';
  if (error.code === 'email_not_confirmed') return 'Confirm your email address before signing in.';
  if (error.code === 'user_banned') return 'This account is disabled. Contact an administrator.';
  if (error.code === 'role_mismatch') return 'The selected role does not match the role assigned to this account.';
  if (error.code === 'profile_unavailable') return 'Your secure access profile could not be verified. Contact an administrator.';
  if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
    return 'Too many attempts. Please wait before trying again.';
  }
  if (mode === 'signup' && error.code === 'user_already_exists') {
    return 'An account could not be created with those details. Try signing in instead.';
  }
  return mode === 'login'
    ? 'Unable to sign in with those credentials.'
    : 'Unable to create the account. Please try again.';
}

export default function AuthPage({ onBack }: AuthPageProps) {
  const { signIn, signUp, authMessage, clearAuthMessage } = useAuth();
  const signupEnabled = import.meta.env.VITE_ENABLE_SIGNUP !== 'false';
  const [mode, setMode] = useState<AuthMode>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<AppRole>('executive');
  const [requestReason, setRequestReason] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const switchMode = (nextMode: AuthMode) => {
    if (nextMode === 'signup' && !signupEnabled) return;
    setMode(nextMode);
    clearAuthMessage();
    setErrorMessage(null);
    setSuccessMessage(null);
    setPassword('');
    setConfirmPassword('');
    setRequestReason('');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
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
      if (mode === 'login') {
        const { error } = await signIn(email.trim(), password, selectedRole);
        if (error) setErrorMessage(formatAuthError(error, mode));
      } else {
        const { error, requiresEmailConfirmation } = await signUp(
          email.trim(),
          password,
          fullName,
          selectedRole,
          requestReason,
        );

        if (error) {
          setErrorMessage(formatAuthError(error, mode));
        } else if (requiresEmailConfirmation) {
          setSuccessMessage(selectedRole === 'executive'
            ? 'Account created with Executive access. Check your email to confirm your account, then sign in.'
            : `Account created with Executive access. Your ${ROLE_LABELS[selectedRole]} request was sent to the Administrator for review.`);
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

  return (
    <div className="auth-shell min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-5xl">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-[11px] font-bold text-navy-800 shadow-sm backdrop-blur transition hover:border-indigo-200 hover:bg-white"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to home page
          </button>
        )}
        <div className="relative w-full min-h-[620px] bg-white border border-slate-200/80 rounded-2xl shadow-[0_30px_70px_-42px_rgba(7,32,58,.65)] overflow-hidden grid lg:grid-cols-[1.08fr_.92fr]">
        <section className="auth-panel hidden lg:flex overflow-hidden text-white p-10 flex-col justify-between">
          <div className="auth-grid absolute inset-0 opacity-70" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-10">
              <div className="institutional-mark w-11 h-11 rounded-xl text-sm font-extrabold tracking-tight">D</div>
              <div>
                <p className="text-sm font-bold tracking-[0.09em]">DRISHTI</p>
                <p className="text-[9px] uppercase tracking-[0.14em] text-teal-200/75 mt-0.5">Infrastructure Intelligence</p>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 text-[10px] text-sky-100/80 font-semibold uppercase tracking-[0.16em]">
              <Landmark className="w-3.5 h-3.5" /> Government of India
            </div>
            <h1 className="text-[2.65rem] leading-[1.05] font-bold tracking-[-0.04em] mt-4 max-w-md">See delay sooner. Act on risk smarter.</h1>
            <p className="text-[10px] uppercase tracking-[0.12em] text-teal-100/75 font-semibold mt-4 max-w-md leading-relaxed">Delay &amp; Risk Intelligence System for High-value Transport &amp; Infrastructure</p>
            <p className="text-sm text-sky-100/70 leading-relaxed mt-6 max-w-md">
              Secure access to national infrastructure monitoring, risk intelligence, early warnings,
              and inter-ministerial intervention workflows.
            </p>

            <div className="grid grid-cols-2 gap-3 mt-9 max-w-md">
              <div className="rounded-xl border border-white/10 bg-white/[0.055] p-3.5">
                <Network className="w-4 h-4 text-teal-200" />
                <p className="text-xs font-semibold mt-2">Unified oversight</p>
                <p className="text-[10px] text-sky-100/55 mt-0.5">Portfolio to project evidence</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.055] p-3.5">
                <ShieldCheck className="w-4 h-4 text-teal-200" />
                <p className="text-xs font-semibold mt-2">Controlled access</p>
                <p className="text-[10px] text-sky-100/55 mt-0.5">Role-based and auditable</p>
              </div>
            </div>
          </div>

          <div className="relative border-t border-white/10 pt-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-sky-200/55">राष्ट्रीय अवसंरचना निगरानी</p>
              <p className="text-[11px] text-slate-300/70 mt-1">Ministry of Statistics &amp; Programme Implementation · IPMD</p>
            </div>
            <div className="w-8 h-8 rounded-full border border-white/15 grid place-items-center text-sky-200/60">
              <Landmark className="w-3.5 h-3.5" />
            </div>
          </div>
        </section>

        <section className="flex items-center p-7 sm:p-10 lg:p-12 bg-[linear-gradient(180deg,#fff,#fbfcfe)]">
          <div className="w-full max-w-sm mx-auto">
            <div className="lg:hidden flex items-center gap-3 mb-8">
              <div className="institutional-mark w-9 h-9 rounded-lg text-xs font-extrabold">
                D
              </div>
              <div>
                <p className="font-bold tracking-[0.08em] text-navy-900">DRISHTI</p>
                <p className="text-2xs text-slate-500">Delay &amp; Risk Intelligence System</p>
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-navy-500 font-bold mb-2">Secure government workspace</p>
              <h2 className="text-2xl font-bold text-navy-900 tracking-tight">
                {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {mode === 'login'
                  ? 'Use your registered email and password to continue.'
                  : 'Register for secure access to DRISHTI.'}
              </p>
            </div>

            {signupEnabled ? (
            <div className="grid grid-cols-2 bg-slate-100 rounded p-1 mt-7 mb-6">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`py-2 text-sm font-semibold rounded transition-colors ${mode === 'login' ? 'bg-white text-navy-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`py-2 text-sm font-semibold rounded transition-colors ${mode === 'signup' ? 'bg-white text-navy-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Sign Up
              </button>
            </div>
            ) : <div className="mt-7" />}

            {(errorMessage || authMessage) && (
              <div role="alert" className="mb-4 flex items-start gap-2 p-3 rounded border border-red-200 bg-red-50 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{errorMessage ?? authMessage}</span>
              </div>
            )}

            {successMessage && (
              <div role="status" className="mb-4 flex items-start gap-2 p-3 rounded border border-green-200 bg-green-50 text-sm text-green-700">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label htmlFor="full-name" className="block text-xs font-semibold text-slate-600 mb-1.5">Full name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="full-name"
                      type="text"
                      autoComplete="name"
                      required
                      value={fullName}
                      onChange={event => setFullName(event.target.value)}
                      className="input pl-10 h-10"
                      placeholder="Your full name"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-slate-600 mb-1.5">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    className="input pl-10 h-10"
                    placeholder="name@organization.gov.in"
                  />
                </div>
              </div>

              <div>
                  <label htmlFor="access-role" className="block text-xs font-semibold text-slate-600 mb-1.5">{mode === 'login' ? 'Assigned access role' : 'Requested access role'}</label>
                  <div className="relative">
                    <UserRoundCog className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <select
                      id="access-role"
                      required
                      value={selectedRole}
                      onChange={event => setSelectedRole(event.target.value as AppRole)}
                      className="select pl-10 h-10 w-full"
                    >
                      {LOGIN_ROLES.map(role => (
                        <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">
                    {mode === 'login'
                      ? `${ROLE_DESCRIPTIONS[selectedRole]}. Your stored profile must match this selection.`
                      : selectedRole === 'executive'
                        ? 'Executive is the default role applied by the database after email registration.'
                        : `${ROLE_DESCRIPTIONS[selectedRole]}. This is a request only; the Administrator must approve it.`}
                  </p>
                </div>

              {mode === 'signup' && selectedRole !== 'executive' && (
                <div>
                  <label htmlFor="access-request-reason" className="block text-xs font-semibold text-slate-600 mb-1.5">Reason for elevated access</label>
                  <textarea
                    id="access-request-reason"
                    required
                    maxLength={1000}
                    rows={3}
                    value={requestReason}
                    onChange={event => setRequestReason(event.target.value)}
                    className="input min-h-20 py-2 resize-y"
                    placeholder="Describe your designation and why this role is required."
                  />
                </div>
              )}

              <div>
                <label htmlFor="password" className="block text-xs font-semibold text-slate-600 mb-1.5">Password</label>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    className="input pl-10 pr-10 h-10"
                    placeholder="Minimum 8 characters"
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
                  <label htmlFor="confirm-password" className="block text-xs font-semibold text-slate-600 mb-1.5">Confirm password</label>
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
                      className="input pl-10 h-10"
                      placeholder="Repeat your password"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary w-full h-10 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <p className="text-2xs text-slate-400 text-center mt-6 leading-relaxed">
              {mode === 'signup'
                ? 'All accounts are created by Supabase. Elevated roles remain pending until approved by the Administrator.'
                : 'By continuing, you acknowledge that access is restricted to authorized users and may be audited.'}
            </p>
          </div>
        </section>
        </div>
      </div>
    </div>
  );
}
