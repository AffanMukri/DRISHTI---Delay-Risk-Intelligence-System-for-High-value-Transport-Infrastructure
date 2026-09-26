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
      await AuditService.securityEvent('logout_requested');
    } catch (auditError) {
      console.warn('Unable to record logout audit event:', auditError);
    }
    const { error } = await supabase.auth.signOut();
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
