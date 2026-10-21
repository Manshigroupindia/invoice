import React, { useState, useMemo } from 'react';
import {
  X,
  Download,
  Calendar,
  FileSpreadsheet,
  FileText,
  Archive,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import type { InvoiceRecord, CompanySettings } from '../../types';
import {
  MONTH_NAMES,
  generateMonthlyBackupZip,
  filterInvoicesByMonth,
  type BackupProgressInfo,
} from '../../utils/monthlyBackupService';
import { formatIndianCurrency } from '../../utils/financialYear';

interface MonthlyBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoices: InvoiceRecord[];
  companySettings?: CompanySettings;
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
}

export const MonthlyBackupModal: React.FC<MonthlyBackupModalProps> = ({
  isOpen,
  onClose,
  invoices,
  companySettings,
  onSuccessToast,
  onErrorToast,
}) => {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(currentDate.getMonth());
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<BackupProgressInfo | null>(null);

  // Available year options (e.g. from 2023 to currentYear + 1)
  const yearOptions = useMemo(() => {
    const curY = new Date().getFullYear();
    const years: number[] = [];
    for (let y = curY - 3; y <= curY + 1; y++) {
      years.push(y);
    }
    return years;
  }, []);

  // Quick preview count based on local memory list
  const matchingInvoices = useMemo(() => {
    return filterInvoicesByMonth(invoices, selectedYear, selectedMonthIndex);
  }, [invoices, selectedYear, selectedMonthIndex]);

  const taxInvoicesCount = useMemo(() => {
    return matchingInvoices.filter((inv) => inv.invoiceType === 'tax').length;
  }, [matchingInvoices]);

  const regularInvoicesCount = matchingInvoices.length - taxInvoicesCount;

  const totalAmount = useMemo(() => {
    return matchingInvoices.reduce(
      (sum, inv) => sum + (inv.grandTotal ?? inv.subtotal ?? 0),
      0
    );
  }, [matchingInvoices]);

  if (!isOpen) return null;

  const monthName = MONTH_NAMES[selectedMonthIndex];
  const excelFilename = `Manshi_Invoices_${monthName}_${selectedYear}.xlsx`;
  const zipFilename = `Manshi_Invoices_${monthName}_${selectedYear}_Backup.zip`;

  const handleDownload = async () => {
    try {
      setIsGenerating(true);
      setProgress({
        percent: 5,
        stage: 'fetching',
        message: 'Initializing monthly backup...',
      });

      const result = await generateMonthlyBackupZip({
        year: selectedYear,
        monthIndex: selectedMonthIndex,
        companySettings,
        onProgress: (info) => {
          setProgress(info);
        },
      });

      if (result.failedPdfs.length > 0) {
        const failedNos = result.failedPdfs.map((f) => f.invoiceNumber).join(', ');
        onErrorToast(
          `Backup downloaded with ${result.totalInvoices - result.failedPdfs.length} PDFs. Warning: ${result.failedPdfs.length} invoice(s) could not be rendered: ${failedNos}. See ERRORS_REPORT.txt inside ZIP.`
        );
      } else {
        onSuccessToast(
          `Monthly backup downloaded successfully! Generated ${result.totalInvoices} invoice PDFs and Excel register.`
        );
      }

      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Monthly backup failed';
      onErrorToast(msg);
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={isGenerating ? undefined : onClose}>
      <div
        className="modal-container"
        style={{ maxWidth: '580px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
              }}
            >
              <Archive size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', color: '#0f172a' }}>
                Download Monthly Backup
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                Offline Excel register and authentic A4 invoice PDFs
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: isGenerating ? 'not-allowed' : 'pointer',
              color: '#64748b',
              padding: '4px',
              borderRadius: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: '20px 24px' }}>
          {/* Month & Year Selectors */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr',
              gap: '12px',
              marginBottom: '18px',
            }}
          >
            <div>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar size={14} color="#3b82f6" />
                Select Month
              </label>
              <select
                className="form-select"
                value={selectedMonthIndex}
                disabled={isGenerating}
                onChange={(e) => setSelectedMonthIndex(Number(e.target.value))}
                style={{ fontWeight: 600, color: '#0f172a' }}
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">Select Year</label>
              <select
                className="form-select"
                value={selectedYear}
                disabled={isGenerating}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                style={{ fontWeight: 600, color: '#0f172a' }}
              >
                {yearOptions.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Month Summary Card */}
          <div
            style={{
              background: matchingInvoices.length > 0 ? '#f8fafc' : '#fffbeb',
              border: `1px solid ${matchingInvoices.length > 0 ? '#e2e8f0' : '#fde68a'}`,
              borderRadius: '10px',
              padding: '14px 16px',
              marginBottom: '18px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
                marginBottom: '8px',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                {monthName} {selectedYear} Invoices
              </span>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: matchingInvoices.length > 0 ? '#dbeafe' : '#fee2e2',
                  color: matchingInvoices.length > 0 ? '#1e40af' : '#b91c1c',
                }}
              >
                {matchingInvoices.length} Found
              </span>
            </div>

            {matchingInvoices.length > 0 ? (
              <div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                  <span>
                    Tax Invoices: <strong style={{ color: '#0f172a' }}>{taxInvoicesCount}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Regular Invoices: <strong style={{ color: '#0f172a' }}>{regularInvoicesCount}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Total: <strong style={{ color: '#1e3a8a' }}>₹ {formatIndianCurrency(totalAmount)}</strong>
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  Full records will be queried fresh from Cloud Firestore during download.
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#92400e',
                  fontSize: '12.5px',
                }}
              >
                <AlertCircle size={16} />
                <span>No invoices recorded for {monthName} {selectedYear}. Please choose another month.</span>
              </div>
            )}
          </div>

          {/* Backup Contents Info Box */}
          <div
            style={{
              background: '#f1f5f9',
              borderRadius: '10px',
              padding: '12px 14px',
              fontSize: '12px',
              color: '#334155',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              marginBottom: '16px',
            }}
          >
            <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={15} color="#16a34a" />
              Backup Package Contents:
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileSpreadsheet size={15} color="#059669" />
              <span>
                <strong>Excel Register:</strong> <code>{excelFilename}</code> (16 columns, numeric values, totals)
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={15} color="#2563eb" />
              <span>
                <strong>PDF Invoices:</strong> Authentic A4 PDFs for every invoice with clean, collision-free filenames
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Archive size={15} color="#d97706" />
              <span>
                <strong>ZIP Archive:</strong> <code>{zipFilename}</code> (100% offline, standalone)
              </span>
            </div>
          </div>

          {/* Progress Section */}
          {isGenerating && progress && (
            <div
              style={{
                marginTop: '12px',
                padding: '14px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '8px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: '#1e3a8a',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Loader2 size={14} className="spin-icon" style={{ animation: 'spin 1s linear infinite' }} />
                  {progress.message}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#1d4ed8' }}>
                  {progress.percent}%
                </span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '7px',
                  background: '#dbeafe',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progress.percent}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #2563eb, #1d4ed8)',
                    transition: 'width 0.25s ease',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isGenerating}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={isGenerating || matchingInvoices.length === 0}
            onClick={handleDownload}
            style={{
              opacity: isGenerating || matchingInvoices.length === 0 ? 0.6 : 1,
              cursor: isGenerating || matchingInvoices.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Generating Backup...
              </>
            ) : (
              <>
                <Download size={16} />
                Download {monthName} Backup (.zip)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
