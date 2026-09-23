import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, Loader2, LockKeyhole, RefreshCw, ShieldCheck, UserCog, Users } from 'lucide-react';
import {
  ROLE_DESCRIPTIONS,
  ROLE_DATA_VISIBILITY,
  ROLE_LABELS,
  type AppRole,
  type AuthProfile,
} from '../auth/authorization';
import { Badge } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { ProfileAdminService } from '../services/profileAdminService';

const APP_ROLES = Object.keys(ROLE_LABELS) as AppRole[];

export default function UserAdministration() {
  const { user, hasPermission } = useAuth();
  const [profiles, setProfiles] = useState<AuthProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      setProfiles(await ProfileAdminService.list());
    } catch {
      setMessage({ type: 'error', text: 'Unable to load user profiles. Verify the authorization migration and your Administrator role.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasPermission('administer_users')) return;

    let active = true;
    void ProfileAdminService.list()
      .then(data => {
        if (active) setProfiles(data);
      })
      .catch(() => {
        if (active) {
          setMessage({ type: 'error', text: 'Unable to load user profiles. Verify the authorization migration and your Administrator role.' });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [hasPermission]);

  const updateAccess = async (target: AuthProfile, role: AppRole, isActive: boolean) => {
    setSavingId(target.id);
    setMessage(null);
    try {
      await ProfileAdminService.updateAccess(target.id, role, isActive);
      setProfiles(current => current.map(profile => (
        profile.id === target.id ? { ...profile, role, is_active: isActive } : profile
      )));
      setMessage({ type: 'success', text: `Access updated for ${target.email}.` });
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unable to update access.';
      setMessage({ type: 'error', text });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-navy-900 tracking-tight">Master Access Portal</h1>
            <Badge variant="info">Administrator Only</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Assign one of four controlled roles, suspend access, and review each role's data boundary.
          </p>
        </div>
        <button onClick={() => void loadProfiles()} disabled={loading} className="btn btn-secondary text-xs">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {message && (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2 p-3 rounded border text-sm ${
            message.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-green-200 bg-green-50 text-green-700'
          }`}
        >
          {message.type === 'error'
            ? <AlertCircle className="w-4 h-4 mt-0.5" />
            : <CheckCircle2 className="w-4 h-4 mt-0.5" />}
          {message.text}
        </div>
      )}

      <div className="rounded-xl border border-indigo-200 bg-[linear-gradient(110deg,#f4f4ff,#ffffff_55%,#eefaf8)] p-4 flex items-start gap-3">
        <div className="grid place-items-center w-9 h-9 shrink-0 rounded-lg bg-indigo-100 text-indigo-700">
          <LockKeyhole className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-navy-900">Database-authoritative access control</p>
          <p className="text-xs leading-relaxed text-slate-600 mt-1">
            The login role selection only verifies the user's intent. It never grants access. The role stored in the protected profile, FastAPI dependencies, and PostgreSQL Row Level Security remain authoritative.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {APP_ROLES.map(role => (
          <div key={role} className="card p-4 border-t-2 border-t-indigo-400">
            <div className="flex items-center justify-between gap-2">
              <span className="grid place-items-center w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700"><UserCog className="w-4 h-4" /></span>
              <span className="text-[9px] uppercase tracking-[0.1em] font-bold text-indigo-600">{ROLE_DATA_VISIBILITY[role].tier}</span>
            </div>
            <p className="text-sm font-semibold text-navy-900 mt-3">{ROLE_LABELS[role]}</p>
            <p className="text-[11px] leading-relaxed text-slate-500 mt-1">{ROLE_DESCRIPTIONS[role]}</p>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.1em] font-bold text-emerald-700"><Eye className="w-3 h-3" /> Visible data</p>
              <ul className="mt-1.5 space-y-1">
                {ROLE_DATA_VISIBILITY[role].visible.slice(0, 3).map(item => <li key={item} className="text-[10px] leading-snug text-slate-600">• {item}</li>)}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-indigo-700" /><h2 className="text-sm font-semibold text-navy-800">Role data-visibility matrix</h2></div>
          <span className="text-[10px] text-slate-500">Least-privilege view</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[900px]">
            <thead><tr><th>Role</th><th>Access tier</th><th>Visible information</th><th>Restricted information</th></tr></thead>
            <tbody>
              {APP_ROLES.map(role => (
                <tr key={role}>
                  <td><p className="text-xs font-semibold text-navy-900">{ROLE_LABELS[role]}</p><p className="text-[10px] text-slate-500 mt-1">{ROLE_DATA_VISIBILITY[role].summary}</p></td>
                  <td><Badge variant={role === 'administrator' ? 'critical' : role === 'executive' ? 'watch' : 'info'}>{ROLE_DATA_VISIBILITY[role].tier}</Badge></td>
                  <td><ul className="space-y-1">{ROLE_DATA_VISIBILITY[role].visible.map(item => <li key={item} className="text-[10px] text-slate-600">• {item}</li>)}</ul></td>
                  <td><ul className="space-y-1">{ROLE_DATA_VISIBILITY[role].restricted.map(item => <li key={item} className="text-[10px] text-slate-500">• {item}</li>)}</ul></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-navy-700" />
            <h2 className="text-sm font-semibold text-navy-800">Registered Users</h2>
          </div>
          <span className="text-xs text-slate-500">{profiles.length} profile{profiles.length === 1 ? '' : 's'}</span>
        </div>

        {loading ? (
          <div className="p-10 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading profiles...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[800px]">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map(profile => {
                  const isSelf = profile.id === user?.id;
                  const saving = savingId === profile.id;
                  return (
                    <tr key={profile.id}>
                      <td>
                        <p className="text-xs font-semibold text-navy-900">{profile.full_name || 'Unnamed user'}</p>
                        <p className="text-2xs text-slate-500">{profile.email}</p>
                      </td>
                      <td>
                        <select
                          value={profile.role}
                          disabled={saving || isSelf}
                          onChange={event => void updateAccess(profile, event.target.value as AppRole, profile.is_active)}
                          className="select py-1 text-xs min-w-44"
                          aria-label={`Role for ${profile.email}`}
                        >
                          {APP_ROLES.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          disabled={saving || isSelf}
                          onClick={() => void updateAccess(profile, profile.role, !profile.is_active)}
                          className={`badge ${profile.is_active ? 'badge-healthy' : 'badge-critical'} disabled:opacity-50`}
                        >
                          {saving ? 'Saving...' : profile.is_active ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                      <td className="text-xs text-slate-500">
                        {new Date(profile.created_at).toLocaleDateString('en-IN')}
                        {isSelf && (
                          <span className="ml-2 inline-flex items-center gap-1 text-blue-700">
                            <ShieldCheck className="w-3 h-3" /> You
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
