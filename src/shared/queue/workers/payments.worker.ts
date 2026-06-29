import { createWorker, QUEUES } from '../client.js';

export interface FailedWebhookJobData {
  tenantId: string;
  schemaName: string;
  eventId: string;
  eventType: string;
  rawPayload: string;
  error: string;
  failedAt: string;
}

// Dead-letter queue handler for failed webhook events.
// Logs the failure for manual review; in Phase 2 this will alert via Termii/email.
export const paymentsWorker = createWorker<FailedWebhookJobData>(
  QUEUES.PAYMENTS,
  async (job) => {
    const { tenantId, eventType, eventId, error, failedAt } = job.data;
    job.log(
      `[DLQ] Failed webhook event — tenant=${tenantId} type=${eventType} eventId=${eventId} error="${error}" failedAt=${failedAt}`,
    );
    // TODO Phase 2: send alert via Termii SMS or email to tenant owner
  },
);
