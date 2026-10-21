import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Save,
  Download,
  Printer,
  RotateCcw,
  Eye,
  ZoomIn,
  ZoomOut,
  Maximize2,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import type { InvoiceRecord, InvoiceLineItem, CompanySettings, InvoiceType, TaxMode } from '../types';
import {
  getCompanySettingsFirestore,
  previewNextInvoiceNumberFirestore,
  reserveAndCommitInvoiceNumberFirestore,
  saveInvoiceFirestore,
  subscribeCompanySettings,
} from '../services/firestoreService';
import { saveInvoice as saveLocalInvoice } from '../db';
import { uploadInvoicePdfToDrive } from '../services/googleDriveClient';
import { getIndianFinancialYear, formatInvoiceNumber, formatIndianCurrency } from '../utils/financialYear';
import { calculateInvoiceTotals } from '../utils/taxCalculator';
import { downloadInvoicePDF } from '../utils/pdfGenerator';
import { InvoiceDocument } from '../components/invoice/InvoiceDocument';
import { ConfirmModal } from '../components/common/Feedback';

interface CreateInvoicePageProps {
  initialInvoice?: InvoiceRecord | null;
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
  onNavigateToHistory: () => void;
}

const SAMPLE_REFERENCE_ITEMS: InvoiceLineItem[] = [
  {
    id: 'sample-1',
    description: 'Website Fee (Valid till 28 September 2029)',
    hsnSac: '',
    amount: 6989.00,
  },
  {
    id: 'sample-2',
    description: 'Domain',
    hsnSac: '',
    amount: '',
  },
  {
    id: 'sample-3',
    description: 'Hosting & SSL Certificate',
    hsnSac: '',
    amount: '',
  },
  {
    id: 'sample-4',
    description: 'Maintenance Fee',
    hsnSac: '',
    amount: '',
  },
];

export const CreateInvoicePage: React.FC<CreateInvoicePageProps> = ({
  initialInvoice,
  onSuccessToast,
  onErrorToast,
  onNavigateToHistory,
}) => {
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  // Form States
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('regular');
  const [taxMode, setTaxMode] = useState<TaxMode>('cgst_sgst');
  const [cgstRate, setCgstRate] = useState<number>(0);
  const [sgstRate, setSgstRate] = useState<number>(0);
  const [igstRate, setIgstRate] = useState<number>(0);

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [items, setItems] = useState<InvoiceLineItem[]>(SAMPLE_REFERENCE_ITEMS);

  // UI States
  const [previewScale, setPreviewScale] = useState(() => {
    if (typeof window !== 'undefined') {
      if (window.innerWidth < 480) return 0.42;
      if (window.innerWidth < 768) return 0.52;
      if (window.innerWidth < 1024) return 0.68;
    }
    return 0.82;
  });
  const [activeTab, setActiveTab] = useState<'form' | 'preview'>('form');
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [existingInvoiceId, setExistingInvoiceId] = useState<string | null>(null);

  const handleFitPreview = () => {
    if (typeof window !== 'undefined') {
      const containerWidth = window.innerWidth <= 1024 ? Math.min(window.innerWidth - 36, 750) : 560;
      const fitScale = Math.min(1.0, Math.max(0.38, Math.round((containerWidth / 794) * 100) / 100));
      setPreviewScale(fitScale);
    } else {
      setPreviewScale(0.82);
    }
  };

  useEffect(() => {
    loadSettingsAndInit();
    const unsub = subscribeCompanySettings((cloudSettings) => {
      setSettings(cloudSettings);
    });
    return () => unsub();
  }, [initialInvoice]);

  const loadSettingsAndInit = async () => {
    try {
      const activeSettings = await getCompanySettingsFirestore();
      setSettings(activeSettings);

      if (initialInvoice) {
        setIsEditingExisting(true);
        setExistingInvoiceId(initialInvoice.id);
        setInvoiceType(initialInvoice.invoiceType || 'regular');
        setTaxMode(initialInvoice.taxMode || 'cgst_sgst');
        setCgstRate(initialInvoice.cgstRate !== undefined ? initialInvoice.cgstRate : 0);
        setSgstRate(initialInvoice.sgstRate !== undefined ? initialInvoice.sgstRate : 0);
        setIgstRate(initialInvoice.igstRate !== undefined ? initialInvoice.igstRate : 0);
        setInvoiceNumber(initialInvoice.invoiceNumber);
        setInvoiceDate(initialInvoice.date);
        setCustomerName(initialInvoice.customerName);
        setCustomerAddress(initialInvoice.customerAddress);
        setCustomerMobile(initialInvoice.customerMobile || '');
        setCustomerGstin(initialInvoice.customerGstin || '');
        setItems(initialInvoice.items.length > 0 ? initialInvoice.items : SAMPLE_REFERENCE_ITEMS);
      } else {
        setIsEditingExisting(false);
        setExistingInvoiceId(null);
        setInvoiceType('regular');
        setTaxMode('cgst_sgst');
        setCgstRate(0);
        setSgstRate(0);
        setIgstRate(0);
        setCustomerGstin('');
        const today = new Date().toISOString().slice(0, 10);
        setInvoiceDate(today);
        const nextNum = await previewNextInvoiceNumberFirestore(today);
        setInvoiceNumber(nextNum);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed initialization';
      onErrorToast(msg);
    }
  };

  // When date changes, update the Financial Year in invoice number if it was auto-generated
  const handleDateChange = async (newDate: string) => {
    setInvoiceDate(newDate);
    if (!isEditingExisting && settings) {
      const fy = getIndianFinancialYear(newDate);
      const prefix = settings.invoicePrefix || 'MGS';
      const parts = invoiceNumber.split('/');
      if (parts.length === 3) {
        const seq = parseInt(parts[2], 10) || settings.nextSequence || 79;
        setInvoiceNumber(formatInvoiceNumber(prefix, fy, seq));
      } else {
        const generated = await previewNextInvoiceNumberFirestore(newDate);
        setInvoiceNumber(generated);
      }
    }
  };

  // Line item helpers
  const handleAddItem = () => {
    const newItem: InvoiceLineItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      description: '',
      hsnSac: '',
      amount: '',
    };
    setItems([...items, newItem]);
  };

  const handleUpdateItem = (id: string, field: keyof InvoiceLineItem, value: string | number) => {
    setItems(items.map(item => {
      if (item.id === id) {
        let finalVal: string | number = value;
        if (field === 'amount') {
          if (value === '' || value === undefined || value === null) {
            finalVal = '';
          } else {
            const num = parseFloat(String(value));
            finalVal = isNaN(num) ? '' : num;
          }
        }
        return {
          ...item,
          [field]: finalVal,
        };
      }
      return item;
    }));
  };

  const handleRemoveItem = (id: string) => {
    if (items.length === 1) {
      setItems([{ id: `item-${Date.now()}`, description: '', hsnSac: '', amount: '' }]);
      return;
    }
    setItems(items.filter(item => item.id !== id));
  };

  const handleLoadSampleData = () => {
    setCustomerName('M/s. Brushspace');
    setCustomerAddress('F-24/2,3rd floor, Nandi Appartment,\nSector -24, Rohini, Delhi - 110042');
    setCustomerMobile('+91 88604 30075');
    setCustomerGstin('09ARJPY9074A1Z9');
    setItems(SAMPLE_REFERENCE_ITEMS);
    onSuccessToast('Reference data for Brushspace loaded into form.');
  };

  const handleTaxModeChange = (mode: TaxMode) => {
    setTaxMode(mode);
    if (mode === 'cgst_sgst') {
      setIgstRate(0);
    } else {
      setCgstRate(0);
      setSgstRate(0);
    }
  };

  const handleCgstRateChange = (val: string) => {
    if (val === '') {
      setCgstRate(0);
      return;
    }
    const num = Math.max(0, Math.min(100, parseFloat(val) || 0));
    setCgstRate(num);
  };

  const handleSgstRateChange = (val: string) => {
    if (val === '') {
      setSgstRate(0);
      return;
    }
    const num = Math.max(0, Math.min(100, parseFloat(val) || 0));
    setSgstRate(num);
  };

  const handleIgstRateChange = (val: string) => {
    if (val === '') {
      setIgstRate(0);
      return;
    }
    const num = Math.max(0, Math.min(100, parseFloat(val) || 0));
    setIgstRate(num);
  };

  const applyPresetRate = (totalRate: number) => {
    if (taxMode === 'cgst_sgst') {
      const half = totalRate / 2;
      setCgstRate(half);
      setSgstRate(half);
      setIgstRate(0);
    } else {
      setCgstRate(0);
      setSgstRate(0);
      setIgstRate(totalRate);
    }
  };

  const totals = calculateInvoiceTotals({
    invoiceType,
    items,
    taxMode,
    cgstRate,
    sgstRate,
    igstRate,
  });

  const subtotal = totals.subtotal;

  // Construct current invoice object for preview & saving
  const currentInvoiceData: InvoiceRecord = {
    id: existingInvoiceId || `inv-${Date.now()}`,
    invoiceNumber: invoiceNumber.trim() || 'MGS/2026-27/079',
    date: invoiceDate,
    customerName: customerName.trim(),
    customerAddress: customerAddress.trim(),
    customerMobile: customerMobile.trim(),
    customerGstin: customerGstin.trim(),
    items: items.filter(it => it.description.trim() !== '' || (it.amount !== '' && Number(it.amount) > 0)),
    subtotal,
    status: 'issued',
    companySnapshot: settings!,
    createdAt: initialInvoice?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // Tax properties
    invoiceType,
    taxMode,
    cgstRate: totals.cgstRate,
    sgstRate: totals.sgstRate,
    igstRate: totals.igstRate,
    cgstAmount: totals.cgstAmount,
    sgstAmount: totals.sgstAmount,
    igstAmount: totals.igstAmount,
    totalTax: totals.totalTax,
    grandTotal: totals.grandTotal,
  };

  // Save Validation
  const handleTriggerSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      onErrorToast('Customer / Business Name is required.');
      return;
    }
    if (!customerAddress.trim()) {
      onErrorToast('Customer Address is required.');
      return;
    }
    if (items.length === 0 || !items.some(i => i.description.trim())) {
      onErrorToast('Please add at least one line item with a description.');
      return;
    }
    setShowSaveConfirm(true);
  };

  const handleConfirmSave = async () => {
    try {
      setIsSaving(true);
      setShowSaveConfirm(false);

      let finalInvNo = invoiceNumber.trim();
      if (!isEditingExisting) {
        // Reserve and lock number sequence permanently in Firestore transaction
        finalInvNo = await reserveAndCommitInvoiceNumberFirestore(invoiceDate, invoiceNumber);
      }

      const invoiceToSave: InvoiceRecord = {
        ...currentInvoiceData,
        invoiceNumber: finalInvNo,
      };

      await saveInvoiceFirestore(invoiceToSave);
      // Backup to local db without blocking
      saveLocalInvoice(invoiceToSave).catch((err) => console.warn('Local backup failed:', err));
      onSuccessToast(`Invoice ${finalInvNo} saved to Cloud Firestore.`);

      // Trigger automatic background Google Drive backup (non-blocking)
      uploadInvoicePdfToDrive(invoiceToSave, settings || undefined).catch((driveErr) => {
        console.warn('Background Google Drive backup notification:', driveErr);
      });

      onNavigateToHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save invoice';
      onErrorToast(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      setIsDownloading(true);
      await downloadInvoicePDF(currentInvoiceData, settings || undefined);
      onSuccessToast('A4 PDF generated and downloaded successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate PDF';
      onErrorToast(msg);
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleResetForm = () => {
    setShowResetConfirm(false);
    setCustomerName('');
    setCustomerAddress('');
    setCustomerMobile('');
    setCustomerGstin('');
    setItems([{ id: `item-${Date.now()}`, description: '', hsnSac: '', amount: '' }]);
    setInvoiceType('regular');
    setTaxMode('cgst_sgst');
    setCgstRate(0);
    setSgstRate(0);
    setIgstRate(0);
    onSuccessToast('Invoice form reset.');
  };

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
      {/* Top Action Bar */}
      <div className="invoice-top-bar">
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a' }}>
            {isEditingExisting ? `Edit Invoice: ${invoiceNumber}` : 'Create New Invoice'}
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b' }}>
            Enter customer details and line items. Live preview updates automatically.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="invoice-actions-group">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleLoadSampleData}
            title="Load original sample data from Brushspace.pdf"
          >
            <Sparkles size={16} color="#d97706" />
            <span>Load Sample (Brushspace)</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowResetConfirm(true)}
          >
            <RotateCcw size={16} />
            <span>Reset Form</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handlePrint}
            title="Print invoice or save as PDF via browser print"
          >
            <Printer size={16} />
            <span>Print Invoice</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleDownloadPDF}
            disabled={isDownloading}
            style={{ borderColor: '#3b82f6', color: '#1d4ed8' }}
          >
            <Download size={16} />
            <span>{isDownloading ? 'Generating PDF...' : 'Download PDF'}</span>
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleTriggerSave}
            disabled={isSaving}
          >
            <Save size={16} />
            <span>{isSaving ? 'Saving...' : 'Save Invoice'}</span>
          </button>
        </div>
      </div>

      {/* Screen Size Switcher for Mobile / Tablet */}
      <div className="mobile-tab-bar">
        <button
          type="button"
          className={`mobile-tab-btn ${activeTab === 'form' ? 'active' : ''}`}
          onClick={() => setActiveTab('form')}
        >
          Invoice Editor
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => setActiveTab('preview')}
        >
          <Eye size={16} />
          <span>Live A4 Preview</span>
        </button>
      </div>

      {/* Main Split Layout: Form on Left, Live Preview on Right */}
      <div className="invoice-main-grid">
        {/* LEFT COLUMN: Invoice Form */}
        <div className={`invoice-form-column ${activeTab === 'preview' ? 'hide-on-mobile-tab' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Invoice Type Selector */}
          <div className="ui-card" style={{ padding: '14px 18px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>Invoice Type</span>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  {invoiceType === 'tax' ? 'Tax Invoice with GST (CGST/SGST/IGST)' : 'Regular Invoice (without tax)'}
                </div>
              </div>
              <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: '8px', padding: '3px', gap: '4px', border: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => setInvoiceType('regular')}
                  style={{
                    padding: '6px 14px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: invoiceType === 'regular' ? '#ffffff' : 'transparent',
                    color: invoiceType === 'regular' ? '#1e3a8a' : '#64748b',
                    boxShadow: invoiceType === 'regular' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  Regular Invoice
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceType('tax')}
                  style={{
                    padding: '6px 14px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: invoiceType === 'tax' ? '#1e3a8a' : 'transparent',
                    color: invoiceType === 'tax' ? '#ffffff' : '#64748b',
                    boxShadow: invoiceType === 'tax' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>Tax Invoice</span>
                  <span style={{
                    fontSize: '10px',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: invoiceType === 'tax' ? 'rgba(255,255,255,0.25)' : '#cbd5e1',
                    color: invoiceType === 'tax' ? '#ffffff' : '#334155',
                    fontWeight: 700,
                  }}>
                    GST
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Multi-page length warning if line items exceed standard page capacity */}
          {items.length > 10 && (
            <div style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '8px',
              padding: '12px 16px',
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
              color: '#92400e',
              fontSize: '13px',
            }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <div>
                <strong>Single-Page Limit Notice:</strong> Invoices with more than 10 items will exceed single-page A4 height.
                The table will expand gracefully and multi-page continuation will apply on PDF export.
              </div>
            </div>
          )}

          {/* Customer Details Card */}
          <div className="ui-card">
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '16px' }}>
              Customer Details (Bill To)
            </h3>

            <div className="form-group">
              <label className="form-label">Customer / Business Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. M/s. Brushspace"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Customer Address (Multiline) *</label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Address Line 1&#10;Sector, Area, City - PIN"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: invoiceType === 'tax' ? '16px' : 0 }}>
              <label className="form-label">Customer Mobile Number (Optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. +91 88604 30075"
                value={customerMobile}
                onChange={(e) => setCustomerMobile(e.target.value)}
              />
            </div>

            {invoiceType === 'tax' && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Customer GSTIN (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 09ARJPY9074A1Z9"
                  value={customerGstin}
                  onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                  maxLength={15}
                />
              </div>
            )}
          </div>

          {/* Invoice Information Card */}
          <div className="ui-card">
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '16px' }}>
              Invoice Metadata
            </h3>

            <div className="invoice-meta-grid">
              <div className="form-group">
                <label className="form-label">Invoice Date *</label>
                <input
                  type="date"
                  className="form-input"
                  value={invoiceDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  required
                />
                <div className="form-hint">
                  Indian Financial Year: <strong>{getIndianFinancialYear(invoiceDate)}</strong>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Invoice Number *</label>
                <input
                  type="text"
                  className="form-input"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  required
                />
                <div className="form-hint">Auto-sequenced from company configuration.</div>
              </div>
            </div>
          </div>

          {/* Invoice Line Items Card */}
          <div className="ui-card">
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '8px',
            }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Line Items</h3>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  Add or edit items. Subtotal calculates automatically.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleAddItem}
                style={{ padding: '6px 14px', fontSize: '12.5px' }}
              >
                <Plus size={14} />
                <span>Add Item</span>
              </button>
            </div>

            {/* Line Items in Editor: Desktop Row & Mobile Card */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {items.map((item, index) => (
                <div key={item.id} className="line-item-wrapper">
                  {/* Desktop Row (>= 640px) */}
                  <div className="line-item-desktop-row">
                    <div>
                      <input
                        type="text"
                        className="form-input"
                        placeholder={`Description #${index + 1}`}
                        value={item.description}
                        onChange={(e) => handleUpdateItem(item.id, 'description', e.target.value)}
                        style={{ padding: '6px 10px', fontSize: '13px' }}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="HSN/SAC"
                        value={item.hsnSac}
                        onChange={(e) => handleUpdateItem(item.id, 'hsnSac', e.target.value)}
                        style={{ padding: '6px 10px', fontSize: '13px', textAlign: 'center' }}
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        step="0.01"
                        className="form-input"
                        placeholder="0.00"
                        value={item.amount === undefined || item.amount === null ? '' : item.amount}
                        onChange={(e) => handleUpdateItem(item.id, 'amount', e.target.value)}
                        style={{ padding: '6px 10px', fontSize: '13px', textAlign: 'right' }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '6px',
                      }}
                      title="Remove item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Mobile Card (< 640px) */}
                  <div className="line-item-mobile-card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#1e3a8a' }}>
                        Item #{index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          fontWeight: 600,
                          padding: '4px 6px',
                        }}
                      >
                        <Trash2 size={13} />
                        <span>Delete</span>
                      </button>
                    </div>
                    <div>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Description of goods or service"
                        value={item.description}
                        onChange={(e) => handleUpdateItem(item.id, 'description', e.target.value)}
                      />
                    </div>
                    <div className="line-item-mobile-row2">
                      <div>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '2px' }}>HSN/SAC</span>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="HSN/SAC"
                          value={item.hsnSac}
                          onChange={(e) => handleUpdateItem(item.id, 'hsnSac', e.target.value)}
                          style={{ textAlign: 'center' }}
                        />
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Amount (₹)</span>
                        <input
                          type="number"
                          step="0.01"
                          className="form-input"
                          placeholder="0.00"
                          value={item.amount === undefined || item.amount === null ? '' : item.amount}
                          onChange={(e) => handleUpdateItem(item.id, 'amount', e.target.value)}
                          style={{ textAlign: 'right', fontWeight: 600 }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tax & Totals Section */}
            {invoiceType === 'tax' ? (
              <div className="tax-config-container">
                {/* Left Column: Tax Mode & Controls */}
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>
                    GST Tax Configuration
                  </div>

                  {/* Mode Selector */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleTaxModeChange('cgst_sgst')}
                      style={{
                        flex: 1,
                        minWidth: '130px',
                        padding: '8px 10px',
                        fontSize: '12px',
                        fontWeight: 600,
                        borderRadius: '6px',
                        border: `1px solid ${taxMode === 'cgst_sgst' ? '#2563eb' : '#cbd5e1'}`,
                        background: taxMode === 'cgst_sgst' ? '#eff6ff' : '#ffffff',
                        color: taxMode === 'cgst_sgst' ? '#1d4ed8' : '#64748b',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      CGST + SGST (Intra-State)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTaxModeChange('igst')}
                      style={{
                        flex: 1,
                        minWidth: '130px',
                        padding: '8px 10px',
                        fontSize: '12px',
                        fontWeight: 600,
                        borderRadius: '6px',
                        border: `1px solid ${taxMode === 'igst' ? '#2563eb' : '#cbd5e1'}`,
                        background: taxMode === 'igst' ? '#eff6ff' : '#ffffff',
                        color: taxMode === 'igst' ? '#1d4ed8' : '#64748b',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      IGST (Inter-State)
                    </button>
                  </div>

                  {/* Rate Inputs */}
                  {taxMode === 'cgst_sgst' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '12px' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '12px' }}>CGST Rate (%)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          className="form-input"
                          value={cgstRate === 0 ? '' : cgstRate}
                          placeholder="0%"
                          onChange={(e) => handleCgstRateChange(e.target.value)}
                          style={{ fontSize: '13px', padding: '6px 10px' }}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '12px' }}>SGST Rate (%)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          className="form-input"
                          value={sgstRate === 0 ? '' : sgstRate}
                          placeholder="0%"
                          onChange={(e) => handleSgstRateChange(e.target.value)}
                          style={{ fontSize: '13px', padding: '6px 10px' }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '12px' }}>IGST Rate (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        className="form-input"
                        value={igstRate === 0 ? '' : igstRate}
                        placeholder="0%"
                        onChange={(e) => handleIgstRateChange(e.target.value)}
                        style={{ fontSize: '13px', padding: '6px 10px' }}
                      />
                    </div>
                  )}

                  {/* Presets */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>Presets:</span>
                    {[5, 12, 18, 28].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => applyPresetRate(rate)}
                        style={{
                          padding: '4px 9px',
                          fontSize: '11px',
                          fontWeight: 600,
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          cursor: 'pointer',
                          color: '#334155',
                          minHeight: '28px',
                        }}
                      >
                        {rate}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right Column: Breakdown Summary */}
                <div className="tax-summary-column">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#475569' }}>
                    <span>Taxable Subtotal:</span>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>₹ {formatIndianCurrency(totals.subtotal)}</span>
                  </div>
                  {taxMode === 'cgst_sgst' ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#475569' }}>
                        <span>CGST ({totals.cgstRate}%):</span>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>₹ {formatIndianCurrency(totals.cgstAmount)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#475569' }}>
                        <span>SGST ({totals.sgstRate}%):</span>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>₹ {formatIndianCurrency(totals.sgstAmount)}</span>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#475569' }}>
                      <span>IGST ({totals.igstRate}%):</span>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>₹ {formatIndianCurrency(totals.igstAmount)}</span>
                    </div>
                  )}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '16px',
                    fontWeight: 700,
                    color: '#1e3a8a',
                    marginTop: '8px',
                    paddingTop: '10px',
                    borderTop: '1px solid #cbd5e1',
                  }}>
                    <span>Grand Total:</span>
                    <span>₹ {formatIndianCurrency(totals.grandTotal)}</span>
                  </div>
                </div>
              </div>
            ) : (
              /* Regular Invoice Calculated Subtotal Bar */
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                marginTop: '16px',
                paddingTop: '14px',
                borderTop: '1px solid #e2e8f0',
              }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#475569' }}>
                  Calculated Sub-Total:
                </span>
                <span style={{ fontSize: '18px', fontWeight: 700, color: '#1e3a8a' }}>
                  ₹ {formatIndianCurrency(totals.subtotal)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Live A4 Invoice Preview */}
        <div className={`invoice-preview-column ${activeTab === 'form' ? 'hide-on-mobile-tab' : ''}`} style={{
          position: 'sticky',
          top: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          {/* Preview Toolbar */}
          <div className="preview-toolbar" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#ffffff',
            padding: '10px 16px',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            flexWrap: 'wrap',
            gap: '8px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Eye size={16} color="#2563eb" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                Live A4 Preview (Trebuchet MS 8.5pt)
              </span>
            </div>

            {/* Zoom Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 8px', minHeight: '32px' }}
                onClick={() => setPreviewScale(prev => Math.max(0.35, prev - 0.1))}
                title="Zoom Out"
              >
                <ZoomOut size={14} />
              </button>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', minWidth: '40px', textAlign: 'center' }}>
                {Math.round(previewScale * 100)}%
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 8px', minHeight: '32px' }}
                onClick={() => setPreviewScale(prev => Math.min(1.2, prev + 0.1))}
                title="Zoom In"
              >
                <ZoomIn size={14} />
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 8px', minHeight: '32px' }}
                onClick={handleFitPreview}
                title="Fit to Screen Width"
              >
                <Maximize2 size={14} />
              </button>
            </div>
          </div>

          {/* Scaled Preview Frame */}
          <div className="preview-scaler-box">
            <InvoiceDocument
              invoice={currentInvoiceData}
              settings={settings || undefined}
              scale={previewScale}
            />
          </div>
        </div>
      </div>

      {/* Confirmation Modal Before Permanent Save */}
      <ConfirmModal
        isOpen={showSaveConfirm}
        title="Confirm Save Invoice"
        message={
          <div>
            <p style={{ marginBottom: '10px' }}>
              Are you sure you want to save invoice <strong>{invoiceNumber}</strong> for <strong>{customerName}</strong>?
            </p>
            <p style={{ fontSize: '12.5px', color: '#64748b' }}>
              Total Amount: <strong>₹ {subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </p>
            <p style={{ fontSize: '12px', color: '#92400e', background: '#fffbeb', padding: '8px', borderRadius: '6px', marginTop: '12px' }}>
              Notice: This invoice number will be locked into the sequence and safely recorded in IndexedDB history.
            </p>
          </div>
        }
        confirmText="Save Invoice"
        onConfirm={handleConfirmSave}
        onCancel={() => setShowSaveConfirm(false)}
      />

      {/* Reset Confirmation */}
      <ConfirmModal
        isOpen={showResetConfirm}
        title="Reset Invoice Form"
        message="Are you sure you want to clear this invoice form? All unsaved customer information and items will be lost."
        confirmText="Reset"
        isDanger={true}
        onConfirm={handleResetForm}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
};
