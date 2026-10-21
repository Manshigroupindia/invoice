import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { InvoiceRecord, CompanySettings } from '../types';
import { getAllInvoicesFirestore } from '../services/firestoreService';
import { createInvoicePDFDocument, getUniqueInvoicePdfFilenames } from './pdfGenerator';

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export interface BackupProgressInfo {
  percent: number;
  stage: 'fetching' | 'excel' | 'pdfs' | 'compressing' | 'done';
  message: string;
  current?: number;
  total?: number;
}

export interface MonthlyBackupOptions {
  year: number; // e.g. 2026
  monthIndex: number; // 0 = January, 11 = December
  companySettings?: CompanySettings;
  onProgress?: (info: BackupProgressInfo) => void;
}

export interface MonthlyBackupResult {
  success: boolean;
  totalInvoices: number;
  failedPdfs: { invoiceNumber: string; error: string }[];
  zipFilename: string;
  excelFilename: string;
}

/**
 * Filter invoices belonging to a specific month and year,
 * sorted chronologically by date ascending and invoice number.
 */
export function filterInvoicesByMonth(
  invoices: InvoiceRecord[],
  year: number,
  monthIndex: number
): InvoiceRecord[] {
  const targetMonthStr = String(monthIndex + 1).padStart(2, '0');
  const targetPrefix = `${year}-${targetMonthStr}`;

  const filtered = invoices.filter((inv) => {
    if (!inv.date) return false;
    if (inv.date.startsWith(targetPrefix)) return true;

    // Fallback: parse date string
    const d = new Date(inv.date);
    if (!isNaN(d.getTime())) {
      return d.getFullYear() === year && d.getMonth() === monthIndex;
    }
    return false;
  });

  // Sort ascending by date, then invoiceNumber for a clean chronological register
  return filtered.sort((a, b) => {
    const cmp = (a.date || '').localeCompare(b.date || '');
    if (cmp !== 0) return cmp;
    return (a.invoiceNumber || '').localeCompare(b.invoiceNumber || '');
  });
}

function formatDriveStatus(status?: string): string {
  switch (status) {
    case 'backed_up':
      return 'Backed Up';
    case 'pending':
      return 'Pending';
    case 'failed':
      return 'Failed';
    case 'not_connected':
      return 'Not Connected';
    default:
      return 'Not Connected';
  }
}

/**
 * Generates an Excel workbook buffer (.xlsx) matching all formatting requirements.
 */
export async function generateMonthlyExcelBuffer(
  invoices: InvoiceRecord[],
  filenameMap: Map<string, string>,
  monthName: string,
  year: number
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Manshi Goyal & Services';
  wb.created = new Date();

  const sheetName = `${monthName} ${year}`.substring(0, 31);
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // 16 Columns as specified
  ws.columns = [
    { header: 'Invoice Number', key: 'invoiceNumber', width: 20 },
    { header: 'Invoice Date', key: 'invoiceDate', width: 14 },
    { header: 'Invoice Type', key: 'invoiceType', width: 16 },
    { header: 'Customer Name', key: 'customerName', width: 28 },
    { header: 'Customer Mobile', key: 'customerMobile', width: 18 },
    { header: 'Customer Email', key: 'customerEmail', width: 24 },
    { header: 'Customer GSTIN', key: 'customerGstin', width: 18 },
    { header: 'Subtotal', key: 'subtotal', width: 16 },
    { header: 'Discount', key: 'discount', width: 14 },
    { header: 'CGST', key: 'cgst', width: 14 },
    { header: 'SGST', key: 'sgst', width: 14 },
    { header: 'IGST', key: 'igst', width: 14 },
    { header: 'Grand Total', key: 'grandTotal', width: 18 },
    { header: 'Payment Status', key: 'paymentStatus', width: 16 },
    { header: 'Google Drive Backup Status', key: 'driveStatus', width: 24 },
    { header: 'PDF Filename', key: 'pdfFilename', width: 36 },
  ];

  // Header row formatting
  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF3A4E86' }, // #3A4E86 Manshi brand navy
    };
    cell.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF2A3A66' } },
      left: { style: 'thin', color: { argb: 'FF2A3A66' } },
      bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
      right: { style: 'thin', color: { argb: 'FF2A3A66' } },
    };
  });

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  };

  // Populate data rows
  invoices.forEach((inv, index) => {
    // Date parsing to UTC date serial to avoid timezone shift
    let dateVal: Date | string = inv.date || '';
    if (inv.date && /^\d{4}-\d{2}-\d{2}$/.test(inv.date)) {
      const [y, m, d] = inv.date.split('-').map(Number);
      dateVal = new Date(Date.UTC(y, m - 1, d));
    }

    const invTypeStr = inv.invoiceType === 'tax' ? 'Tax Invoice' : 'Regular Invoice';
    const subtotal = typeof inv.subtotal === 'number' ? inv.subtotal : 0;
    const discount = typeof (inv as { discount?: number }).discount === 'number'
      ? (inv as { discount?: number }).discount!
      : 0;
    const cgst = typeof inv.cgstAmount === 'number' ? inv.cgstAmount : 0;
    const sgst = typeof inv.sgstAmount === 'number' ? inv.sgstAmount : 0;
    const igst = typeof inv.igstAmount === 'number' ? inv.igstAmount : 0;
    const grandTotal = typeof inv.grandTotal === 'number'
      ? inv.grandTotal
      : (typeof inv.subtotal === 'number' ? inv.subtotal : 0);

    const email = ((inv as { customerEmail?: string }).customerEmail || (inv as { email?: string }).email || '').trim();
    const paymentStatus = ((inv as { paymentStatus?: string }).paymentStatus || (inv.status === 'issued' ? 'Issued' : (inv.status || 'Issued'))).trim();
    const driveStatus = formatDriveStatus(inv.driveBackupStatus);
    const pdfFilename = filenameMap.get(inv.id) || filenameMap.get(inv.invoiceNumber) || '';

    const row = ws.addRow({
      invoiceNumber: inv.invoiceNumber || '',
      invoiceDate: dateVal,
      invoiceType: invTypeStr,
      customerName: inv.customerName || '',
      customerMobile: inv.customerMobile ? String(inv.customerMobile).trim() : '',
      customerEmail: email,
      customerGstin: inv.customerGstin ? inv.customerGstin.trim() : '',
      subtotal,
      discount,
      cgst,
      sgst,
      igst,
      grandTotal,
      paymentStatus,
      driveStatus,
      pdfFilename,
    });

    row.height = 20;

    // Zebra striping
    const isEven = index % 2 === 1;
    const rowBgColor = isEven ? 'FFF8FAFC' : 'FFFFFFFF';

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = thinBorder;
      cell.font = { name: 'Calibri', size: 10 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: rowBgColor },
      };

      // Specific column alignments & number formats
      switch (colNumber) {
        case 1: // Invoice Number
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          break;
        case 2: // Invoice Date
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          if (dateVal instanceof Date) {
            cell.numFmt = 'yyyy-mm-dd';
          }
          break;
        case 3: // Invoice Type
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          break;
        case 4: // Customer Name
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          break;
        case 5: // Customer Mobile
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.numFmt = '@';
          break;
        case 6: // Customer Email
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          break;
        case 7: // Customer GSTIN
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          break;
        case 8: // Subtotal
        case 9: // Discount
        case 10: // CGST
        case 11: // SGST
        case 12: // IGST
        case 13: // Grand Total
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '#,##0.00';
          break;
        case 14: // Payment Status
        case 15: // Drive Status
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          break;
        case 16: // PDF Filename
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          break;
      }
    });
  });

  const rowCount = invoices.length;

  // Auto-Filter across all columns
  ws.autoFilter = { from: 'A1', to: 'P1' };

  // Totals Row
  const totalsRowNum = rowCount + 2;
  const totalsRow = ws.getRow(totalsRowNum);
  totalsRow.height = 24;

  totalsRow.getCell(1).value = 'Total';
  totalsRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

  if (rowCount > 0) {
    const lastDataRow = rowCount + 1;
    // H: Subtotal, I: Discount, J: CGST, K: SGST, L: IGST, M: Grand Total
    totalsRow.getCell(8).value = { formula: `SUM(H2:H${lastDataRow})` };
    totalsRow.getCell(9).value = { formula: `SUM(I2:I${lastDataRow})` };
    totalsRow.getCell(10).value = { formula: `SUM(J2:J${lastDataRow})` };
    totalsRow.getCell(11).value = { formula: `SUM(K2:K${lastDataRow})` };
    totalsRow.getCell(12).value = { formula: `SUM(L2:L${lastDataRow})` };
    totalsRow.getCell(13).value = { formula: `SUM(M2:M${lastDataRow})` };
  } else {
    totalsRow.getCell(8).value = 0;
    totalsRow.getCell(9).value = 0;
    totalsRow.getCell(10).value = 0;
    totalsRow.getCell(11).value = 0;
    totalsRow.getCell(12).value = 0;
    totalsRow.getCell(13).value = 0;
  }

  // Format Totals Row
  totalsRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF3A4E86' } },
      bottom: { style: 'double', color: { argb: 'FF3A4E86' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };

    if (colNumber >= 8 && colNumber <= 13) {
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
      cell.numFmt = '#,##0.00';
    }
  });

  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}

/**
 * Native browser download trigger with cleanup.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Main Monthly Backup Generator:
 * 1. Queries all matching invoices directly from Firestore
 * 2. Prepares unique PDF filenames preventing collisions
 * 3. Builds formatted Excel register
 * 4. Renders authentic A4 PDFs using existing createInvoicePDFDocument
 * 5. Bundles all files into a genuine offline ZIP archive
 * 6. Triggers browser download
 */
export async function generateMonthlyBackupZip({
  year,
  monthIndex,
  companySettings,
  onProgress,
}: MonthlyBackupOptions): Promise<MonthlyBackupResult> {
  const monthName = MONTH_NAMES[monthIndex];
  const excelFilename = `Manshi_Invoices_${monthName}_${year}.xlsx`;
  const zipFilename = `Manshi_Invoices_${monthName}_${year}_Backup.zip`;

  // 1. Fetch matching invoices
  onProgress?.({
    percent: 5,
    stage: 'fetching',
    message: `Fetching invoices from Firestore for ${monthName} ${year}...`,
  });

  const allInvoices = await getAllInvoicesFirestore();
  const matchingInvoices = filterInvoicesByMonth(allInvoices, year, monthIndex);

  if (matchingInvoices.length === 0) {
    throw new Error(`No invoices found for ${monthName} ${year}.`);
  }

  // 2. Resolve unique PDF filenames for every invoice
  const filenameMap = getUniqueInvoicePdfFilenames(matchingInvoices);

  // 3. Create ZIP archive
  const zip = new JSZip();

  // 4. Generate Excel Register
  onProgress?.({
    percent: 15,
    stage: 'excel',
    message: `Creating Excel register (${excelFilename})...`,
  });

  const excelBuffer = await generateMonthlyExcelBuffer(
    matchingInvoices,
    filenameMap,
    monthName,
    year
  );
  zip.file(excelFilename, excelBuffer);

  // 5. Generate actual invoice PDFs
  const total = matchingInvoices.length;
  const failedPdfs: { invoiceNumber: string; error: string }[] = [];

  for (let i = 0; i < total; i++) {
    const inv = matchingInvoices[i];
    const pdfFilename = filenameMap.get(inv.id) || `${inv.invoiceNumber}.pdf`;

    const progressPct = 20 + Math.round(((i + 1) / total) * 60); // 20% -> 80%
    onProgress?.({
      percent: progressPct,
      stage: 'pdfs',
      message: `Generating PDF ${i + 1} of ${total}: ${pdfFilename}`,
      current: i + 1,
      total,
    });

    try {
      const doc = await createInvoicePDFDocument(
        inv,
        inv.companySnapshot || companySettings
      );
      const pdfArrayBuffer = doc.output('arraybuffer');
      zip.file(pdfFilename, pdfArrayBuffer);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to generate PDF for invoice ${inv.invoiceNumber}:`, err);
      failedPdfs.push({
        invoiceNumber: inv.invoiceNumber,
        error: errMsg,
      });
    }

    // Yield control briefly to avoid blocking UI and free memory
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  // If any PDF generation failed, include an error report in the ZIP
  if (failedPdfs.length > 0) {
    const reportLines = [
      `MANSHI INVOICE BACKUP ERROR LOG - ${monthName} ${year}`,
      `Generated at: ${new Date().toISOString()}`,
      `Total invoices in month: ${total}`,
      `Successfully generated PDFs: ${total - failedPdfs.length}`,
      `Failed PDFs: ${failedPdfs.length}`,
      '',
      'FAILED INVOICES DETAILS:',
      '------------------------',
      ...failedPdfs.map(
        (f, idx) => `${idx + 1}. Invoice No: ${f.invoiceNumber} | Error: ${f.error}`
      ),
    ];
    zip.file('ERRORS_REPORT.txt', reportLines.join('\n'));
  }

  // 6. Compress ZIP archive
  onProgress?.({
    percent: 85,
    stage: 'compressing',
    message: 'Compressing ZIP archive...',
  });

  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      const compressPct = 85 + Math.round((metadata.percent / 100) * 14); // 85% -> 99%
      onProgress?.({
        percent: compressPct,
        stage: 'compressing',
        message: `Compressing ZIP archive (${Math.round(metadata.percent)}%)...`,
      });
    }
  );

  // 7. Trigger browser download
  onProgress?.({
    percent: 100,
    stage: 'done',
    message: 'Backup downloaded successfully!',
  });

  downloadBlob(zipBlob, zipFilename);

  return {
    success: true,
    totalInvoices: total,
    failedPdfs,
    zipFilename,
    excelFilename,
  };
}
