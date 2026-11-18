import React from 'react';
import { CheckCircle2, FileText, Folder, ExternalLink, Share2, X } from 'lucide-react';
import {
  AndroidPdfDownloader,
  type AndroidDownloadResult,
} from '../../utils/androidPdfDownload';

export interface AndroidDownloadSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  downloadData: AndroidDownloadResult | null;
  onErrorToast?: (msg: string) => void;
}

export const AndroidDownloadSuccessModal: React.FC<AndroidDownloadSuccessModalProps> = ({
  isOpen,
  onClose,
  downloadData,
  onErrorToast,
}) => {
  if (!isOpen || !downloadData) return null;

  const handleOpenPdf = async () => {
    try {
      await AndroidPdfDownloader.openPdf({ uri: downloadData.uri });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not open PDF viewer';
      if (onErrorToast) onErrorToast(msg);
    }
  };

  const handleSharePdf = async () => {
    try {
      await AndroidPdfDownloader.sharePdf({
        uri: downloadData.uri,
        filename: downloadData.filename,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not launch share menu';
      if (onErrorToast) onErrorToast(msg);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-container"
        style={{ maxWidth: '440px', width: '92%', margin: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#dcfce7',
                color: '#16a34a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <CheckCircle2 size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                PDF Downloaded Successfully!
              </h3>
              <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                Saved to your phone's public storage
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              padding: '6px',
              borderRadius: '6px',
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div
          className="modal-body"
          style={{
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <FileText size={18} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 500 }}>
                  File:
                </div>
                <div
                  style={{
                    fontSize: '13.5px',
                    color: '#0f172a',
                    fontWeight: 600,
                    wordBreak: 'break-all',
                  }}
                >
                  {downloadData.filename}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                paddingTop: '8px',
                borderTop: '1px solid #e2e8f0',
              }}
            >
              <Folder size={18} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 500 }}>
                  Location:
                </div>
                <div style={{ fontSize: '13px', color: '#0f172a', fontWeight: 600 }}>
                  {downloadData.location || 'Downloads/Manshi Invoice/'}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  Accessible from your phone's Files / Downloads app
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          className="modal-footer"
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSharePdf}
            style={{
              fontSize: '13px',
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Share2 size={15} />
            <span>Share PDF</span>
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleOpenPdf}
            style={{
              fontSize: '13px',
              padding: '8px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#2563eb',
              borderColor: '#1d4ed8',
            }}
          >
            <ExternalLink size={15} />
            <span>Open PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
};
