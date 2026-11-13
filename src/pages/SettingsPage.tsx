import React, { useState, useEffect } from 'react';
import {
  Save,
  RotateCcw,
  Upload,
  Building,
  CreditCard,
  FileText,
  Link,
  Trash2,
  AlertCircle,
  Database,
  RefreshCw,
  HardDrive,
  CheckCircle2,
  Lock,
  KeyRound,
} from 'lucide-react';
import type { CompanySettings } from '../types';
import {
  subscribeCompanySettings,
  saveCompanySettingsFirestore,
  updateAppPinFirestore,
  DEFAULT_SETTINGS,
} from '../services/firestoreService';
import { uploadBrandAsset, validateImageUrl } from '../services/storageService';
import { runLocalToFirestoreMigration } from '../services/migrationService';
import {
  subscribeDriveConnection,
  connectGoogleDrive,
  disconnectGoogleDrive,
} from '../services/googleDriveClient';
import { ConfirmModal } from '../components/common/Feedback';
import { getIndianFinancialYear } from '../utils/financialYear';

interface SettingsPageProps {
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
  onSettingsChanged?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  onSuccessToast,
  onErrorToast,
  onSettingsChanged,
}) => {
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Logo & QR upload/URL states
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const [logoUrlError, setLogoUrlError] = useState<string | null>(null);
  const [qrUrlError, setQrUrlError] = useState<string | null>(null);

  // Migration state
  const [isMigrating, setIsMigrating] = useState(false);

  // Google Drive Client state
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveEmail, setDriveEmail] = useState<string | undefined>();
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);

  // PIN Management state
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [isUpdatingPin, setIsUpdatingPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);

  useEffect(() => {
    // Real-time synchronization with Firestore companySettings/main
    const unsubscribe = subscribeCompanySettings(
      (cloudSettings) => {
        setSettings(cloudSettings);
        setIsLoading(false);
      },
      (err) => {
        console.error('Error in Firestore settings listener:', err);
        onErrorToast('Failed to connect to Firestore settings. Check network or security rules.');
        setIsLoading(false);
      }
    );

    // Subscribe to Google Drive client connection state
    const unsubDrive = subscribeDriveConnection((connected, email) => {
      setDriveConnected(connected);
      setDriveEmail(email);
    });

    return () => {
      unsubscribe();
      unsubDrive();
    };
  }, []);

  const handleToggleDriveConnection = async () => {
    if (driveConnected) {
      disconnectGoogleDrive();
      onSuccessToast('Google Drive disconnected.');
    } else {
      try {
        setIsConnectingDrive(true);
        await connectGoogleDrive(settings.googleDriveClientId);
        onSuccessToast('Google Drive connected successfully.');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to connect Google Drive';
        onErrorToast(msg);
      } finally {
        setIsConnectingDrive(false);
      }
    }
  };

  const handleInputChange = (field: keyof CompanySettings, value: string | number) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Logo URL Change
  const handleLogoUrlChange = async (url: string) => {
    handleInputChange('logoUrl', url);
    handleInputChange('logoDataUrl', url);
    if (!url.trim()) {
      setLogoUrlError(null);
      return;
    }
    const isValid = await validateImageUrl(url);
    if (!isValid) {
      setLogoUrlError('Warning: This image URL could not be loaded or may be blocked by CORS.');
    } else {
      setLogoUrlError(null);
    }
  };

  // QR URL Change
  const handleQrUrlChange = async (url: string) => {
    handleInputChange('qrScannerUrl', url);
    handleInputChange('qrScannerDataUrl', url);
    if (!url.trim()) {
      setQrUrlError(null);
      return;
    }
    const isValid = await validateImageUrl(url);
    if (!isValid) {
      setQrUrlError('Warning: This image URL could not be loaded or may be blocked by CORS.');
    } else {
      setQrUrlError(null);
    }
  };

  // Logo File Upload (Firebase Storage)
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingLogo(true);
      const downloadUrl = await uploadBrandAsset(file, 'logos');
      handleInputChange('logoUrl', downloadUrl);
      handleInputChange('logoDataUrl', downloadUrl);
      setLogoUrlError(null);
      onSuccessToast('Company logo uploaded to Firebase Storage. Click "Save Settings" to persist.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      onErrorToast(msg);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  // QR File Upload (Firebase Storage)
  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingQr(true);
      const downloadUrl = await uploadBrandAsset(file, 'scanners');
      handleInputChange('qrScannerUrl', downloadUrl);
      handleInputChange('qrScannerDataUrl', downloadUrl);
      setQrUrlError(null);
      onSuccessToast('Payment scanner uploaded to Firebase Storage. Click "Save Settings" to persist.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      onErrorToast(msg);
    } finally {
      setIsUploadingQr(false);
    }
  };

  // Save Settings to Firestore
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      await saveCompanySettingsFirestore(settings);
      onSuccessToast('Company settings successfully saved to Cloud Firestore.');
      if (onSettingsChanged) onSettingsChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save settings to Firestore';
      onErrorToast(`Save error: ${msg}. Check Firestore rules in Firebase Console.`);
    } finally {
      setIsSaving(false);
    }
  };

  // Restore Defaults
  const handleResetDefaults = async () => {
    try {
      setIsSaving(true);
      await saveCompanySettingsFirestore(DEFAULT_SETTINGS);
      setShowResetConfirm(false);
      onSuccessToast('All settings restored to reference invoice defaults in Firestore.');
      if (onSettingsChanged) onSettingsChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset settings';
      onErrorToast(msg);
    } finally {
      setIsSaving(false);
    }
  };

  // Run Manual Migration from Local DB to Firestore
  const handleRunMigration = async () => {
    try {
      setIsMigrating(true);
      const result = await runLocalToFirestoreMigration(true);
      if (result.success) {
        onSuccessToast(result.message);
      } else {
        onErrorToast(result.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Migration failed';
      onErrorToast(`Migration error: ${msg}`);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    setPinSuccess(null);

    const activePin = settings.appPin || '1234';
    if (currentPinInput.trim() !== activePin) {
      setPinError('Current PIN is incorrect.');
      return;
    }

    const cleanNewPin = newPinInput.trim();
    if (!/^\d{4}$/.test(cleanNewPin)) {
      setPinError('New PIN must be exactly 4 numeric digits.');
      return;
    }

    if (cleanNewPin !== confirmPinInput.trim()) {
      setPinError('New PIN and Confirm PIN do not match.');
      return;
    }

    try {
      setIsUpdatingPin(true);
      await updateAppPinFirestore(cleanNewPin);
      setPinSuccess('PIN updated successfully! Your new 4-digit PIN is active.');
      onSuccessToast('Website PIN updated successfully.');
      setCurrentPinInput('');
      setNewPinInput('');
      setConfirmPinInput('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update PIN.';
      setPinError(msg);
      onErrorToast(msg);
    } finally {
      setIsUpdatingPin(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
        <RefreshCw size={32} className="spin-icon" style={{ margin: '0 auto 12px auto' }} />
        <div style={{ fontSize: '15px', fontWeight: 600 }}>Loading company settings from Cloud Firestore...</div>
      </div>
    );
  }

  const currentLogo = settings.logoUrl || settings.logoDataUrl || '/assets/logo.png';
  const currentQr = settings.qrScannerUrl || settings.qrScannerDataUrl || '/assets/qr_scanner.jpg';
  const currentFy = getIndianFinancialYear(new Date());

  return (
    <div style={{ maxWidth: '1050px', margin: '0 auto' }}>
      <form onSubmit={handleSave}>
        {/* Top Header Actions */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '24px',
        }}>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a' }}>Invoice Settings</h2>
            <p style={{ fontSize: '13px', color: '#64748b' }}>
              Connected to Cloud Firestore (project: <strong>invoice-c797f</strong>). Updates sync in real-time across devices.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowResetConfirm(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RotateCcw size={15} />
              Restore Defaults
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Save size={15} />
              {isSaving ? 'Saving to Firestore...' : 'Save Settings'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* 1. Company Profile */}
          <div className="ui-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <Building size={20} color="#1e3a8a" />
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Company Profile & Header Details</h3>
            </div>

            <div className="form-group">
              <label className="form-label">Company Name *</label>
              <input
                type="text"
                className="form-input"
                value={settings.companyName}
                onChange={(e) => handleInputChange('companyName', e.target.value)}
                required
              />
            </div>

            <div className="settings-grid-3">
              <div className="form-group">
                <label className="form-label">Address Line 1</label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.addressLine1}
                  onChange={(e) => handleInputChange('addressLine1', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Address Line 2</label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.addressLine2}
                  onChange={(e) => handleInputChange('addressLine2', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Address Line 3</label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.addressLine3}
                  onChange={(e) => handleInputChange('addressLine3', e.target.value)}
                />
              </div>
            </div>

            <div className="settings-grid-2">
              <div className="form-group">
                <label className="form-label">GSTIN *</label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.gstin}
                  onChange={(e) => handleInputChange('gstin', e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Phone Number *</label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="settings-grid-2">
              <div className="form-group">
                <label className="form-label">Email Address (Hyperlinked in invoice)</label>
                <input
                  type="email"
                  className="form-input"
                  value={settings.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Website (Hyperlinked in invoice)</label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.website}
                  onChange={(e) => handleInputChange('website', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* 2. Brand Assets: Company Logo & Payment Scanner with Upload & URL support */}
          <div className="ui-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <Link size={20} color="#1e3a8a" />
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                Brand Assets: Company Logo & Payment Scanner
              </h3>
            </div>

            <div className="settings-grid-2">
              {/* COMPANY LOGO SECTION */}
              <div style={{
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '18px',
                background: '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>Company Logo</div>

                {/* Live Preview */}
                <div style={{
                  width: '100%',
                  height: '110px',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px',
                  overflow: 'hidden',
                }}>
                  {currentLogo ? (
                    <img
                      src={currentLogo}
                      alt="Company Logo Preview"
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>No Logo Selected</span>
                  )}
                </div>

                {/* Paste URL */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Or Paste Image URL</label>
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://example.com/logo.png"
                    value={settings.logoUrl || ''}
                    onChange={(e) => handleLogoUrlChange(e.target.value)}
                    style={{ fontSize: '13px' }}
                  />
                  {logoUrlError && (
                    <div style={{ fontSize: '11.5px', color: '#d97706', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                      <AlertCircle size={13} /> {logoUrlError}
                    </div>
                  )}
                </div>

                {/* Upload or Reset Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <label className="btn btn-secondary" style={{ fontSize: '12px', padding: '6px 12px', cursor: 'pointer' }}>
                    <Upload size={14} />
                    {isUploadingLogo ? 'Uploading to Storage...' : 'Upload Image'}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleLogoUpload}
                      disabled={isUploadingLogo}
                    />
                  </label>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleLogoUrlChange('/assets/logo.png')}
                    style={{ fontSize: '12px', padding: '6px 10px' }}
                    title="Reset to default Manshi logo asset"
                  >
                    Reset Asset
                  </button>

                  {settings.logoUrl && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => handleLogoUrlChange('')}
                      style={{ fontSize: '12px', padding: '6px 8px' }}
                      title="Clear Logo"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* PAYMENT SCANNER / QR CODE SECTION */}
              <div style={{
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '18px',
                background: '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>Payment Scanner / QR Code</div>

                {/* Live Preview */}
                <div style={{
                  width: '100%',
                  height: '110px',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px',
                  overflow: 'hidden',
                }}>
                  {currentQr ? (
                    <img
                      src={currentQr}
                      alt="Payment Scanner Preview"
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>No QR Selected</span>
                  )}
                </div>

                {/* Paste URL */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Or Paste Image URL</label>
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://example.com/qr.jpg"
                    value={settings.qrScannerUrl || ''}
                    onChange={(e) => handleQrUrlChange(e.target.value)}
                    style={{ fontSize: '13px' }}
                  />
                  {qrUrlError && (
                    <div style={{ fontSize: '11.5px', color: '#d97706', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                      <AlertCircle size={13} /> {qrUrlError}
                    </div>
                  )}
                </div>

                {/* Upload or Reset Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <label className="btn btn-secondary" style={{ fontSize: '12px', padding: '6px 12px', cursor: 'pointer' }}>
                    <Upload size={14} />
                    {isUploadingQr ? 'Uploading to Storage...' : 'Upload Image'}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleQrUpload}
                      disabled={isUploadingQr}
                    />
                  </label>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleQrUrlChange('/assets/qr_scanner.jpg')}
                    style={{ fontSize: '12px', padding: '6px 10px' }}
                    title="Reset to default Manshi QR asset"
                  >
                    Reset Asset
                  </button>

                  {settings.qrScannerUrl && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => handleQrUrlChange('')}
                      style={{ fontSize: '12px', padding: '6px 8px' }}
                      title="Clear QR"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Banking & Payment Terms */}
          <div className="ui-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <CreditCard size={20} color="#1e3a8a" />
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Bank Account & Payment Terms</h3>
            </div>

            <div className="settings-grid-2">
              <div className="form-group">
                <label className="form-label">Bank Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.bankName}
                  onChange={(e) => handleInputChange('bankName', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Account Number</label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.accountNo}
                  onChange={(e) => handleInputChange('accountNo', e.target.value)}
                />
              </div>
            </div>

            <div className="settings-grid-3">
              <div className="form-group">
                <label className="form-label">Account Holder Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.accountHolderName}
                  onChange={(e) => handleInputChange('accountHolderName', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">IFSC Code</label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.ifscCode}
                  onChange={(e) => handleInputChange('ifscCode', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Branch</label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.branch}
                  onChange={(e) => handleInputChange('branch', e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Payment Terms (Multiline)</label>
              <textarea
                className="form-textarea"
                rows={2}
                value={settings.paymentTerms}
                onChange={(e) => handleInputChange('paymentTerms', e.target.value)}
              />
              <div className="form-hint">Displayed inside the Payment Terms box on the invoice.</div>
            </div>
          </div>

          {/* 4. Invoice Numbering Sequence for Tax Invoice */}
          <div className="ui-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={20} color="#1e3a8a" />
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Invoice Numbering Sequence for Tax Invoice</h3>
                  <div style={{ fontSize: '12.5px', color: '#64748b' }}>Configure independent numbering sequence for GST Tax Invoices.</div>
                </div>
              </div>
              <span style={{ fontSize: '11.5px', padding: '3px 8px', borderRadius: '12px', background: '#eff6ff', color: '#1d4ed8', fontWeight: 600, border: '1px solid #bfdbfe' }}>
                Tax Invoices
              </span>
            </div>

            <div className="settings-grid-2">
              <div className="form-group">
                <label className="form-label">Invoice Prefix</label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.taxInvoicePrefix || settings.invoicePrefix || 'MGS'}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    handleInputChange('taxInvoicePrefix', val);
                    handleInputChange('invoicePrefix', val);
                  }}
                />
                <div className="form-hint">Format: PREFIX/YYYY-YY/XXX</div>
              </div>

              <div className="form-group">
                <label className="form-label">Next Sequence Number</label>
                <input
                  type="number"
                  min="1"
                  className="form-input"
                  value={settings.taxNextSequence !== undefined ? settings.taxNextSequence : (settings.nextSequence || 22)}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10) || 1;
                    handleInputChange('taxNextSequence', val);
                    handleInputChange('nextSequence', val);
                  }}
                />
                <div className="form-hint">
                  Next generated invoice: <strong>{(settings.taxInvoicePrefix || settings.invoicePrefix || 'MGS')}/{currentFy}/{String(settings.taxNextSequence !== undefined ? settings.taxNextSequence : (settings.nextSequence || 22)).padStart(2, '0')}</strong>
                </div>
              </div>
            </div>

            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '12.5px',
              color: '#475569',
              lineHeight: 1.5,
              marginTop: '8px',
            }}>
              <strong>Tax Invoice Sequence:</strong> Automatically generated based on the highest existing Tax Invoice number in Cloud Firestore.
            </div>
          </div>

          {/* 5. Invoice Numbering Sequence for Normal Invoice */}
          <div className="ui-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={20} color="#059669" />
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Invoice Numbering Sequence for Normal Invoice</h3>
                  <div style={{ fontSize: '12.5px', color: '#64748b' }}>Configure independent numbering sequence for Normal (non-tax) Invoices.</div>
                </div>
              </div>
              <span style={{ fontSize: '11.5px', padding: '3px 8px', borderRadius: '12px', background: '#ecfdf5', color: '#065f46', fontWeight: 600, border: '1px solid #a7f3d0' }}>
                Normal Invoices
              </span>
            </div>

            <div className="settings-grid-2">
              <div className="form-group">
                <label className="form-label">Invoice Prefix</label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.normalInvoicePrefix || 'MGS'}
                  onChange={(e) => handleInputChange('normalInvoicePrefix', e.target.value.toUpperCase())}
                />
                <div className="form-hint">Format: PREFIX/YYYY-YY/XXX</div>
              </div>

              <div className="form-group">
                <label className="form-label">Next Sequence Number</label>
                <input
                  type="number"
                  min="1"
                  className="form-input"
                  value={settings.normalNextSequence !== undefined ? settings.normalNextSequence : 1}
                  onChange={(e) => handleInputChange('normalNextSequence', parseInt(e.target.value, 10) || 1)}
                />
                <div className="form-hint">
                  Next generated invoice: <strong>{(settings.normalInvoicePrefix || 'MGS')}/{currentFy}/{String(settings.normalNextSequence !== undefined ? settings.normalNextSequence : 1).padStart(2, '0')}</strong>
                </div>
              </div>
            </div>

            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '12.5px',
              color: '#475569',
              lineHeight: 1.5,
              marginTop: '8px',
            }}>
              <strong>Normal Invoice Sequence:</strong> Operates completely independently from Tax Invoices with atomic Firestore reservation.
            </div>
          </div>

          {/* 5. Google Drive Backup Integration */}
          <div className="ui-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <HardDrive size={20} color="#1e3a8a" />
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Google Drive Cloud Backup</h3>
                  <div style={{ fontSize: '12.5px', color: '#64748b' }}>Client-side OAuth 2.0 with automatic background PDF backup to your "Manshi Invoices" Drive folder.</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: driveConnected ? '#eff6ff' : '#f8fafc',
                  color: driveConnected ? '#1d4ed8' : '#64748b',
                  border: `1px solid ${driveConnected ? '#bfdbfe' : '#e2e8f0'}`,
                }}>
                  {driveConnected ? <CheckCircle2 size={13} color="#2563eb" /> : <HardDrive size={13} />}
                  <span>{driveConnected ? `Connected (${driveEmail || 'Authorized'})` : 'Not Connected'}</span>
                </div>
                <button
                  type="button"
                  className={driveConnected ? "btn btn-secondary" : "btn btn-primary"}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                  onClick={handleToggleDriveConnection}
                  disabled={isConnectingDrive}
                >
                  {isConnectingDrive ? 'Connecting...' : driveConnected ? 'Disconnect' : 'Connect Drive'}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Google OAuth 2.0 Web Client ID (Optional Override)</label>
              <input
                type="text"
                className="form-input"
                placeholder="631933281935-xxxx.apps.googleusercontent.com"
                value={settings.googleDriveClientId || ''}
                onChange={(e) => handleInputChange('googleDriveClientId', e.target.value)}
              />
              <div className="form-hint">
                Configured in Google Cloud Console &gt; APIs &amp; Services &gt; Credentials under Authorized JavaScript origins (<code>http://localhost:5173</code>, <code>https://invoice-c797f.web.app</code>). No client secret is ever required.
              </div>
            </div>
          </div>

          {/* 6. Website Security & PIN Lock */}
          <div className="ui-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Lock size={20} color="#1e3a8a" />
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Website Security & PIN Lock</h3>
                  <div style={{ fontSize: '12.5px', color: '#64748b' }}>
                    4-digit security PIN required to access the Invoice Portal. Stored in Cloud Firestore and verified each session.
                  </div>
                </div>
              </div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
                background: '#eff6ff',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe',
              }}>
                <KeyRound size={13} color="#2563eb" />
                <span>PIN Protected (Active)</span>
              </div>
            </div>

            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '20px',
              maxWidth: '560px',
            }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', marginBottom: '14px' }}>
                Change 4-Digit Security PIN
              </div>

              {pinError && (
                <div style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                }}>
                  <AlertCircle size={16} />
                  <span>{pinError}</span>
                </div>
              )}

              {pinSuccess && (
                <div style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#16a34a',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                }}>
                  <CheckCircle2 size={16} />
                  <span>{pinSuccess}</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12.5px' }}>Current PIN</label>
                  <input
                    type="password"
                    maxLength={4}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="••••"
                    className="form-input"
                    style={{ letterSpacing: '4px', textAlign: 'center', fontSize: '16px' }}
                    value={currentPinInput}
                    onChange={(e) => setCurrentPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12.5px' }}>New 4-Digit PIN</label>
                  <input
                    type="password"
                    maxLength={4}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="••••"
                    className="form-input"
                    style={{ letterSpacing: '4px', textAlign: 'center', fontSize: '16px' }}
                    value={newPinInput}
                    onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12.5px' }}>Confirm New PIN</label>
                  <input
                    type="password"
                    maxLength={4}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="••••"
                    className="form-input"
                    style={{ letterSpacing: '4px', textAlign: 'center', fontSize: '16px' }}
                    value={confirmPinInput}
                    onChange={(e) => setConfirmPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  Default PIN is <strong>1234</strong>. PIN must be 4 digits.
                </span>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                  disabled={isUpdatingPin || newPinInput.length !== 4 || confirmPinInput.length !== 4 || !currentPinInput}
                  onClick={handleUpdatePin}
                >
                  {isUpdatingPin ? 'Updating PIN...' : 'Update Security PIN'}
                </button>
              </div>
            </div>
          </div>

          {/* 7. Cloud Migration Sync Card */}
          <div className="ui-card" style={{ borderLeft: '4px solid #2563eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Database size={18} color="#2563eb" />
                  <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Local to Firestore Data Synchronization</h4>
                </div>
                <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '4px' }}>
                  Migrate existing invoices, numbering sequences, and settings from local IndexedDB into Cloud Firestore.
                </div>
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleRunMigration}
                disabled={isMigrating}
                style={{ fontSize: '13px' }}
              >
                <RefreshCw size={14} className={isMigrating ? 'spin-icon' : ''} />
                {isMigrating ? 'Syncing...' : 'Sync Local Data to Cloud'}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Reset Confirmation Modal */}
      <ConfirmModal
        isOpen={showResetConfirm}
        title="Restore Default Settings"
        message="Are you sure you want to restore all settings to the reference Manshi Group of Services invoice defaults in Cloud Firestore?"
        confirmText="Restore Defaults"
        isDanger={true}
        onConfirm={handleResetDefaults}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
};
