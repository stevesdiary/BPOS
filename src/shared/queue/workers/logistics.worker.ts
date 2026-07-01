import { createWorker, QUEUES } from '../client.js';

interface DispatchedJobData {
  tenantId: string;
  schemaName: string;
  orderId: string;
  trackingNumber: string;
  providerName: string;
}

interface DeliveredJobData {
  tenantId: string;
  schemaName: string;
  orderId: string;
  eventType: string;
  trackingNumber: string;
}

interface FailedJobData {
  tenantId: string;
  schemaName: string;
  orderId: string;
  eventType: string;
  trackingNumber: string;
}

type LogisticsJobData = DispatchedJobData | DeliveredJobData | FailedJobData;

export const logisticsWorker = createWorker<LogisticsJobData>(
  QUEUES.LOGISTICS,
  async (job) => {
    const { name, data } = job;

    switch (name) {
      case 'notify-customer-dispatched': {
        const d = data as DispatchedJobData;
        // TODO: integrate Termii SMS — send tracking number to customer
        // For now: structured log so the event is observable
        job.log(
          JSON.stringify({
            event: 'customer_dispatch_notification',
            tenantId: d.tenantId,
            orderId: d.orderId,
            trackingNumber: d.trackingNumber,
            provider: d.providerName,
          }),
        );
        break;
      }

      case 'notify-customer-delivered': {
        const d = data as DeliveredJobData;
        job.log(
          JSON.stringify({
            event: 'customer_delivery_notification',
            tenantId: d.tenantId,
            orderId: d.orderId,
            trackingNumber: d.trackingNumber,
          }),
        );
        break;
      }

      case 'notify-merchant-failed': {
        const d = data as FailedJobData;
        // TODO: send alert to merchant (email / in-app notification)
        job.log(
          JSON.stringify({
            event: 'merchant_dispatch_failure_alert',
            tenantId: d.tenantId,
            orderId: d.orderId,
            trackingNumber: d.trackingNumber,
            eventType: d.eventType,
          }),
        );
        break;
      }

      default:
        job.log(`Unknown logistics job: ${name}`);
    }
  },
);
