import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  GraduationCap,
  BookOpen,
  Wrench,
  ShieldCheck,
  Sun,
  Moon,
  ArrowRightLeft,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useTheme } from '../contexts/ThemeContext.tsx';
import { formatRoleLabel } from '../components/StatusText.tsx';
import { USER_ROLES, UserRole } from '../shared/types.ts';

interface RolePortalMeta {
  role: UserRole;
  label: string;
  shortLabel: string;
  summary: string;
  accessNote: string;
  icon: typeof GraduationCap;
}

const ROLE_PORTALS: RolePortalMeta[] = [
  {
    role: 'STUDENT',
    label: 'Student',
    shortLabel: 'Student',
    summary: 'Browse campus rooms, submit reservation requests, and report facility maintenance issues.',
    accessNote: 'New institutional Google accounts receive Student access automatically.',
    icon: GraduationCap,
  },
  {
    role: 'FACULTY',
    label: 'Faculty',
    shortLabel: 'Faculty',
    summary: 'Reserve lecture halls, seminar rooms, and laboratories for courses and academic events.',
    accessNote: 'Institutional Google sign-in verifies your Faculty portal session.',
    icon: BookOpen,
  },
  {
    role: 'MAINTENANCE_STAFF',
    label: 'Maintenance Staff',
    shortLabel: 'Staff',
    summary: 'View assigned work orders, update repair progress, and log resolution remarks.',
    accessNote: 'Requires an Administrator-provisioned email in Campus User Management.',
    icon: Wrench,
  },
  {
    role: 'ADMIN',
    label: 'Administrator',
    shortLabel: 'Admin',
    summary: 'Approve conflict-locked bookings, dispatch maintenance tickets, and govern campus roles.',
    accessNote: 'Restricted to authorized Campus Administrators and workspace owners.',
    icon: ShieldCheck,
  },
];

function isValidRole(value: string | null): value is UserRole {
  return value !== null && (USER_ROLES as string[]).includes(value);
}

export function LoginPage() {
  const {
    user,
    loading,
    authError,
    roleMismatch,
    signInWithGoogle,
    clearAuthError,
  } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialRoleParam = searchParams.get('role')?.toUpperCase() ?? null;
  const [selectedRole, setSelectedRole] = useState<UserRole>(
    isValidRole(initialRoleParam) ? initialRoleParam : 'STUDENT'
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const param = searchParams.get('role')?.toUpperCase() ?? null;
    if (isValidRole(param) && param !== selectedRole) {
      setSelectedRole(param);
    }
  }, [searchParams, selectedRole]);

  if (!loading && user) {
    return <Navigate to={user.profileCompleted ? '/dashboard' : '/register'} replace />;
  }

  const activePortal =
    ROLE_PORTALS.find((portal) => portal.role === selectedRole) ?? ROLE_PORTALS[0];

  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
    clearAuthError();
    setSearchParams({ role }, { replace: true });
  };

  const handleGoogleSignIn = async () => {
    clearAuthError();
    setSubmitting(true);
    try {
      const signedIn = await signInWithGoogle(selectedRole);
      if (signedIn) {
        navigate(signedIn.profileCompleted ? '/dashboard' : '/register');
      }
    } catch {
      // authError and roleMismatch state display feedback
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#0F2342] dark:bg-[#09111E] dark:text-[#F5F2EB] flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#E5DFD3] dark:border-[#1E2E4A]">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#0F2342] dark:text-slate-300 dark:hover:text-[#F5F2EB]"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Campus Overview</span>
        </Link>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle color theme"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5DFD3] bg-white text-[#0F2342] dark:border-[#1E2E4A] dark:bg-[#101B2E] dark:text-[#F5F2EB]"
        >
          {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg rounded-2xl border border-[#E5DFD3] bg-white p-8 shadow-sm dark:border-[#1E2E4A] dark:bg-[#101B2E]">
          <p className="text-xs font-semibold tracking-wide text-[#2B4C7E] dark:text-[#EAB308]">
            Smart Campus Portal
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold">
            Sign in to your role portal
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Select your campus role and authenticate with your institutional Google account. Portal access is strictly verified against your assigned role.
          </p>

          {/* Interactive 4-Role Portal Selector */}
          <div className="mt-6">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
              Select Campus Role Portal
            </label>
            <div
              role="tablist"
              aria-label="Campus role portal selector"
              className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 rounded-xl border border-[#E5DFD3] bg-[#FAF8F5] p-1.5 dark:border-[#1E2E4A] dark:bg-[#09111E]"
            >
              {ROLE_PORTALS.map((portal) => {
                const Icon = portal.icon;
                const isSelected = portal.role === selectedRole;
                return (
                  <button
                    key={portal.role}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => handleSelectRole(portal.role)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                      isSelected
                        ? 'bg-[#0F2342] text-[#FAF8F5] shadow-sm dark:bg-[#EAB308] dark:text-[#09111E]'
                        : 'text-slate-600 hover:bg-white hover:text-[#0F2342] dark:text-slate-300 dark:hover:bg-[#101B2E] dark:hover:text-[#F5F2EB]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{portal.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Portal Details */}
          <div className="mt-4 rounded-xl border border-[#E5DFD3] bg-[#FAF8F5] p-4 dark:border-[#1E2E4A] dark:bg-[#09111E]">
            <p className="text-xs font-semibold text-[#0F2342] dark:text-[#EAB308]">
              {activePortal.label} Portal
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {activePortal.summary}
            </p>
          </div>

          {authError && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
            >
              <p className="leading-relaxed">{authError}</p>
              {roleMismatch && (
                <button
                  type="button"
                  onClick={() => handleSelectRole(roleMismatch.actualRole)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 transition-colors hover:bg-red-100 dark:border-red-700 dark:bg-[#101B2E] dark:text-red-200 dark:hover:bg-red-900/40"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  <span>Switch to {formatRoleLabel(roleMismatch.actualRole)} Portal</span>
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={submitting || loading}
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg bg-[#0F2342] px-4 py-3 text-sm font-semibold text-[#FAF8F5] transition-colors hover:bg-[#1A355E] disabled:opacity-60 dark:bg-[#EAB308] dark:text-[#09111E] dark:hover:bg-[#CA8A04]"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
              />
            </svg>
            <span>
              {submitting
                ? 'Verifying Role & Authenticating...'
                : `Continue with Google as ${activePortal.label}`}
            </span>
          </button>

          <div className="mt-6 border-t border-[#E5DFD3] pt-5 dark:border-[#1E2E4A]">
            <div className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[#2B4C7E] dark:text-[#EAB308] mt-0.5" />
              <p className="leading-relaxed">{activePortal.accessNote}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
