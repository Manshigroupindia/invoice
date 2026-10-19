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
  sequence: number
): string {
  const cleanPrefix = (prefix || 'MGS').trim().toUpperCase();
  const cleanFY = financialYear.trim();
  const paddedSeq = String(sequence).padStart(3, '0');
  return `${cleanPrefix}/${cleanFY}/${paddedSeq}`;
}

export function parseInvoiceNumber(invoiceNumber: string): {
  prefix: string;
  financialYear: string;
  sequence: number;
} | null {
  const parts = invoiceNumber.trim().split('/');
  if (parts.length === 3) {
    const seq = parseInt(parts[2], 10);
    if (!isNaN(seq)) {
      return {
        prefix: parts[0],
        financialYear: parts[1],
        sequence: seq,
      };
    }
  }
  return null;
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
