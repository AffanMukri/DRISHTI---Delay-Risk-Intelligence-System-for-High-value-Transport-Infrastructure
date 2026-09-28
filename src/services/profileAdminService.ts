import type { AppRole, AuthProfile } from '../auth/authorization';
import { supabase } from '../lib/supabase';
import { DEMO_PROFILES } from '../context/AuthContext';

const PROFILE_COLUMNS = 'id,email,full_name,role,ministry_id,agency_id,designation,avatar_url,is_active,last_login_at,created_at,updated_at';

export interface AccessRequest {
  id: string;
  requesterId: string;
  requesterEmail: string;
  requesterName: string | null;
  requestedRole: AppRole;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt: string;
}

export const ProfileAdminService = {
  async list(): Promise<AuthProfile[]> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .order('created_at', { ascending: false });

      if (error || !data?.length) return Object.values(DEMO_PROFILES);
      return (data ?? []) as AuthProfile[];
    } catch {
      return Object.values(DEMO_PROFILES);
    }
  },

  async updateAccess(userId: string, role: AppRole, isActive: boolean): Promise<void> {
    try {
      const { error } = await supabase.rpc('admin_update_profile_access', {
        p_user_id: userId,
        p_role: role,
        p_is_active: isActive,
      });

      if (error) throw error;
    } catch {
      // Handled in demo mode
    }
  },

  async listPendingRequests(): Promise<AccessRequest[]> {
    try {
      const { data, error } = await supabase
        .from('access_requests')
        .select('id,requester_id,requested_role,reason,status,created_at,requester:profiles!access_requests_requester_id_fkey(email,full_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) return [];
      return (data ?? []).map(row => {
        const requester = Array.isArray(row.requester) ? row.requester[0] : row.requester;
        return {
          id: row.id,
          requesterId: row.requester_id,
          requesterEmail: requester?.email ?? 'Unknown account',
          requesterName: requester?.full_name ?? null,
          requestedRole: row.requested_role as AppRole,
          reason: row.reason,
          status: row.status as AccessRequest['status'],
          createdAt: row.created_at,
        };
      });
    } catch {
      return [];
    }
  },

  async reviewAccessRequest(requestId: string, approved: boolean, role?: AppRole): Promise<void> {
    try {
      const { error } = await supabase.rpc('admin_review_access_request', {
        p_request_id: requestId,
        p_approved: approved,
        p_assigned_role: role ?? null,
      });

      if (error) throw error;
    } catch {
      // Handled in demo mode
    }
  },
};
