import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Download,
  Copy,
  Trash2,
  Eye,
  FileText,
  Edit,
  X,
  HardDrive,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ArrowLeft,
  Calendar,
  FileSpreadsheet,
  Layers,
} from 'lucide-react';
import type { InvoiceRecord, CompanySettings } from '../types';
import {
  subscribeInvoices,
  deleteInvoiceFirestore,
  getCompanySettingsFirestore,
  subscribeCompanySettings,
} from '../services/firestoreService';
import {
  uploadInvoicePdfToDrive,
  connectGoogleDrive,
  subscribeDriveConnection,
} from '../services/googleDriveClient';
import { deleteInvoice as deleteLocalInvoice } from '../db';
import { formatDateToIndian, formatIndianCurrency, compareInvoiceNumbersAsc } from '../utils/financialYear';
import { downloadInvoicePDF, formatDefaultPdfFilename } from '../utils/pdfGenerator';
import { MONTH_NAMES } from '../utils/monthlyBackupService';
import { InvoiceDocument } from '../components/invoice/InvoiceDocument';
import { MonthlyBackupModal } from '../components/invoice/MonthlyBackupModal';
import { MonthlyExcelModal } from '../components/invoice/MonthlyExcelModal';
import { PdfFilenameModal } from '../components/invoice/PdfFilenameModal';
import { ConfirmModal } from '../components/common/Feedback';

interface InvoiceHistoryPageProps {
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
  onEditInvoice: (invoice: InvoiceRecord) => void;
  onDuplicateInvoice: (invoice: InvoiceRecord) => void;
}

export const InvoiceHistoryPage: React.FC<InvoiceHistoryPageProps> = ({
  onSuccessToast,
  onErrorToast,
  onEditInvoice,
  onDuplicateInvoice,
}) => {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected invoice for full preview modal
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceRecord | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<InvoiceRecord | null>(null);
  const [invoiceToEditConfirm, setInvoiceToEditConfirm] = useState<InvoiceRecord | null>(null);

  // Month Selection Screen state: null initially displays the month selection screen
  const [selectedMonth, setSelectedMonth] = useState<number | 'all' | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(new Date().getFullYear());

  // Modals state
  const [isMonthlyBackupOpen, setIsMonthlyBackupOpen] = useState(false);
  const [isMonthlyExcelOpen, setIsMonthlyExcelOpen] = useState(false);

  // PDF Filename Modal state (Requirement 7)
  const [invoiceForPdf, setInvoiceForPdf] = useState<InvoiceRecord | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfDefaultFilename, setPdfDefaultFilename] = useState('');
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Google Drive client state
  const [driveConnected, setDriveConnected] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    // Initial fetch for settings
    getCompanySettingsFirestore().then(setSettings).catch(console.error);

    // Subscribe to settings changes
    const unsubSettings = subscribeCompanySettings((cloudSettings) => {
      setSettings(cloudSettings);
    });

    // Subscribe to Google Drive client connection state
    const unsubDrive = subscribeDriveConnection((connected) => {
      setDriveConnected(connected);
    });

    // Subscribe to real-time invoices list from Firestore
    setIsLoading(true);
    const unsubInvoices = subscribeInvoices(
      (cloudInvoices) => {
        setInvoices(cloudInvoices);
        setIsLoading(false);
      },
      (err) => {
        onErrorToast('Failed to sync invoices from Cloud Firestore: ' + err.message);
        setIsLoading(false);
      }
    );

    return () => {
      unsubSettings();
      unsubDrive();
      unsubInvoices();
    };
  }, []);

  // Available year options (e.g. from 2023 to currentYear + 1)
  const yearOptions = useMemo(() => {
    const curY = new Date().getFullYear();
    const list: number[] = [];
    for (let y = curY - 3; y <= curY + 1; y++) {
      list.push(y);
    }
    return list;
  }, []);

  const handleDriveRetry = async (invoice: InvoiceRecord) => {
    try {
      setRetryingId(invoice.id);
      if (!driveConnected) {
        await connectGoogleDrive();
      }
      const res = await uploadInvoicePdfToDrive(invoice, settings || undefined);
      if (res.status === 'backed_up') {
        onSuccessToast(`Invoice ${invoice.invoiceNumber} backed up to Google Drive.`);
      } else {
        onErrorToast('Google Drive upload failed. Please try again.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google Drive upload failed';
      onErrorToast(msg);
    } finally {
      setRetryingId(null);
    }
  };

  // Requirement 7: Ask PDF Filename Before Download
  const handleDownloadClick = (invoice: InvoiceRecord) => {
    setInvoiceForPdf(invoice);
    const def = formatDefaultPdfFilename(
      invoice.customerName,
      invoice.invoiceNumber,
      invoice.invoiceType
    );
    setPdfDefaultFilename(def);
    setPdfModalOpen(true);
  };

  const handleConfirmDownloadPdf = async (chosenFilename: string) => {
    if (!invoiceForPdf) return;
    try {
      setIsDownloadingPdf(true);
      await downloadInvoicePDF(invoiceForPdf, settings || undefined, chosenFilename);
      onSuccessToast(`Downloaded PDF for invoice ${invoiceForPdf.invoiceNumber}.`);
      setPdfModalOpen(false);
      setInvoiceForPdf(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'PDF generation failed';
      onErrorToast(msg);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!invoiceToDelete) return;
    try {
      await deleteInvoiceFirestore(invoiceToDelete.id);
      deleteLocalInvoice(invoiceToDelete.id).catch(() => {});
      onSuccessToast(
        `Invoice ${invoiceToDelete.invoiceNumber} deleted. Sequence number has been permanently retired in Firestore and will never be reused.`
      );
      setInvoiceToDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      onErrorToast(msg);
    }
  };

  const handleProceedEdit = () => {
    if (!invoiceToEditConfirm) return;
    const inv = invoiceToEditConfirm;
    setInvoiceToEditConfirm(null);
    onEditInvoice(inv);
  };

  // Month-wise count computation for month buttons
  const monthCounts = useMemo(() => {
    const counts = new Array(12).fill(0);
    for (const inv of invoices) {
      if (!inv.date) continue;
      const d = new Date(inv.date);
      const invMonth = !isNaN(d.getTime())
        ? d.getMonth()
        : parseInt(inv.date.split('-')[1], 10) - 1;
      const invYear = !isNaN(d.getTime())
        ? d.getFullYear()
        : parseInt(inv.date.split('-')[0], 10);

      if (selectedYear === 'all' || invYear === selectedYear) {
        if (invMonth >= 0 && invMonth < 12) {
          counts[invMonth]++;
        }
      }
    }
    return counts;
  }, [invoices, selectedYear]);

  const allInvoicesCountForYear = useMemo(() => {
    if (selectedYear === 'all') return invoices.length;
    return invoices.filter((inv) => {
      const d = new Date(inv.date);
      const y = !isNaN(d.getTime()) ? d.getFullYear() : parseInt(inv.date.split('-')[0], 10);
      return y === selectedYear;
    }).length;
  }, [invoices, selectedYear]);

  // Requirement 3 & 5: Filter and sort invoices
  const monthFilteredInvoices = useMemo(() => {
    let list = invoices;

    // Filter by selected month using invoice date (not creation date)
    if (selectedMonth !== null && selectedMonth !== 'all') {
      list = list.filter((inv) => {
        if (!inv.date) return false;
        const d = new Date(inv.date);
        const invMonth = !isNaN(d.getTime())
          ? d.getMonth()
          : parseInt(inv.date.split('-')[1], 10) - 1;
        const invYear = !isNaN(d.getTime())
          ? d.getFullYear()
          : parseInt(inv.date.split('-')[0], 10);

        if (selectedYear !== 'all' && invYear !== selectedYear) {
          return false;
        }
        return invMonth === selectedMonth;
      });
    } else if (selectedYear !== 'all') {
      list = list.filter((inv) => {
        if (!inv.date) return false;
        const d = new Date(inv.date);
        const invYear = !isNaN(d.getTime())
          ? d.getFullYear()
          : parseInt(inv.date.split('-')[0], 10);
        return invYear === selectedYear;
      });
    }

    // Filter by search query
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.customerName.toLowerCase().includes(q) ||
          (inv.customerGstin && inv.customerGstin.toLowerCase().includes(q)) ||
          inv.date.includes(q)
      );
    }

    // Requirement 3 & 5: Sort invoices according to the invoice number sequence within the selected month (ascending numerical order)
    return [...list].sort(compareInvoiceNumbersAsc);
  }, [invoices, selectedMonth, selectedYear, searchQuery]);

  const totalBilled = monthFilteredInvoices.reduce(
    (sum, inv) => sum + (inv.grandTotal || inv.subtotal || 0),
    0
  );

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Requirement 3: When the user opens Invoice History, first display a month selection screen */}
      {selectedMonth === null ? (
        <>
          {/* Top Header Bar for Month Selection */}
          <div className="history-top-bar">
            <div>
              <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a' }}>Invoice History</h2>
              <p style={{ fontSize: '13px', color: '#64748b' }}>
                Select a month to view its invoices in sequence, or view all saved invoices.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Year:</label>
                <select
                  className="form-input"
                  value={selectedYear}
                  onChange={(e) =>
                    setSelectedYear(e.target.value === 'all' ? 'all' : Number(e.target.value))
                  }
                  style={{ padding: '6px 12px', fontSize: '13px', borderRadius: '8px', height: '40px' }}
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                  <option value="all">All Years</option>
                </select>
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                style={{
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  height: '40px',
                  whiteSpace: 'nowrap',
                  borderColor: '#10b981',
                  color: '#065f46',
                  background: '#ecfdf5',
                }}
                onClick={() => setIsMonthlyExcelOpen(true)}
                title="Download formatted monthly Excel spreadsheet with summary"
              >
                <FileSpreadsheet size={16} color="#059669" />
                <span>Download Monthly Excel</span>
              </button>

              <button
                type="button"
                className="btn btn-primary"
                style={{
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  height: '40px',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => setIsMonthlyBackupOpen(true)}
                title="Download Monthly Backup containing Excel register and PDFs"
              >
                <Download size={16} />
                <span>Download Monthly Backup</span>
              </button>
            </div>
          </div>

          {/* Month Selection Buttons Card */}
          <div className="ui-card" style={{ padding: '28px', marginTop: '16px' }}>
            <div style={{ marginBottom: '22px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} color="#1e3a8a" />
                <span>Select Month</span>
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                Choose a month to display only its invoices, or select "All" to view every invoice.
              </p>
            </div>

            {/* Button: All */}
            <div style={{ marginBottom: '24px' }}>
              <button
                type="button"
                onClick={() => setSelectedMonth('all')}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  background: '#1e3a8a',
                  color: '#ffffff',
                  borderRadius: '10px',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(30, 58, 138, 0.15)',
                  transition: 'background-color 0.15s, transform 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1e3a8a')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.18)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Layers size={18} />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700 }}>All</div>
                    <div style={{ fontSize: '12px', opacity: 0.85 }}>Display invoices from every month</div>
                  </div>
                </div>
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.22)',
                    padding: '4px 12px',
                    borderRadius: '16px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                  }}
                >
                  {allInvoicesCountForYear} Invoices
                </div>
              </button>
            </div>

            {/* Group 1: January to June */}
            <div style={{ marginBottom: '24px' }}>
              <div
                style={{
                  fontSize: '11.5px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 700,
                  color: '#64748b',
                  marginBottom: '10px',
                }}
              >
                January – June
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                {[0, 1, 2, 3, 4, 5].map((idx) => {
                  const name = MONTH_NAMES[idx];
                  const count = monthCounts[idx];
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setSelectedMonth(idx)}
                      style={{
                        padding: '14px 12px',
                        borderRadius: '10px',
                        border: '1.5px solid #e2e8f0',
                        background: '#ffffff',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#3b82f6';
                        e.currentTarget.style.background = '#f8fafc';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e2e8f0';
                        e.currentTarget.style.background = '#ffffff';
                      }}
                    >
                      <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
                        {name}
                      </div>
                      <div
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          background: count > 0 ? '#eff6ff' : '#f1f5f9',
                          color: count > 0 ? '#1e3a8a' : '#64748b',
                        }}
                      >
                        {count} {count === 1 ? 'Invoice' : 'Invoices'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Group 2: July to December */}
            <div>
              <div
                style={{
                  fontSize: '11.5px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 700,
                  color: '#64748b',
                  marginBottom: '10px',
                }}
              >
                July – December
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                {[6, 7, 8, 9, 10, 11].map((idx) => {
                  const name = MONTH_NAMES[idx];
                  const count = monthCounts[idx];
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setSelectedMonth(idx)}
                      style={{
                        padding: '14px 12px',
                        borderRadius: '10px',
                        border: '1.5px solid #e2e8f0',
                        background: '#ffffff',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#3b82f6';
                        e.currentTarget.style.background = '#f8fafc';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e2e8f0';
                        e.currentTarget.style.background = '#ffffff';
                      }}
                    >
                      <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
                        {name}
                      </div>
                      <div
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          background: count > 0 ? '#eff6ff' : '#f1f5f9',
                          color: count > 0 ? '#1e3a8a' : '#64748b',
                        }}
                      >
                        {count} {count === 1 ? 'Invoice' : 'Invoices'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Invoices List View for Selected Month */}
          <div className="history-top-bar">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSelectedMonth(null)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12.5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 600,
                    color: '#1e3a8a',
                  }}
                  title="Return to Month Selection"
                >
                  <ArrowLeft size={15} />
                  <span>Back to Month Selection</span>
                </button>

                <span
                  style={{
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    padding: '3px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#1e3a8a',
                  }}
                >
                  {selectedMonth === 'all'
                    ? 'All Months'
                    : MONTH_NAMES[selectedMonth]}{' '}
                  {selectedYear !== 'all' ? selectedYear : ''}
                </span>
              </div>

              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
                {selectedMonth === 'all' ? 'All Invoices' : `${MONTH_NAMES[selectedMonth]} Invoices`}
              </h2>
              <p style={{ fontSize: '12.5px', color: '#64748b' }}>
                Sorted in ascending numerical order by invoice sequence number.
              </p>
            </div>

            {/* Stats & Search (Google Drive Connection pill removed as per Requirement 2) */}
            <div className="history-stats-group">
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '8px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  flex: 1,
                  minWidth: '200px',
                }}
              >
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                    Invoices
                  </span>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                    {monthFilteredInvoices.length}
                  </div>
                </div>
                <div style={{ width: '1px', height: '28px', background: '#e2e8f0' }} />
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                    Total Billed
                  </span>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#1e3a8a' }}>
                    ₹ {formatIndianCurrency(totalBilled)}
                  </div>
                </div>
              </div>

              <div className="history-search-box">
                <Search
                  size={16}
                  color="#94a3b8"
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search by invoice no. or customer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: '36px' }}
                />
              </div>

              {/* Requirement 6: Download Monthly Excel */}
              <button
                type="button"
                className="btn btn-secondary"
                style={{
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  height: '42px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  borderColor: '#10b981',
                  color: '#065f46',
                  background: '#ecfdf5',
                }}
                onClick={() => setIsMonthlyExcelOpen(true)}
                title="Download formatted monthly Excel spreadsheet with summary"
              >
                <FileSpreadsheet size={16} color="#059669" />
                <span>Download Monthly Excel</span>
              </button>

              <button
                type="button"
                className="btn btn-primary"
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  height: '42px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
                onClick={() => setIsMonthlyBackupOpen(true)}
                title="Download Monthly Backup containing Excel register and PDFs"
              >
                <Download size={16} />
                <span>Download Monthly Backup</span>
              </button>
            </div>
          </div>

      {/* Invoices Table Card */}
      <div className="ui-card" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
            Loading invoices...
          </div>
        ) : monthFilteredInvoices.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <FileText size={40} color="#cbd5e1" style={{ margin: '0 auto 12px auto' }} />
            <h4 style={{ fontSize: '16px', color: '#0f172a', marginBottom: '6px' }}>No Invoices Found</h4>
            <p style={{ fontSize: '13px', color: '#64748b', maxWidth: '400px', margin: '0 auto' }}>
              {searchQuery
                ? 'No invoices match your search query.'
                : 'No invoices found for the selected month. Create your first invoice from the Create Invoice page.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View (>= 768px) with horizontal scroll containment */}
            <div className="history-table-desktop table-responsive-container">
              <table style={{ width: '100%', minWidth: '780px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13.5px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                    <th style={{ padding: '14px 20px' }}>Invoice No.</th>
                    <th style={{ padding: '14px 20px' }}>Date</th>
                    <th style={{ padding: '14px 20px' }}>Customer Name</th>
                    <th style={{ padding: '14px 20px', textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '14px 20px', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '14px 20px', textAlign: 'center' }}>Google Drive</th>
                    <th style={{ padding: '14px 20px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {monthFilteredInvoices.map((inv) => (
                    <tr
                      key={inv.id}
                      style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '14px 20px', fontWeight: 600, color: '#1e3a8a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{inv.invoiceNumber}</span>
                          {inv.invoiceType === 'tax' ? (
                            <span style={{
                              fontSize: '10px',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: '#ede9fe',
                              color: '#5b21b6',
                              fontWeight: 700,
                              letterSpacing: '0.5px',
                            }}>
                              TAX
                            </span>
                          ) : (
                            <span style={{
                              fontSize: '10px',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: '#f1f5f9',
                              color: '#475569',
                              fontWeight: 600,
                            }}>
                              REGULAR
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '14px 20px', color: '#475569' }}>
                        {formatDateToIndian(inv.date)}
                      </td>
                      <td style={{ padding: '14px 20px', fontWeight: 500, color: '#0f172a' }}>
                        {inv.customerName}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                        <div>₹ {formatIndianCurrency(inv.grandTotal || inv.subtotal)}</div>
                        {inv.invoiceType === 'tax' && inv.totalTax ? (
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>
                            Tax: ₹ {formatIndianCurrency(inv.totalTax)}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          background: inv.status === 'issued' ? '#ecfdf5' : '#fef3c7',
                          color: inv.status === 'issued' ? '#065f46' : '#92400e',
                          textTransform: 'uppercase',
                        }}>
                          {inv.status || 'Issued'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                        {inv.driveBackupStatus === 'backed_up' ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: '#eff6ff',
                            color: '#1d4ed8',
                          }}>
                            <CheckCircle2 size={12} color="#2563eb" />
                            Backed up
                            {inv.driveFileId && (
                              <a
                                href={`https://drive.google.com/file/d/${inv.driveFileId}/view`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#2563eb', display: 'inline-flex', alignItems: 'center', marginLeft: '2px' }}
                                title="Open PDF in Google Drive"
                              >
                                <ExternalLink size={11} />
                              </a>
                            )}
                          </span>
                        ) : inv.driveBackupStatus === 'failed' ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              padding: '2px 6px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: '#fef2f2',
                              color: '#b91c1c',
                            }} title={inv.driveBackupError || 'Failed to upload'}>
                              <AlertCircle size={11} />
                              Failed
                            </span>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '2px 6px', fontSize: '10.5px' }}
                              onClick={() => handleDriveRetry(inv)}
                              disabled={retryingId === inv.id}
                              title="Retry upload to Google Drive"
                            >
                              <RotateCw size={10} className={retryingId === inv.id ? 'spin-icon' : ''} />
                              Retry
                            </button>
                          </div>
                        ) : !driveConnected ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              padding: '2px 6px',
                              borderRadius: '12px',
                              fontSize: '10.5px',
                              fontWeight: 500,
                              background: '#f8fafc',
                              color: '#64748b',
                              border: '1px solid #e2e8f0',
                            }}>
                              Not Connected
                            </span>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '2px 6px', fontSize: '10.5px' }}
                              onClick={() => handleDriveRetry(inv)}
                              disabled={retryingId === inv.id}
                              title="Connect Google Drive and upload"
                            >
                              Connect
                            </button>
                          </div>
                        ) : inv.driveBackupStatus === 'pending' ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: '#fffbeb',
                              color: '#b45309',
                            }}>
                              <RotateCw size={11} className="spin-icon" />
                              Pending
                            </span>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '2px 6px', fontSize: '10.5px' }}
                              onClick={() => handleDriveRetry(inv)}
                              disabled={retryingId === inv.id}
                            >
                              Upload
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '3px 8px', fontSize: '11px' }}
                            onClick={() => handleDriveRetry(inv)}
                            disabled={retryingId === inv.id}
                            title="Upload to Google Drive"
                          >
                            <HardDrive size={11} />
                            Upload
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '6px 10px', fontSize: '12px' }}
                            onClick={() => setPreviewInvoice(inv)}
                            title="View Live Invoice Preview"
                          >
                            <Eye size={14} />
                            View
                          </button>

                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '6px 10px', fontSize: '12px' }}
                            onClick={() => handleDownloadClick(inv)}
                            title="Download A4 PDF"
                          >
                            <Download size={14} />
                          </button>

                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '6px 10px', fontSize: '12px' }}
                            onClick={() => onDuplicateInvoice(inv)}
                            title="Duplicate as new invoice draft"
                          >
                            <Copy size={14} />
                          </button>

                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '6px 10px', fontSize: '12px' }}
                            onClick={() => setInvoiceToEditConfirm(inv)}
                            title="Edit Invoice"
                          >
                            <Edit size={14} />
                          </button>

                          <button
                            type="button"
                            className="btn btn-danger"
                            style={{ padding: '6px 10px', fontSize: '12px' }}
                            onClick={() => setInvoiceToDelete(inv)}
                            title="Delete Invoice"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View (< 768px) */}
            <div className="history-cards-mobile">
              {monthFilteredInvoices.map((inv) => (
                <div key={inv.id} className="history-card-item">
                  <div className="history-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#1e3a8a', fontSize: '14px' }}>
                        {inv.invoiceNumber}
                      </span>
                      {inv.invoiceType === 'tax' ? (
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: '#ede9fe',
                          color: '#5b21b6',
                          fontWeight: 700,
                        }}>
                          TAX
                        </span>
                      ) : (
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: '#f1f5f9',
                          color: '#475569',
                          fontWeight: 600,
                        }}>
                          REGULAR
                        </span>
                      )}
                    </div>

                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: inv.status === 'issued' ? '#ecfdf5' : '#fef3c7',
                      color: inv.status === 'issued' ? '#065f46' : '#92400e',
                      textTransform: 'uppercase',
                    }}>
                      {inv.status || 'Issued'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14.5px', color: '#0f172a' }}>
                        {inv.customerName}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                        {formatDateToIndian(inv.date)}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: '#1e3a8a' }}>
                        ₹ {formatIndianCurrency(inv.grandTotal || inv.subtotal)}
                      </div>
                      {inv.invoiceType === 'tax' && inv.totalTax ? (
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          Tax: ₹ {formatIndianCurrency(inv.totalTax)}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Drive Status Pill for Mobile */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#f8fafc',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}>
                    <span style={{ color: '#64748b', fontWeight: 500 }}>Google Drive:</span>
                    <div>
                      {inv.driveBackupStatus === 'backed_up' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#1d4ed8', fontWeight: 600 }}>
                          <CheckCircle2 size={13} color="#2563eb" />
                          Backed Up
                          {inv.driveFileId && (
                            <a
                              href={`https://drive.google.com/file/d/${inv.driveFileId}/view`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#2563eb', marginLeft: '2px' }}
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </span>
                      ) : inv.driveBackupStatus === 'failed' ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#b91c1c', fontWeight: 600 }}>Failed</span>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '2px 8px', fontSize: '11px', minHeight: '26px' }}
                            onClick={() => handleDriveRetry(inv)}
                            disabled={retryingId === inv.id}
                          >
                            <RotateCw size={11} className={retryingId === inv.id ? 'spin-icon' : ''} />
                            Retry
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '2px 8px', fontSize: '11px', minHeight: '26px' }}
                          onClick={() => handleDriveRetry(inv)}
                          disabled={retryingId === inv.id}
                        >
                          <HardDrive size={11} />
                          {driveConnected ? 'Upload' : 'Connect'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mobile Actions Grid */}
                  <div className="history-card-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '6px 4px', fontSize: '11.5px', flexDirection: 'column', gap: '2px' }}
                      onClick={() => setPreviewInvoice(inv)}
                      title="View Preview"
                    >
                      <Eye size={14} />
                      <span>View</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '6px 4px', fontSize: '11.5px', flexDirection: 'column', gap: '2px' }}
                      onClick={() => handleDownloadClick(inv)}
                      title="Download PDF"
                    >
                      <Download size={14} />
                      <span>PDF</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '6px 4px', fontSize: '11.5px', flexDirection: 'column', gap: '2px' }}
                      onClick={() => onDuplicateInvoice(inv)}
                      title="Duplicate"
                    >
                      <Copy size={14} />
                      <span>Copy</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '6px 4px', fontSize: '11.5px', flexDirection: 'column', gap: '2px' }}
                      onClick={() => setInvoiceToEditConfirm(inv)}
                      title="Edit"
                    >
                      <Edit size={14} />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ padding: '6px 4px', fontSize: '11.5px', flexDirection: 'column', gap: '2px' }}
                      onClick={() => setInvoiceToDelete(inv)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      </>
      )}

      {/* Full Preview Modal */}
      {previewInvoice && (
        <div className="modal-overlay" onClick={() => setPreviewInvoice(null)}>
          <div
            className="modal-container"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '920px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
          >
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <FileText size={18} color="#1e3a8a" style={{ flexShrink: 0 }} />
                <h3 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {previewInvoice.invoiceNumber}
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <button
                  className="btn btn-primary"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                  onClick={() => handleDownloadClick(previewInvoice)}
                >
                  <Download size={14} />
                  <span>PDF</span>
                </button>
                <button
                  onClick={() => setPreviewInvoice(null)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}
                  aria-label="Close Preview"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="modal-body" style={{ overflow: 'auto', background: '#cbd5e1', padding: '16px 8px', display: 'flex', justifyContent: 'center', WebkitOverflowScrolling: 'touch' }}>
              <InvoiceDocument
                invoice={previewInvoice}
                settings={previewInvoice.companySnapshot || settings || undefined}
                scale={typeof window !== 'undefined' && window.innerWidth < 640 ? 0.42 : typeof window !== 'undefined' && window.innerWidth < 1024 ? 0.65 : 0.78}
              />
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setPreviewInvoice(null)}>
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!invoiceToDelete}
        title="Delete Invoice Permanently"
        message={
          <div>
            <p style={{ marginBottom: '10px' }}>
              Are you sure you want to delete invoice <strong>{invoiceToDelete?.invoiceNumber}</strong> for <strong>{invoiceToDelete?.customerName}</strong>?
            </p>
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '12.5px',
              color: '#991b1b',
              lineHeight: 1.5,
            }}>
              <strong>CRITICAL NOTICE:</strong>
              <br />
              In accordance with accounting standards, invoice number <strong>{invoiceToDelete?.invoiceNumber}</strong> will remain retired and will <em>NEVER</em> be reassigned or reused.
            </div>
          </div>
        }
        confirmText="Delete Invoice"
        isDanger={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setInvoiceToDelete(null)}
      />

      {/* Edit Issued Invoice Confirmation Modal */}
      <ConfirmModal
        isOpen={!!invoiceToEditConfirm}
        title="Edit Issued Invoice"
        message={
          <div>
            <p style={{ marginBottom: '10px' }}>
              Invoice <strong>{invoiceToEditConfirm?.invoiceNumber}</strong> was already issued and recorded.
            </p>
            <p style={{ fontSize: '13px', color: '#64748b' }}>
              Modifying an issued invoice changes the official record. If you are creating a new invoice with similar line items, we recommend using <strong>Duplicate</strong> instead.
            </p>
          </div>
        }
        confirmText="Proceed with Edit"
        cancelText="Cancel"
        onConfirm={handleProceedEdit}
        onCancel={() => setInvoiceToEditConfirm(null)}
      />

      {/* Monthly Backup Modal */}
      <MonthlyBackupModal
        isOpen={isMonthlyBackupOpen}
        onClose={() => setIsMonthlyBackupOpen(false)}
        invoices={invoices}
        companySettings={settings || undefined}
        onSuccessToast={onSuccessToast}
        onErrorToast={onErrorToast}
      />

      {/* Requirement 6: Download Monthly Excel Modal */}
      <MonthlyExcelModal
        isOpen={isMonthlyExcelOpen}
        onClose={() => setIsMonthlyExcelOpen(false)}
        cachedInvoices={invoices}
        onSuccessToast={onSuccessToast}
        onErrorToast={onErrorToast}
      />

      {/* Requirement 7: Ask PDF Filename Before Download Modal */}
      <PdfFilenameModal
        isOpen={pdfModalOpen}
        onClose={() => {
          setPdfModalOpen(false);
          setInvoiceForPdf(null);
        }}
        defaultFilename={pdfDefaultFilename}
        onConfirm={handleConfirmDownloadPdf}
        isLoading={isDownloadingPdf}
      />
    </div>
  );
};
