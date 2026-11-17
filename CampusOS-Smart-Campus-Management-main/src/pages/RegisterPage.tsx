import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useToast } from '../contexts/ToastContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { AppUser } from '../shared/types.ts';
import { formatRoleLabel } from '../components/StatusText.tsx';

export function RegisterPage() {
  const { user, loading, refreshProfile, signInWithGoogle } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [requestedRole, setRequestedRole] = useState<'STUDENT' | 'FACULTY'>(
    user?.role === 'FACULTY' ? 'FACULTY' : 'STUDENT'
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5] dark:bg-[#09111E]">
        <p className="text-sm text-slate-500">Loading campus account...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] text-[#0F2342] dark:bg-[#09111E] dark:text-[#F5F2EB] flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-[#E5DFD3] bg-white p-8 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
          <h1 className="font-display text-2xl font-semibold">Campus Registration</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Sign in with your Google account first to register and complete your university profile.
          </p>
          <button
            type="button"
            onClick={async () => {
              await signInWithGoogle();
            }}
            className="mt-6 w-full rounded-lg bg-[#0F2342] px-4 py-2.5 text-sm font-semibold text-[#FAF8F5] hover:bg-[#1A355E] dark:bg-[#EAB308] dark:text-[#09111E]"
          >
            Sign In with Google
          </button>
          <div className="mt-4 text-center">
            <Link to="/" className="text-xs text-slate-500 hover:underline">
              Return to Campus Overview
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isPrivileged = user.role === 'ADMIN' || user.role === 'MAINTENANCE_STAFF';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest<{ user: AppUser }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: fullName.trim() || user.fullName,
          department: department.trim() || 'General Campus',
          ...(isPrivileged ? {} : { requestedRole }),
        }),
      });
      await refreshProfile();
      showToast({
        title: 'Campus profile saved',
        description: 'Your account details are up to date.',
        variant: 'success',
      });
      navigate('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save registration.');
    } finally {
      setSubmitting(false);
    }
  };

  if (user.profileCompleted && !fullName) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#0F2342] dark:bg-[#09111E] dark:text-[#F5F2EB] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-[#E5DFD3] bg-white p-8 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
        <p className="text-xs font-semibold tracking-wide text-[#2B4C7E] dark:text-[#EAB308]">
          Profile Registration
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold">
          Complete your Smart Campus profile
        </h1>
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
          Signed in as <span className="font-medium">{user.email}</span> · Assigned role:{' '}
          <span className="font-semibold">{formatRoleLabel(user.role)}</span>
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium">
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              required
              minLength={2}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g., Maya Lin"
              className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3.5 py-2.5 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E] dark:focus:border-[#EAB308]"
            />
          </div>

          <div>
            <label htmlFor="department" className="block text-sm font-medium">
              Academic Department / Unit
            </label>
            <input
              id="department"
              type="text"
              required
              minLength={2}
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g., School of Computing"
              className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3.5 py-2.5 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E] dark:focus:border-[#EAB308]"
            />
          </div>

          {!isPrivileged && (
            <div>
              <label htmlFor="requestedRole" className="block text-sm font-medium">
                Campus Affiliation
              </label>
              <select
                id="requestedRole"
                value={requestedRole}
                onChange={(e) => setRequestedRole(e.target.value as 'STUDENT' | 'FACULTY')}
                className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3.5 py-2.5 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E] dark:focus:border-[#EAB308]"
              >
                <option value="STUDENT">Student</option>
                <option value="FACULTY">Faculty</option>
              </select>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                Maintenance Staff and Administrator roles cannot be self-assigned and are granted exclusively by Campus Administrators.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-3">
            <Link
              to="/dashboard"
              className="text-sm font-medium text-slate-600 hover:underline dark:text-slate-300"
            >
              Skip for now
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[#0F2342] px-5 py-2.5 text-sm font-semibold text-[#FAF8F5] hover:bg-[#1A355E] disabled:opacity-60 dark:bg-[#EAB308] dark:text-[#09111E]"
            >
              {submitting ? 'Saving...' : 'Save & Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
