import { jsPDF } from 'jspdf';
import type { InvoiceRecord, CompanySettings, InvoiceType } from '../types';
import { formatDateToIndian, formatIndianCurrency } from './financialYear';
import { calculateInvoiceTotals } from './taxCalculator';

// Cache for loaded base64 fonts to avoid re-fetching
let cachedRegularFont: string | null = null;
let cachedBoldFont: string | null = null;
let cachedBoldItalicFont: string | null = null;

async function fetchFontAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) {
    return url;
  }
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('Could not load image as data URL:', url, err);
    return '';
  }
}

async function loadFonts(doc: jsPDF): Promise<void> {
  try {
    if (!cachedRegularFont) {
      cachedRegularFont = await fetchFontAsBase64('/fonts/trebuc.ttf');
    }
    if (!cachedBoldFont) {
      cachedBoldFont = await fetchFontAsBase64('/fonts/trebucbd.ttf');
    }
    if (!cachedBoldItalicFont) {
      cachedBoldItalicFont = await fetchFontAsBase64('/fonts/trebucbi.ttf');
    }

    doc.addFileToVFS('TrebuchetMS-Regular.ttf', cachedRegularFont);
    doc.addFont('TrebuchetMS-Regular.ttf', 'TrebuchetMS', 'normal');

    doc.addFileToVFS('TrebuchetMS-Bold.ttf', cachedBoldFont);
    doc.addFont('TrebuchetMS-Bold.ttf', 'TrebuchetMS', 'bold');

    doc.addFileToVFS('TrebuchetMS-BoldItalic.ttf', cachedBoldItalicFont);
    doc.addFont('TrebuchetMS-BoldItalic.ttf', 'TrebuchetMS', 'bolditalic');
  } catch (e) {
    console.warn('Failed to load embedded Trebuchet MS font, using Helvetica fallback:', e);
  }
}

export async function createInvoicePDFDocument(
  invoice: InvoiceRecord,
  companySettings?: CompanySettings
): Promise<jsPDF> {
  const settings = invoice.companySnapshot || companySettings;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4', // 595.28 x 841.89 pt
  });

  await loadFonts(doc);

  const fontName = doc.getFontList()['TrebuchetMS'] ? 'TrebuchetMS' : 'Helvetica';

  // Exact metrics matching Brushspace.pdf
  const pageWidth = 595.28;
  const marginX = 39.5; // Exactly 39.5 pt left/right margin
  const tableWidth = pageWidth - marginX * 2; // 516.28 pt

  // Exact RGB Colors extracted from stream 1
  const navyColor = { r: 58, g: 78, b: 134 }; // RGB(58, 78, 134) / #3a4e86 for table header & boxes
  const slateTitleColor = { r: 121, g: 141, b: 197 }; // RGB(121, 141, 197) / #798dc5 for "INVOICE"
  const companyTitleColor = { r: 44, g: 57, b: 100 }; // RGB(44, 57, 100) / #2c3964
  const linkColor = { r: 58, g: 78, b: 134 }; // #3a4e86 for email & website links
  const altRowColor = { r: 241, g: 241, b: 241 }; // 0.945 grayscale (#f1f1f1)

  // 1. Company Logo
  const logoUrl = settings?.logoUrl || settings?.logoDataUrl || '/assets/logo.png';
  try {
    const logoData = await fetchImageAsDataUrl(logoUrl);
    if (logoData) {
      doc.addImage(logoData, 'PNG', marginX, 36, 55.6, 48);
    }
  } catch (err) {
    console.warn('Error adding logo to PDF:', err);
  }

  // 2. Company Name Beside Logo
  const companyHeaderX = marginX + 66;
  doc.setFont(fontName, 'bold');
  doc.setFontSize(20.5);
  doc.setTextColor(companyTitleColor.r, companyTitleColor.g, companyTitleColor.b);
  doc.text(settings?.companyName || 'Manshi Group Of Services', companyHeaderX, 62);

  // 3. INVOICE Title (Top Right)
  const isTax = invoice.invoiceType === 'tax';
  doc.setFont(fontName, 'bold');
  doc.setFontSize(22.5);
  doc.setTextColor(slateTitleColor.r, slateTitleColor.g, slateTitleColor.b);
  const invoiceTitleText = isTax ? 'TAX INVOICE' : 'INVOICE';
  const invoiceTitleW = doc.getTextWidth(invoiceTitleText);
  doc.text(invoiceTitleText, pageWidth - marginX - invoiceTitleW, 64);

  // 4. Fix 2: Company Address Positioned DIRECTLY BELOW Logo, starting from marginX
  doc.setFont(fontName, 'normal');
  doc.setFontSize(8.52);
  doc.setTextColor(0, 0, 0);

  const addrStartY = 96;
  let addrY = addrStartY;
  if (settings?.addressLine1) {
    doc.text(settings.addressLine1, marginX, addrY);
    addrY += 11;
  }
  if (settings?.addressLine2) {
    doc.text(settings.addressLine2, marginX, addrY);
    addrY += 11;
  }
  if (settings?.addressLine3) {
    doc.text(settings.addressLine3, marginX, addrY);
    addrY += 11;
  }

  // 5. Contact Details (GSTIN, Phone, Email, Website)
  const contactY = Math.max(addrY + 3, 129);
  const contactValX = marginX + 44;

  // Outlined Date & Invoice No. box dimensions used for alignment and safe bounds
  const fieldBoxW = 86.8;
  const fieldBoxH = 11.5;
  const fieldBoxX = pageWidth - marginX - fieldBoxW;
  const maxContactValWidth = fieldBoxX - 25 - contactValX;

  // GSTIN (bold label and bold value)
  doc.setFont(fontName, 'bold');
  doc.setFontSize(8.52);
  doc.setTextColor(0, 0, 0);
  doc.text('GSTIN :', marginX, contactY);
  doc.text(settings?.gstin || '09PQRPK4105E1ZG', contactValX, contactY);

  // Phone (bold label and bold value)
  doc.text('Phone:', marginX, contactY + 12);
  doc.text(settings?.phone || '8076187274', contactValX, contactY + 12);

  // Email id:- (blue, underlined label and value with clear gap, aligned with contact values)
  doc.setFont(fontName, 'normal');
  doc.setTextColor(linkColor.r, linkColor.g, linkColor.b);
  doc.setDrawColor(linkColor.r, linkColor.g, linkColor.b);
  doc.setLineWidth(0.6);

  const emailLabel = 'Email id:-';
  doc.text(emailLabel, marginX, contactY + 24);
  const emailLabelWidth = doc.getTextWidth(emailLabel);
  doc.line(marginX, contactY + 25, marginX + emailLabelWidth, contactY + 25);

  const emailVal = settings?.email || 'Info@Manshigroup.in';
  let emailFontSize = 8.52;
  while (doc.getTextWidth(emailVal) > maxContactValWidth && emailFontSize > 5) {
    emailFontSize -= 0.25;
    doc.setFontSize(emailFontSize);
  }
  doc.text(emailVal, contactValX, contactY + 24);
  const emailValWidth = doc.getTextWidth(emailVal);
  doc.line(contactValX, contactY + 25, contactValX + emailValWidth, contactY + 25);
  doc.setFontSize(8.52);

  // Website:- (blue, underlined label and value with clear gap, aligned with contact values)
  const websiteLabel = 'Website:-';
  doc.text(websiteLabel, marginX, contactY + 36);
  const websiteLabelWidth = doc.getTextWidth(websiteLabel);
  doc.line(marginX, contactY + 37, marginX + websiteLabelWidth, contactY + 37);

  const websiteVal = settings?.website || 'www.Manshigroup.in';
  let websiteFontSize = 8.52;
  while (doc.getTextWidth(websiteVal) > maxContactValWidth && websiteFontSize > 5) {
    websiteFontSize -= 0.25;
    doc.setFontSize(websiteFontSize);
  }
  doc.text(websiteVal, contactValX, contactY + 36);
  const websiteValWidth = doc.getTextWidth(websiteVal);
  doc.line(contactValX, contactY + 37, contactValX + websiteValWidth, contactY + 37);
  doc.setFontSize(8.52);

  // 6. Fix 1: Date & Invoice No. Outlined Fields ALIGNED WITH GSTIN AND PHONE
  const dateBoxY = contactY - 8.5; // Perfectly aligns text baseline with GSTIN
  const invNoBoxY = contactY + 12 - 8.5; // Perfectly aligns text baseline with Phone

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.75);

  // Date Label & Box (horizontally aligned with GSTIN row)
  doc.setFont(fontName, 'normal');
  doc.setFontSize(8.52);
  doc.setTextColor(0, 0, 0);
  doc.text('Date', fieldBoxX - 16, contactY, { align: 'right' });
  doc.rect(fieldBoxX, dateBoxY, fieldBoxW, fieldBoxH, 'S');
  const formattedDate = formatDateToIndian(invoice.date);
  doc.text(formattedDate, fieldBoxX + fieldBoxW / 2, contactY, { align: 'center' });

  // Invoice No. Label & Box (horizontally aligned with Phone row)
  doc.text('Invoice No.', fieldBoxX - 12, contactY + 12, { align: 'right' });
  doc.rect(fieldBoxX, invNoBoxY, fieldBoxW, fieldBoxH, 'S');
  doc.text(invoice.invoiceNumber, fieldBoxX + fieldBoxW / 2, contactY + 12, { align: 'center' });

  // 7. Bill To Box
  const billToY = contactY + 47;
  const billToW = 227; // Exactly 227 pt width
  const billToHeaderH = 13.5;

  // Header Bar
  doc.setFillColor(navyColor.r, navyColor.g, navyColor.b);
  doc.rect(marginX, billToY, billToW, billToHeaderH, 'F');
  doc.rect(marginX, billToY, billToW, billToHeaderH, 'S');

  doc.setFont(fontName, 'bold');
  doc.setFontSize(8.52);
  doc.setTextColor(255, 255, 255);
  doc.text('Bill To :-', marginX + 6, billToY + 9.5);

  // Customer Name & Address Rows
  doc.setFont(fontName, 'normal');
  doc.setTextColor(0, 0, 0);

  const customerName = invoice.customerName.trim() || 'M/s. Brushspace';
  const customerAddress = invoice.customerAddress.trim();
  const addressLines = doc.splitTextToSize(customerAddress, billToW - 12);

  const row1H = 14;
  const row2H = Math.max(26, addressLines.length * 11 + 4);
  const row3H = 14;
  const row4H = isTax ? 14 : 0;
  const billToContentH = row1H + row2H + row3H + row4H;

  // Outer border around Bill To body
  doc.rect(marginX, billToY + billToHeaderH, billToW, billToContentH, 'S');
  // Horizontal divider lines between rows
  doc.line(marginX, billToY + billToHeaderH + row1H, marginX + billToW, billToY + billToHeaderH + row1H);
  doc.line(marginX, billToY + billToHeaderH + row1H + row2H, marginX + billToW, billToY + billToHeaderH + row1H + row2H);
  if (isTax) {
    doc.line(
      marginX,
      billToY + billToHeaderH + row1H + row2H + row3H,
      marginX + billToW,
      billToY + billToHeaderH + row1H + row2H + row3H
    );
  }

  // Row 1: Name
  doc.text(customerName, marginX + 6, billToY + billToHeaderH + 10);

  // Row 2: Address
  let addrLineY = billToY + billToHeaderH + row1H + 10;
  for (const line of addressLines) {
    doc.text(line, marginX + 6, addrLineY);
    addrLineY += 10.5;
  }

  // Row 3: Mobile
  const mobileVal = invoice.customerMobile?.trim();
  const mobileText = mobileVal ? `Mobile  :   ${mobileVal}` : 'Mobile  :   ';
  doc.text(mobileText, marginX + 6, billToY + billToHeaderH + row1H + row2H + 10);

  // Row 4: GSTIN (Tax Invoice only - bold label and value matching reference)
  if (isTax) {
    const customerGstinVal = invoice.customerGstin?.trim();
    const gstinText = customerGstinVal ? `GSTIN   :   ${customerGstinVal}` : 'GSTIN   :   ';
    doc.setFont(fontName, 'bold');
    doc.text(gstinText, marginX + 6, billToY + billToHeaderH + row1H + row2H + row3H + 10);
    doc.setFont(fontName, 'normal');
  }

  // 8. Main Description Table
  const tableY = billToY + billToHeaderH + billToContentH + 14;

  // Column Widths matching Brushspace.pdf: 73.3%, 10.2%, 16.5%
  const colDescW = Math.round(tableWidth * 0.733); // ~378.4 pt
  const colHsnW = Math.round(tableWidth * 0.102); // ~52.7 pt
  const colAmountW = tableWidth - colDescW - colHsnW; // ~85.2 pt

  const col1X = marginX;
  const col2X = col1X + colDescW;
  const col3X = col2X + colHsnW;
  const colRightX = col1X + tableWidth;

  const tableHeaderH = 15;

  // Table Header Bar
  doc.setFillColor(navyColor.r, navyColor.g, navyColor.b);
  doc.rect(col1X, tableY, tableWidth, tableHeaderH, 'F');
  doc.rect(col1X, tableY, tableWidth, tableHeaderH, 'S');

  // Header column divider lines
  doc.line(col2X, tableY, col2X, tableY + tableHeaderH);
  doc.line(col3X, tableY, col3X, tableY + tableHeaderH);

  // Header text
  doc.setFont(fontName, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('DESCRIPTION', col1X + 8, tableY + 11);
  doc.text('HSN/SAC', col2X + colHsnW / 2, tableY + 11, { align: 'center' });
  doc.text('AMOUNT', colRightX - 8, tableY + 11, { align: 'right' });

  // Calculate totals using shared calculation utility
  const totals = calculateInvoiceTotals({
    invoiceType: invoice.invoiceType,
    items: invoice.items,
    taxMode: invoice.taxMode,
    cgstRate: invoice.cgstRate,
    sgstRate: invoice.sgstRate,
    igstRate: invoice.igstRate,
  });

  // Dynamic row structure
  interface TableRowDef {
    type: 'item' | 'blank' | 'cgst' | 'sgst' | 'igst';
    description: string;
    hsnSac?: string;
    amount?: string;
    isBold?: boolean;
    isSgstIndent?: boolean;
  }

  const tableRows: TableRowDef[] = [];
  const maxDescW = colDescW - 16;
  const items = invoice.items || [];

  items.forEach((item, itemIdx) => {
    const descText = item.description || '';
    const lines = doc.splitTextToSize(descText, maxDescW);
    const descLines: string[] = lines.length > 0 ? lines : [''];

    // Check if amount is actually provided or left blank
    const hasAmount =
      item.amount !== '' &&
      item.amount !== undefined &&
      item.amount !== null &&
      !isNaN(Number(item.amount));
    const amtStr = hasAmount ? formatIndianCurrency(Number(item.amount)) : '';

    descLines.forEach((lineText: string, lineIdx: number) => {
      tableRows.push({
        type: 'item',
        description: lineText,
        hsnSac: lineIdx === 0 ? (item.hsnSac || '') : '',
        amount: lineIdx === 0 ? amtStr : '',
      });
    });

    // Leave one consistent blank line of vertical space between consecutive item descriptions
    if (itemIdx < items.length - 1) {
      tableRows.push({
        type: 'blank',
        description: '',
        hsnSac: '',
        amount: '',
      });
    }
  });

  // For Tax Invoice, leave one blank line between items and tax rows if items exist (matching reference bill)
  if (isTax && items.length > 0) {
    tableRows.push({
      type: 'blank',
      description: '',
      hsnSac: '',
      amount: '',
    });
  }

  // Tax Breakdown Rows
  if (isTax) {
    if (totals.taxMode === 'cgst_sgst') {
      tableRows.push({
        type: 'cgst',
        description: `Add: CGST @ ${totals.cgstRate || 0}%`,
        amount: formatIndianCurrency(totals.cgstAmount),
        isBold: true,
      });
      tableRows.push({
        type: 'sgst',
        description: `SGST @ ${totals.sgstRate || 0}%`,
        amount: formatIndianCurrency(totals.sgstAmount),
        isBold: true,
        isSgstIndent: true,
      });
    } else if (totals.taxMode === 'igst') {
      tableRows.push({
        type: 'igst',
        description: `Add: IGST @ ${totals.igstRate || 0}%`,
        amount: formatIndianCurrency(totals.igstAmount),
        isBold: true,
      });
    }
  }

  // Maintain minimum 11 rows to match the tall reference bill height
  const minRows = 11;
  while (tableRows.length < minRows) {
    tableRows.push({
      type: 'blank',
      description: '',
      hsnSac: '',
      amount: '',
    });
  }

  const totalRowsCount = tableRows.length;

  // Adjust row heights dynamically so text never overlaps, clips, or crosses table borders
  const availableBodyH = 360;
  const standardRowH = 13.5;
  const rowH =
    totalRowsCount * standardRowH > availableBodyH
      ? Math.max(10, availableBodyH / totalRowsCount)
      : standardRowH;
  const bodyHeight = totalRowsCount * rowH;

  let currentY = tableY + tableHeaderH;

  // Draw rows and alternating grey backgrounds (#f1f1f1 on rows 1, 3, 5, etc.)
  for (let i = 0; i < totalRowsCount; i++) {
    const row = tableRows[i];

    if (i % 2 === 1) {
      doc.setFillColor(altRowColor.r, altRowColor.g, altRowColor.b);
      doc.rect(col1X, currentY, tableWidth, rowH, 'F');
    }

    if (row.type !== 'blank') {
      doc.setFont(fontName, row.isBold ? 'bold' : 'normal');
      doc.setFontSize(8.52);
      doc.setTextColor(0, 0, 0);

      const textY = currentY + (rowH * 0.7);

      // Description (left)
      if (row.description) {
        let descX = col1X + 8;
        if (row.isSgstIndent) {
          doc.setFont(fontName, 'bold');
          const addPrefixWidth = doc.getTextWidth('Add: ');
          descX += addPrefixWidth;
        }
        doc.text(row.description, descX, textY);
      }

      // HSN/SAC (centered)
      if (row.hsnSac) {
        doc.text(row.hsnSac, col2X + colHsnW / 2, textY, { align: 'center' });
      }

      // Amount (right aligned with 2 decimals when present)
      if (row.amount) {
        doc.text(row.amount, colRightX - 8, textY, { align: 'right' });
      }
    }

    currentY += rowH;
  }

  // Draw continuous outer border around table body
  doc.rect(col1X, tableY + tableHeaderH, tableWidth, bodyHeight, 'S');

  // Draw continuous vertical column divider lines through table body
  doc.line(col2X, tableY + tableHeaderH, col2X, tableY + tableHeaderH + bodyHeight);
  doc.line(col3X, tableY + tableHeaderH, col3X, tableY + tableHeaderH + bodyHeight);

  // Sub-Total / Total Row
  const subtotalRowH = 15;
  const subtotalY = tableY + tableHeaderH + bodyHeight;

  // Border around Sub-Total / Total and Amount cells
  doc.rect(col2X, subtotalY, colHsnW, subtotalRowH, 'S');
  doc.rect(col3X, subtotalY, colAmountW, subtotalRowH, 'S');

  doc.setFont(fontName, 'bold');
  doc.setFontSize(8.52);
  doc.setTextColor(0, 0, 0);
  const bottomLabel = isTax ? 'Total' : 'Sub-Total';
  doc.text(bottomLabel, col2X + 6, subtotalY + 11);

  doc.setFont(fontName, 'bold');
  doc.setFontSize(9.5);
  const finalTotalStr = formatIndianCurrency(isTax ? totals.grandTotal : totals.subtotal);
  doc.text(finalTotalStr, colRightX - 8, subtotalY + 11, { align: 'right' });

  // 9. Bottom Section: Payment Terms & Account Details on Left; SCAN AND PAY on Right
  const bottomSectionY = subtotalY + subtotalRowH + 18;
  const bottomWLeft = 348; // Exact width from stream 1: 347.8 pt

  // Payment Terms
  const termsHeaderH = 13.5;
  doc.setFillColor(navyColor.r, navyColor.g, navyColor.b);
  doc.rect(marginX, bottomSectionY, bottomWLeft, termsHeaderH, 'F');
  doc.rect(marginX, bottomSectionY, bottomWLeft, termsHeaderH, 'S');

  doc.setFont(fontName, 'bold');
  doc.setFontSize(8.52);
  doc.setTextColor(255, 255, 255);
  doc.text('Payment Terms:', marginX + 6, bottomSectionY + 9.5);

  const termsText = settings?.paymentTerms || '1. 50% Advance & Balance 50% after completion of work.';
  const termsLines = doc.splitTextToSize(termsText, bottomWLeft - 12);
  const termsContentH = Math.max(18, termsLines.length * 11 + 4);

  doc.rect(marginX, bottomSectionY + termsHeaderH, bottomWLeft, termsContentH, 'S');
  doc.setFont(fontName, 'normal');
  doc.setTextColor(0, 0, 0);

  let termLineY = bottomSectionY + termsHeaderH + 10;
  for (const line of termsLines) {
    doc.text(line, marginX + 6, termLineY);
    termLineY += 10.5;
  }

  // Account Details
  const acctBoxY = bottomSectionY + termsHeaderH + termsContentH + 10;
  const acctHeaderH = 13.5;
  doc.setFillColor(navyColor.r, navyColor.g, navyColor.b);
  doc.rect(marginX, acctBoxY, bottomWLeft, acctHeaderH, 'F');
  doc.rect(marginX, acctBoxY, bottomWLeft, acctHeaderH, 'S');

  doc.setFont(fontName, 'bold');
  doc.setFontSize(8.52);
  doc.setTextColor(255, 255, 255);
  doc.text('Account Details:', marginX + 6, acctBoxY + 9.5);

  const acctContentH = 68;
  doc.rect(marginX, acctBoxY + acctHeaderH, bottomWLeft, acctContentH, 'S');

  doc.setFont(fontName, 'normal');
  doc.setTextColor(0, 0, 0);
  let acctLineY = acctBoxY + acctHeaderH + 11;

  doc.text(settings?.bankName || 'Slice Small Finance Bank', marginX + 6, acctLineY);
  acctLineY += 12;

  doc.text('A/C No.-', marginX + 6, acctLineY);
  doc.text(settings?.accountNo || '033311501053615', marginX + 56, acctLineY);
  acctLineY += 12;

  doc.text('Name-', marginX + 6, acctLineY);
  doc.text(settings?.accountHolderName || 'Manshi Group Of Services', marginX + 56, acctLineY);
  acctLineY += 12;

  doc.text('IFSC Code-', marginX + 6, acctLineY);
  doc.text(settings?.ifscCode || 'NESF0000333', marginX + 56, acctLineY);
  acctLineY += 12;

  doc.text('Branch-', marginX + 6, acctLineY);
  doc.text(settings?.branch || 'Koramangala, Bengaluru', marginX + 56, acctLineY);

  // 10. SCAN AND PAY (Right Side)
  const qrAreaW = 124;
  const qrX = pageWidth - marginX - qrAreaW;
  const qrTopY = bottomSectionY + 2;

  doc.setFont(fontName, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('SCAN AND PAY', qrX + qrAreaW / 2, qrTopY + 10, { align: 'center' });

  // QR Scanner Image
  const qrUrl = settings?.qrScannerUrl || settings?.qrScannerDataUrl || '/assets/qr_scanner.jpg';
  try {
    const qrData = await fetchImageAsDataUrl(qrUrl);
    if (qrData) {
      const qrImgW = 124;
      const qrImgH = 129;
      doc.addImage(qrData, 'JPEG', qrX, qrTopY + 16, qrImgW, qrImgH);
    }
  } catch (err) {
    console.warn('Error adding QR scanner to PDF:', err);
  }

  // 11. Thank You Footer
  const footerY = acctBoxY + acctHeaderH + acctContentH + 24;
  doc.setFont(fontName, 'bolditalic');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text('Thank You For Your Business! Eager to Serve You Again', marginX, footerY);

  return doc;
}

/**
 * Sanitizes a customer or business name for use in filesystem filenames:
 * - Strips control characters
 * - Replaces invalid filesystem characters (/ \ ? % * : | " < >) with a hyphen
 * - Collapses consecutive hyphens and whitespace
 * - Trims leading and trailing hyphens, periods, and spaces
 * - Falls back to 'Customer' if the name is empty or contains only invalid characters
 */
export function sanitizeCustomerNameForFilename(customerName?: string): string {
  if (!customerName) return 'Customer';
  const sanitized = customerName
    .replace(/[\x00-\x1f\x80-\x9f]/g, '')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/-+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[-. ]+|[-. ]+$/g, '')
    .trim();

  return sanitized || 'Customer';
}

/**
 * Returns the standardized PDF filename for an invoice:
 * - Regular Invoice: `[Customer-Business-Name] Invoice.pdf`
 * - Tax Invoice: `[Customer-Business-Name] Tax Invoice.pdf`
 *
 * If duplicate detection is requested or if `appendInvoiceNumber` is true (e.g. for batch/monthly backups
 * where multiple invoices have the same customer name), the invoice number is appended to prevent overwriting:
 * `[Customer-Business-Name] [Tax] Invoice - [InvoiceNo].pdf`
 */
export function getInvoicePdfFilename(
  invoice: { customerName?: string; invoiceType?: InvoiceType; invoiceNumber?: string },
  options?: { appendInvoiceNumber?: boolean; existingFilenames?: Set<string> | string[] }
): string {
  const customer = sanitizeCustomerNameForFilename(invoice.customerName);
  const isTax = invoice.invoiceType === 'tax';
  const typeLabel = isTax ? 'Tax Invoice' : 'Invoice';
  const baseName = `${customer} ${typeLabel}`;
  let finalName = `${baseName}.pdf`;

  let shouldAppend = options?.appendInvoiceNumber ?? false;

  if (options?.existingFilenames) {
    const exists = Array.isArray(options.existingFilenames)
      ? options.existingFilenames.includes(finalName)
      : options.existingFilenames.has(finalName);
    if (exists) {
      shouldAppend = true;
    }
  }

  if (shouldAppend && invoice.invoiceNumber) {
    const safeInvNo = invoice.invoiceNumber.replace(/[/\\?%*:|"<>]/g, '-').trim();
    finalName = `${baseName} - ${safeInvNo}.pdf`;
  }

  return finalName;
}

/**
 * Generates unique PDF filenames for an array of invoices (e.g. monthly backups / batch downloads).
 * If multiple invoices have the same customer name and invoice type, appends the invoice number
 * to ensure no files are overwritten.
 */
export function getUniqueInvoicePdfFilenames(
  invoices: InvoiceRecord[]
): Map<string, string> {
  const result = new Map<string, string>(); // invoice.id -> unique filename
  const counts = new Map<string, number>();

  for (const inv of invoices) {
    const base = getInvoicePdfFilename(inv);
    counts.set(base, (counts.get(base) || 0) + 1);
  }

  const assigned = new Set<string>();
  for (const inv of invoices) {
    const base = getInvoicePdfFilename(inv);
    let filename = base;
    if ((counts.get(base) || 0) > 1 || assigned.has(filename)) {
      filename = getInvoicePdfFilename(inv, { appendInvoiceNumber: true });
    }
    assigned.add(filename);
    result.set(inv.id, filename);
  }

  return result;
}

export async function downloadInvoicePDF(
  invoice: InvoiceRecord,
  companySettings?: CompanySettings
): Promise<void> {
  const doc = await createInvoicePDFDocument(invoice, companySettings);
  const filename = getInvoicePdfFilename(invoice);
  doc.save(filename);
}
