import ExcelJS from 'exceljs';
import type { InvoiceRecord } from '../types';
import { MONTH_NAMES } from './monthlyBackupService';
import { compareInvoiceNumbersAsc } from './financialYear';

export interface MonthlyExcelExportOptions {
  monthIndex: number; // 0 = January, 11 = December
  year: number; // e.g. 2026
  invoiceTypeFilter: 'all' | 'regular' | 'tax';
  invoices: InvoiceRecord[];
}

/**
 * Generates and downloads a professionally styled Excel (.xlsx) file
 * containing the monthly invoice register with all 14 specified columns
 * and formatted summary rows.
 */
export async function downloadMonthlyExcelReport(
  options: MonthlyExcelExportOptions
): Promise<void> {
  const { monthIndex, year, invoiceTypeFilter, invoices } = options;
  const monthName = MONTH_NAMES[monthIndex];

  // 1. Filter matching invoices by date and invoice type
  const targetPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

  const matchingInvoices = invoices.filter((inv) => {
    if (!inv.date) return false;
    let inMonth = false;
    if (inv.date.startsWith(targetPrefix)) {
      inMonth = true;
    } else {
      const d = new Date(inv.date);
      if (!isNaN(d.getTime())) {
        inMonth = d.getFullYear() === year && d.getMonth() === monthIndex;
      }
    }
    if (!inMonth) return false;

    if (invoiceTypeFilter === 'regular') {
      return inv.invoiceType === 'regular' || (!inv.invoiceType && !inv.totalTax && !inv.cgstRate && !inv.sgstRate && !inv.igstRate);
    }
    if (invoiceTypeFilter === 'tax') {
      return inv.invoiceType === 'tax' || (!inv.invoiceType && !!(inv.totalTax || inv.cgstRate || inv.sgstRate || inv.igstRate));
    }
    return true; // 'all'
  });

  // 2. Sort invoices in ascending numerical order by invoice sequence
  matchingInvoices.sort(compareInvoiceNumbersAsc);

  // 3. Create Excel Workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Manshi Group Of Services';
  workbook.created = new Date();

  const typeLabel =
    invoiceTypeFilter === 'all'
      ? 'All Invoices'
      : invoiceTypeFilter === 'tax'
      ? 'Tax Invoices'
      : 'Regular Invoices';

  const sheetName = `${monthName} ${year}`.substring(0, 31);
  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 4 }], // Freeze header row
  });

  // Title Block Rows (1-3)
  worksheet.mergeCells('A1:N1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'Manshi Group Of Services';
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1E3A8A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(1).height = 24;

  worksheet.mergeCells('A2:N2');
  const subTitleCell = worksheet.getCell('A2');
  subTitleCell.value = `Monthly Invoice Register – ${monthName} ${year} (${typeLabel}) | Total Invoices: ${matchingInvoices.length}`;
  subTitleCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF475569' } };
  subTitleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(2).height = 20;

  worksheet.getRow(3).height = 10; // spacer

  // 4. Define the 14 Columns
  worksheet.columns = [
    { header: 'S.No.', key: 'sno', width: 8 },
    { header: 'Invoice No.', key: 'invoiceNumber', width: 22 },
    { header: 'Customer Name', key: 'customerName', width: 32 },
    { header: 'Customer GST', key: 'customerGst', width: 20 },
    { header: 'HSN Code', key: 'hsnCode', width: 15 },
    { header: 'Taxable Amount', key: 'taxableAmount', width: 18 },
    { header: 'CGST %', key: 'cgstRate', width: 12 },
    { header: 'CGST Amount', key: 'cgstAmount', width: 16 },
    { header: 'SGST %', key: 'sgstRate', width: 12 },
    { header: 'SGST Amount', key: 'sgstAmount', width: 16 },
    { header: 'IGST %', key: 'igstRate', width: 12 },
    { header: 'IGST Amount', key: 'igstAmount', width: 16 },
    { header: 'Total GST Amount', key: 'totalGst', width: 18 },
    { header: 'Total Invoice Amount', key: 'totalInvoice', width: 22 },
  ];

  // Table Header Row styling (Row 4)
  const headerRow = worksheet.getRow(4);
  headerRow.height = 30;
  headerRow.values = [
    'S.No.',
    'Invoice No.',
    'Customer Name',
    'Customer GST',
    'HSN Code',
    'Taxable Amount',
    'CGST %',
    'CGST Amount',
    'SGST %',
    'SGST Amount',
    'IGST %',
    'IGST Amount',
    'Total GST Amount',
    'Total Invoice Amount',
  ];

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
      top: { style: 'thin', color: { argb: 'FF2C3964' } },
      left: { style: 'thin', color: { argb: 'FF2C3964' } },
      bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
      right: { style: 'thin', color: { argb: 'FF2C3964' } },
    };
  });

  // Track summary sums
  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalGstSum = 0;
  let totalInvoiceSum = 0;

  // 5. Populate Data Rows
  matchingInvoices.forEach((inv, index) => {
    const isTax = inv.invoiceType === 'tax';
    const isIgst = isTax && inv.taxMode === 'igst';
    const isCgstSgst = isTax && !isIgst;

    // Customer GST: For Regular Invoices, "N/A"
    const customerGst = isTax ? (inv.customerGstin?.trim() || 'N/A') : 'N/A';

    // HSN Code: saved code or "N/A"
    let hsnCode = 'N/A';
    if (inv.cgstHsnSac?.trim()) {
      hsnCode = inv.cgstHsnSac.trim();
    } else if (inv.sgstHsnSac?.trim()) {
      hsnCode = inv.sgstHsnSac.trim();
    } else if (inv.igstHsnSac?.trim()) {
      hsnCode = inv.igstHsnSac.trim();
    } else if (inv.items && inv.items.length > 0) {
      const itemWithHsn = inv.items.find((i) => i.hsnSac && i.hsnSac.trim());
      if (itemWithHsn && itemWithHsn.hsnSac) {
        hsnCode = itemWithHsn.hsnSac.trim();
      }
    }

    // Taxable Amount
    const taxableAmount = Number(inv.subtotal) || 0;

    // GST percentages and amounts
    let cgstRate = 0;
    let cgstAmount = 0;
    let sgstRate = 0;
    let sgstAmount = 0;
    let igstRate = 0;
    let igstAmount = 0;
    let totalGst = 0;

    if (isTax) {
      if (isCgstSgst) {
        cgstRate = Number(inv.cgstRate) || 0;
        cgstAmount = Number(inv.cgstAmount) || 0;
        sgstRate = Number(inv.sgstRate) || 0;
        sgstAmount = Number(inv.sgstAmount) || 0;
        igstRate = 0;
        igstAmount = 0;
      } else if (isIgst) {
        cgstRate = 0;
        cgstAmount = 0;
        sgstRate = 0;
        sgstAmount = 0;
        igstRate = Number(inv.igstRate) || 0;
        igstAmount = Number(inv.igstAmount) || 0;
      }
      totalGst = Number(inv.totalTax) || (cgstAmount + sgstAmount + igstAmount);
    }

    const totalInvoice = Number(inv.grandTotal ?? (taxableAmount + totalGst)) || 0;

    // Accumulate for summary
    totalTaxable += taxableAmount;
    totalCgst += cgstAmount;
    totalSgst += sgstAmount;
    totalIgst += igstAmount;
    totalGstSum += totalGst;
    totalInvoiceSum += totalInvoice;

    // Add row to worksheet
    const row = worksheet.addRow([
      index + 1,
      inv.invoiceNumber || '',
      inv.customerName || '',
      customerGst,
      hsnCode,
      taxableAmount,
      cgstRate,
      cgstAmount,
      sgstRate,
      sgstAmount,
      igstRate,
      igstAmount,
      totalGst,
      totalInvoice,
    ]);

    row.height = 22;
    const isEven = index % 2 === 1;

    // Format individual cells in the row
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      if (isEven) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      }

      // Column specific alignments and number formats
      switch (colNumber) {
        case 1: // S.No.
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          break;
        case 2: // Invoice No.
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
          break;
        case 3: // Customer Name
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          break;
        case 4: // Customer GST
        case 5: // HSN Code
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          break;
        case 6: // Taxable Amount
        case 8: // CGST Amount
        case 10: // SGST Amount
        case 12: // IGST Amount
        case 13: // Total GST Amount
        case 14: // Total Invoice Amount
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '#,##0.00';
          break;
        case 7: // CGST %
        case 9: // SGST %
        case 11: // IGST %
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '0.00"%"';
          break;
      }
    });
  });

  // Empty spacer row before summary
  const emptyRow = worksheet.addRow([]);
  emptyRow.height = 14;

  // 6. Clearly Formatted Summary Rows at end of sheet
  // Row A: Main Summary Header Banner
  const summaryHeaderRow = worksheet.addRow([
    '',
    '',
    'MONTHLY SUMMARY TOTALS',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]);
  summaryHeaderRow.height = 24;
  worksheet.mergeCells(`C${summaryHeaderRow.number}:N${summaryHeaderRow.number}`);
  const summaryBannerCell = summaryHeaderRow.getCell(3);
  summaryBannerCell.value = 'MONTHLY SUMMARY TOTALS';
  summaryBannerCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1E3A8A' } };
  summaryBannerCell.alignment = { vertical: 'middle', horizontal: 'center' };
  summaryBannerCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEFF6FF' },
  };

  // Row B: Key Totals Row (Matching the table columns)
  const totalRow = worksheet.addRow([
    'TOTAL',
    `Total Invoices: ${matchingInvoices.length}`,
    '',
    '',
    '',
    totalTaxable,
    '',
    totalCgst,
    '',
    totalSgst,
    '',
    totalIgst,
    totalGstSum,
    totalInvoiceSum,
  ]);

  totalRow.height = 28;
  totalRow.eachCell((cell, colNumber) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDBEAFE' }, // Light blue summary highlight
    };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF3A4E86' } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF1E3A8A' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } },
    };

    if ([6, 8, 10, 12, 13, 14].includes(colNumber)) {
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
      cell.numFmt = '#,##0.00';
    } else {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }
  });

  // Separate Structured Summary Block for extra clarity as required
  worksheet.addRow([]);
  const summaryBlock = [
    { label: 'Total Invoices', value: matchingInvoices.length, isCurrency: false },
    { label: 'Total Taxable Amount', value: totalTaxable, isCurrency: true },
    { label: 'Total CGST Amount', value: totalCgst, isCurrency: true },
    { label: 'Total SGST Amount', value: totalSgst, isCurrency: true },
    { label: 'Total IGST Amount', value: totalIgst, isCurrency: true },
    { label: 'Total GST Amount', value: totalGstSum, isCurrency: true },
    { label: 'Total Invoice Amount', value: totalInvoiceSum, isCurrency: true },
  ];

  summaryBlock.forEach((item, sIndex) => {
    const sRow = worksheet.addRow(['', '', item.label, '', item.value]);
    sRow.height = 22;
    worksheet.mergeCells(`C${sRow.number}:D${sRow.number}`);

    const labelCell = sRow.getCell(3);
    labelCell.font = {
      name: 'Calibri',
      size: 10.5,
      bold: sIndex === 0 || sIndex === summaryBlock.length - 1,
      color: { argb: 'FF1E293B' },
    };
    labelCell.alignment = { vertical: 'middle', horizontal: 'left' };

    const valCell = sRow.getCell(5);
    valCell.font = {
      name: 'Calibri',
      size: 10.5,
      bold: true,
      color: sIndex === summaryBlock.length - 1 ? { argb: 'FF1E3A8A' } : { argb: 'FF0F172A' },
    };
    valCell.alignment = { vertical: 'middle', horizontal: 'right' };
    if (item.isCurrency) {
      valCell.numFmt = '#,##0.00';
    } else {
      valCell.numFmt = '#,##0';
    }

    [labelCell, valCell].forEach((c) => {
      c.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: sIndex % 2 === 0 ? { argb: 'FFF1F5F9' } : { argb: 'FFFFFFFF' },
      };
      c.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  });

  // 7. Write to buffer & trigger browser download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const cleanMonth = monthName.replace(/\s+/g, '_');
  const typeSlug = invoiceTypeFilter.charAt(0).toUpperCase() + invoiceTypeFilter.slice(1);
  const filename = `Manshi_Invoices_${cleanMonth}_${year}_${typeSlug}.xlsx`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
