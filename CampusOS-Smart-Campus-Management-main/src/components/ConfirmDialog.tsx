import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]"
    >
      <div className="w-full max-w-md rounded-xl border border-[#E5DFD3] bg-white p-6 shadow-xl dark:border-[#1E2E4A] dark:bg-[#101B2E]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {destructive && (
              <div className="mt-0.5 rounded-lg bg-red-50 p-2 text-red-700 dark:bg-red-950/60 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
            )}
            <div>
              <h3
                id="confirm-dialog-title"
                className="text-base font-semibold text-[#0F2342] dark:text-[#F5F2EB]"
              >
                {title}
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close dialog"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="rounded-lg border border-[#E5DFD3] px-4 py-2 text-sm font-medium text-[#0F2342] transition-colors hover:bg-[#F3EFE7] disabled:opacity-50 dark:border-[#1E2E4A] dark:text-[#F5F2EB] dark:hover:bg-[#16233B]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
              destructive
                ? 'bg-red-700 text-white hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-700'
                : 'bg-[#0F2342] text-[#FAF8F5] hover:bg-[#1A355E] dark:bg-[#EAB308] dark:text-[#09111E] dark:hover:bg-[#CA8A04]'
            }`}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
