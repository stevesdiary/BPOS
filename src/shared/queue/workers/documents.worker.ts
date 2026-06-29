import { createWorker, QUEUES } from '../client.js';
import type { GenerateInvoiceJobData } from '../../../modules/invoicing/service.js';

// Handles 'generate-invoice-pdf' jobs.
// Phase 2: replace this stub with real Puppeteer → HTML template → PDF → R2 upload.
createWorker<GenerateInvoiceJobData>(QUEUES.DOCUMENTS, async (job) => {
  if (job.name === 'generate-invoice-pdf') {
    const { invoiceId, orderId, schemaName } = job.data;

    // TODO (Phase 2): render HTML template, launch Puppeteer, upload to R2,
    // then update invoices.pdfUrl and invoices.status = 'sent'
    job.log(
      `[documents.worker] PDF generation queued for invoice ${invoiceId} (order ${orderId}, schema ${schemaName})`,
    );
  }
});
