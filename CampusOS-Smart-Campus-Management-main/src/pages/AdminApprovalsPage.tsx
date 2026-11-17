import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { StatusText } from '../components/StatusText.tsx';
import { useToast } from '../contexts/ToastContext.tsx';
import { ApiError, apiRequest } from '../lib/api.ts';
import { BookingWithRelations, Facility } from '../shared/types.ts';

export function AdminApprovalsPage() {
  const { showToast } = useToast();
  const [bookings, setBookings] = useState<BookingWithRelations[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflictBanner, setConflictBanner] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [facilityFilter, setFacilityFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');

  // Decision modal
  const [modalMode, setModalMode] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<BookingWithRelations | null>(null);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bookRes, facRes] = await Promise.all([
        apiRequest<{ bookings: BookingWithRelations[] }>('/api/bookings'),
        apiRequest<{ facilities: Facility[] }>('/api/facilities'),
      ]);
      setBookings(bookRes.bookings);
      setFacilities(facRes.facilities);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load booking requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (statusFilter !== 'ALL' && b.status !== statusFilter) return false;
      if (facilityFilter !== 'ALL' && String(b.facilityId) !== facilityFilter) return false;
      if (dateFilter && b.bookingDate !== dateFilter) return false;
      return true;
    });
  }, [bookings, statusFilter, facilityFilter, dateFilter]);

  const openModal = (booking: BookingWithRelations, mode: 'APPROVE' | 'REJECT') => {
    setSelectedBooking(booking);
    setModalMode(mode);
    setRemarks('');
    setConflictBanner(null);
  };

  const handleDecision = async () => {
    if (!selectedBooking || !modalMode) return;
    setSubmitting(true);
    setConflictBanner(null);
    try {
      const endpoint =
        modalMode === 'APPROVE'
          ? `/api/bookings/${selectedBooking.id}/approve`
          : `/api/bookings/${selectedBooking.id}/reject`;

      await apiRequest(endpoint, {
        method: 'PATCH',
        body: JSON.stringify({ approvalRemarks: remarks.trim() }),
      });

      showToast({
        title: modalMode === 'APPROVE' ? 'Booking approved' : 'Booking rejected',
        description: `Reservation #${selectedBooking.id} for ${selectedBooking.facilityName} updated.`,
        variant: modalMode === 'APPROVE' ? 'success' : 'info',
      });
      setModalMode(null);
      setSelectedBooking(null);
      await loadData();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictBanner(err.message);
        showToast({
          title: 'Booking Conflict (409)',
          description: err.message,
          variant: 'error',
        });
      } else {
        showToast({
          title: 'Action failed',
          description: err instanceof Error ? err.message : 'Unable to process decision.',
          variant: 'error',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout
      title="Booking Approvals & Ledger"
      subtitle="Review room reservation requests with atomic Cloud Firestore overlap locking."
    >
      {/* Filters */}
      <div className="rounded-xl border border-[#E5DFD3] bg-white p-4 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12 items-center">
          <div className="md:col-span-6 flex flex-wrap gap-1 rounded-lg bg-[#FAF8F5] p-1 dark:bg-[#09111E]">
            {['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ALL'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  statusFilter === s
                    ? 'bg-white text-[#0F2342] shadow-sm dark:bg-[#101B2E] dark:text-[#EAB308]'
                    : 'text-slate-600 hover:text-[#0F2342] dark:text-slate-400'
                }`}
              >
                {s === 'ALL' ? 'All Records' : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <div className="md:col-span-3">
            <select
              value={facilityFilter}
              onChange={(e) => setFacilityFilter(e.target.value)}
              aria-label="Filter by facility"
              className="w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 text-xs dark:border-[#1E2E4A] dark:bg-[#09111E]"
            >
              <option value="ALL">All Facilities</option>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.code} — {f.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3 flex items-center gap-2">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              aria-label="Filter by date"
              className="w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-1.5 font-mono-tabular text-xs dark:border-[#1E2E4A] dark:bg-[#09111E]"
            />
            {dateFilter && (
              <button
                type="button"
                onClick={() => setDateFilter('')}
                className="text-xs font-semibold text-slate-500 hover:text-[#0F2342] dark:hover:text-[#EAB308]"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {conflictBanner && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{conflictBanner}</span>
        </div>
      )}

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
                <th className="px-4 py-3">Requester</th>
                <th className="px-4 py-3">Date & Window</th>
                <th className="px-4 py-3">Purpose</th>
                <th className="px-4 py-3 text-right">Seats</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
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
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                    No booking requests match the active filters.
                  </td>
                </tr>
              ) : (
                filtered.map((b) => (
                  <tr key={b.id} className="hover:bg-[#FAF8F5]/70 dark:hover:bg-[#16233B]/40">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{b.facilityName}</p>
                      <p className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                        {b.facilityCode} · {b.facilityBuilding}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{b.requesterName}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {b.requesterEmail}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono-tabular text-xs whitespace-nowrap">
                      <p className="font-semibold">{b.bookingDate}</p>
                      <p className="text-slate-500 dark:text-slate-400">
                        {b.startTime} – {b.endTime}
                      </p>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="truncate">{b.purpose}</p>
                      {b.remarks && (
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          Note: {b.remarks}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular">
                      {b.attendees}/{b.facilityCapacity}
                    </td>
                    <td className="px-4 py-3">
                      <StatusText status={b.status} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {b.status === 'PENDING' ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openModal(b, 'APPROVE')}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>Approve</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openModal(b, 'REJECT')}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                          >
                            <X className="h-3.5 w-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {b.approverName ? `By ${b.approverName}` : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Decision Modal */}
      {modalMode && selectedBooking && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-[#E5DFD3] bg-white p-6 shadow-xl dark:border-[#1E2E4A] dark:bg-[#101B2E]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">
                {modalMode === 'APPROVE'
                  ? `Approve Booking #${selectedBooking.id}`
                  : `Reject Booking #${selectedBooking.id}`}
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
              {selectedBooking.facilityName} · {selectedBooking.bookingDate} (
              {selectedBooking.startTime}–{selectedBooking.endTime})
            </p>

            {conflictBanner && (
              <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                {conflictBanner}
              </div>
            )}

            <div className="mt-4">
              <label className="block text-sm font-medium">
                {modalMode === 'REJECT'
                  ? 'Rejection Reason (Required)'
                  : 'Approval Remarks (Optional)'}
              </label>
              <textarea
                rows={3}
                required={modalMode === 'REJECT'}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder={
                  modalMode === 'REJECT'
                    ? 'State why this reservation could not be accommodated...'
                    : 'Optional confirmation note for the requester...'
                }
                className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 text-sm dark:border-[#1E2E4A] dark:bg-[#09111E]"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="rounded-lg border border-[#E5DFD3] px-4 py-2 text-xs font-semibold dark:border-[#1E2E4A]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  submitting || (modalMode === 'REJECT' && remarks.trim().length < 3)
                }
                onClick={handleDecision}
                className={`rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 ${
                  modalMode === 'APPROVE'
                    ? 'bg-emerald-700 hover:bg-emerald-800'
                    : 'bg-red-700 hover:bg-red-800'
                }`}
              >
                {submitting
                  ? 'Processing...'
                  : modalMode === 'APPROVE'
                    ? 'Confirm Approval'
                    : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
