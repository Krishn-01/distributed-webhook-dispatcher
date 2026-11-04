export type WebhookStatusType = 'QUEUED' | 'PROCESSING' | 'DELIVERED' | 'FAILED';

export type DeliveryStatusType = 'SUCCESS' | 'FAILED' | 'RETRYING';

export interface WebhookDispatchInput {
  destinationUrl: string;
  eventId: string;
  payload: Record<string, unknown>;
}

export interface WebhookDispatchResponse {
  status: 'queued';
  jobId: string;
  eventId: string;
}

export interface WebhookJobData {
  webhookEventId: string;
  eventId: string;
  destinationUrl: string;
  destinationDomain: string;
  payload: Record<string, unknown>;
  attemptNumber: number; // 1-indexed: 1 = initial attempt, 2 = retry 1, 3 = retry 2, 4 = retry 3
}

export interface WebhookEventDetails {
  id: string;
  jobId: string | null;
  eventId: string;
  destinationUrl: string;
  destinationDomain: string;
  payload: unknown;
  status: WebhookStatusType;
  attemptCount: number;
  lastResponseCode: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryAttemptDetails {
  id: string;
  webhookEventId: string;
  attemptNumber: number;
  status: DeliveryStatusType;
  responseCode: number | null;
  errorMessage: string | null;
  durationMs: number;
  createdAt: Date;
}
