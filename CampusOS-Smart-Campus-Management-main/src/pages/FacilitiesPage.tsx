import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, ArrowRight } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { FacilityImage } from '../components/FacilityImage.tsx';
import { StatusText } from '../components/StatusText.tsx';
import { apiRequest } from '../lib/api.ts';
import { FACILITY_CATEGORIES, Facility } from '../shared/types.ts';

export function FacilitiesPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [category, setCategory] = useState('ALL');
  const [building, setBuilding] = useState('ALL');
  const [minCapacity, setMinCapacity] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    const paramSearch = searchParams.get('search') || '';
    setSearch(paramSearch);
  }, [searchParams]);

  const loadFacilities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{ facilities: Facility[] }>('/api/facilities');
      setFacilities(data.facilities);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load facilities.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFacilities();
  }, [loadFacilities]);

  const buildings = useMemo(() => {
    const set = new Set(facilities.map((f) => f.building));
    return Array.from(set).sort();
  }, [facilities]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minCap = Number(minCapacity) || 0;
    return facilities.filter((f) => {
      if (
        q &&
        !f.name.toLowerCase().includes(q) &&
        !f.code.toLowerCase().includes(q) &&
        !f.building.toLowerCase().includes(q) &&
        !f.roomNumber.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (category !== 'ALL' && f.category !== category) return false;
      if (building !== 'ALL' && f.building !== building) return false;
      if (statusFilter !== 'ALL' && f.operationalStatus !== statusFilter) return false;
      if (minCap > 0 && f.capacity < minCap) return false;
      return true;
    });
  }, [facilities, search, category, building, statusFilter, minCapacity]);

  const resetFilters = () => {
    setSearch('');
    setCategory('ALL');
    setBuilding('ALL');
    setMinCapacity('');
    setStatusFilter('ALL');
    setSearchParams({});
  };

  return (
    <DashboardLayout
      title="Campus Facilities Directory"
      subtitle="Browse lecture halls, laboratories, seminar rooms, and athletic venues across campus."
      actions={
        <Link
          to="/bookings/new"
          className="inline-flex items-center gap-2 rounded-lg bg-[#0F2342] px-4 py-2 text-sm font-semibold text-[#FAF8F5] hover:bg-[#1A355E] dark:bg-[#EAB308] dark:text-[#09111E]"
        >
          <span>Request a Booking</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      }
    >
      {/* Filter Toolbar */}
      <div className="rounded-xl border border-[#E5DFD3] bg-white p-4 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="relative md:col-span-4">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, code, or room..."
              aria-label="Search facilities"
              className="w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] py-2 pl-9 pr-3 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E] dark:focus:border-[#EAB308]"
            />
          </div>

          <div className="md:col-span-3">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filter by category"
              className="w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
            >
              <option value="ALL">All Categories</option>
              {FACILITY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              aria-label="Filter by building"
              className="w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
            >
              <option value="ALL">All Buildings</option>
              {buildings.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <input
              type="number"
              min={1}
              value={minCapacity}
              onChange={(e) => setMinCapacity(e.target.value)}
              placeholder="Min seats"
              aria-label="Minimum capacity"
              className="w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
            />
          </div>

          <div className="md:col-span-1 flex items-center justify-end">
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-semibold text-slate-600 hover:text-[#0F2342] dark:text-slate-300 dark:hover:text-[#EAB308]"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Status Segmented Tabs */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#E5DFD3] pt-3 dark:border-[#1E2E4A]">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#FAF8F5] p-1 dark:bg-[#09111E]">
            {[
              { id: 'ALL', label: 'All Statuses' },
              { id: 'OPERATIONAL', label: 'Operational' },
              { id: 'UNDER_MAINTENANCE', label: 'Under Maintenance' },
              { id: 'DISABLED', label: 'Disabled' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-white text-[#0F2342] shadow-sm dark:bg-[#101B2E] dark:text-[#EAB308]'
                    : 'text-slate-600 hover:text-[#0F2342] dark:text-slate-400 dark:hover:text-[#F5F2EB]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="font-mono-tabular">
              Showing {filtered.length} of {facilities.length} facilities
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Facility Grid */}
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-80 animate-pulse rounded-xl border border-[#E5DFD3] bg-white dark:border-[#1E2E4A] dark:bg-[#101B2E]"
            />
          ))
        ) : filtered.length === 0 ? (
          <div className="col-span-full rounded-xl border border-[#E5DFD3] bg-white p-12 text-center dark:border-[#1E2E4A] dark:bg-[#101B2E]">
            <p className="text-base font-semibold">No matching facilities found</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Adjust your search keywords, building, or capacity threshold.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 rounded-lg bg-[#0F2342] px-4 py-2 text-xs font-semibold text-[#FAF8F5] dark:bg-[#EAB308] dark:text-[#09111E]"
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          filtered.map((fac) => (
            <div
              key={fac.id}
              className="flex flex-col overflow-hidden rounded-xl border border-[#E5DFD3] bg-white transition-transform duration-150 hover:-translate-y-0.5 dark:border-[#1E2E4A] dark:bg-[#101B2E]"
            >
              <div className="aspect-[4/3] w-full overflow-hidden border-b border-[#E5DFD3] dark:border-[#1E2E4A]">
                <FacilityImage
                  imageKey={fac.imageKey}
                  alt={fac.name}
                  className="h-full w-full"
                />
              </div>

              <div className="flex flex-1 flex-col justify-between p-5">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-tabular text-xs font-medium text-slate-500 dark:text-slate-400">
                      {fac.code} · {fac.category}
                    </span>
                    <StatusText status={fac.operationalStatus} />
                  </div>
                  <h2 className="mt-1.5 text-base font-semibold text-[#0F2342] dark:text-[#F5F2EB]">
                    {fac.name}
                  </h2>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    {fac.building} · Floor {fac.floor} · Room {fac.roomNumber} ·{' '}
                    <span className="font-mono-tabular font-semibold">{fac.capacity} seats</span>
                  </p>
                  <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {fac.description}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#E5DFD3] pt-3.5 dark:border-[#1E2E4A]">
                  <Link
                    to={`/facilities/${fac.id}`}
                    className="text-xs font-semibold text-[#2B4C7E] hover:underline dark:text-[#60A5FA]"
                  >
                    Availability & Details
                  </Link>
                  {fac.operationalStatus === 'OPERATIONAL' ? (
                    <Link
                      to={`/bookings/new?facilityId=${fac.id}`}
                      className="rounded-lg bg-[#0F2342] px-3 py-1.5 text-xs font-semibold text-[#FAF8F5] hover:bg-[#1A355E] dark:bg-[#EAB308] dark:text-[#09111E]"
                    >
                      Book Room
                    </Link>
                  ) : (
                    <Link
                      to={`/maintenance/new?facilityId=${fac.id}`}
                      className="text-xs font-medium text-slate-500 hover:underline dark:text-slate-400"
                    >
                      Report Issue
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </DashboardLayout>
  );
}
