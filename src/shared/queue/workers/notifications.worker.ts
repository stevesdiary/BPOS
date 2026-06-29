import { createWorker, QUEUES } from '../client.js';

interface SmsJobData {
  to: string;
  message: string;
  tenantId: string;
}

interface EmailJobData {
  to: string;
  subject: string;
  body: string;
  tenantId: string;
}

type NotificationJobData = SmsJobData | EmailJobData;

export const notificationsWorker = createWorker<NotificationJobData>(
  QUEUES.NOTIFICATIONS,
  async (job) => {
    if (job.name === 'send-sms') {
      const data = job.data as SmsJobData;
      // TODO: Implement Termii SMS integration in Stage 1
      await job.log(`SMS queued to ${data.to}: ${data.message.substring(0, 50)}...`);
    } else if (job.name === 'send-email') {
      const data = job.data as EmailJobData;
      // TODO: Implement email sending
      await job.log(`Email queued to ${data.to}: ${data.subject}`);
    }
  },
);

notificationsWorker.on('failed', (job, err: Error) => {
  console.error(`Notification job ${job?.id ?? 'unknown'} failed:`, err.message);
});
