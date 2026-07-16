export type VerificationChain = 'solana' | 'ethereum' | 'base' | 'arbitrum';
export type VerificationTier = 'standard' | 'priority';
export type VerificationStatus = 'received' | 'under_review' | 'auto_rejected' | 'approved' | 'rejected' | 'flagged';
export type VerificationBadge = 'verified' | 'community_vouched' | 'unverified_clone' | 'flagged';
export type NotificationState = 'queued' | 'sent';

export interface VerificationTimelineEvent {
  code: string;
  label: string;
  at: string;
  detail?: string;
}

export interface VerificationRequest {
  id: string;
  projectName: string;
  contractAddress: string;
  chain: VerificationChain;
  officialTwitter: string;
  officialTelegram: string;
  website: string;
  description: string;
  tier: VerificationTier;
  status: VerificationStatus;
  badge?: VerificationBadge;
  autoScanScore: number;
  rejectionReason?: string;
  reviewWindowHours: number;
  reviewWindowLabel: string;
  antiCloneProtection: boolean;
  createdAt: string;
  updatedAt: string;
  notificationState: NotificationState;
  timeline: VerificationTimelineEvent[];
}

export interface VerificationOverviewResponse {
  totals: {
    submitted: number;
    underReview: number;
    approved: number;
    rejected: number;
    flagged: number;
    priority: number;
  };
  updatedAt: string;
}

export interface VerificationRequestResponse {
  request: VerificationRequest;
}

export interface VerificationSubmissionPayload {
  projectName: string;
  contractAddress: string;
  chain: VerificationChain;
  officialTwitter: string;
  officialTelegram: string;
  website: string;
  description: string;
  contact: string;
  tier: VerificationTier;
}

function apiUrl(path: string) {
  const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const baseUrl = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, '') : '';
  return baseUrl ? `${baseUrl}${path}` : path;
}

async function verificationFetch<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `API request failed: ${response.status} ${response.statusText}`;
    throw new Error(errorMessage);
  }

  return payload as T;
}

export function fetchVerificationOverview(signal?: AbortSignal) {
  return verificationFetch<VerificationOverviewResponse>('/api/verification/overview', {
    method: 'GET',
    signal,
  });
}

export function fetchVerificationRequest(requestId: string, signal?: AbortSignal) {
  return verificationFetch<VerificationRequestResponse>(`/api/verification/applications/${encodeURIComponent(requestId.trim())}`, {
    method: 'GET',
    signal,
  });
}

export function submitVerificationApplication(payload: VerificationSubmissionPayload, accessToken?: string | null) {
  return verificationFetch<VerificationRequestResponse>('/api/verification/applications', {
    method: 'POST',
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
    body: JSON.stringify(payload),
  });
}
