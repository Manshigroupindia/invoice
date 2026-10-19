import React, { useRef, useState, useEffect } from 'react';
import { Download, Upload, Cloud, Database, X, HardDrive, CheckCircle2, ExternalLink } from 'lucide-react';
import { exportDatabaseBackup, importDatabaseBackup } from '../../db';
import { runLocalToFirestoreMigration } from '../../services/migrationService';
import {
  connectGoogleDrive,
  disconnectGoogleDrive,
  subscribeDriveConnection,
} from '../../services/googleDriveClient';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveEmail, setDriveEmail] = useState<string | undefined>();
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeDriveConnection((connected, email) => {
      setDriveConnected(connected);
      setDriveEmail(email);
    });
    return () => unsub();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const backupData = await exportDatabaseBackup();
      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `manshi_invoice_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onSuccess(`Backup file exported successfully with ${backupData.invoices.length} invoices.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error during export';
      onError(`Export failed: ${msg}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      const text = await file.text();
      const parsed = JSON.parse(text);
      const result = await importDatabaseBackup(parsed);
      onSuccess(result.message);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid backup file format';
      onError(`Import failed: ${msg}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSyncToCloud = async () => {
    try {
      setIsMigrating(true);
      const res = await runLocalToFirestoreMigration(true);
      if (res.success) {
        onSuccess(res.message);
      } else {
        onError(res.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cloud synchronization failed';
      onError(msg);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleConnectDrive = async () => {
    try {
      setIsConnectingDrive(true);
      await connectGoogleDrive();
      onSuccess('Google Drive connected successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect Google Drive';
      onError(msg);
    } finally {
      setIsConnectingDrive(false);
    }
  };

  const handleDisconnectDrive = () => {
    disconnectGoogleDrive();
    onSuccess('Google Drive disconnected.');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Database size={20} color="#1e3a8a" />
            <h3>Backup & Cloud Migration</h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Cloud Sync Notice */}
          <div style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '8px',
            padding: '14px',
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}>
            <Cloud size={20} color="#16a34a" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '13px', color: '#166534', lineHeight: 1.5, flex: 1, minWidth: '200px' }}>
              <strong>Cloud Firestore Connected (invoice-c797f):</strong>
              <br />
              All invoices and settings sync in real-time to Google Cloud Firestore. Your local IndexedDB serves as an offline-ready cache.
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '8px 14px', fontSize: '12.5px', whiteSpace: 'nowrap' }}
              onClick={handleSyncToCloud}
              disabled={isMigrating}
            >
              {isMigrating ? 'Syncing...' : 'Sync Local to Cloud'}
            </button>
          </div>

          {/* Google Drive Integration */}
          <div style={{
            background: driveConnected ? '#eff6ff' : '#f8fafc',
            border: `1px solid ${driveConnected ? '#bfdbfe' : '#e2e8f0'}`,
            borderRadius: '8px',
            padding: '14px',
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}>
            <HardDrive size={22} color={driveConnected ? '#2563eb' : '#64748b'} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: '13px', minWidth: '200px' }}>
              <div style={{ fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Google Drive Cloud Storage</span>
                {driveConnected && (
                  <span style={{ fontSize: '11px', background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                    Connected
                  </span>
                )}
              </div>
              <div style={{ color: '#64748b', fontSize: '12px', marginTop: '2px' }}>
                {driveConnected
                  ? `OAuth 2.0 active for ${driveEmail || 'connected account'}. Automatically backs up invoice PDFs to the "Manshi Invoices" folder.`
                  : 'Connect your Google Drive account using secure Google Identity Services (drive.file scope).'}
              </div>
            </div>
            {!driveConnected ? (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '8px 14px', fontSize: '12.5px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={handleConnectDrive}
                disabled={isConnectingDrive}
              >
                <ExternalLink size={13} />
                <span>{isConnectingDrive ? 'Connecting...' : 'Connect Drive'}</span>
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontSize: '12px', fontWeight: 600 }}>
                  <CheckCircle2 size={16} />
                  <span>Authorized</span>
                </div>
                <button
                  type="button"
                  onClick={handleDisconnectDrive}
                  style={{
                    background: '#fee2e2',
                    border: '1px solid #fecaca',
                    color: '#b91c1c',
                    borderRadius: '4px',
                    padding: '6px 10px',
                    fontSize: '11.5px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>

          <div className="settings-grid-2">
            <div style={{
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}>
              <Download size={28} color="#2563eb" />
              <div>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>Export Backup</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  Download all invoices and settings as a JSON file.
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={handleExport}
                disabled={isExporting}
                style={{ width: '100%', marginTop: 'auto' }}
              >
                {isExporting ? 'Exporting...' : 'Export JSON Backup'}
              </button>
            </div>

            <div style={{
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}>
              <Upload size={28} color="#059669" />
              <div>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>Restore Backup</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  Restore previously saved invoices and company settings.
                </div>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <button
                className="btn btn-secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                style={{ width: '100%', marginTop: 'auto' }}
              >
                {isImporting ? 'Restoring...' : 'Select JSON File'}
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
