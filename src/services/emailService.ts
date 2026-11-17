import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../lib/firebase';
import type { CompanySettings } from '../types';

export interface EmailSendParams {
  to: string;
  subject: string;
  message: string;
  pdfBase64: string;
  filename: string;
  companySettings?: CompanySettings | null;
}

/**
 * Checks if Backend Email Service is configured in company settings
 */
export function isEmailServiceConfigured(settings?: CompanySettings | null): boolean {
  return Boolean(settings?.emailServiceEnabled);
}

/**
 * Queues an invoice email with attached PDF in Firestore for backend delivery
 * (Integrates with Firebase 'firestore-send-email' Extension or Cloud Function triggers)
 */
export async function sendInvoiceViaBackendEmail(params: EmailSendParams): Promise<{
  success: boolean;
  queueId: string;
}> {
  const { to, subject, message, pdfBase64, filename, companySettings } = params;

  if (!isEmailServiceConfigured(companySettings)) {
    throw new Error(
      'Backend Email Integration is not configured. Please enable Backend Email Service in Settings.'
    );
  }

  const sender =
    companySettings?.emailSenderAddress?.trim() ||
    companySettings?.email?.trim() ||
    'Info@Manshigroup.in';

  // Standard document structure used by Firebase Email Extension
  const docRef = await addDoc(collection(firestore, 'mail'), {
    to: to.trim(),
    from: sender,
    message: {
      subject: subject.trim(),
      text: message.trim(),
      attachments: [
        {
          filename: filename.trim(),
          content: pdfBase64,
          encoding: 'base64',
        },
      ],
    },
    createdAt: serverTimestamp(),
    status: 'pending',
  });

  return { success: true, queueId: docRef.id };
}
