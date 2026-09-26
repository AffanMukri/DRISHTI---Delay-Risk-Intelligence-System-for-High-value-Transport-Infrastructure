import { createContext } from 'react';
import type { AuthError, Session, User } from '@supabase/supabase-js';
import type { AppPermission, AppRole, AuthProfile } from '../auth/authorization';

export interface AuthResult {
  error: AuthError | null;
}

export interface SignUpResult extends AuthResult {
  requiresEmailConfirmation: boolean;
}

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: AuthProfile | null;
  role: AppRole | null;
  loading: boolean;
  authMessage: string | null;
  clearAuthMessage: () => void;
  hasPermission: (permission: AppPermission) => boolean;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string, requestedRole: AppRole) => Promise<AuthResult>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    requestedRole: AppRole,
    requestReason?: string,
  ) => Promise<SignUpResult>;
  signOut: () => Promise<AuthResult>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
