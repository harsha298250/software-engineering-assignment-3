import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, UserPlus, Trash2, X } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { StatusText, formatRoleLabel } from '../components/StatusText.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useToast } from '../contexts/ToastContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { AppUser, RoleInvite, USER_ROLES, UserRole } from '../shared/types.ts';

export function AdminUsersPage() {
  const { user: currentUser, refreshProfile } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<AppUser[]>([]);
  const [invites, setInvites] = useState<RoleInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);

  const [showProvisionForm, setShowProvisionForm] = useState(false);
  const [provisionFullName, setProvisionFullName] = useState('');
  const [provisionEmail, setProvisionEmail] = useState('');
  const [provisionDepartment, setProvisionDepartment] = useState('');
  const [provisionRole, setProvisionRole] = useState<UserRole>('MAINTENANCE_STAFF');
  const [provisioning, setProvisioning] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, invitesRes] = await Promise.all([
        apiRequest<{ users: AppUser[] }>('/api/admin/users'),
        apiRequest<{ invites: RoleInvite[] }>('/api/admin/invites'),
      ]);
      setUsers(usersRes.users);
      setInvites(invitesRes.invites);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (
        q &&
        !u.fullName.toLowerCase().includes(q) &&
        !u.email.toLowerCase().includes(q) &&
        !u.department.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [users, roleFilter, search]);

  const handleUpdateUser = async (
    target: AppUser,
    patch: { role?: UserRole; accountStatus?: 'ACTIVE' | 'INACTIVE' }
  ) => {
    setUpdatingId(target.id);
    try {
      await apiRequest(`/api/admin/users/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      showToast({
        title: 'User account updated',
        description: `${target.fullName} updated successfully.`,
        variant: 'success',
      });
      if (currentUser && target.id === currentUser.id) {
        await refreshProfile();
      }
      await loadData();
    } catch (err: unknown) {
      showToast({
        title: 'Update rejected',
        description: err instanceof Error ? err.message : 'Unable to update user.',
        variant: 'error',
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleProvisionAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisioning(true);
    try {
      const res = await apiRequest<{
        mode: 'updated_user' | 'created_invite';
        user?: AppUser;
        invite?: RoleInvite;
      }>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          fullName: provisionFullName.trim(),
          email: provisionEmail.trim().toLowerCase(),
          department: provisionDepartment.trim(),
          role: provisionRole,
        }),
      });

      if (res.mode === 'updated_user' && res.user) {
        showToast({
          title: 'Existing account updated',
          description: `${res.user.email} is now assigned ${formatRoleLabel(res.user.role)}.`,
          variant: 'success',
        });
        if (currentUser && res.user.id === currentUser.id) {
          await refreshProfile();
        }
      } else {
        showToast({
          title: 'Role invitation provisioned',
          description: `${provisionEmail.trim().toLowerCase()} can now sign in via the ${formatRoleLabel(
            provisionRole
          )} portal.`,
          variant: 'success',
        });
      }

      setProvisionFullName('');
      setProvisionEmail('');
      setProvisionDepartment('');
      setProvisionRole('MAINTENANCE_STAFF');
      setShowProvisionForm(false);
      await loadData();
    } catch (err: unknown) {
      showToast({
        title: 'Provisioning failed',
        description: err instanceof Error ? err.message : 'Unable to provision account.',
        variant: 'error',
      });
    } finally {
      setProvisioning(false);
    }
  };

  const handleRevokeInvite = async (invite: RoleInvite) => {
    setRevokingInviteId(invite.id);
    try {
      await apiRequest(`/api/admin/invites/${invite.id}`, {
        method: 'DELETE',
      });
      showToast({
        title: 'Invitation revoked',
        description: `Removed ${formatRoleLabel(invite.role)} invite for ${invite.email}.`,
        variant: 'success',
      });
      await loadData();
    } catch (err: unknown) {
      showToast({
        title: 'Revoke failed',
        description: err instanceof Error ? err.message : 'Unable to revoke invitation.',
        variant: 'error',
      });
    } finally {
      setRevokingInviteId(null);
    }
  };

  return (
    <DashboardLayout
      title="User Management & Role Governance"
      subtitle="Pre-provision staff and administrator emails, assign campus roles, and manage account status."
      actions={
        <button
          type="button"
          onClick={() => setShowProvisionForm((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0F2342] px-4 py-2 text-sm font-semibold text-[#FAF8F5] transition-colors hover:bg-[#1A355E] dark:bg-[#EAB308] dark:text-[#09111E] dark:hover:bg-[#CA8A04] whitespace-nowrap shrink-0"
        >
          {showProvisionForm ? (
            <>
              <X className="h-4 w-4" />
              <span>Close Form</span>
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" />
              <span>Provision Account</span>
            </>
          )}
        </button>
      }
    >
      {showProvisionForm && (
        <form
          onSubmit={handleProvisionAccount}
          className="mb-6 rounded-xl border border-[#E5DFD3] bg-white p-5 dark:border-[#1E2E4A] dark:bg-[#101B2E]"
        >
          <div className="mb-4">
            <h2 className="text-base font-semibold">
              Pre-Provision Staff or Campus Account
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Enter an institutional Google email to assign Maintenance Staff, Administrator, Faculty, or Student permissions before first sign-in, or update an existing user immediately.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label
                htmlFor="provision-fullname"
                className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
              >
                Full Name
              </label>
              <input
                id="provision-fullname"
                type="text"
                required
                minLength={2}
                maxLength={100}
                value={provisionFullName}
                onChange={(e) => setProvisionFullName(e.target.value)}
                placeholder="e.g. Jordan Reyes"
                className="w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
              />
            </div>

            <div>
              <label
                htmlFor="provision-email"
                className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
              >
                Institutional Email
              </label>
              <input
                id="provision-email"
                type="email"
                required
                value={provisionEmail}
                onChange={(e) => setProvisionEmail(e.target.value)}
                placeholder="staff@northbridge.edu"
                className="w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
              />
            </div>

            <div>
              <label
                htmlFor="provision-department"
                className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
              >
                Department / Unit
              </label>
              <input
                id="provision-department"
                type="text"
                required
                minLength={2}
                maxLength={100}
                value={provisionDepartment}
                onChange={(e) => setProvisionDepartment(e.target.value)}
                placeholder="e.g. Facilities Engineering"
                className="w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
              />
            </div>

            <div>
              <label
                htmlFor="provision-role"
                className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
              >
                Assigned Role
              </label>
              <select
                id="provision-role"
                value={provisionRole}
                onChange={(e) => setProvisionRole(e.target.value as UserRole)}
                className="w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 text-sm font-medium focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
              >
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {formatRoleLabel(r)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowProvisionForm(false)}
              className="rounded-lg border border-[#E5DFD3] px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-[#FAF8F5] dark:border-[#1E2E4A] dark:text-slate-300 dark:hover:bg-[#09111E]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={provisioning}
              className="rounded-lg bg-[#0F2342] px-4 py-2 text-xs font-semibold text-[#FAF8F5] transition-colors hover:bg-[#1A355E] disabled:opacity-60 dark:bg-[#EAB308] dark:text-[#09111E] dark:hover:bg-[#CA8A04]"
            >
              {provisioning ? 'Provisioning...' : 'Save Provisioning'}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-[#E5DFD3] bg-white p-4 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#FAF8F5] p-1 dark:bg-[#09111E]">
            {['ALL', ...USER_ROLES].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  roleFilter === r
                    ? 'bg-white text-[#0F2342] shadow-sm dark:bg-[#101B2E] dark:text-[#EAB308]'
                    : 'text-slate-600 hover:text-[#0F2342] dark:text-slate-400'
                }`}
              >
                {r === 'ALL' ? 'All Roles' : formatRoleLabel(r)}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, unit..."
              className="w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] py-1.5 pl-9 pr-3 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-[#E5DFD3] bg-white dark:border-[#1E2E4A] dark:bg-[#101B2E]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#E5DFD3] bg-[#FAF8F5] text-xs font-semibold text-slate-600 dark:border-[#1E2E4A] dark:bg-[#09111E] dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Assigned Role</th>
                <th className="px-4 py-3">Account Status</th>
                <th className="px-4 py-3 text-right">Status Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5DFD3] dark:divide-[#1E2E4A]">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-4 py-4">
                      <div className="h-5 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">
                    No user accounts match your search.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-[#FAF8F5]/70 dark:hover:bg-[#16233B]/40">
                    <td className="px-4 py-3">
                      <p className="font-semibold">
                        {u.fullName}
                        {currentUser?.id === u.id ? ' (You)' : ''}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {u.email}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs">{u.department}</td>
                    <td className="px-4 py-3">
                      <select
                        aria-label={`Role for ${u.fullName}`}
                        disabled={updatingId === u.id}
                        value={u.role}
                        onChange={(e) =>
                          handleUpdateUser(u, { role: e.target.value as UserRole })
                        }
                        className="rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-2.5 py-1.5 text-xs font-medium dark:border-[#1E2E4A] dark:bg-[#09111E]"
                      >
                        {USER_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {formatRoleLabel(r)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <StatusText status={u.accountStatus} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        disabled={updatingId === u.id}
                        onClick={() =>
                          handleUpdateUser(u, {
                            accountStatus:
                              u.accountStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                          })
                        }
                        className={`rounded-lg border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
                          u.accountStatus === 'ACTIVE'
                            ? 'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40'
                            : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40'
                        }`}
                      >
                        {u.accountStatus === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Provisioned Role Invitations */}
      {invites.length > 0 && (
        <section className="mt-8">
          <div className="mb-3">
            <h2 className="text-base font-semibold">Provisioned Role Invitations</h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Pending invitations are automatically claimed when the invited institutional Google email signs in through its matching role portal.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-[#E5DFD3] bg-white dark:border-[#1E2E4A] dark:bg-[#101B2E]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[#E5DFD3] bg-[#FAF8F5] text-xs font-semibold text-slate-600 dark:border-[#1E2E4A] dark:bg-[#09111E] dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Invitee</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Provisioned Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Invited By</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5DFD3] dark:divide-[#1E2E4A]">
                  {invites.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#FAF8F5]/70 dark:hover:bg-[#16233B]/40">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{inv.fullName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {inv.email}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs">{inv.department}</td>
                      <td className="px-4 py-3 text-xs font-medium">
                        {formatRoleLabel(inv.role)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusText status={inv.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {inv.invitedByName}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={revokingInviteId === inv.id}
                          onClick={() => handleRevokeInvite(inv)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>{revokingInviteId === inv.id ? 'Revoking...' : 'Revoke'}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </DashboardLayout>
  );
}
