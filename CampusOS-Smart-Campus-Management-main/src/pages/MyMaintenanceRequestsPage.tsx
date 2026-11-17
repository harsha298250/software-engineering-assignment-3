import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wrench, Search } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { PriorityText, StatusText } from '../components/StatusText.tsx';
import { apiRequest } from '../lib/api.ts';
import { MaintenanceWithRelations } from '../shared/types.ts';

export function MyMaintenanceRequestsPage() {
  const [requests, setRequests] = useState<MaintenanceWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{ requests: MaintenanceWithRelations[] }>(
        '/api/maintenance?scope=mine'
      );
      setRequests(data.requests);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Unable to load your maintenance requests.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (
        q &&
        !r.title.toLowerCase().includes(q) &&
        !(r.facilityName || '').toLowerCase().includes(q) &&
        !r.category.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [requests, statusFilter, search]);

  return (
    <DashboardLayout
      title="My Maintenance Requests"
      subtitle="Track repair progress, assigned technicians, and resolution remarks for issues you reported."
      actions={
        <Link
          to="/maintenance/new"
          className="inline-flex items-center gap-2 rounded-lg bg-[#0F2342] px-4 py-2 text-sm font-semibold text-[#FAF8F5] hover:bg-[#1A355E] dark:bg-[#EAB308] dark:text-[#09111E]"
        >
          <Wrench className="h-4 w-4" />
          <span>New Maintenance Ticket</span>
        </Link>
      }
    >
      <div className="rounded-xl border border-[#E5DFD3] bg-white p-4 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#FAF8F5] p-1 dark:bg-[#09111E]">
            {['ALL', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === s
                    ? 'bg-white text-[#0F2342] shadow-sm dark:bg-[#101B2E] dark:text-[#EAB308]'
                    : 'text-slate-600 hover:text-[#0F2342] dark:text-slate-400'
                }`}
              >
                {s === 'ALL' ? 'All' : s.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or facility..."
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

      <div className="mt-6 space-y-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="h-28 animate-pulse rounded-xl border border-[#E5DFD3] bg-white dark:border-[#1E2E4A] dark:bg-[#101B2E]"
            />
          ))
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-12 text-center dark:border-[#1E2E4A] dark:bg-[#101B2E]">
            <p className="font-semibold">No maintenance requests found</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Use the button above to report an issue in any campus facility.
            </p>
          </div>
        ) : (
          filtered.map((req) => (
            <div
              key={req.id}
              className="rounded-xl border border-[#E5DFD3] bg-white p-5 dark:border-[#1E2E4A] dark:bg-[#101B2E]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                    Ticket #{req.id} · {req.facilityCode} ({req.facilityName}) ·{' '}
                    {req.category} · Reported {req.reportedDate}
                  </p>
                  <h2 className="mt-1 text-base font-semibold">{req.title}</h2>
                </div>
                <div className="flex items-center gap-4">
                  <PriorityText priority={req.priority} />
                  <StatusText status={req.status} />
                </div>
              </div>

              <p className="mt-2.5 text-sm text-slate-600 dark:text-slate-300">
                {req.description}
              </p>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#E5DFD3] pt-3 text-xs dark:border-[#1E2E4A]">
                <span className="text-slate-500 dark:text-slate-400">
                  Assigned technician:{' '}
                  <strong className="text-[#0F2342] dark:text-[#F5F2EB]">
                    {req.assigneeName || 'Pending assignment'}
                  </strong>
                </span>
                {req.resolutionRemarks && (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    Resolution: {req.resolutionRemarks}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </DashboardLayout>
  );
}
