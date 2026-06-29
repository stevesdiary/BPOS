import { createWorker, QUEUES } from '../client.js';

export interface LowStockJobData {
  tenantId: string;
  schemaName: string;
  variantId: string;
  variantName: string;
  sku: string;
  quantityOnHand: number;
  threshold: number;
  locationId: string;
}

export const inventoryWorker = createWorker<LowStockJobData>(
  QUEUES.NOTIFICATIONS,
  async (job) => {
    const { tenantId, variantName, sku, quantityOnHand, threshold, locationId } = job.data;

    job.log(
      `Low stock alert: tenant=${tenantId} sku=${sku} name="${variantName}" ` +
        `qty=${quantityOnHand} threshold=${threshold} location=${locationId}`,
    );

    // TODO Phase 2: send Termii SMS to tenant contact number
    // For now, structured log is the alert mechanism
  },
);
