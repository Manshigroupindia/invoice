import type { InvoiceRecord, CompanySettings } from '../types';
import { formatDateToIndian, formatIndianCurrency } from './financialYear';

/**
 * Replaces dynamic placeholders in a template string with actual invoice & company values:
 * - {CustomerName}
 * - {InvoiceNumber}
 * - {InvoiceDate}
 * - {InvoiceAmount}
 * - {CompanyName}
 */
export function interpolateInvoiceTemplate(
  template: string,
  invoice: InvoiceRecord,
  companySettings?: CompanySettings
): string {
  if (!template) return '';
  const customer = invoice.customerName || 'Customer';
  const invNo = invoice.invoiceNumber || '';
  const invDate = formatDateToIndian(invoice.date || new Date().toISOString());
  const totalAmt = formatIndianCurrency(
    invoice.grandTotal !== undefined && invoice.grandTotal !== null
      ? invoice.grandTotal
      : invoice.subtotal || 0
  );
  const company = companySettings?.companyName || 'Manshi Group Of Services';

  return template
    .replace(/\{CustomerName\}/gi, customer)
    .replace(/\{InvoiceNumber\}/gi, invNo)
    .replace(/\{InvoiceDate\}/gi, invDate)
    .replace(/\{InvoiceAmount\}/gi, totalAmt)
    .replace(/\{CompanyName\}/gi, company);
}

/**
 * Normalizes and validates a mobile phone number for WhatsApp sharing.
 * Strips non-digit characters and ensures country code (defaults to 91 for Indian numbers).
 */
export function cleanIndianMobileNumber(mobile?: string): {
  isValid: boolean;
  cleaned: string;
  formatted: string;
  raw: string;
} {
  const raw = (mobile || '').trim();
  let digits = raw.replace(/\D/g, '');

  if (!digits) {
    return { isValid: false, cleaned: '', formatted: '', raw };
  }

  // Handle leading 0 (e.g. 09876543210 -> 919876543210)
  if (digits.startsWith('0') && digits.length === 11) {
    digits = '91' + digits.slice(1);
  }
  // Standard 10-digit Indian number without country code
  else if (digits.length === 10) {
    digits = '91' + digits;
  }

  const isValid = digits.length >= 10 && digits.length <= 15;
  const formatted =
    digits.length === 12 && digits.startsWith('91')
      ? `+${digits.slice(0, 2)} ${digits.slice(2, 7)} ${digits.slice(7)}`
      : raw || `+${digits}`;

  return {
    isValid,
    cleaned: digits,
    formatted,
    raw,
  };
}

/**
 * Validates an email address format
 */
export function isValidEmail(email?: string): boolean {
  if (!email) return false;
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Checks if the current browser environment supports native file sharing (Web Share API Level 2)
 */
export function canShareFiles(file?: File): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  try {
    const testFile = file || new File(['test'], 'test.pdf', { type: 'application/pdf' });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}

/**
 * Opens WhatsApp Web or WhatsApp app with prefilled message
 */
export function openWhatsAppChat(phone: string, text: string) {
  const cleanPhone = phone.replace(/\D/g, '');
  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Opens default system email client with prefilled recipient, subject, and body
 */
export function openEmailClient(email: string, subject: string, body: string) {
  const mailtoUrl = `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailtoUrl;
}
