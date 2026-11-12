/**
 * Indian Financial Year & Invoice Numbering Utilities
 * Financial year runs from April 1 to March 31.
 */

export function getIndianFinancialYear(dateInput: Date | string): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) {
    const now = new Date();
    return getIndianFinancialYear(now);
  }

  const month = d.getMonth(); // 0-11. 3 is April
  const year = d.getFullYear();

  let startYear: number;
  let endYear: number;

  if (month >= 3) {
    // April to December
    startYear = year;
    endYear = year + 1;
  } else {
    // January to March
    startYear = year - 1;
    endYear = year;
  }

  const endYearShort = String(endYear).slice(-2);
  return `${startYear}-${endYearShort}`;
}

export function formatInvoiceNumber(
  prefix: string,
  financialYear: string,
  sequence: number,
  padLength: number = 2
): string {
  const cleanPrefix = (prefix || 'MGS').trim().toUpperCase();
  const cleanFY = financialYear.trim();
  const targetPad = Math.max(2, padLength);
  const paddedSeq = String(sequence).padStart(targetPad, '0');
  return `${cleanPrefix}/${cleanFY}/${paddedSeq}`;
}

export function parseInvoiceNumber(invoiceNumber: string): {
  prefix: string;
  financialYear: string;
  sequence: number;
  padLength: number;
} | null {
  if (!invoiceNumber) return null;
  const parts = invoiceNumber.trim().split('/');
  if (parts.length === 3) {
    const rawSeq = parts[2];
    const seq = parseInt(rawSeq, 10);
    if (!isNaN(seq)) {
      return {
        prefix: parts[0],
        financialYear: parts[1],
        sequence: seq,
        padLength: rawSeq.length,
      };
    }
  }
  return null;
}

/**
 * Extracts the trailing numeric sequence from an invoice number string.
 * e.g. "MGS/2026-27/01" -> 1
 *      "MGS/2026-27/24" -> 24
 *      "MGS/2026-27/078" -> 78
 */
export function extractInvoiceSequenceNumber(invoiceNumber: string): number {
  if (!invoiceNumber) return 0;
  const trimmed = invoiceNumber.trim();
  const match = trimmed.match(/(\d+)(?!.*\d)/);
  if (match) {
    const num = parseInt(match[1], 10);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

/**
 * Compares two invoice records or objects with invoiceNumber in ascending numerical order
 * based on the sequence number at the end of the invoice number.
 */
export function compareInvoiceNumbersAsc(
  a: { invoiceNumber?: string },
  b: { invoiceNumber?: string }
): number {
  const seqA = extractInvoiceSequenceNumber(a.invoiceNumber || '');
  const seqB = extractInvoiceSequenceNumber(b.invoiceNumber || '');
  if (seqA !== seqB) {
    return seqA - seqB;
  }
  return (a.invoiceNumber || '').localeCompare(b.invoiceNumber || '');
}

export function formatDateToIndian(dateStr: string): string {
  // Input: YYYY-MM-DD -> Output: DD-MM-YYYY
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

export function formatIndianCurrency(amount: number): string {
  if (isNaN(amount)) return '0.00';
  return amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
