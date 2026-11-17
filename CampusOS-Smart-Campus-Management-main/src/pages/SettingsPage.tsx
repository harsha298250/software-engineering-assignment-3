import React, { useState } from 'react';
import { Sun, Moon, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { formatRoleLabel, StatusText } from '../components/StatusText.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useTheme } from '../contexts/ThemeContext.tsx';
import { useToast } from '../contexts/ToastContext.tsx';
import { apiRequest } from '../lib/api.ts';

export function SettingsPage() {
  const { user, refreshProfile, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [saving, setSaving] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: fullName.trim(),
          department: department.trim(),
        }),
      });
      await refreshProfile();
      showToast({
        title: 'Profile updated',
        description: 'Your personal details have been saved to Cloud Firestore.',
        variant: 'success',
      });
    } catch (err: unknown) {
      showToast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unable to update profile.',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      title="Profile & Settings"
      subtitle="Manage your institutional profile, appearance preferences, and active session."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-6 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
            <h2 className="text-base font-semibold">Campus Profile</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Your email and institutional role are verified via Google Sign-In and campus governance.
            </p>

            <form onSubmit={handleSaveProfile} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Institutional Email
                </label>
                <p className="mt-1 font-mono-tabular text-sm font-medium">{user?.email}</p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Assigned Role
                  </label>
                  <p className="mt-1 text-sm font-semibold">
                    {formatRoleLabel(user?.role || 'STUDENT')}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Account Status
                  </label>
                  <div className="mt-1">
                    <StatusText status={user?.accountStatus || 'ACTIVE'} />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="settingsName" className="block text-sm font-medium">
                  Full Name
                </label>
                <input
                  id="settingsName"
                  type="text"
                  required
                  minLength={2}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3.5 py-2.5 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
                />
              </div>

              <div>
                <label htmlFor="settingsDept" className="block text-sm font-medium">
                  Academic Department / Unit
                </label>
                <input
                  id="settingsDept"
                  type="text"
                  required
                  minLength={2}
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3.5 py-2.5 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#0F2342] px-5 py-2.5 text-sm font-semibold text-[#FAF8F5] hover:bg-[#1A355E] disabled:opacity-50 dark:bg-[#EAB308] dark:text-[#09111E]"
                >
                  {saving ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-6 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
            <h2 className="text-base font-semibold">Workspace Appearance</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Switch between Warm Ivory (Light) and Midnight Navy (Dark).
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition-colors ${
                  theme === 'light'
                    ? 'border-[#0F2342] bg-[#FAF8F5] text-[#0F2342]'
                    : 'border-[#E5DFD3] text-slate-600 dark:border-[#1E2E4A] dark:text-slate-300'
                }`}
              >
                <Sun className="h-4 w-4" />
                <span>Warm Ivory</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition-colors ${
                  theme === 'dark'
                    ? 'border-[#EAB308] bg-[#09111E] text-[#EAB308]'
                    : 'border-[#E5DFD3] text-slate-600 dark:border-[#1E2E4A] dark:text-slate-300'
                }`}
              >
                <Moon className="h-4 w-4" />
                <span>Midnight Navy</span>
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[#E5DFD3] bg-white p-6 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
            <h2 className="text-base font-semibold">Session</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              End your authenticated session across this browser.
            </p>
            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate('/');
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
