import React from 'react';
import type { InvoiceRecord, CompanySettings } from '../../types';
import { formatDateToIndian, formatIndianCurrency } from '../../utils/financialYear';
import { calculateInvoiceTotals } from '../../utils/taxCalculator';
import './InvoiceDocument.css';

interface InvoiceDocumentProps {
  invoice: Partial<InvoiceRecord>;
  settings?: CompanySettings;
  scale?: number;
}

export const InvoiceDocument: React.FC<InvoiceDocumentProps> = ({
  invoice,
  settings,
  scale = 1,
}) => {
  const activeSettings = invoice.companySnapshot || settings;

  const logoSrc = activeSettings?.logoUrl || activeSettings?.logoDataUrl || '/assets/logo.png';
  const qrSrc = activeSettings?.qrScannerUrl || activeSettings?.qrScannerDataUrl || '/assets/qr_scanner.jpg';

  const items = invoice.items || [];
  const isTax = invoice.invoiceType === 'tax';

  const totals = calculateInvoiceTotals({
    invoiceType: invoice.invoiceType,
    items: invoice.items,
    taxMode: invoice.taxMode,
    cgstRate: invoice.cgstRate,
    sgstRate: invoice.sgstRate,
    igstRate: invoice.igstRate,
  });

  // Ensure visual balance like reference invoice (minimum 11 rows)
  const minRows = 11;
  const taxRowCount = isTax ? (totals.taxMode === 'igst' ? 1 : 2) : 0;
  const totalRowsCount = Math.max(items.length + taxRowCount, minRows);
  const emptyRowsCount = Math.max(0, totalRowsCount - taxRowCount - items.length);

  const formattedDate = invoice.date
    ? formatDateToIndian(invoice.date)
    : formatDateToIndian(new Date().toISOString().slice(0, 10));

  const mobileVal = invoice.customerMobile?.trim();

  return (
    <div
      className="invoice-document-scaler"
      style={{
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
      }}
    >
      <div className="invoice-document a4-sheet" id="invoice-printable-area">
        {/* Top Header Row: Logo & Company Name beside it; INVOICE / TAX INVOICE title on the right */}
        <div className="inv-top-row">
          <div className="inv-company-header-group">
            <div className="inv-logo-box">
              {logoSrc ? (
                <img src={logoSrc} alt="Company Logo" className="inv-logo-img" />
              ) : (
                <div className="inv-logo-placeholder">Logo</div>
              )}
            </div>
            <div className="inv-company-title-wrap">
              <h1 className="inv-company-name">
                {activeSettings?.companyName || 'Manshi Group Of Services'}
              </h1>
            </div>
          </div>

          <div className="inv-title">{isTax ? 'TAX INVOICE' : 'INVOICE'}</div>
        </div>

        {/* Fix 2: Company Address block directly BELOW logo, starting from left margin */}
        <div className="inv-company-address">
          <div>{activeSettings?.addressLine1 || 'Office No. 2B, 2nd Floor, Bhawani Market,'}</div>
          <div>{activeSettings?.addressLine2 || 'Sector-27, Noida, Gautam Buddha Nagar,'}</div>
          <div>{activeSettings?.addressLine3 || 'Uttar Pradesh-201301'}</div>
        </div>

        {/* Fix 1: Middle Row with GSTIN/Phone/Email/Website on Left; Date & Invoice No aligned on Right */}
        <div className="inv-middle-row">
          <div className="inv-company-contact">
            <div className="inv-contact-line">
              <span className="inv-contact-label inv-label-bold">GSTIN :</span>
              <span className="inv-contact-val inv-val-bold">{activeSettings?.gstin || '09PQRPK4105E1ZG'}</span>
            </div>
            <div className="inv-contact-line">
              <span className="inv-contact-label inv-label-bold">Phone:</span>
              <span className="inv-contact-val inv-val-bold">{activeSettings?.phone || '8076187274'}</span>
            </div>
            <div className="inv-contact-line">
              <span className="inv-contact-label inv-link-label">
                <a href={`mailto:${activeSettings?.email || 'Info@Manshigroup.in'}`}>
                  Email id:-
                </a>
              </span>
              <span className="inv-contact-val inv-link-val">
                <a href={`mailto:${activeSettings?.email || 'Info@Manshigroup.in'}`}>
                  {activeSettings?.email || 'Info@Manshigroup.in'}
                </a>
              </span>
            </div>
            <div className="inv-contact-line">
              <span className="inv-contact-label inv-link-label">
                <a href={`http://${activeSettings?.website || 'www.Manshigroup.in'}`} target="_blank" rel="noreferrer">
                  Website:-
                </a>
              </span>
              <span className="inv-contact-val inv-link-val">
                <a href={`http://${activeSettings?.website || 'www.Manshigroup.in'}`} target="_blank" rel="noreferrer">
                  {activeSettings?.website || 'www.Manshigroup.in'}
                </a>
              </span>
            </div>
          </div>

          <div className="inv-meta-block">
            <div className="inv-field-row">
              <span className="inv-field-label">Date</span>
              <div className="inv-field-box">
                {formattedDate}
              </div>
            </div>

            <div className="inv-field-row">
              <span className="inv-field-label">Invoice No.</span>
              <div className="inv-field-box">
                {invoice.invoiceNumber || 'MGS/2026-27/079'}
              </div>
            </div>
          </div>
        </div>

        {/* Bill To Section */}
        <div className="inv-bill-to-section">
          <div className="inv-box-header">Bill To :-</div>
          <div className="inv-bill-to-body">
            <div className="inv-bill-to-row inv-bill-to-name">
              {invoice.customerName ? invoice.customerName : 'M/s. Brushspace'}
            </div>
            <div className="inv-bill-to-row inv-bill-to-address">
              {invoice.customerAddress
                ? invoice.customerAddress.split('\n').map((line, idx) => (
                    <div key={idx}>{line}</div>
                  ))
                : (
                  <>
                    <div>F-24/2,3rd floor, Nandi Appartment,</div>
                    <div>Sector -24, Rohini, Delhi - 110042</div>
                  </>
                )}
            </div>
            <div className="inv-bill-to-row inv-bill-to-mobile">
              Mobile &nbsp;: &nbsp;{mobileVal || '+91 88604 30075'}
            </div>
            {isTax && (
              <div className="inv-bill-to-row inv-bill-to-gstin">
                GSTIN &nbsp; : &nbsp;{invoice.customerGstin?.trim() || ''}
              </div>
            )}
          </div>
        </div>

        {/* Main Description Table */}
        <div className="inv-items-table-wrapper">
          <table className="inv-items-table">
            <thead>
              <tr>
                <th className="col-desc">DESCRIPTION</th>
                <th className="col-hsn">HSN/SAC</th>
                <th className="col-amount">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id || idx} className={idx % 2 === 1 ? 'row-stripe' : 'row-white'}>
                  <td className="col-desc">{item.description}</td>
                  <td className="col-hsn">{item.hsnSac || ''}</td>
                  <td className="col-amount">{formatIndianCurrency(Number(item.amount) || 0)}</td>
                </tr>
              ))}
              {Array.from({ length: emptyRowsCount }).map((_, idx) => {
                const totalIndex = items.length + idx;
                return (
                  <tr key={`empty-${idx}`} className={totalIndex % 2 === 1 ? 'row-stripe' : 'row-white'}>
                    <td className="col-desc">&nbsp;</td>
                    <td className="col-hsn">&nbsp;</td>
                    <td className="col-amount">&nbsp;</td>
                  </tr>
                );
              })}
              {isTax && totals.taxMode === 'cgst_sgst' && (
                <>
                  <tr className={(totalRowsCount - 2) % 2 === 1 ? 'row-stripe' : 'row-white'}>
                    <td className="col-desc" style={{ fontWeight: 600 }}>
                      Add: CGST @ {totals.cgstRate || 0}%
                    </td>
                    <td className="col-hsn"></td>
                    <td className="col-amount">{formatIndianCurrency(totals.cgstAmount)}</td>
                  </tr>
                  <tr className={(totalRowsCount - 1) % 2 === 1 ? 'row-stripe' : 'row-white'}>
                    <td className="col-desc" style={{ fontWeight: 600 }}>
                      <span style={{ visibility: 'hidden' }}>Add:&nbsp;</span>SGST @ {totals.sgstRate || 0}%
                    </td>
                    <td className="col-hsn"></td>
                    <td className="col-amount">{formatIndianCurrency(totals.sgstAmount)}</td>
                  </tr>
                </>
              )}
              {isTax && totals.taxMode === 'igst' && (
                <tr className={(totalRowsCount - 1) % 2 === 1 ? 'row-stripe' : 'row-white'}>
                  <td className="col-desc" style={{ fontWeight: 600 }}>
                    Add: IGST @ {totals.igstRate || 0}%
                  </td>
                  <td className="col-hsn"></td>
                  <td className="col-amount">{formatIndianCurrency(totals.igstAmount)}</td>
                </tr>
              )}
              <tr className="subtotal-row">
                <td className="col-desc subtotal-empty-cell"></td>
                <td className="col-hsn subtotal-label">{isTax ? 'Total' : 'Sub-Total'}</td>
                <td className="col-amount subtotal-value">
                  {formatIndianCurrency(isTax ? totals.grandTotal : totals.subtotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Bottom Section: Payment terms, Bank details on Left; SCAN AND PAY QR on Right */}
        <div className="inv-bottom-section">
          {/* Left Column: Terms + Bank + Footer Greeting */}
          <div className="inv-bottom-left">
            <div className="inv-terms-box">
              <div className="inv-box-header">Payment Terms:</div>
              <div className="inv-terms-body">
                {activeSettings?.paymentTerms ? (
                  activeSettings.paymentTerms.split('\n').map((line, idx) => (
                    <div key={idx}>{line}</div>
                  ))
                ) : (
                  <div>1. 50% Advance & Balance 50% after completion of work.</div>
                )}
              </div>
            </div>

            <div className="inv-account-box">
              <div className="inv-box-header">Account Details:</div>
              <div className="inv-account-body">
                <div className="inv-bank-name">{activeSettings?.bankName || 'Slice Small Finance Bank'}</div>
                <div className="inv-acct-row">
                  <span className="inv-acct-lbl">A/C No.-</span>
                  <span className="inv-acct-val">{activeSettings?.accountNo || '033311501053615'}</span>
                </div>
                <div className="inv-acct-row">
                  <span className="inv-acct-lbl">Name-</span>
                  <span className="inv-acct-val">{activeSettings?.accountHolderName || 'Manshi Group Of Services'}</span>
                </div>
                <div className="inv-acct-row">
                  <span className="inv-acct-lbl">IFSC Code-</span>
                  <span className="inv-acct-val">{activeSettings?.ifscCode || 'NESF0000333'}</span>
                </div>
                <div className="inv-acct-row">
                  <span className="inv-acct-lbl">Branch-</span>
                  <span className="inv-acct-val">{activeSettings?.branch || 'Koramangala, Bengaluru'}</span>
                </div>
              </div>
            </div>

            <div className="inv-footer-thankyou">
              Thank You For Your Business! Eager to Serve You Again
            </div>
          </div>

          {/* Right Column: SCAN AND PAY */}
          <div className="inv-bottom-right">
            <div className="inv-scan-title">SCAN AND PAY</div>
            <div className="inv-qr-card">
              {qrSrc ? (
                <img src={qrSrc} alt="Payment Scanner" className="inv-qr-img" />
              ) : (
                <div className="inv-qr-placeholder">QR Scanner</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
