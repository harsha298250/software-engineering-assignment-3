import { useCallback, useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Download } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useToast } from '../contexts/ToastContext.tsx';
import { apiRequest, downloadCsvReport } from '../lib/api.ts';

interface AnalyticsPayload {
  monthlyBookingTrends: Array<{ month: string; total: number; approved: number }>;
  bookingStatusDistribution: Array<{ status: string; count: number }>;
  facilityUtilization: Array<{
    name: string;
    fullName: string;
    category: string;
    bookings: number;
    capacity: number;
  }>;
  maintenanceByCategory: Array<{ category: string; count: number }>;
  maintenanceCompletionTrends: Array<{
    month: string;
    reported: number;
    resolved: number;
  }>;
}

interface AuditLogRow {
  id: number;
  action: string;
  entityType: string;
  entityId: number;
  details: string | null;
  timestamp: string;
  actorName: string | null;
  actorEmail: string | null;
}

const CHART_COLORS = ['#0F2342', '#0D9488', '#D97706', '#64748B', '#B91C1C'];

export function ReportsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === 'ADMIN';

  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<AnalyticsPayload>('/api/dashboard/analytics');
      setAnalytics(data);
      if (isAdmin) {
        const logsRes = await apiRequest<{ auditLogs: AuditLogRow[] }>(
          '/api/admin/audit-logs'
        );
        setAuditLogs(logsRes.auditLogs);
      }
    } catch (err: unknown) {
      showToast({
        title: 'Failed to load analytics',
        description: err instanceof Error ? err.message : 'Unable to fetch report data.',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, showToast]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleExport = async (dataset: 'bookings' | 'maintenance') => {
    setExporting(dataset);
    try {
      await downloadCsvReport(dataset);
      showToast({
        title: 'CSV Export Downloaded',
        description: `Exported ${dataset} operational dataset.`,
        variant: 'success',
      });
    } catch (err: unknown) {
      showToast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Unable to export CSV.',
        variant: 'error',
      });
    } finally {
      setExporting(null);
    }
  };

  return (
    <DashboardLayout
      title="Reports & Operational Analytics"
      subtitle="Live Cloud Firestore utilization metrics, maintenance category breakdowns, and CSV exports."
      actions={
        isAdmin ? (
          <>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => handleExport('bookings')}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0F2342] px-3.5 py-2 text-xs font-semibold text-[#FAF8F5] hover:bg-[#1A355E] disabled:opacity-50 dark:bg-[#EAB308] dark:text-[#09111E]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{exporting === 'bookings' ? 'Exporting...' : 'Export Bookings CSV'}</span>
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => handleExport('maintenance')}
              className="inline-flex items-center gap-2 rounded-lg border border-[#E5DFD3] bg-white px-3.5 py-2 text-xs font-semibold hover:bg-[#F3EFE7] disabled:opacity-50 dark:border-[#1E2E4A] dark:bg-[#101B2E]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>
                {exporting === 'maintenance' ? 'Exporting...' : 'Export Maintenance CSV'}
              </span>
            </button>
          </>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Monthly Booking Trends */}
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-5 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
          <h2 className="text-base font-semibold">Monthly Room Booking Trends</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Total booking submissions compared against approved sessions
          </p>
          <div className="mt-4 h-64">
            {loading ? (
              <div className="h-full animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics?.monthlyBookingTrends || []}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Total Bookings"
                    stroke="#0F2342"
                    fill="#2B4C7E"
                    fillOpacity={0.2}
                  />
                  <Area
                    type="monotone"
                    dataKey="approved"
                    name="Approved / Completed"
                    stroke="#0D9488"
                    fill="#0D9488"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Booking Status Distribution */}
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-5 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
          <h2 className="text-base font-semibold">Booking Status Distribution</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Breakdown across Pending, Approved, Completed, Rejected, and Cancelled
          </p>
          <div className="mt-4 h-64">
            {loading ? (
              <div className="h-full animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics?.bookingStatusDistribution || []}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={84}
                    paddingAngle={3}
                  >
                    {(analytics?.bookingStatusDistribution || []).map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Facility Utilization */}
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-5 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
          <h2 className="text-base font-semibold">Facility Utilization (Top Rooms)</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Active and historical reservation counts by campus facility code
          </p>
          <div className="mt-4 h-64">
            {loading ? (
              <div className="h-full animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics?.facilityUtilization || []}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar
                    dataKey="bookings"
                    name="Reservations"
                    fill="#2B4C7E"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Maintenance Requests by Category */}
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-5 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
          <h2 className="text-base font-semibold">Maintenance Requests by Category</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Distribution of reported faults across technical trades
          </p>
          <div className="mt-4 h-64">
            {loading ? (
              <div className="h-full animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics?.maintenanceByCategory || []}
                  layout="vertical"
                  margin={{ left: 24 }}
                >
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={120}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    name="Tickets"
                    fill="#0D9488"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Audit Log Trail (Admin) */}
      {isAdmin && (
        <section className="mt-6 rounded-xl border border-[#E5DFD3] bg-white dark:border-[#1E2E4A] dark:bg-[#101B2E]">
          <div className="border-b border-[#E5DFD3] px-5 py-4 dark:border-[#1E2E4A]">
            <h2 className="text-base font-semibold">Campus Audit Log</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Immutable trail of administrative approvals, role changes, and ticket transitions
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E5DFD3] bg-[#FAF8F5] text-slate-600 dark:border-[#1E2E4A] dark:bg-[#09111E] dark:text-slate-300">
                <tr>
                  <th className="px-4 py-2.5">Timestamp</th>
                  <th className="px-4 py-2.5">Actor</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Entity</th>
                  <th className="px-4 py-2.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5DFD3] dark:divide-[#1E2E4A]">
                {auditLogs.slice(0, 15).map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-2.5 font-mono-tabular whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 font-medium">
                      {log.actorName || 'System'}
                    </td>
                    <td className="px-4 py-2.5 font-mono-tabular font-semibold">
                      {log.action}
                    </td>
                    <td className="px-4 py-2.5 font-mono-tabular">
                      {log.entityType} #{log.entityId}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                      {log.details || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </DashboardLayout>
  );
}
