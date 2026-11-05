import { apiClient } from './client';

// --- Types matching actual backend schemas ---

export interface HealthResponse {
  status: string;
  timestamp: string;
  services: {
    api: string;
    database: string;
    redis: string;
  };
}

export interface DispatchRequest {
  destinationUrl: string;
  eventId: string;
  payload: Record<string, unknown>;
}

export interface DispatchResponse {
  status: string;
  jobId: string;
  eventId: string;
}

export interface JobStatusResponse {
  jobId: string;
  eventId: string;
  destinationDomain: string;
  status: 'QUEUED' | 'PROCESSING' | 'DELIVERED' | 'FAILED';
  attemptCount: number;
  lastResponseCode: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryAttempt {
  attemptNumber: number;
  status: 'SUCCESS' | 'FAILED' | 'RETRYING';
  responseCode: number | null;
  errorMessage: string | null;
  durationMs: number;
  createdAt: string;
}

export interface AttemptsResponse {
  jobId: string;
  attempts: DeliveryAttempt[];
}

export interface RecentEventsResponse {
  events: JobStatusResponse[];
}

// --- API functions ---

export async function checkHealth(): Promise<HealthResponse> {
  const res = await apiClient.get<HealthResponse>('/health');
  return res.data;
}

export async function dispatchWebhook(body: DispatchRequest): Promise<DispatchResponse> {
  const res = await apiClient.post<DispatchResponse>('/api/webhooks/dispatch', body);
  return res.data;
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const res = await apiClient.get<JobStatusResponse>(`/api/webhooks/${jobId}`);
  return res.data;
}

export async function getAttempts(jobId: string): Promise<AttemptsResponse> {
  const res = await apiClient.get<AttemptsResponse>(`/api/webhooks/${jobId}/attempts`);
  return res.data;
}

export async function getRecentJobs(): Promise<RecentEventsResponse> {
  const res = await apiClient.get<RecentEventsResponse>('/api/webhooks');
  return res.data;
}
