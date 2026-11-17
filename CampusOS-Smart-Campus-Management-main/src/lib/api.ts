import { auth } from './firebase.ts';

export class ApiError extends Error {
  public readonly status: number;
  public readonly data?: Record<string, unknown>;

  constructor(message: string, status: number, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'ApiError';
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const currentUser = auth.currentUser;
  if (currentUser) {
    const token = await currentUser.getIdToken();
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(path, {
    ...options,
    headers: {
      ...authHeaders,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let errorMessage = `Request failed (${response.status})`;
    let errorData: Record<string, unknown> | undefined;
    try {
      const body = await response.json();
      if (body && typeof body === 'object') {
        errorData = body as Record<string, unknown>;
        if (typeof body.error === 'string') {
          errorMessage = body.error;
        }
      }
    } catch {
      // ignore non-JSON error body
    }
    throw new ApiError(errorMessage, response.status, errorData);
  }

  return response.json() as Promise<T>;
}

export async function downloadCsvReport(dataset: 'bookings' | 'maintenance'): Promise<void> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`/api/admin/reports/export?dataset=${dataset}`, {
    headers: authHeaders,
  });

  if (!response.ok) {
    let msg = 'Failed to export CSV report.';
    try {
      const data = await response.json();
      if (data?.error) msg = data.error;
    } catch {
      // ignore
    }
    throw new ApiError(msg, response.status);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `smart-campus-${dataset}-report.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
