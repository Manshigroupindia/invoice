import React, { useState, useMemo } from 'react';
import { X, FileSpreadsheet, Download, Loader2, Calendar, Filter } from 'lucide-react';
import type { InvoiceRecord } from '../../types';
import { MONTH_NAMES } from '../../utils/monthlyBackupService';
import { getAllInvoicesFirestore } from '../../services/firestoreService';
import { downloadMonthlyExcelReport } from '../../utils/monthlyExcelExport';

interface MonthlyExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  cachedInvoices?: InvoiceRecord[];
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
}

export const MonthlyExcelModal: React.FC<MonthlyExcelModalProps> = ({
  isOpen,
  onClose,
  cachedInvoices = [],
  onSuccessToast,
  onErrorToast,
}) => {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(currentDate.getMonth());
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState<'all' | 'regular' | 'tax'>('all');
  const [isDownloading, setIsDownloading] = useState(false);

  // Year options: current year - 3 to current year + 1
  const yearOptions = useMemo(() => {
    const curY = new Date().getFullYear();
    const list: number[] = [];
    for (let y = curY - 3; y <= curY + 1; y++) {
      list.push(y);
    }
    return list;
  }, []);

  // Quick count preview based on currently loaded in-memory invoices
  const previewCount = useMemo(() => {
    const targetPrefix = `${selectedYear}-${String(selectedMonthIndex + 1).padStart(2, '0')}`;
    return cachedInvoices.filter((inv) => {
      if (!inv.date) return false;
      const inMonth =
        inv.date.startsWith(targetPrefix) ||
        new Date(inv.date).getMonth() === selectedMonthIndex;
      if (!inMonth) return false;
      if (invoiceTypeFilter === 'regular') return inv.invoiceType === 'regular' || (!inv.invoiceType && !inv.totalTax && !inv.cgstRate && !inv.sgstRate && !inv.igstRate);
      if (invoiceTypeFilter === 'tax') return inv.invoiceType === 'tax' || (!inv.invoiceType && !!(inv.totalTax || inv.cgstRate || inv.sgstRate || inv.igstRate));
      return true;
    }).length;
  }, [cachedInvoices, selectedYear, selectedMonthIndex, invoiceTypeFilter]);

  if (!isOpen) return null;

  const monthName = MONTH_NAMES[selectedMonthIndex];

  const handleDownload = async () => {
    try {
      setIsDownloading(true);

      // Fetch ALL matching invoices from Firestore, not just in-memory/page view
      const allInvoices = await getAllInvoicesFirestore();
      const invoicesToUse = allInvoices.length > 0 ? allInvoices : cachedInvoices;

      await downloadMonthlyExcelReport({
        monthIndex: selectedMonthIndex,
        year: selectedYear,
        invoiceTypeFilter,
        invoices: invoicesToUse,
      });

      onSuccessToast(`Excel register for ${monthName} ${selectedYear} downloaded successfully.`);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate Excel report';
      onErrorToast(msg);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!isDownloading) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-container"
        style={{ maxWidth: '520px', width: '100%', margin: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#ecfdf5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#059669',
              }}
            >
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Download Monthly Excel
              </h3>
              <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                Generate official Excel register with tax breakdown & summary
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDownloading}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: isDownloading ? 'not-allowed' : 'pointer',
              color: '#64748b',
              padding: '4px',
              borderRadius: '6px',
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '20px 24px' }}>
          {/* Month & Year Selection Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '12.5px', fontWeight: 600 }}>
                <Calendar size={14} style={{ display: 'inline', marginRight: '5px', verticalAlign: '-2px' }} />
                Select Month
              </label>
              <select
                className="form-input"
                value={selectedMonthIndex}
                onChange={(e) => setSelectedMonthIndex(Number(e.target.value))}
                disabled={isDownloading}
                style={{ borderRadius: '8px', padding: '9px 12px', fontSize: '13.5px' }}
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '12.5px', fontWeight: 600 }}>
                Select Year
              </label>
              <select
                className="form-input"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                disabled={isDownloading}
                style={{ borderRadius: '8px', padding: '9px 12px', fontSize: '13.5px' }}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Invoice Type Selection */}
          <div style={{ marginBottom: '20px' }}>
            <label className="form-label" style={{ fontSize: '12.5px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
              <Filter size={14} style={{ display: 'inline', marginRight: '5px', verticalAlign: '-2px' }} />
              Invoice Type Filter
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {(['all', 'regular', 'tax'] as const).map((type) => {
                const label = type === 'all' ? 'All Invoices' : type === 'regular' ? 'Regular' : 'Tax Invoice';
                const isSelected = invoiceTypeFilter === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setInvoiceTypeFilter(type)}
                    disabled={isDownloading}
                    style={{
                      padding: '8px 10px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      borderRadius: '8px',
                      border: `1.5px solid ${isSelected ? '#1e3a8a' : '#e2e8f0'}`,
                      background: isSelected ? '#eff6ff' : '#ffffff',
                      color: isSelected ? '#1e3a8a' : '#475569',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.15s',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview Box */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Estimated Matching Invoices</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                {previewCount} Invoices ({monthName} {selectedYear})
              </div>
            </div>
            <span
              style={{
                fontSize: '11.5px',
                padding: '4px 8px',
                borderRadius: '6px',
                background: '#e0f2fe',
                color: '#0369a1',
                fontWeight: 600,
              }}
            >
              14 Columns + Summary
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isDownloading}
            style={{ padding: '8px 16px', fontSize: '13px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleDownload}
            disabled={isDownloading}
            style={{
              padding: '8px 20px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#059669',
              borderColor: '#059669',
            }}
          >
            {isDownloading ? (
              <>
                <Loader2 size={15} className="spinner" />
                <span>Generating Excel...</span>
              </>
            ) : (
              <>
                <Download size={15} />
                <span>Download Excel (.xlsx)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

