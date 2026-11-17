import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, Wrench, Clock } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { FacilityImage } from '../components/FacilityImage.tsx';
import { StatusText } from '../components/StatusText.tsx';
import { apiRequest } from '../lib/api.ts';
import { Facility } from '../shared/types.ts';

interface BookedSlot {
  id: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  purpose: string;
  status: string;
}

export function FacilityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [facility, setFacility] = useState<Facility | null>(null);
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{
        facility: Facility;
        date: string;
        bookedSlots: BookedSlot[];
      }>(`/api/facilities/${id}?date=${encodeURIComponent(date)}`);
      setFacility(res.facility);
      setBookedSlots(res.bookedSlots);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load facility details.');
    } finally {
      setLoading(false);
    }
  }, [id, date]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  return (
    <DashboardLayout
      title={facility ? `${facility.code} · ${facility.name}` : 'Facility Details'}
      actions={
        <Link
          to="/facilities"
          className="inline-flex items-center gap-2 rounded-lg border border-[#E5DFD3] bg-white px-3.5 py-2 text-xs font-semibold hover:bg-[#F3EFE7] dark:border-[#1E2E4A] dark:bg-[#101B2E]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Directory</span>
        </Link>
      }
    >
      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {loading && !facility ? (
        <div className="h-96 animate-pulse rounded-xl border border-[#E5DFD3] bg-white dark:border-[#1E2E4A] dark:bg-[#101B2E]" />
      ) : facility ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Photo + Overview */}
          <div className="lg:col-span-7 space-y-6">
            <div className="overflow-hidden rounded-xl border border-[#E5DFD3] bg-white dark:border-[#1E2E4A] dark:bg-[#101B2E]">
              <div className="aspect-[16/10] w-full overflow-hidden border-b border-[#E5DFD3] dark:border-[#1E2E4A]">
                <FacilityImage
                  imageKey={facility.imageKey}
                  alt={facility.name}
                  className="h-full w-full"
                />
              </div>

              <div className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono-tabular text-xs font-medium text-slate-500 dark:text-slate-400">
                    {facility.code} · {facility.category}
                  </span>
                  <StatusText status={facility.operationalStatus} />
                </div>

                <h2 className="mt-2 font-display text-2xl font-semibold">
                  {facility.name}
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {facility.building} · Floor {facility.floor} · Room {facility.roomNumber} ·{' '}
                  <span className="font-mono-tabular font-semibold">
                    {facility.capacity} seats
                  </span>
                </p>

                <p className="mt-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {facility.description}
                </p>

                <div className="mt-6 border-t border-[#E5DFD3] pt-4 dark:border-[#1E2E4A]">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Installed Equipment & Amenities
                  </p>
                  <p className="mt-2 text-sm text-[#0F2342] dark:text-[#F5F2EB]">
                    {(facility.amenities || []).length > 0
                      ? facility.amenities.join(' · ')
                      : 'Standard campus classroom furnishings'}
                  </p>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {facility.operationalStatus === 'OPERATIONAL' && (
                    <Link
                      to={`/bookings/new?facilityId=${facility.id}&date=${date}`}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#0F2342] px-4 py-2.5 text-sm font-semibold text-[#FAF8F5] hover:bg-[#1A355E] dark:bg-[#EAB308] dark:text-[#09111E]"
                    >
                      <CalendarPlus className="h-4 w-4" />
                      <span>Book This Facility</span>
                    </Link>
                  )}
                  <Link
                    to={`/maintenance/new?facilityId=${facility.id}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#E5DFD3] px-4 py-2.5 text-sm font-semibold hover:bg-[#FAF8F5] dark:border-[#1E2E4A] dark:hover:bg-[#16233B]"
                  >
                    <Wrench className="h-4 w-4" />
                    <span>Report Maintenance Issue</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live Schedule & Availability */}
          <div className="lg:col-span-5">
            <div className="rounded-xl border border-[#E5DFD3] bg-white p-6 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
              <div className="flex items-center justify-between gap-3 border-b border-[#E5DFD3] pb-4 dark:border-[#1E2E4A]">
                <div>
                  <h3 className="text-base font-semibold">Daily Slot Schedule</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Operating hours: 07:00 – 21:00
                  </p>
                </div>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="Select schedule date"
                  className="rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-1.5 font-mono-tabular text-xs focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
                />
              </div>

              <div className="mt-4">
                {facility.operationalStatus !== 'OPERATIONAL' ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                    This facility is currently marked{' '}
                    <strong>{facility.operationalStatus.replace('_', ' ')}</strong> and cannot accept new reservations.
                  </div>
                ) : bookedSlots.length === 0 ? (
                  <div className="py-8 text-center">
                    <Clock className="mx-auto h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                    <p className="mt-2 text-sm font-semibold">Open all day on {date}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      No approved or pending bookings overlap this date.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Reserved & Pending Intervals ({date})
                    </p>
                    {bookedSlots.map((slot) => (
                      <div
                        key={slot.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3.5 py-2.5 dark:border-[#1E2E4A] dark:bg-[#09111E]"
                      >
                        <div className="min-w-0">
                          <p className="font-mono-tabular text-xs font-semibold">
                            {slot.startTime} – {slot.endTime}
                          </p>
                          <p className="truncate text-xs text-slate-600 dark:text-slate-400">
                            {slot.purpose}
                          </p>
                        </div>
                        <StatusText status={slot.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
