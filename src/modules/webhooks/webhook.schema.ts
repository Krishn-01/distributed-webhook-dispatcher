import { z } from 'zod';

export const dispatchWebhookSchema = z.object({
  destinationUrl: z
    .string({
      required_error: 'destinationUrl is required',
    })
    .url('destinationUrl must be a valid URL')
    .refine(
      (url) => {
        try {
          const parsed = new URL(url);
          return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
          return false;
        }
      },
      {
        message: 'destinationUrl must use http or https protocol',
      }
    ),
  eventId: z
    .string({
      required_error: 'eventId is required',
    })
    .trim()
    .min(1, 'eventId cannot be empty')
    .max(255, 'eventId is too long (maximum 255 characters)'),
  payload: z
    .record(z.unknown(), {
      required_error: 'payload is required',
    })
    .refine((val) => typeof val === 'object' && val !== null, {
      message: 'payload must be a valid JSON object',
    }),
});

export const webhookJobIdParamSchema = z.object({
  jobId: z.string().trim().min(1, 'jobId parameter cannot be empty'),
});

export type DispatchWebhookDto = z.infer<typeof dispatchWebhookSchema>;
