import type { AppRole, AuthProfile } from '../auth/authorization';
import { demoAuthEnabled, demoProfiles, updateDemoAccess } from '../auth/demoAuth';
import { supabase } from '../lib/supabase';

const PROFILE_COLUMNS = 'id,email,full_name,role,ministry_id,agency_id,designation,avatar_url,is_active,last_login_at,created_at,updated_at';

export const ProfileAdminService = {
  async list(): Promise<AuthProfile[]> {
    if (demoAuthEnabled) return demoProfiles();
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as AuthProfile[];
  },

  async updateAccess(userId: string, role: AppRole, isActive: boolean): Promise<void> {
    if (demoAuthEnabled) {
      updateDemoAccess(userId, role, isActive);
      return;
    }
    const { error } = await supabase.rpc('admin_update_profile_access', {
      p_user_id: userId,
      p_role: role,
      p_is_active: isActive,
    });

    if (error) throw error;
  },
};
