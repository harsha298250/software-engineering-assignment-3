import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Search } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { StatusText } from '../components/StatusText.tsx';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { useToast } from '../contexts/ToastContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { BookingWithRelations } from '../shared/types.ts';

export function MyBookingsPage() {
  const { showToast } = useToast();
  const [bookings, setBookings] = useState<BookingWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [cancelTarget, setCancelTarget] = useState<BookingWithRelations | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{ bookings: BookingWithRelations[] }>(
        '/api/bookings?scope=mine'
      );
      setBookings(data.bookings);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load your bookings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookings.filter((b) => {
      if (statusFilter !== 'ALL' && b.status !== statusFilter) return false;
      if (
        q &&
        !(b.facilityName || '').toLowerCase().includes(q) &&
        !b.purpose.toLowerCase().includes(q) &&
        !b.bookingDate.includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [bookings, statusFilter, search]);

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await apiRequest(`/api/bookings/${cancelTarget.id}/cancel`, {
        method: 'PATCH',
      });
      showToast({
        title: 'Booking cancelled',
        description: `${cancelTarget.facilityName} on ${cancelTarget.bookingDate} has been cancelled.`,
        variant: 'info',
      });
      setCancelTarget(null);
      await loadBookings();
    } catch (err: unknown) {
      showToast({
        title: 'Cancellation failed',
        description: err instanceof Error ? err.message : 'Unable to cancel booking.',
        variant: 'error',
      });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <DashboardLayout
      title="My Room Bookings"
      subtitle="Track approval status, administrative remarks, and cancel upcoming reservations."
      actions={
        <Link
          to="/bookings/new"
          className="inline-flex items-center gap-2 rounded-lg bg-[#0F2342] px-4 py-2 text-sm font-semibold text-[#FAF8F5] hover:bg-[#1A355E] dark:bg-[#EAB308] dark:text-[#09111E]"
        >
          <CalendarPlus className="h-4 w-4" />
          <span>New Booking</span>
        </Link>
      }
    >
      <div className="rounded-xl border border-[#E5DFD3] bg-white p-4 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#FAF8F5] p-1 dark:bg-[#09111E]">
            {['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'].map((s) => (
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
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search purpose or room..."
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
                <th className="px-4 py-3">Facility</th>
                <th className="px-4 py-3">Date & Window</th>
                <th className="px-4 py-3">Purpose</th>
                <th className="px-4 py-3 text-right">Attendees</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Remarks</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5DFD3] dark:divide-[#1E2E4A]">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-4 py-4">
                      <div className="h-5 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <p className="font-semibold">No room bookings match your filter</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Submit a new room booking request to get started.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((b) => (
                  <tr
                    key={b.id}
                    className="hover:bg-[#FAF8F5]/70 dark:hover:bg-[#16233B]/40"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold">{b.facilityName}</p>
                      <p className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                        {b.facilityCode} · {b.facilityBuilding}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono-tabular text-xs whitespace-nowrap">
                      <p className="font-semibold">{b.bookingDate}</p>
                      <p className="text-slate-500 dark:text-slate-400">
                        {b.startTime} – {b.endTime}
                      </p>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="truncate font-medium">{b.purpose}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular">
                      {b.attendees}
                    </td>
                    <td className="px-4 py-3">
                      <StatusText status={b.status} />
                    </td>
                    <td className="px-4 py-3 max-w-xs text-xs text-slate-600 dark:text-slate-400">
                      {b.approvalRemarks || '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {['PENDING', 'APPROVED'].includes(b.status) ? (
                        <button
                          type="button"
                          onClick={() => setCancelTarget(b)}
                          className="rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                        >
                          Cancel
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel room booking?"
        description={
          cancelTarget
            ? `Are you sure you want to cancel your reservation for ${cancelTarget.facilityName} on ${cancelTarget.bookingDate} (${cancelTarget.startTime}–${cancelTarget.endTime})?`
            : ''
        }
        confirmLabel="Cancel Booking"
        destructive
        loading={cancelling}
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </DashboardLayout>
  );
}
