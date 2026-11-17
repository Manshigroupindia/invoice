import type { CompanySettings } from '../types';

const FUNCTION_REGION = 'asia-south1';
const PROJECT_ID = 'invoice-c797f';
const WHATSAPP_API_ENDPOINT = `https://${FUNCTION_REGION}-${PROJECT_ID}.cloudfunctions.net/sendInvoiceWhatsApp`;

export interface WhatsAppSendParams {
  phoneNumber: string;
  message: string;
  pdfBase64: string;
  filename: string;
  companySettings?: CompanySettings | null;
}

/**
 * Checks if WhatsApp Business Cloud API is configured in company settings
 */
export function isWhatsAppApiConfigured(settings?: CompanySettings | null): boolean {
  return Boolean(
    settings?.whatsappApiEnabled &&
      settings?.whatsappPhoneNumberId &&
      settings.whatsappPhoneNumberId.trim().length > 0
  );
}

/**
 * Dispatches an invoice PDF with prefilled message to a recipient via WhatsApp Business Cloud API
 */
export async function sendInvoiceViaWhatsAppApi(params: WhatsAppSendParams): Promise<{
  success: boolean;
  messageId?: string;
}> {
  const { phoneNumber, message, pdfBase64, filename, companySettings } = params;

  if (!isWhatsAppApiConfigured(companySettings)) {
    throw new Error(
      'WhatsApp Business Cloud API is not configured. Please configure your Meta Phone Number ID in Settings.'
    );
  }

  const response = await fetch(WHATSAPP_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phoneNumber,
      message,
      pdfBase64,
      filename,
      phoneNumberId: companySettings?.whatsappPhoneNumberId?.trim(),
      wabaId: companySettings?.whatsappBusinessAccountId?.trim(),
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg =
      data?.message ||
      data?.error ||
      `WhatsApp Cloud API dispatch failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return { success: true, messageId: data?.result?.messages?.[0]?.id };
}
