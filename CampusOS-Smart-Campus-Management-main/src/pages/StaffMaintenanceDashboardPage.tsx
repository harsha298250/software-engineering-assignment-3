import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserCheck, Wrench, X } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { PriorityText, StatusText } from '../components/StatusText.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useToast } from '../contexts/ToastContext.tsx';
import { apiRequest } from '../lib/api.ts';
import {
  AppUser,
  MAINTENANCE_PRIORITIES,
  MaintenanceWithRelations,
} from '../shared/types.ts';

export function StaffMaintenanceDashboardPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === 'ADMIN';

  const [requests, setRequests] = useState<MaintenanceWithRelations[]>([]);
  const [staffMembers, setStaffMembers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<'ACTIVE' | 'COMPLETED' | 'ALL'>('ACTIVE');

  // Assign Modal state (Admin)
  const [assignTicket, setAssignTicket] = useState<MaintenanceWithRelations | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('MEDIUM');

  // Status Update Modal state
  const [progressTicket, setProgressTicket] = useState<MaintenanceWithRelations | null>(null);
  const [nextStatus, setNextStatus] = useState('IN_PROGRESS');
  const [resolutionRemarks, setResolutionRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const maintRes = await apiRequest<{ requests: MaintenanceWithRelations[] }>(
        '/api/maintenance'
      );
      setRequests(maintRes.requests);

      if (isAdmin) {
        const usersRes = await apiRequest<{ users: AppUser[] }>(
          '/api/admin/users?role=MAINTENANCE_STAFF'
        );
        setStaffMembers(usersRes.users.filter((u) => u.accountStatus === 'ACTIVE'));
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Unable to load maintenance queue.'
      );
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const counts = useMemo(() => {
    return {
      open: requests.filter((r) => r.status === 'OPEN').length,
      assigned: requests.filter((r) => r.status === 'ASSIGNED').length,
      inProgress: requests.filter((r) => r.status === 'IN_PROGRESS').length,
      resolved: requests.filter((r) => ['RESOLVED', 'CLOSED'].includes(r.status)).length,
      highCritical: requests.filter(
        (r) =>
          ['HIGH', 'CRITICAL'].includes(r.priority) &&
          !['RESOLVED', 'CLOSED'].includes(r.status)
      ).length,
    };
  }, [requests]);

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (statusTab === 'ACTIVE') {
        return ['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(r.status);
      }
      if (statusTab === 'COMPLETED') {
        return ['RESOLVED', 'CLOSED'].includes(r.status);
      }
      return true;
    });
  }, [requests, statusTab]);

  const openAssignModal = (ticket: MaintenanceWithRelations) => {
    setAssignTicket(ticket);
    setSelectedStaffId(
      ticket.assignedTo
        ? String(ticket.assignedTo)
        : staffMembers[0]
          ? String(staffMembers[0].id)
          : ''
    );
    setSelectedPriority(ticket.priority);
  };

  const handleAssignSubmit = async () => {
    if (!assignTicket || !selectedStaffId) return;
    setSaving(true);
    try {
      await apiRequest(`/api/maintenance/${assignTicket.id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({
          assignedTo: Number(selectedStaffId),
          priority: selectedPriority,
        }),
      });
      showToast({
        title: 'Technician assigned',
        description: `Ticket #${assignTicket.id} assigned successfully.`,
        variant: 'success',
      });
      setAssignTicket(null);
      await loadData();
    } catch (err: unknown) {
      showToast({
        title: 'Assignment failed',
        description: err instanceof Error ? err.message : 'Unable to assign ticket.',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const openProgressModal = (ticket: MaintenanceWithRelations, targetStatus: string) => {
    setProgressTicket(ticket);
    setNextStatus(targetStatus);
    setResolutionRemarks(ticket.resolutionRemarks || '');
  };

  const handleProgressSubmit = async () => {
    if (!progressTicket) return;
    setSaving(true);
    try {
      await apiRequest(`/api/maintenance/${progressTicket.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextStatus,
          resolutionRemarks: resolutionRemarks.trim() || null,
        }),
      });
      showToast({
        title: 'Task status updated',
        description: `Ticket #${progressTicket.id} moved to ${nextStatus.replace('_', ' ')}.`,
        variant: 'success',
      });
      setProgressTicket(null);
      await loadData();
    } catch (err: unknown) {
      showToast({
        title: 'Status update failed',
        description: err instanceof Error ? err.message : 'Unable to update ticket.',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      title={isAdmin ? 'Maintenance Operations & Dispatch' : 'Maintenance Staff Queue'}
      subtitle={
        isAdmin
          ? 'Triage reported campus faults, assign technicians, and close resolved repairs.'
          : 'Inspect your assigned repair tasks, log progress, and submit resolution remarks.'
      }
    >
      {/* Summary Strip */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {[
          { label: 'Open Requests', value: counts.open },
          { label: 'Assigned Tasks', value: counts.assigned },
          { label: 'In Progress', value: counts.inProgress },
          { label: 'Resolved & Closed', value: counts.resolved },
          { label: 'High / Critical Open', value: counts.highCritical },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-[#E5DFD3] bg-white p-4 dark:border-[#1E2E4A] dark:bg-[#101B2E]"
          >
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {item.label}
            </p>
            <p className="mt-1.5 font-mono-tabular text-2xl font-bold">{item.value}</p>
          </div>
        ))}
      </section>

      {/* Filter Tabs */}
      <div className="mt-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 rounded-lg border border-[#E5DFD3] bg-white p-1 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
          {[
            { id: 'ACTIVE', label: 'Active Queue' },
            { id: 'COMPLETED', label: 'Completed History' },
            { id: 'ALL', label: 'All Tickets' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setStatusTab(t.id as 'ACTIVE' | 'COMPLETED' | 'ALL')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusTab === t.id
                  ? 'bg-[#0F2342] text-[#FAF8F5] dark:bg-[#EAB308] dark:text-[#09111E]'
                  : 'text-slate-600 hover:text-[#0F2342] dark:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Tickets List */}
      <div className="mt-6 space-y-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="h-32 animate-pulse rounded-xl border border-[#E5DFD3] bg-white dark:border-[#1E2E4A] dark:bg-[#101B2E]"
            />
          ))
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-12 text-center dark:border-[#1E2E4A] dark:bg-[#101B2E]">
            <Wrench className="mx-auto h-6 w-6 text-slate-400" />
            <p className="mt-2 font-semibold">No maintenance tickets in this view</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Switch tabs above to inspect completed repair history.
            </p>
          </div>
        ) : (
          filtered.map((ticket) => (
            <div
              key={ticket.id}
              className="rounded-xl border border-[#E5DFD3] bg-white p-5 dark:border-[#1E2E4A] dark:bg-[#101B2E]"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                    #{ticket.id} · {ticket.facilityCode} ({ticket.facilityName}) ·{' '}
                    {ticket.category} · Reported {ticket.reportedDate} by{' '}
                    {ticket.reporterName}
                  </p>
                  <h3 className="mt-1 text-base font-semibold">{ticket.title}</h3>
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                    {ticket.description}
                  </p>
                  {ticket.resolutionRemarks && (
                    <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      Resolution remarks: {ticket.resolutionRemarks}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
                  <div className="flex items-center gap-3">
                    <PriorityText priority={ticket.priority} />
                    <StatusText status={ticket.status} />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Technician:{' '}
                    <span className="font-semibold text-[#0F2342] dark:text-[#F5F2EB]">
                      {ticket.assigneeName || 'Unassigned'}
                    </span>
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-[#E5DFD3] pt-3 dark:border-[#1E2E4A]">
                {isAdmin && ticket.status !== 'CLOSED' && (
                  <button
                    type="button"
                    onClick={() => openAssignModal(ticket)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5DFD3] px-3 py-1.5 text-xs font-semibold hover:bg-[#FAF8F5] dark:border-[#1E2E4A] dark:hover:bg-[#16233B]"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    <span>{ticket.assignedTo ? 'Reassign Staff' : 'Assign Staff'}</span>
                  </button>
                )}

                {['OPEN', 'ASSIGNED'].includes(ticket.status) &&
                  (isAdmin || ticket.assignedTo === user?.id) && (
                    <button
                      type="button"
                      onClick={() => openProgressModal(ticket, 'IN_PROGRESS')}
                      className="rounded-lg bg-[#2B4C7E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1A355E]"
                    >
                      Start Work
                    </button>
                  )}

                {['ASSIGNED', 'IN_PROGRESS'].includes(ticket.status) &&
                  (isAdmin || ticket.assignedTo === user?.id) && (
                    <button
                      type="button"
                      onClick={() => openProgressModal(ticket, 'RESOLVED')}
                      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                    >
                      Mark Resolved
                    </button>
                  )}

                {isAdmin && ticket.status === 'RESOLVED' && (
                  <button
                    type="button"
                    onClick={() => openProgressModal(ticket, 'CLOSED')}
                    className="rounded-lg bg-[#0F2342] px-3 py-1.5 text-xs font-semibold text-[#FAF8F5] dark:bg-[#EAB308] dark:text-[#09111E]"
                  >
                    Close Ticket
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Assign Staff Modal (Admin) */}
      {assignTicket && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-[#E5DFD3] bg-white p-6 shadow-xl dark:border-[#1E2E4A] dark:bg-[#101B2E]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">
                Assign Maintenance Staff · #{assignTicket.id}
              </h3>
              <button
                type="button"
                onClick={() => setAssignTicket(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {assignTicket.title}
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium">Technician</label>
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 text-sm dark:border-[#1E2E4A] dark:bg-[#09111E]"
                >
                  {staffMembers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} ({s.department})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium">Priority</label>
                <select
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 text-sm dark:border-[#1E2E4A] dark:bg-[#09111E]"
                >
                  {MAINTENANCE_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setAssignTicket(null)}
                className="rounded-lg border border-[#E5DFD3] px-4 py-2 text-xs font-semibold dark:border-[#1E2E4A]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !selectedStaffId}
                onClick={handleAssignSubmit}
                className="rounded-lg bg-[#0F2342] px-4 py-2 text-xs font-semibold text-[#FAF8F5] disabled:opacity-50 dark:bg-[#EAB308] dark:text-[#09111E]"
              >
                {saving ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Status Modal */}
      {progressTicket && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-[#E5DFD3] bg-white p-6 shadow-xl dark:border-[#1E2E4A] dark:bg-[#101B2E]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">
                Update Ticket #{progressTicket.id} → {nextStatus.replace('_', ' ')}
              </h3>
              <button
                type="button"
                onClick={() => setProgressTicket(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium">
                {nextStatus === 'RESOLVED'
                  ? 'Resolution Remarks (Required)'
                  : 'Progress Notes (Optional)'}
              </label>
              <textarea
                rows={4}
                required={nextStatus === 'RESOLVED'}
                value={resolutionRemarks}
                onChange={(e) => setResolutionRemarks(e.target.value)}
                placeholder="Document parts replaced, diagnostics performed, or verification outcome..."
                className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 text-sm dark:border-[#1E2E4A] dark:bg-[#09111E]"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setProgressTicket(null)}
                className="rounded-lg border border-[#E5DFD3] px-4 py-2 text-xs font-semibold dark:border-[#1E2E4A]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  saving || (nextStatus === 'RESOLVED' && !resolutionRemarks.trim())
                }
                onClick={handleProgressSubmit}
                className="rounded-lg bg-[#0F2342] px-4 py-2 text-xs font-semibold text-[#FAF8F5] disabled:opacity-50 dark:bg-[#EAB308] dark:text-[#09111E]"
              >
                {saving ? 'Updating...' : 'Save Status'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
