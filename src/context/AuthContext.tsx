import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuthError, Session, User } from '@supabase/supabase-js';
import { hasPermission as roleHasPermission, type AppPermission, type AppRole, type AuthProfile } from '../auth/authorization';
import {
  clearDemoSession,
  demoAuthEnabled,
  findDemoAccount,
  getStoredDemoAccount,
  storeDemoSession,
  type DemoAccount,
} from '../auth/demoAuth';
import { supabase } from '../lib/supabase';
import { AuditService } from '../services/auditService';
import {
  AuthContext,
  type AuthContextValue,
  type AuthResult,
  type SignUpResult,
} from './auth-context';

const PROFILE_COLUMNS = 'id,email,full_name,role,ministry_id,agency_id,designation,avatar_url,is_active,last_login_at,created_at,updated_at';
function demoIdentity(account: DemoAccount): { session: Session; profile: AuthProfile } {
  const now = new Date().toISOString();
  const user = {
    id: account.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: account.email,
    email_confirmed_at: now,
    phone: '',
    confirmed_at: now,
    last_sign_in_at: now,
    app_metadata: { provider: 'demo', providers: ['demo'] },
    user_metadata: { full_name: account.fullName },
    identities: [],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  } as User;
  return {
    session: {
      access_token: 'local-demo-session-not-valid-for-backend-apis',
      refresh_token: 'local-demo-refresh-token',
      expires_in: 86_400,
      expires_at: Math.floor(Date.now() / 1000) + 86_400,
      token_type: 'bearer',
      user,
    },
    profile: {
      id: account.id,
      email: account.email,
      full_name: account.fullName,
      role: account.role,
      ministry_id: null,
      agency_id: null,
      designation: account.designation,
      avatar_url: null,
      is_active: account.isActive,
      last_login_at: now,
      created_at: now,
      updated_at: now,
    },
  };
}

function demoAuthError(message: string, code: string): AuthError {
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

    if (demoAuthEnabled) {
      const storedAccount = getStoredDemoAccount();
      if (storedAccount?.isActive) {
        const identity = demoIdentity(storedAccount);
        sessionRef.current = identity.session;
        setSession(identity.session);
        setProfile(identity.profile);
      }
      setLoading(false);
      return () => { mounted.current = false; };
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
        // Supabase recommends keeping the auth callback synchronous. Profile
        // hydration runs after the callback releases the auth client lock.
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

  const signIn = useCallback(async (email: string, password: string, requestedRole: AppRole): Promise<AuthResult> => {
    setAuthMessage(null);
    if (demoAuthEnabled) {
      const account = findDemoAccount(email, password);
      if (!account) {
        return { error: demoAuthError('Invalid demo credentials.', 'invalid_credentials') };
      }
      if (!account.isActive) {
        return { error: demoAuthError('This account is disabled.', 'user_banned') };
      }
      if (account.role !== requestedRole) {
        return { error: demoAuthError('The selected role does not match the assigned account role.', 'role_mismatch') };
      }
      const identity = demoIdentity(account);
      storeDemoSession(account);
      sessionRef.current = identity.session;
      setSession(identity.session);
      setProfile(identity.profile);
      return { error: null };
    }
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
        return { error: demoAuthError('Your authorization profile could not be verified.', 'profile_unavailable') };
      }
      if (!accessProfile.is_active) {
        intentionalSignOut.current = true;
        await supabase.auth.signOut({ scope: 'local' });
        intentionalSignOut.current = false;
        return { error: demoAuthError('This account is disabled.', 'user_banned') };
      }
      if (accessProfile.role !== requestedRole) {
        intentionalSignOut.current = true;
        await supabase.auth.signOut({ scope: 'local' });
        intentionalSignOut.current = false;
        return { error: demoAuthError('The selected role does not match your assigned account role.', 'role_mismatch') };
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
  ): Promise<SignUpResult> => {
    setAuthMessage(null);
    if (demoAuthEnabled) {
      return {
        error: demoAuthError('Signup is disabled in local demo mode.', 'signup_disabled'),
        requiresEmailConfirmation: false,
      };
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName.trim() },
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
    if (demoAuthEnabled) {
      clearDemoSession();
      sessionRef.current = null;
      setSession(null);
      setProfile(null);
      intentionalSignOut.current = false;
      return { error: null };
    }
    try {
      await AuditService.securityEvent('logout_requested');
    } catch (auditError) {
      console.warn('Unable to record logout audit event:', auditError);
    }
    const { error } = await supabase.auth.signOut();
    if (error) intentionalSignOut.current = false;
    return { error };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (demoAuthEnabled) return;
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
    signUp,
    signOut,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
