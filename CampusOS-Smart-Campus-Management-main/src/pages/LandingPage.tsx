import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, CalendarCheck, ShieldCheck, Sun, Moon, Wrench } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useTheme } from '../contexts/ThemeContext.tsx';
import { CAMPUS_HERO_IMAGE } from '../lib/facilityImages.ts';
import { Facility } from '../shared/types.ts';
import { FacilityImage } from '../components/FacilityImage.tsx';
import { StatusText } from '../components/StatusText.tsx';

interface PublicOverview {
  totalFacilities: number;
  operationalFacilities: number;
  activeBookingsToday: number;
  featuredFacilities: Facility[];
}

export function LandingPage() {
  const { user, signInWithGoogle } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [overview, setOverview] = useState<PublicOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch('/api/public/overview')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load'))))
      .then((data: PublicOverview) => {
        if (mounted) setOverview(data);
      })
      .catch(() => {
        // leave null on error
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handlePrimaryAction = async () => {
    if (user) {
      navigate('/dashboard');
      return;
    }
    setSigningIn(true);
    setError(null);
    try {
      const signedIn = await signInWithGoogle();
      if (signedIn) {
        navigate(signedIn.profileCompleted ? '/dashboard' : '/register');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to complete sign-in.');
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#0F2342] dark:bg-[#09111E] dark:text-[#F5F2EB]">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-[#E5DFD3] bg-[#FAF8F5]/95 backdrop-blur-sm dark:border-[#1E2E4A] dark:bg-[#09111E]/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="font-display text-xl font-bold tracking-tight text-[#0F2342] dark:text-[#F5F2EB] whitespace-nowrap shrink-0"
          >
            Smart Campus
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a
              href="#overview"
              className="hover:text-[#0F2342] dark:hover:text-[#F5F2EB] transition-colors whitespace-nowrap shrink-0"
            >
              Overview
            </a>
            <a
              href="#availability"
              className="hover:text-[#0F2342] dark:hover:text-[#F5F2EB] transition-colors whitespace-nowrap shrink-0"
            >
              Facilities
            </a>
            <a
              href="#workflows"
              className="hover:text-[#0F2342] dark:hover:text-[#F5F2EB] transition-colors whitespace-nowrap shrink-0"
            >
              Workflows
            </a>
            <Link
              to="/login"
              className="hover:text-[#0F2342] dark:hover:text-[#F5F2EB] transition-colors whitespace-nowrap shrink-0"
            >
              Portal
            </Link>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5DFD3] bg-white text-[#0F2342] transition-colors hover:bg-[#F3EFE7] dark:border-[#1E2E4A] dark:bg-[#101B2E] dark:text-[#F5F2EB]"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={signingIn}
              className="rounded-lg bg-[#0F2342] px-4 py-2 text-sm font-semibold text-[#FAF8F5] transition-colors hover:bg-[#1A355E] disabled:opacity-60 dark:bg-[#EAB308] dark:text-[#09111E] dark:hover:bg-[#CA8A04] whitespace-nowrap shrink-0"
            >
              {user ? 'Open Dashboard' : signingIn ? 'Signing In...' : 'Sign In'}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section id="overview" className="mx-auto max-w-7xl px-4 pt-10 pb-12 sm:px-6 lg:px-8 lg:pt-14">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-stretch">
          <div className="flex flex-col justify-between lg:col-span-6 py-2">
            <div>
              <p className="text-xs font-semibold tracking-wide text-[#2B4C7E] dark:text-[#EAB308]">
                Northbridge University Operations
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-[#0F2342] sm:text-5xl leading-[1.12] [text-wrap:balance] dark:text-[#F5F2EB]">
                Unified campus room booking and facility maintenance
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
                Browse lecture halls, laboratories, and athletic venues with live slot visibility. Submit conflict-checked room reservations and dispatch maintenance crews through one institutional platform.
              </p>

              {error && (
                <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                  {error}
                </div>
              )}

              <div className="mt-7 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={handlePrimaryAction}
                  disabled={signingIn}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0F2342] px-5 py-3 text-sm font-semibold text-[#FAF8F5] transition-colors hover:bg-[#1A355E] disabled:opacity-60 dark:bg-[#EAB308] dark:text-[#09111E] dark:hover:bg-[#CA8A04]"
                >
                  <span>{user ? 'Enter Workspace' : 'Sign In with Google'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
                <a
                  href="#availability"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#E5DFD3] bg-white px-5 py-3 text-sm font-semibold text-[#0F2342] transition-colors hover:bg-[#F3EFE7] dark:border-[#1E2E4A] dark:bg-[#101B2E] dark:text-[#F5F2EB] dark:hover:bg-[#16233B]"
                >
                  Browse Facilities
                </a>
              </div>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-4 border-t border-[#E5DFD3] pt-6 dark:border-[#1E2E4A]">
              <div>
                <p className="font-mono-tabular text-2xl font-bold">
                  {loading ? '—' : overview?.totalFacilities ?? 14}
                </p>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                  Campus Facilities
                </p>
              </div>
              <div>
                <p className="font-mono-tabular text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {loading ? '—' : overview?.operationalFacilities ?? 12}
                </p>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                  Operational Now
                </p>
              </div>
              <div>
                <p className="font-mono-tabular text-2xl font-bold">
                  {loading ? '—' : overview?.activeBookingsToday ?? 0}
                </p>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                  Scheduled Today
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-72 sm:h-96 lg:h-full overflow-hidden rounded-2xl border border-[#E5DFD3] bg-white dark:border-[#1E2E4A] dark:bg-[#101B2E]">
              <img
                src={CAMPUS_HERO_IMAGE}
                alt="Northbridge University academic quadrangle and library"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Live Facility Availability Preview */}
      <section
        id="availability"
        className="border-t border-[#E5DFD3] bg-white py-14 dark:border-[#1E2E4A] dark:bg-[#101B2E]/60"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
                Live Campus Facility Directory
              </h2>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                Real-time operational status synchronized from the campus Cloud Firestore registry.
              </p>
            </div>
            <Link
              to={user ? '/facilities' : '/login'}
              className="text-sm font-semibold text-[#2B4C7E] hover:underline dark:text-[#EAB308] whitespace-nowrap"
            >
              View all rooms and time slots →
            </Link>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {loading
              ? Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-72 animate-pulse rounded-xl border border-[#E5DFD3] bg-[#FAF8F5] dark:border-[#1E2E4A] dark:bg-[#09111E]"
                  />
                ))
              : (overview?.featuredFacilities || []).map((fac) => (
                  <div
                    key={fac.id}
                    className="flex flex-col overflow-hidden rounded-xl border border-[#E5DFD3] bg-[#FAF8F5] transition-transform duration-150 hover:-translate-y-0.5 dark:border-[#1E2E4A] dark:bg-[#09111E]"
                  >
                    <div className="aspect-[4/3] w-full overflow-hidden border-b border-[#E5DFD3] dark:border-[#1E2E4A]">
                      <FacilityImage
                        imageKey={fac.imageKey}
                        alt={fac.name}
                        className="h-full w-full"
                      />
                    </div>
                    <div className="flex flex-1 flex-col justify-between p-4">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono-tabular text-xs font-medium text-slate-500 dark:text-slate-400">
                            {fac.code} · {fac.category}
                          </span>
                          <StatusText status={fac.operationalStatus} />
                        </div>
                        <h3 className="mt-1.5 text-base font-semibold text-[#0F2342] dark:text-[#F5F2EB]">
                          {fac.name}
                        </h3>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                          {fac.building} · Floor {fac.floor} · Room {fac.roomNumber} ·{' '}
                          <span className="font-mono-tabular font-medium">{fac.capacity} seats</span>
                        </p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-[#E5DFD3] dark:border-[#1E2E4A]">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(user ? `/facilities/${fac.id}` : '/login')
                          }
                          className="text-xs font-semibold text-[#0F2342] hover:underline dark:text-[#EAB308]"
                        >
                          {user ? 'Inspect schedule & book →' : 'Sign in to reserve →'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
          </div>
        </div>
      </section>

      {/* Core Workflows */}
      <section id="workflows" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Built for academic reliability
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Every reservation, approval, and repair ticket follows audited server-side workflows.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-6 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
            <CalendarCheck className="h-5 w-5 text-[#0F2342] dark:text-[#EAB308]" />
            <h3 className="mt-4 text-base font-semibold">
              01. Atomic Conflict Locking
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              All room booking requests enter administrative review and commit inside Cloud Firestore transactions, returning HTTP 409 Conflict if simultaneous approvals collide.
            </p>
          </div>

          <div className="rounded-xl border border-[#E5DFD3] bg-white p-6 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
            <Wrench className="h-5 w-5 text-[#0F2342] dark:text-[#EAB308]" />
            <h3 className="mt-4 text-base font-semibold">
              02. Maintenance Dispatch
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Students and faculty report facility issues with priority levels. Administrators assign maintenance staff who log progress and resolution remarks through closure.
            </p>
          </div>

          <div className="rounded-xl border border-[#E5DFD3] bg-white p-6 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
            <ShieldCheck className="h-5 w-5 text-[#0F2342] dark:text-[#EAB308]" />
            <h3 className="mt-4 text-base font-semibold">
              03. Role-Based Governance
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Dedicated permissions for Students, Faculty, Maintenance Staff, and Administrators—enforced on every REST endpoint with real-time notifications and CSV audit exports.
            </p>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-[#E5DFD3] bg-white py-8 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:px-6 lg:px-8 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#0F2342] dark:text-[#EAB308]" />
            <span className="font-semibold text-[#0F2342] dark:text-[#F5F2EB]">
              Smart Campus Operations
            </span>
            <span>·</span>
            <span>Facility Booking & Maintenance Platform</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/login" className="hover:text-[#0F2342] dark:hover:text-[#F5F2EB]">
              Sign In
            </Link>
            <Link to="/register" className="hover:text-[#0F2342] dark:hover:text-[#F5F2EB]">
              Complete Profile
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
