import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuthError, Session } from '@supabase/supabase-js';
import { hasPermission as roleHasPermission, type AppPermission, type AppRole, type AuthProfile } from '../auth/authorization';
import { supabase } from '../lib/supabase';
import { AuditService } from '../services/auditService';
import {
  AuthContext,
  type AuthContextValue,
  type AuthResult,
  type SignUpResult,
} from './auth-context';

export const DEMO_PROFILES: Record<AppRole, AuthProfile> = {
  administrator: {
    id: '11111111-1111-4111-8111-000000000001',
    email: 'administrator@drishti.gov.in',
    full_name: 'Dr. Rajesh Verma (Administrator)',
    role: 'administrator',
    ministry_id: null,
    agency_id: null,
    designation: 'Principal Secretary / Chief Administrator',
    avatar_url: null,
    is_active: true,
    last_login_at: new Date().toISOString(),
    created_at: '2025-01-01T00:00:00Z',
    updated_at: new Date().toISOString(),
  },
  executive: {
    id: '11111111-1111-4111-8111-000000000002',
    email: 'executive@drishti.gov.in',
    full_name: 'Smt. Ananya Sharma (Joint Secretary)',
    role: 'executive',
    ministry_id: null,
    agency_id: null,
    designation: 'Joint Secretary (Infrastructure Oversight)',
    avatar_url: null,
    is_active: true,
    last_login_at: new Date().toISOString(),
    created_at: '2025-01-01T00:00:00Z',
    updated_at: new Date().toISOString(),
  },
  monitoring_officer: {
    id: '11111111-1111-4111-8111-000000000003',
    email: 'monitoring@drishti.gov.in',
    full_name: 'Shri Vikram Malhotra (Monitoring Director)',
    role: 'monitoring_officer',
    ministry_id: null,
    agency_id: null,
    designation: 'Director (Project Monitoring & CUF Operations)',
    avatar_url: null,
    is_active: true,
    last_login_at: new Date().toISOString(),
    created_at: '2025-01-01T00:00:00Z',
    updated_at: new Date().toISOString(),
  },
  analyst: {
    id: '11111111-1111-4111-8111-000000000004',
    email: 'analyst@drishti.gov.in',
    full_name: 'Pooja Deshmukh (Lead Analyst)',
    role: 'analyst',
    ministry_id: null,
    agency_id: null,
    designation: 'Senior Risk & Schedule Analytics Specialist',
    avatar_url: null,
    is_active: true,
    last_login_at: new Date().toISOString(),
    created_at: '2025-01-01T00:00:00Z',
    updated_at: new Date().toISOString(),
  },
};

const PROFILE_COLUMNS = 'id,email,full_name,role,ministry_id,agency_id,designation,avatar_url,is_active,last_login_at,created_at,updated_at';
function clientAuthError(message: string, code: string): AuthError {
  return { name: 'AuthApiError', message, status: 400, code } as AuthError;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const loadSequence = useRef(0);
  const intentionalSignOut = useRef(false);
  const mounted = useRef(true);

  const hydrateSession = useCallback(async (nextSession: Session | null) => {
    const sequence = ++loadSequence.current;
    sessionRef.current = nextSession;
    setSession(nextSession);

    if (!nextSession) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', nextSession.user.id)
      .single();

    if (!mounted.current || sequence !== loadSequence.current) return;

    if (error || !data) {
      // Check if this was a demo/role session
      try {
        const saved = localStorage.getItem('drishti_active_role_session');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.profile) {
            setProfile(parsed.profile);
            setAuthMessage(null);
            setLoading(false);
            return;
          }
        }
      } catch {
        // ignore
      }

      console.error('Unable to load authorization profile:', error?.message);
      setProfile(null);
      setAuthMessage('Your account profile could not be loaded. Retry or contact an administrator.');
      setLoading(false);
      return;
    }

    const nextProfile = data as AuthProfile;
    if (!nextProfile.is_active) {
      sessionRef.current = null;
      setSession(null);
      setProfile(null);
      setAuthMessage('This account has been disabled. Contact an administrator.');
      setLoading(false);
      await supabase.auth.signOut({ scope: 'local' });
      return;
    }

    setProfile(nextProfile);
    setAuthMessage(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;

    // Check for saved demo role session first
    try {
      const saved = localStorage.getItem('drishti_active_role_session');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.session && parsed?.profile) {
          sessionRef.current = parsed.session;
          setSession(parsed.session);
          setProfile(parsed.profile);
          setLoading(false);
          return;
        }
      }
    } catch {
      // ignore
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT') {
        const hadSession = Boolean(sessionRef.current);
        sessionRef.current = null;
        ++loadSequence.current;
        setSession(null);
        setProfile(null);
        setLoading(false);

        if (hadSession && !intentionalSignOut.current) {
          setAuthMessage('Your session ended or expired. Please sign in again.');
        }
        intentionalSignOut.current = false;
        return;
      }

      if (nextSession) {
        window.setTimeout(() => void hydrateSession(nextSession), 0);
      }
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted.current) return;
      if (error) {
        console.error('Unable to restore Supabase session:', error.message);
        setAuthMessage('The saved session could not be restored. Please sign in again.');
      }
      void hydrateSession(data.session);
    });

    return () => {
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, [hydrateSession]);

  const signInAsRole = useCallback(async (selectedRole: AppRole): Promise<AuthResult> => {
    setAuthMessage(null);
    setLoading(true);

    const demoProfile = DEMO_PROFILES[selectedRole];
    const userId = demoProfile.id;
    const expiresAt = Math.floor(Date.now() / 1000) + 86400 * 7;
    const email = demoProfile.email;

    const base64Url = (value: unknown) => {
      try {
        return btoa(unescape(encodeURIComponent(JSON.stringify(value))))
          .replace(/=/g, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_');
      } catch {
        return 'drishti-token';
      }
    };

    const accessToken = `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url({
      aud: 'authenticated', exp: expiresAt, sub: userId, email, role: 'authenticated',
    })}.drishti-demo-signature`;

    const demoUser = {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      email_confirmed_at: new Date().toISOString(),
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { full_name: demoProfile.full_name },
      identities: [],
      created_at: demoProfile.created_at,
      updated_at: new Date().toISOString(),
    };

    const demoSession: Session = {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: 86400 * 7,
      expires_at: expiresAt,
      refresh_token: `drishti-refresh-${selectedRole}`,
      user: demoUser as any,
    };

    try {
      localStorage.setItem('drishti_active_role_session', JSON.stringify({ session: demoSession, profile: demoProfile }));
    } catch {
      // ignore
    }

    sessionRef.current = demoSession;
    setSession(demoSession);
    setProfile(demoProfile);
    setLoading(false);

    try {
      await AuditService.securityEvent('login_success');
    } catch (auditError) {
      console.warn('Unable to record login audit event:', auditError);
    }
    return { error: null };
  }, []);

  const signIn = useCallback(async (email: string, password: string, requestedRole: AppRole): Promise<AuthResult> => {
    setAuthMessage(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      const { data: accessProfile, error: profileError } = await supabase
        .from('profiles')
        .select('role,is_active')
        .eq('id', data.user.id)
        .single();

      if (profileError || !accessProfile) {
        intentionalSignOut.current = true;
        await supabase.auth.signOut({ scope: 'local' });
        intentionalSignOut.current = false;
        return { error: clientAuthError('Your authorization profile could not be verified.', 'profile_unavailable') };
      }
      if (!accessProfile.is_active) {
        intentionalSignOut.current = true;
        await supabase.auth.signOut({ scope: 'local' });
        intentionalSignOut.current = false;
        return { error: clientAuthError('This account is disabled.', 'user_banned') };
      }
      if (accessProfile.role !== requestedRole) {
        intentionalSignOut.current = true;
        await supabase.auth.signOut({ scope: 'local' });
        intentionalSignOut.current = false;
        return { error: clientAuthError('The selected role does not match your assigned account role.', 'role_mismatch') };
      }
    }
    if (!error) {
      try {
        await AuditService.securityEvent('login_success');
      } catch (auditError) {
        console.warn('Unable to record login audit event:', auditError);
      }
    }
    return { error };
  }, []);

  const signUp = useCallback(async (
    email: string,
    password: string,
    fullName: string,
    requestedRole: AppRole,
    requestReason?: string,
  ): Promise<SignUpResult> => {
    setAuthMessage(null);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          requested_role: requestedRole,
          access_request_reason: requestReason?.trim() || null,
        },
      },
    });

    return {
      error,
      requiresEmailConfirmation: Boolean(data.user && !data.session),
    };
  }, []);

  const signOut = useCallback(async (): Promise<AuthResult> => {
    intentionalSignOut.current = true;
    setAuthMessage(null);
    try {
      localStorage.removeItem('drishti_active_role_session');
    } catch {
      // ignore
    }
    try {
      await AuditService.securityEvent('logout_requested');
    } catch (auditError) {
      console.warn('Unable to record logout audit event:', auditError);
    }
    const { error } = await supabase.auth.signOut();
    sessionRef.current = null;
    setSession(null);
    setProfile(null);
    setLoading(false);
    if (error) intentionalSignOut.current = false;
    return { error };
  }, []);

  const refreshProfile = useCallback(async () => {
    await hydrateSession(sessionRef.current);
  }, [hydrateSession]);

  const clearAuthMessage = useCallback(() => setAuthMessage(null), []);
  const checkPermission = useCallback(
    (permission: AppPermission) => roleHasPermission(profile?.role ?? null, permission),
    [profile?.role],
  );

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    loading,
    authMessage,
    clearAuthMessage,
    hasPermission: checkPermission,
    refreshProfile,
    signIn,
    signInAsRole,
    signUp,
    signOut,
  }), [
    session,
    profile,
    loading,
    authMessage,
    clearAuthMessage,
    checkPermission,
    refreshProfile,
    signIn,
    signInAsRole,
    signUp,
    signOut,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
