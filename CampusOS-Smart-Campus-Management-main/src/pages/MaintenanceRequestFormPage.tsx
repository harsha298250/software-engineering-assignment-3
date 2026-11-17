import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Wrench, AlertTriangle } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { useToast } from '../contexts/ToastContext.tsx';
import { apiRequest } from '../lib/api.ts';
import {
  Facility,
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_PRIORITIES,
} from '../shared/types.ts';

export function MaintenanceRequestFormPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityId, setFacilityId] = useState(searchParams.get('facilityId') || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(MAINTENANCE_CATEGORIES[0]);
  const [priority, setPriority] = useState<string>('MEDIUM');
  const [reportedDate, setReportedDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [attachmentNote, setAttachmentNote] = useState('');

  const [loadingFacilities, setLoadingFacilities] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ facilities: Facility[] }>('/api/facilities')
      .then((res) => {
        setFacilities(res.facilities);
        if (!facilityId && res.facilities.length > 0) {
          setFacilityId(String(res.facilities[0].id));
        }
      })
      .catch((err) => {
        setFormError(err instanceof Error ? err.message : 'Unable to load facilities.');
      })
      .finally(() => setLoadingFacilities(false));
  }, [facilityId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiRequest('/api/maintenance', {
        method: 'POST',
        body: JSON.stringify({
          facilityId: Number(facilityId),
          title: title.trim(),
          description: description.trim(),
          category,
          priority,
          reportedDate,
          attachmentNote: attachmentNote.trim() || null,
        }),
      });
      showToast({
        title: 'Maintenance ticket submitted',
        description: 'Campus operations has been notified and will assign a technician.',
        variant: 'success',
      });
      navigate('/maintenance/mine');
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : 'Unable to submit maintenance request.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout
      title="Report Maintenance Issue"
      subtitle="Submit a campus repair or equipment fault ticket for technician dispatch."
    >
      <div className="mx-auto max-w-2xl rounded-xl border border-[#E5DFD3] bg-white p-6 dark:border-[#1E2E4A] dark:bg-[#101B2E]">
        {formError && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="maintFacility" className="block text-sm font-medium">
              Facility
            </label>
            <select
              id="maintFacility"
              required
              disabled={loadingFacilities}
              value={facilityId}
              onChange={(e) => setFacilityId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3.5 py-2.5 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
            >
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.code} — {f.name} ({f.building}, Floor {f.floor})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="issueTitle" className="block text-sm font-medium">
              Issue Title
            </label>
            <input
              id="issueTitle"
              type="text"
              required
              minLength={5}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Overhead projector lamp warning in Lecture Theatre"
              className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3.5 py-2.5 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="maintCategory" className="block text-sm font-medium">
                Issue Category
              </label>
              <select
                id="maintCategory"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2.5 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
              >
                {MAINTENANCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="maintPriority" className="block text-sm font-medium">
                Priority Level
              </label>
              <select
                id="maintPriority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2.5 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
              >
                {MAINTENANCE_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0) + p.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="reportedDate" className="block text-sm font-medium">
                Date Reported
              </label>
              <input
                id="reportedDate"
                type="date"
                required
                value={reportedDate}
                onChange={(e) => setReportedDate(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3 py-2 font-mono-tabular text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="issueDesc" className="block text-sm font-medium">
              Issue Description
            </label>
            <textarea
              id="issueDesc"
              rows={4}
              required
              minLength={10}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the exact symptom, station/seat location, and any safety hazards..."
              className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3.5 py-2.5 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
            />
          </div>

          <div>
            <label htmlFor="attachmentNote" className="block text-sm font-medium">
              Optional Photo / Asset Reference
            </label>
            <input
              id="attachmentNote"
              type="text"
              value={attachmentNote}
              onChange={(e) => setAttachmentNote(e.target.value)}
              placeholder="e.g., Asset tag #AV-402 or image file name"
              className="mt-1.5 w-full rounded-lg border border-[#E5DFD3] bg-[#FAF8F5] px-3.5 py-2.5 text-sm focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#09111E]"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={submitting || loadingFacilities}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0F2342] px-5 py-2.5 text-sm font-semibold text-[#FAF8F5] hover:bg-[#1A355E] disabled:opacity-60 dark:bg-[#EAB308] dark:text-[#09111E]"
            >
              <Wrench className="h-4 w-4" />
              <span>{submitting ? 'Submitting...' : 'Submit Maintenance Ticket'}</span>
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
