import { z } from 'zod';

/**
 * The only error shape the API returns. Internal messages (SQL errors, stack traces) never
 * reach the client; `requestId` ties a user report to the server log line.
 */
export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
  details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  requestId: z.string().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
