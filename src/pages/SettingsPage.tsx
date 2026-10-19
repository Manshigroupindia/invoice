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
} from 'lucide-react';
import type { CompanySettings } from '../types';
import {
  subscribeCompanySettings,
  saveCompanySettingsFirestore,
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

          {/* 4. Sequence & Cloud Numbering */}
          <div className="ui-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <FileText size={20} color="#1e3a8a" />
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Invoice Numbering Sequence (Firestore)</h3>
            </div>

            <div className="settings-grid-2">
              <div className="form-group">
                <label className="form-label">Invoice Prefix</label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.invoicePrefix}
                  onChange={(e) => handleInputChange('invoicePrefix', e.target.value.toUpperCase())}
                />
                <div className="form-hint">Format: PREFIX/YYYY-YY/XXX</div>
              </div>

              <div className="form-group">
                <label className="form-label">Next Sequence Number</label>
                <input
                  type="number"
                  min="1"
                  className="form-input"
                  value={settings.nextSequence}
                  onChange={(e) => handleInputChange('nextSequence', parseInt(e.target.value, 10) || 1)}
                />
                <div className="form-hint">
                  Next generated invoice: <strong>{settings.invoicePrefix || 'MGS'}/2026-27/{String(settings.nextSequence || 79).padStart(3, '0')}</strong>
                </div>
              </div>
            </div>

            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '13px',
              color: '#475569',
              lineHeight: 1.5,
              marginTop: '8px',
            }}>
              <strong>Transactional Safety:</strong> Firestore transactions guarantee numbers are locked atomically, preventing duplicate invoice numbers when multiple users issue invoices concurrently.
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

          {/* 6. Cloud Migration Sync Card */}
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
