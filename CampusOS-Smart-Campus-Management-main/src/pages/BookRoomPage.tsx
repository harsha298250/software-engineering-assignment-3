import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarCheck, Clock } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { StatusText } from '../components/StatusText.tsx';
import { useToast } from '../contexts/ToastContext.tsx';
import { ApiError, apiRequest } from '../lib/api.ts';
import { Facility } from '../shared/types.ts';

interface SlotPreview {
  id: number;
  startTime: string;
  endTime: string;
  status: string;
  purpose: string;
}

export function BookRoomPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityId, setFacilityId] = useState(searchParams.get('facilityId') || '');
  const [bookingDate, setBookingDate] = useState(
    searchParams.get('date') || new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  );
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const [purpose, setPurpose] = useState('');
  const [attendees, setAttendees] = useState('20');
  const [remarks, setRemarks] = useState('');

  const [slots, setSlots] = useState<SlotPreview[]>([]);
  const [loadingFacilities, setLoadingFacilities] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ facilities: Facility[] }>('/api/facilities')
      .then((res) => {
        const operational = res.facilities.filter(
          (f) => f.operationalStatus === 'OPERATIONAL'
        );
        setFacilities(operational);
        if (!facilityId && operational.length > 0) {
          setFacilityId(String(operational[0].id));
        }
      })
      .catch((err) => {
        setFormError(err instanceof Error ? err.message : 'Failed to load facilities.');
      })
      .finally(() => setLoadingFacilities(false));
  }, [facilityId]);

  useEffect(() => {
    if (!facilityId || !bookingDate) return;
    apiRequest<{ bookedSlots: SlotPreview[] }>(
      `/api/facilities/${facilityId}?date=${encodeURIComponent(bookingDate)}`
    )
      .then((res) => setSlots(res.bookedSlots))
      .catch(() => setSlots([]));
  }, [facilityId, bookingDate]);

  const selectedFacility = useMemo(
    () => facilities.find((f) => String(f.id) === facilityId) || null,
    [facilities, facilityId]
  );

  const hasApprovedOverlap = useMemo(() => {
    return slots.some(
      (s) =>
        s.status === 'APPROVED' && startTime < s.endTime && endTime > s.startTime
    );
  }, [slots, startTime, endTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (startTime >= endTime) {
      setFormError('Start time must be earlier than end time.');
      return;
    }

    const attendeeCount = Number(attendees);
    if (selectedFacility && attendeeCount > selectedFacility.capacity) {
      setFormError(
        `Attendee count (${attendeeCount}) exceeds ${selectedFacility.name} capacity (${selectedFacility.capacity} seats).`
      );
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          facilityId: Number(facilityId),
          bookingDate,
          startTime,
          endTime,
          purpose: purpose.trim(),
          attendees: attendeeCount,
          remarks: remarks.trim() || null,
        }),
      });
      showToast({
        title: 'Booking request submitted',
        description: 'Your reservation is now awaiting administrator approval.',
        variant: 'success',
      });
      navigate('/bookings/mine');
    } catch (err: unknown) {
      const message =
        err instanceof ApiError && err.status === 409
          ? `Slot conflict (409): ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Unable to submit booking request.';
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout
      title="Room Booking Request"
      subtitle="Select an operational campus venue and check live slot availability before submitting."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-6 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
            <h2 className="text-base font-semibold">Reservation Details</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              All reservations are submitted as Pending and reviewed by Campus Administration.
            </p>

            {formError && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="facilityId" className="block text-sm font-medium">
                  Facility
                </label>
                <select
                  id="facilityId"
                  required
                  disabled={loadingFacilities}
                  value={facilityId}
                  onChange={(e) => setFacilityId(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3.5 py-2.5 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
                >
                  {facilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.code} — {f.name} ({f.building} · {f.capacity} seats)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="bookingDate" className="block text-sm font-medium">
                    Booking Date
                  </label>
                  <input
                    id="bookingDate"
                    type="date"
                    required
                    min={new Date().toISOString().slice(0, 10)}
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 font-mono-tabular text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
                  />
                </div>
                <div>
                  <label htmlFor="startTime" className="block text-sm font-medium">
                    Start Time
                  </label>
                  <input
                    id="startTime"
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 font-mono-tabular text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
                  />
                </div>
                <div>
                  <label htmlFor="endTime" className="block text-sm font-medium">
                    End Time
                  </label>
                  <input
                    id="endTime"
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 font-mono-tabular text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label htmlFor="purpose" className="block text-sm font-medium">
                    Booking Purpose
                  </label>
                  <input
                    id="purpose"
                    type="text"
                    required
                    minLength={5}
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="e.g., CS-302 Distributed Systems Workshop"
                    className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3.5 py-2.5 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
                  />
                </div>
                <div>
                  <label htmlFor="attendees" className="block text-sm font-medium">
                    Attendees
                  </label>
                  <input
                    id="attendees"
                    type="number"
                    required
                    min={1}
                    max={selectedFacility?.capacity || 5000}
                    value={attendees}
                    onChange={(e) => setAttendees(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3.5 py-2.5 font-mono-tabular text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
                  />
                  {selectedFacility && (
                    <p className="mt-1 font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
                      Max {selectedFacility.capacity} seats
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="remarks" className="block text-sm font-medium">
                  Additional Remarks (Optional)
                </label>
                <textarea
                  id="remarks"
                  rows={3}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="AV setup, podium mic, or seating configuration notes..."
                  className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3.5 py-2.5 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
                />
              </div>

              {hasApprovedOverlap && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  Warning: Your chosen window overlaps an already approved booking on {bookingDate}. Choose an open slot to avoid a 409 conflict.
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || loadingFacilities}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0F2342] px-5 py-2.5 text-sm font-semibold text-[#FAF8F5] hover:bg-[#1A355E] disabled:opacity-60 dark:bg-[#EAB308] dark:text-[#09111E]"
                >
                  <CalendarCheck className="h-4 w-4" />
                  <span>{submitting ? 'Submitting...' : 'Submit Booking Request'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Live Availability Panel */}
        <div className="lg:col-span-5">
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-6 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
            <h3 className="text-base font-semibold">
              Availability Check · {bookingDate}
            </h3>
            {selectedFacility && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {selectedFacility.name} · {selectedFacility.building} · {selectedFacility.capacity}{' '}
                seats
              </p>
            )}

            <div className="mt-4 border-t border-[#E5DFD3] pt-4 dark:border-[#1E2E4A]">
              {slots.length === 0 ? (
                <div className="py-6 text-center">
                  <Clock className="mx-auto h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <p className="mt-2 text-sm font-semibold">All time slots currently open</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    No approved or pending bookings exist on {bookingDate}.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {slots.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 dark:border-[#1E2E4A] dark:bg-[#09111E]"
                    >
                      <div className="min-w-0">
                        <p className="font-mono-tabular text-xs font-semibold">
                          {s.startTime} – {s.endTime}
                        </p>
                        <p className="truncate text-xs text-slate-600 dark:text-slate-400">
                          {s.purpose}
                        </p>
                      </div>
                      <StatusText status={s.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
