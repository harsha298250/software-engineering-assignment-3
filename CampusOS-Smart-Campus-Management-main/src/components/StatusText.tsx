import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Wrench,
  Ban,
  Loader2,
} from 'lucide-react';

export function formatRoleLabel(role: string): string {
  switch (role) {
    case 'ADMIN':
      return 'Administrator';
    case 'FACULTY':
      return 'Faculty';
    case 'MAINTENANCE_STAFF':
      return 'Maintenance Staff';
    default:
      return 'Student';
  }
}

export function StatusText({ status }: { status: string }) {
  const normalized = status.toUpperCase();

  switch (normalized) {
    case 'OPERATIONAL':
    case 'APPROVED':
    case 'RESOLVED':
    case 'COMPLETED':
    case 'ACTIVE':
    case 'CLAIMED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>{normalized.replace('_', ' ')}</span>
        </span>
      );
    case 'PENDING':
    case 'OPEN':
    case 'ASSIGNED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>{normalized.replace('_', ' ')}</span>
        </span>
      );
    case 'IN_PROGRESS':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2B4C7E] dark:text-[#60A5FA] whitespace-nowrap">
          <Loader2 className="h-3.5 w-3.5 shrink-0" />
          <span>IN PROGRESS</span>
        </span>
      );
    case 'UNDER_MAINTENANCE':
    case 'HIGH':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 whitespace-nowrap">
          <Wrench className="h-3.5 w-3.5 shrink-0" />
          <span>{normalized.replace('_', ' ')}</span>
        </span>
      );
    case 'CRITICAL':
    case 'REJECTED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400 whitespace-nowrap">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{normalized.replace('_', ' ')}</span>
        </span>
      );
    case 'CANCELLED':
    case 'DISABLED':
    case 'INACTIVE':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">
          <Ban className="h-3.5 w-3.5 shrink-0" />
          <span>{normalized.replace('_', ' ')}</span>
        </span>
      );
    case 'CLOSED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          <span>CLOSED</span>
        </span>
      );
    default:
      return (
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {normalized}
        </span>
      );
  }
}

export function PriorityText({ priority }: { priority: string }) {
  const normalized = priority.toUpperCase();
  if (normalized === 'CRITICAL') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400 whitespace-nowrap">
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>Critical</span>
      </span>
    );
  }
  if (normalized === 'HIGH') {
    return (
      <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">
        High
      </span>
    );
  }
  if (normalized === 'MEDIUM') {
    return (
      <span className="text-xs font-medium text-[#2B4C7E] dark:text-[#60A5FA] whitespace-nowrap">
        Medium
      </span>
    );
  }
  return (
    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
      Low
    </span>
  );
}
