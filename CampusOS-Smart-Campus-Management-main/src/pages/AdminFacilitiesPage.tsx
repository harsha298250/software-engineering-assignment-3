import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { StatusText } from '../components/StatusText.tsx';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { useToast } from '../contexts/ToastContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { FACILITY_CATEGORIES, Facility } from '../shared/types.ts';

interface FacilityFormState {
  code: string;
  name: string;
  category: string;
  building: string;
  floor: string;
  roomNumber: string;
  capacity: string;
  description: string;
  amenitiesText: string;
  imageKey: 'lecture_hall' | 'computer_lab' | 'auditorium' | 'sports_complex';
  operationalStatus: 'OPERATIONAL' | 'UNDER_MAINTENANCE' | 'DISABLED';
}

const emptyForm: FacilityFormState = {
  code: '',
  name: '',
  category: FACILITY_CATEGORIES[0],
  building: '',
  floor: '1',
  roomNumber: '',
  capacity: '40',
  description: '',
  amenitiesText: '4K Projector, Whiteboard, Wi-Fi 6E',
  imageKey: 'lecture_hall',
  operationalStatus: 'OPERATIONAL',
};

export function AdminFacilitiesPage() {
  const { showToast } = useToast();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Facility | null>(null);
  const [form, setForm] = useState<FacilityFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Facility | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadFacilities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ facilities: Facility[] }>('/api/facilities');
      setFacilities(res.facilities);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load facilities.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFacilities();
  }, [loadFacilities]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (fac: Facility) => {
    setEditing(fac);
    setForm({
      code: fac.code,
      name: fac.name,
      category: fac.category,
      building: fac.building,
      floor: String(fac.floor),
      roomNumber: fac.roomNumber,
      capacity: String(fac.capacity),
      description: fac.description,
      amenitiesText: (fac.amenities || []).join(', '),
      imageKey:
        (fac.imageKey as FacilityFormState['imageKey']) || 'lecture_hall',
      operationalStatus: fac.operationalStatus,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      category: form.category,
      building: form.building.trim(),
      floor: Number(form.floor),
      roomNumber: form.roomNumber.trim(),
      capacity: Number(form.capacity),
      description: form.description.trim(),
      amenities: form.amenitiesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      imageKey: form.imageKey,
      operationalStatus: form.operationalStatus,
    };

    try {
      if (editing) {
        await apiRequest(`/api/facilities/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast({
          title: 'Facility updated',
          description: `${payload.code} (${payload.name}) saved.`,
          variant: 'success',
        });
      } else {
        await apiRequest('/api/facilities', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast({
          title: 'Facility created',
          description: `${payload.code} (${payload.name}) added to registry.`,
          variant: 'success',
        });
      }
      setModalOpen(false);
      await loadFacilities();
    } catch (err: unknown) {
      showToast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unable to save facility.',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStatus = async (
    fac: Facility,
    operationalStatus: FacilityFormState['operationalStatus']
  ) => {
    try {
      await apiRequest(`/api/facilities/${fac.id}`, {
        method: 'PUT',
        body: JSON.stringify({ operationalStatus }),
      });
      showToast({
        title: 'Status updated',
        description: `${fac.code} is now ${operationalStatus.replace('_', ' ').toLowerCase()}.`,
        variant: 'success',
      });
      await loadFacilities();
    } catch (err: unknown) {
      showToast({
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Unable to update status.',
        variant: 'error',
      });
    }
  };

  const handleDeleteOrArchive = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiRequest<{ archived: boolean }>(
        `/api/facilities/${deleteTarget.id}`,
        { method: 'DELETE' }
      );
      showToast({
        title: res.archived ? 'Facility archived' : 'Facility deleted',
        description: res.archived
          ? `${deleteTarget.code} has active bookings so it was disabled safely.`
          : `${deleteTarget.code} removed from campus registry.`,
        variant: 'info',
      });
      setDeleteTarget(null);
      await loadFacilities();
    } catch (err: unknown) {
      showToast({
        title: 'Action failed',
        description: err instanceof Error ? err.message : 'Unable to remove facility.',
        variant: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <DashboardLayout
      title="Admin Facility Management"
      subtitle="Add campus venues, update capacities, or place rooms under maintenance."
      actions={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0F2342] px-4 py-2 text-sm font-semibold text-[#FAF8F5] hover:bg-[#1A355E] dark:bg-[#EAB308] dark:text-[#09111E]"
        >
          <Plus className="h-4 w-4" />
          <span>Add Facility</span>
        </button>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[#E5DFD3] bg-white dark:border-[#1E2E4A] dark:bg-[#101B2E]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#E5DFD3] bg-[#FAF8F5] text-xs font-semibold text-slate-600 dark:border-[#1E2E4A] dark:bg-[#09111E] dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">Code & Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3 text-right">Capacity</th>
                <th className="px-4 py-3">Operational Status</th>
                <th className="px-4 py-3 text-right">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5DFD3] dark:divide-[#1E2E4A]">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-4">
                      <div className="h-5 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))
              ) : (
                facilities.map((f) => (
                  <tr key={f.id} className="hover:bg-[#FAF8F5]/70 dark:hover:bg-[#16233B]/40">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{f.name}</p>
                      <p className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                        {f.code}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs">{f.category}</td>
                    <td className="px-4 py-3 text-xs">
                      {f.building} · Floor {f.floor} · Rm {f.roomNumber}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-semibold">
                      {f.capacity}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusText status={f.operationalStatus} />
                        <select
                          aria-label={`Change operational status for ${f.name}`}
                          value={f.operationalStatus}
                          onChange={(e) =>
                            handleQuickStatus(
                              f,
                              e.target.value as FacilityFormState['operationalStatus']
                            )
                          }
                          className="rounded border border-[#E5DFD3] bg-[#FAF8F5] px-2 py-1 text-xs dark:border-[#1E2E4A] dark:bg-[#09111E]"
                        >
                          <option value="OPERATIONAL">Operational</option>
                          <option value="UNDER_MAINTENANCE">Maintenance</option>
                          <option value="DISABLED">Disabled</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(f)}
                          aria-label={`Edit ${f.name}`}
                          className="rounded-lg border border-[#E5DFD3] p-1.5 hover:bg-[#FAF8F5] dark:border-[#1E2E4A] dark:hover:bg-[#16233B]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(f)}
                          aria-label={`Delete or archive ${f.name}`}
                          className="rounded-lg border border-red-300 p-1.5 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
        >
          <div className="w-full max-w-xl rounded-xl border border-[#E5DFD3] bg-white p-6 shadow-xl dark:border-[#1E2E4A] dark:bg-[#101B2E]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">
                {editing ? `Edit Facility · ${editing.code}` : 'Add Campus Facility'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium">Facility Code</label>
                  <input
                    type="text"
                    required
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="FAC-115"
                    className="mt-1 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 font-mono-tabular text-sm dark:border-[#1E2E4A] dark:bg-[#09111E]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium">Facility Name</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="AI Systems Research Hall"
                    className="mt-1 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 text-sm dark:border-[#1E2E4A] dark:bg-[#09111E]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 text-sm dark:border-[#1E2E4A] dark:bg-[#09111E]"
                  >
                    {FACILITY_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium">Building</label>
                  <input
                    type="text"
                    required
                    value={form.building}
                    onChange={(e) => setForm({ ...form, building: e.target.value })}
                    placeholder="Engineering West"
                    className="mt-1 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 text-sm dark:border-[#1E2E4A] dark:bg-[#09111E]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="block text-xs font-medium">Floor</label>
                  <input
                    type="number"
                    required
                    value={form.floor}
                    onChange={(e) => setForm({ ...form, floor: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 font-mono-tabular text-sm dark:border-[#1E2E4A] dark:bg-[#09111E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Room No.</label>
                  <input
                    type="text"
                    required
                    value={form.roomNumber}
                    onChange={(e) => setForm({ ...form, roomNumber: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 font-mono-tabular text-sm dark:border-[#1E2E4A] dark:bg-[#09111E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Capacity</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 font-mono-tabular text-sm dark:border-[#1E2E4A] dark:bg-[#09111E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Visual Preset</label>
                  <select
                    value={form.imageKey}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        imageKey: e.target.value as FacilityFormState['imageKey'],
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-2 py-2 text-xs dark:border-[#1E2E4A] dark:bg-[#09111E]"
                  >
                    <option value="lecture_hall">Lecture Hall</option>
                    <option value="computer_lab">Computer Lab</option>
                    <option value="auditorium">Auditorium</option>
                    <option value="sports_complex">Sports Venue</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium">Description</label>
                <textarea
                  rows={2}
                  required
                  minLength={10}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 text-sm dark:border-[#1E2E4A] dark:bg-[#09111E]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium">
                  Amenities (comma-separated)
                </label>
                <input
                  type="text"
                  value={form.amenitiesText}
                  onChange={(e) => setForm({ ...form, amenitiesText: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 text-sm dark:border-[#1E2E4A] dark:bg-[#09111E]"
                />
              </div>

              <div className="pt-3 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-[#E5DFD3] px-4 py-2 text-xs font-semibold dark:border-[#1E2E4A]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#0F2342] px-4 py-2 text-xs font-semibold text-[#FAF8F5] disabled:opacity-50 dark:bg-[#EAB308] dark:text-[#09111E]"
                >
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Facility'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remove or archive facility?"
        description={
          deleteTarget
            ? `If ${deleteTarget.name} has active or pending bookings, it will be safely disabled instead of deleted.`
            : ''
        }
        confirmLabel="Remove Facility"
        destructive
        loading={deleting}
        onConfirm={handleDeleteOrArchive}
        onCancel={() => setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}
