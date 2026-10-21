import type { InvoiceType, TaxMode } from '../types';

export interface TaxCalculationInput {
  invoiceType?: InvoiceType;
  items?: Array<{ amount: number | string }>;
  taxMode?: TaxMode;
  cgstRate?: number;
  sgstRate?: number;
  igstRate?: number;
}

export interface TaxCalculationResult {
  invoiceType: InvoiceType;
  subtotal: number; // Taxable base amount (sum of items)
  taxMode: TaxMode;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  grandTotal: number;
}

/**
 * Safely rounds a number to 2 decimal places using standard accounting rounding
 */
export function roundToTwoDecimals(val: number): number {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

/**
 * Shared calculation function for form, live preview, and PDF generation.
 * Ensures form, preview, and PDF are always in 100% agreement.
 */
export function calculateInvoiceTotals(input: TaxCalculationInput): TaxCalculationResult {
  const invoiceType: InvoiceType = input.invoiceType === 'tax' ? 'tax' : 'regular';
  const taxMode: TaxMode = input.taxMode === 'igst' ? 'igst' : 'cgst_sgst';

  // Subtotal is sum of items rounded to 2 decimals (ignoring blank amounts safely)
  const rawSubtotal = (input.items || []).reduce((sum, item) => {
    const val = item.amount === '' || item.amount === undefined || item.amount === null ? 0 : Number(item.amount);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);
  const subtotal = roundToTwoDecimals(rawSubtotal);

  if (invoiceType === 'regular') {
    return {
      invoiceType: 'regular',
      subtotal,
      taxMode: 'cgst_sgst',
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      totalTax: 0,
      grandTotal: subtotal,
    };
  }

  // Tax Invoice
  let cgstRate = 0;
  let sgstRate = 0;
  let igstRate = 0;

  if (taxMode === 'cgst_sgst') {
    cgstRate = Math.max(0, Number(input.cgstRate) || 0);
    sgstRate = Math.max(0, Number(input.sgstRate) || 0);
    igstRate = 0; // Disabled/reset in CGST+SGST mode
  } else {
    cgstRate = 0; // Disabled/reset in IGST mode
    sgstRate = 0; // Disabled/reset in IGST mode
    igstRate = Math.max(0, Number(input.igstRate) || 0);
  }

  const cgstAmount = roundToTwoDecimals((subtotal * cgstRate) / 100);
  const sgstAmount = roundToTwoDecimals((subtotal * sgstRate) / 100);
  const igstAmount = roundToTwoDecimals((subtotal * igstRate) / 100);

  const totalTax = roundToTwoDecimals(cgstAmount + sgstAmount + igstAmount);
  const grandTotal = roundToTwoDecimals(subtotal + totalTax);

  return {
    invoiceType: 'tax',
    subtotal,
    taxMode,
    cgstRate,
    sgstRate,
    igstRate,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalTax,
    grandTotal,
  };
}
