import React, { useState, useEffect } from 'react';
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
  disconnectGoogleDrive,
  subscribeDriveConnection,
} from '../services/googleDriveClient';
import { deleteInvoice as deleteLocalInvoice } from '../db';
import { formatDateToIndian, formatIndianCurrency } from '../utils/financialYear';
import { downloadInvoicePDF } from '../utils/pdfGenerator';
import { InvoiceDocument } from '../components/invoice/InvoiceDocument';
import { MonthlyBackupModal } from '../components/invoice/MonthlyBackupModal';
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

  // Google Drive client state
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveEmail, setDriveEmail] = useState<string | undefined>();
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Monthly Backup Modal state
  const [isMonthlyBackupOpen, setIsMonthlyBackupOpen] = useState(false);

  useEffect(() => {
    // Initial fetch for settings
    getCompanySettingsFirestore().then(setSettings).catch(console.error);

    // Subscribe to settings changes
    const unsubSettings = subscribeCompanySettings((cloudSettings) => {
      setSettings(cloudSettings);
    });

    // Subscribe to Google Drive client connection state
    const unsubDrive = subscribeDriveConnection((connected, email) => {
      setDriveConnected(connected);
      setDriveEmail(email);
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

  const handleToggleDriveConnection = async () => {
    if (driveConnected) {
      disconnectGoogleDrive();
      onSuccessToast('Google Drive disconnected.');
    } else {
      try {
        await connectGoogleDrive();
        onSuccessToast('Google Drive connected successfully.');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to connect Google Drive';
        onErrorToast(msg);
      }
    }
  };

  const handleDownload = async (invoice: InvoiceRecord) => {
    try {
      await downloadInvoicePDF(invoice, settings || undefined);
      onSuccessToast(`Downloaded PDF for invoice ${invoice.invoiceNumber}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'PDF generation failed';
      onErrorToast(msg);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!invoiceToDelete) return;
    try {
      await deleteInvoiceFirestore(invoiceToDelete.id);
      // Clean up local IndexedDB backup quietly
      deleteLocalInvoice(invoiceToDelete.id).catch(() => {});
      onSuccessToast(`Invoice ${invoiceToDelete.invoiceNumber} deleted. Sequence number has been permanently retired in Firestore and will never be reused.`);
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

  const filteredInvoices = invoices.filter(inv => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.customerName.toLowerCase().includes(q) ||
      (inv.customerGstin && inv.customerGstin.toLowerCase().includes(q)) ||
      inv.date.includes(q)
    );
  });

  const totalBilled = filteredInvoices.reduce((sum, inv) => sum + (inv.grandTotal || inv.subtotal || 0), 0);

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Header & Search Bar */}
      <div className="history-top-bar">
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a' }}>Invoice History</h2>
          <p style={{ fontSize: '13px', color: '#64748b' }}>
            Browse, search, duplicate, view, and re-download saved invoices in Cloud Firestore (invoice-c797f).
          </p>
        </div>

        {/* Stats & Search & Drive Status */}
        <div className="history-stats-group">
          {/* Drive Connection Status Pill */}
          <div style={{
            background: '#ffffff',
            border: `1px solid ${driveConnected ? '#bfdbfe' : '#e2e8f0'}`,
            borderRadius: '10px',
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            flex: 1,
            minWidth: '220px',
          }}>
            <HardDrive size={18} color={driveConnected ? '#2563eb' : '#64748b'} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Google Drive</div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: driveConnected ? '#166534' : '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {driveConnected ? (driveEmail ? driveEmail.split('@')[0] : 'Connected') : 'Not Connected'}
              </div>
            </div>
            <button
              type="button"
              className={driveConnected ? "btn btn-secondary" : "btn btn-primary"}
              style={{ padding: '4px 10px', fontSize: '11px', marginLeft: '4px', flexShrink: 0 }}
              onClick={handleToggleDriveConnection}
            >
              {driveConnected ? 'Disconnect' : 'Connect Drive'}
            </button>
          </div>

          <div style={{
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
            minWidth: '220px',
          }}>
            <div>
              <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Total Invoices</span>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{filteredInvoices.length}</div>
            </div>
            <div style={{ width: '1px', height: '28px', background: '#e2e8f0' }} />
            <div>
              <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Total Billed</span>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#1e3a8a' }}>₹ {formatIndianCurrency(totalBilled)}</div>
            </div>
          </div>

          <div className="history-search-box">
            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Search by invoice no. or customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '36px' }}
            />
          </div>

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
            Download Monthly Backup
          </button>
        </div>
      </div>

      {/* Invoices Table Card */}
      <div className="ui-card" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
            Loading invoices...
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <FileText size={40} color="#cbd5e1" style={{ margin: '0 auto 12px auto' }} />
            <h4 style={{ fontSize: '16px', color: '#0f172a', marginBottom: '6px' }}>No Invoices Found</h4>
            <p style={{ fontSize: '13px', color: '#64748b', maxWidth: '400px', margin: '0 auto' }}>
              {searchQuery ? 'No invoices match your search query.' : 'You have not saved any invoices yet. Create your first invoice from the Create Invoice page.'}
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
                  {filteredInvoices.map((inv) => (
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
                            onClick={() => handleDownload(inv)}
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
              {filteredInvoices.map((inv) => (
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
                      onClick={() => handleDownload(inv)}
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
                  onClick={() => handleDownload(previewInvoice)}
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
    </div>
  );
};
