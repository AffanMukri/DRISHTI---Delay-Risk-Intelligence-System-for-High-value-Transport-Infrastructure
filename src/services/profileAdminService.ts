import type { AppRole, AuthProfile } from '../auth/authorization';
import { supabase } from '../lib/supabase';

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
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as AuthProfile[];
  },

  async updateAccess(userId: string, role: AppRole, isActive: boolean): Promise<void> {
    const { error } = await supabase.rpc('admin_update_profile_access', {
      p_user_id: userId,
      p_role: role,
      p_is_active: isActive,
    });

    if (error) throw error;
  },

  async listPendingRequests(): Promise<AccessRequest[]> {
    const { data, error } = await supabase
      .from('access_requests')
      .select('id,requester_id,requested_role,reason,status,created_at,requester:profiles!access_requests_requester_id_fkey(email,full_name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) throw error;
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
  },

  async reviewAccessRequest(requestId: string, approve: boolean, assignedRole?: AppRole): Promise<void> {
    const { error } = await supabase.rpc('admin_review_access_request', {
      p_request_id: requestId,
      p_approve: approve,
      p_assigned_role: approve ? assignedRole : null,
      p_review_notes: approve ? 'Approved in DRISHTI Master Access Portal.' : 'Rejected in DRISHTI Master Access Portal.',
    });

    if (error) throw error;
  },
};
