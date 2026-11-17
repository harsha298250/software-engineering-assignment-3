import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { CalendarPlus, Wrench, Building2, ArrowRight, ShieldCheck } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { StatusText, PriorityText } from '../components/StatusText.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import {
  BookingWithRelations,
  MaintenanceWithRelations,
} from '../shared/types.ts';

interface DashboardStatsResponse {
  kpis: {
    totalFacilities: number;
    availableRooms: number;
    activeBookings: number;
    pendingApprovals: number;
    openMaintenance: number;
    completedMaintenance: number;
  };
  personal: {
    myBookingsCount: number;
    myPendingBookings: number;
    myMaintenanceCount: number;
    assignedTasksCount: number;
  };
  recentActivity: Array<{
    id: number;
    action: string;
    entityType: string;
    entityId: number;
    details: string | null;
    timestamp: string;
    actorName: string | null;
  }>;
}

interface AnalyticsResponse {
  monthlyBookingTrends: Array<{ month: string; total: number; approved: number }>;
  maintenanceCompletionTrends: Array<{ month: string; reported: number; resolved: number }>;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [bookings, setBookings] = useState<BookingWithRelations[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, analyticsRes, bookingsRes, maintRes] = await Promise.all([
        apiRequest<DashboardStatsResponse>('/api/dashboard/stats'),
        apiRequest<AnalyticsResponse>('/api/dashboard/analytics'),
        apiRequest<{ bookings: BookingWithRelations[] }>('/api/bookings'),
        apiRequest<{ requests: MaintenanceWithRelations[] }>('/api/maintenance'),
      ]);
      setStats(statsRes);
      setAnalytics(analyticsRes);
      setBookings(bookingsRes.bookings);
      setMaintenance(maintRes.requests);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const isAdmin = user?.role === 'ADMIN';
  const isStaff = user?.role === 'MAINTENANCE_STAFF';

  const upcomingBookings = bookings
    .filter((b) => b.status === 'APPROVED' || b.status === 'PENDING')
    .slice(0, 5);
  const pendingApprovalList = bookings.filter((b) => b.status === 'PENDING').slice(0, 5);
  const recentMaintenance = maintenance.slice(0, 5);

  const kpiCards = [
    { label: 'Total Campus Facilities', value: stats?.kpis.totalFacilities ?? 0 },
    { label: 'Available Rooms', value: stats?.kpis.availableRooms ?? 0 },
    { label: 'Active Bookings', value: stats?.kpis.activeBookings ?? 0 },
    { label: 'Pending Booking Approvals', value: stats?.kpis.pendingApprovals ?? 0 },
    { label: 'Open Maintenance Requests', value: stats?.kpis.openMaintenance ?? 0 },
    { label: 'Completed Maintenance Requests', value: stats?.kpis.completedMaintenance ?? 0 },
  ];

  return (
    <DashboardLayout
      title="Campus Operations Dashboard"
      subtitle={`Signed in as ${user?.fullName} · ${user?.department}`}
      actions={
        <>
          <Link
            to="/bookings/new"
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F2342] px-4 py-2 text-sm font-semibold text-[#FAF8F5] transition-colors hover:bg-[#1A355E] dark:bg-[#EAB308] dark:text-[#09111E] dark:hover:bg-[#CA8A04]"
          >
            <CalendarPlus className="h-4 w-4" />
            <span>Book a Room</span>
          </Link>
          <Link
            to="/maintenance/new"
            className="inline-flex items-center gap-2 rounded-lg border border-[#E5DFD3] bg-white px-4 py-2 text-sm font-semibold text-[#0F2342] transition-colors hover:bg-[#F3EFE7] dark:border-[#1E2E4A] dark:bg-[#101B2E] dark:text-[#F5F2EB] dark:hover:bg-[#16233B]"
          >
            <Wrench className="h-4 w-4" />
            <span>Report Issue</span>
          </Link>
        </>
      }
    >
      {error && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <span>{error}</span>
          <button
            type="button"
            onClick={loadDashboard}
            className="font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* 6 KPI Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpiCards.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-[#E5DFD3] bg-white p-4 dark:border-[#1E2E4A] dark:bg-[#101B2E]"
          >
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {kpi.label}
            </p>
            {loading ? (
              <div className="mt-2 h-8 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ) : (
              <p className="mt-2 font-mono-tabular text-2xl font-bold text-[#0F2342] dark:text-[#F5F2EB]">
                {kpi.value}
              </p>
            )}
          </div>
        ))}
      </section>

      {/* Analytics Charts */}
      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-5 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Monthly Room Booking Trends</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Total requested vs. approved reservations
              </p>
            </div>
            <Link
              to="/reports"
              className="text-xs font-semibold text-[#2B4C7E] hover:underline dark:text-[#EAB308]"
            >
              Full reports →
            </Link>
          </div>
          <div className="h-64 w-full">
            {loading ? (
              <div className="h-full w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics?.monthlyBookingTrends || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Total Requests"
                    stroke="#0F2342"
                    fill="#2B4C7E"
                    fillOpacity={0.18}
                  />
                  <Area
                    type="monotone"
                    dataKey="approved"
                    name="Approved / Completed"
                    stroke="#0D9488"
                    fill="#0D9488"
                    fillOpacity={0.22}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[#E5DFD3] bg-white p-5 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Maintenance Completion Trends</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Reported campus issues vs. resolved tickets
              </p>
            </div>
            <Link
              to={isStaff || isAdmin ? '/staff/maintenance' : '/maintenance/mine'}
              className="text-xs font-semibold text-[#2B4C7E] hover:underline dark:text-[#EAB308]"
            >
              View queue →
            </Link>
          </div>
          <div className="h-64 w-full">
            {loading ? (
              <div className="h-full w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics?.maintenanceCompletionTrends || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="reported" name="Reported" fill="#2B4C7E" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="resolved" name="Resolved" fill="#0D9488" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      {/* Role-Adaptive Widgets */}
      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Column 1: Upcoming Bookings or Admin Pending Approvals */}
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-5 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
          <div className="flex items-center justify-between pb-3 border-b border-[#E5DFD3] dark:border-[#1E2E4A]">
            <h2 className="text-base font-semibold">
              {isAdmin ? 'Pending Booking Approvals' : 'Upcoming Bookings'}
            </h2>
            <Link
              to={isAdmin ? '/admin/approvals' : '/bookings/mine'}
              className="text-xs font-semibold text-[#2B4C7E] hover:underline dark:text-[#EAB308]"
            >
              Manage →
            </Link>
          </div>

          <div className="mt-3 divide-y divide-[#E5DFD3] dark:divide-[#1E2E4A]">
            {(isAdmin ? pendingApprovalList : upcomingBookings).length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                {isAdmin ? 'No pending booking requests.' : 'No upcoming room bookings.'}
              </p>
            ) : (
              (isAdmin ? pendingApprovalList : upcomingBookings).map((b) => (
                <div key={b.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">
                      {b.facilityName || `Facility #${b.facilityId}`}
                    </p>
                    <StatusText status={b.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-400">
                    {b.purpose}
                  </p>
                  <p className="mt-1 font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                    {b.bookingDate} · {b.startTime}–{b.endTime}
                    {isAdmin && b.requesterName ? ` · ${b.requesterName}` : ''}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 2: Assigned Tasks (Staff) or Recent Maintenance */}
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-5 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
          <div className="flex items-center justify-between pb-3 border-b border-[#E5DFD3] dark:border-[#1E2E4A]">
            <h2 className="text-base font-semibold">
              {isStaff ? 'Assigned Maintenance Tasks' : 'Recent Maintenance Requests'}
            </h2>
            <Link
              to={isStaff || isAdmin ? '/staff/maintenance' : '/maintenance/mine'}
              className="text-xs font-semibold text-[#2B4C7E] hover:underline dark:text-[#EAB308]"
            >
              View all →
            </Link>
          </div>

          <div className="mt-3 divide-y divide-[#E5DFD3] dark:divide-[#1E2E4A]">
            {recentMaintenance.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                No maintenance requests found.
              </p>
            ) : (
              recentMaintenance.map((m) => (
                <div key={m.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{m.title}</p>
                    <PriorityText priority={m.priority} />
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="truncate">
                      {m.facilityCode} · {m.category}
                    </span>
                    <StatusText status={m.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 3: Activity Feed & Quick Actions */}
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-5 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
          <div className="flex items-center justify-between pb-3 border-b border-[#E5DFD3] dark:border-[#1E2E4A]">
            <h2 className="text-base font-semibold">Campus Activity Feed</h2>
            <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
              Latest
            </span>
          </div>

          <div className="mt-3 space-y-3">
            {(stats?.recentActivity || []).slice(0, 5).map((act) => (
              <div key={act.id} className="text-xs">
                <p className="font-medium text-[#0F2342] dark:text-[#F5F2EB]">
                  {act.details || act.action}
                </p>
                <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                  {act.actorName || 'System'} ·{' '}
                  <span className="font-mono-tabular">
                    {new Date(act.timestamp).toLocaleDateString()}
                  </span>
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-[#E5DFD3] pt-4 dark:border-[#1E2E4A]">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2.5">
              Quick Actions
            </p>
            <div className="grid grid-cols-1 gap-2">
              <Link
                to="/facilities"
                className="flex items-center justify-between rounded-lg border border-[#E5DFD3] px-3 py-2 text-xs font-semibold hover:bg-[#FAF8F5] dark:border-[#1E2E4A] dark:hover:bg-[#16233B]"
              >
                <span className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5" />
                  Browse Campus Facilities
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              {isAdmin && (
                <Link
                  to="/admin/users"
                  className="flex items-center justify-between rounded-lg border border-[#E5DFD3] px-3 py-2 text-xs font-semibold hover:bg-[#FAF8F5] dark:border-[#1E2E4A] dark:hover:bg-[#16233B]"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Manage User Roles
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>
    </DashboardLayout>
  );
}
