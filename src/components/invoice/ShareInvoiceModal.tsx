import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Send,
  Mail,
  Download,
  FileText,
  AlertCircle,
  CheckCircle2,
  Phone,
  Loader2,
  Copy,
  Share2,
} from 'lucide-react';
import type { InvoiceRecord, CompanySettings, ClientRecord } from '../../types';
import {
  interpolateInvoiceTemplate,
  cleanIndianMobileNumber,
  isValidEmail,
  canShareFiles,
} from '../../utils/shareInvoice';
import {
  formatDefaultPdfFilename,
  sanitizePdfFilename,
  getInvoicePDFBlob,
} from '../../utils/pdfGenerator';
import { downloadInvoicePDFUnified } from '../../utils/androidPdfDownload';
import {
  DEFAULT_WHATSAPP_TEMPLATE,
  DEFAULT_EMAIL_SUBJECT_TEMPLATE,
  DEFAULT_EMAIL_BODY_TEMPLATE,
} from '../../services/firestoreService';

export interface ShareInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: InvoiceRecord | null;
  channel: 'whatsapp' | 'email';
  companySettings?: CompanySettings | null;
  clients?: ClientRecord[];
  onSaveContactToClient?: (
    clientId: string,
    contactData: { mobile?: string; email?: string }
  ) => Promise<void>;
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
}

export const ShareInvoiceModal: React.FC<ShareInvoiceModalProps> = ({
  isOpen,
  onClose,
  invoice,
  channel,
  companySettings,
  clients = [],
  onSaveContactToClient,
  onSuccessToast,
  onErrorToast,
}) => {
  // Find linked client record if available
  const linkedClient = useMemo(() => {
    if (!invoice) return null;
    if (invoice.clientId) {
      return clients.find((c) => c.id === invoice.clientId) || null;
    }
    const cleanName = (invoice.customerName || '').trim().toLowerCase();
    return clients.find((c) => c.companyName.trim().toLowerCase() === cleanName) || null;
  }, [invoice, clients]);

  // Contact inputs
  const [mobileInput, setMobileInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [saveToClient, setSaveToClient] = useState(true);

  // Message & Filename states
  const [messageText, setMessageText] = useState('');
  const [subjectText, setSubjectText] = useState('');
  const [filenameInput, setFilenameInput] = useState('');

  // Execution states
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  // Capability state: check if Web Share API with file sharing is supported
  const [hasFileShareSupport, setHasFileShareSupport] = useState<boolean>(() => canShareFiles());

  const isWhatsApp = channel === 'whatsapp';

  // Initialize state whenever modal opens or invoice/channel changes
  useEffect(() => {
    if (isOpen && invoice) {
      setHasFileShareSupport(canShareFiles());
      const activeSettings = companySettings || undefined;

      // 1. Resolve Mobile Number
      const existingMobile =
        invoice.customerMobile?.trim() || linkedClient?.mobile?.trim() || '';
      setMobileInput(existingMobile);

      // 2. Resolve Email Address
      const existingEmail =
        invoice.customerEmail?.trim() || linkedClient?.email?.trim() || '';
      setEmailInput(existingEmail);

      // 3. Resolve Filename
      const defaultFilename = formatDefaultPdfFilename(
        invoice.customerName,
        invoice.invoiceNumber,
        invoice.invoiceType
      );
      setFilenameInput(defaultFilename);

      // 4. Interpolate Message & Subject
      if (channel === 'whatsapp') {
        const template =
          activeSettings?.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE;
        setMessageText(interpolateInvoiceTemplate(template, invoice, activeSettings));
      } else {
        const subTemplate =
          activeSettings?.emailSubjectTemplate || DEFAULT_EMAIL_SUBJECT_TEMPLATE;
        const bodyTemplate =
          activeSettings?.emailBodyTemplate || DEFAULT_EMAIL_BODY_TEMPLATE;
        setSubjectText(interpolateInvoiceTemplate(subTemplate, invoice, activeSettings));
        setMessageText(interpolateInvoiceTemplate(bodyTemplate, invoice, activeSettings));
      }

      setContactError(null);
      setSaveToClient(true);
    }
  }, [isOpen, invoice, channel, companySettings, linkedClient]);

  if (!isOpen || !invoice) return null;

  // Validate Contact Information
  const validateContact = (): { valid: boolean; cleanContact: string; error?: string } => {
    if (isWhatsApp) {
      const cleaned = cleanIndianMobileNumber(mobileInput);
      if (!cleaned.isValid) {
        return {
          valid: false,
          cleanContact: '',
          error: 'Please enter a valid 10-digit mobile number for WhatsApp sharing.',
        };
      }
      return { valid: true, cleanContact: cleaned.cleaned };
    } else {
      if (!isValidEmail(emailInput)) {
        return {
          valid: false,
          cleanContact: '',
          error: 'Please enter a valid email address (e.g. client@example.com).',
        };
      }
      return { valid: true, cleanContact: emailInput.trim() };
    }
  };

  // Perform Save Contact (if user opted to save to client record)
  const maybePersistContact = async () => {
    if (!saveToClient || !onSaveContactToClient) return;

    const clientIdToUpdate = linkedClient?.id || invoice.clientId;
    if (!clientIdToUpdate) return;

    try {
      if (isWhatsApp && mobileInput.trim()) {
        await onSaveContactToClient(clientIdToUpdate, { mobile: mobileInput.trim() });
      } else if (!isWhatsApp && emailInput.trim()) {
        await onSaveContactToClient(clientIdToUpdate, { email: emailInput.trim() });
      }
    } catch (e) {
      console.warn('Could not auto-save contact info to client record:', e);
    }
  };

  // Native Web Share Action with actual attached PDF file
  const handleNativeShare = async () => {
    setContactError(null);

    // 1. Validate contact info
    const check = validateContact();
    if (!check.valid) {
      setContactError(check.error || 'Invalid contact details.');
      return;
    }

    try {
      setIsProcessing(true);

      // 2. Save contact to client record if selected
      await maybePersistContact();

      // 3. Generate the latest invoice PDF in memory (Blob -> File)
      const activeSettings = companySettings || undefined;
      const { blob } = await getInvoicePDFBlob(invoice, activeSettings);
      const safeFilename = sanitizePdfFilename(filenameInput);

      // Construct a proper W3C File object with correct filename and MIME type
      const pdfFile = new File([blob], safeFilename, {
        type: 'application/pdf',
        lastModified: Date.now(),
      });

      // 4. Strictly check Web Share API file sharing support
      if (
        typeof navigator === 'undefined' ||
        typeof navigator.share !== 'function' ||
        typeof navigator.canShare !== 'function' ||
        !navigator.canShare({ files: [pdfFile] })
      ) {
        setHasFileShareSupport(false);
        const unsupportedMsg =
          'Native PDF file sharing is not supported by your current browser or device. Please use Google Chrome on Android, Safari on iOS/macOS, or use the "Download PDF Fallback" button below.';
        setContactError(unsupportedMsg);
        onErrorToast('Native PDF file sharing is unsupported on this browser.');
        return;
      }

      // 5. If Email, copy recipient email to clipboard so user can instantly paste it into Gmail / Email app
      if (!isWhatsApp && check.cleanContact && typeof navigator.clipboard?.writeText === 'function') {
        try {
          await navigator.clipboard.writeText(check.cleanContact);
        } catch {
          // Clipboard write failure is non-fatal
        }
      }

      // 6. Build native ShareData payload with the actual PDF file attachment and prefilled text
      const shareData: ShareData = {
        files: [pdfFile],
        title: isWhatsApp ? safeFilename : subjectText,
        text: messageText,
      };

      // 7. Open device's native share menu with PDF attached
      await navigator.share(shareData);

      if (isWhatsApp) {
        onSuccessToast(
          `Share menu opened with attached invoice PDF. Select WhatsApp to send to ${check.cleanContact}!`
        );
      } else {
        onSuccessToast(
          `Share menu opened with attached invoice PDF. Recipient (${check.cleanContact}) copied to clipboard!`
        );
      }

      onClose();
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        // User dismissed the native share sheet - do not show an error toast
        setIsProcessing(false);
        return;
      }
      const msg = err instanceof Error ? err.message : 'Share failed';
      setContactError(msg);
      onErrorToast(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Manual PDF Download Fallback (for unsupported browsers or manual saving)
  const handleManualDownloadPdf = async () => {
    try {
      setIsDownloadingPdf(true);
      const activeSettings = companySettings || undefined;
      const safeFilename = sanitizePdfFilename(filenameInput);
      const res = await downloadInvoicePDFUnified(invoice, activeSettings, safeFilename);
      if (res.isNative && res.result) {
        onSuccessToast(`PDF saved to ${res.result.location}${res.result.filename}`);
      } else {
        onSuccessToast(`Invoice PDF downloaded: "${safeFilename}"`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to download PDF';
      onErrorToast(msg);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleCopyMessage = async () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(messageText);
        onSuccessToast('Message copied to clipboard.');
      } catch {
        onErrorToast('Failed to copy message.');
      }
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!isProcessing && !isDownloadingPdf) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-container"
        style={{ maxWidth: '600px', width: '100%', margin: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #e2e8f0',
            padding: '16px 20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: isWhatsApp ? '#dcfce7' : '#eff6ff',
                color: isWhatsApp ? '#16a34a' : '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {isWhatsApp ? <Send size={20} /> : <Mail size={20} />}
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                {isWhatsApp ? 'Send Invoice via WhatsApp' : 'Send Invoice via Email'}
              </h3>
              <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                Invoice {invoice.invoiceNumber} • {invoice.customerName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing || isDownloadingPdf}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: isProcessing || isDownloadingPdf ? 'not-allowed' : 'pointer',
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
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            maxHeight: 'calc(85vh - 130px)',
            overflowY: 'auto',
          }}
        >
          {/* Error Message Box */}
          {contactError && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                fontSize: '12.5px',
                color: '#b91c1c',
                lineHeight: 1.45,
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{contactError}</span>
            </div>
          )}

          {/* Native File Sharing Capability Info */}
          {hasFileShareSupport ? (
            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                padding: '12px 14px',
                fontSize: '12px',
                color: '#166534',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={15} color="#16a34a" />
                <span>{isWhatsApp ? 'Native WhatsApp Share Ready' : 'Native Email Share Ready'}</span>
              </div>
              <div style={{ lineHeight: 1.45, color: '#15803d' }}>
                {isWhatsApp ? (
                  <>
                    Clicking <strong>Send WhatsApp</strong> will open your device's native Share menu with the <strong>actual invoice PDF attached</strong> and prefilled message. You can select <strong>WhatsApp</strong> to send directly to your client.
                  </>
                ) : (
                  <>
                    Clicking <strong>Send Email</strong> will open your device's native Share menu with the <strong>actual invoice PDF attached</strong>, subject, and message. You can select <strong>Gmail</strong> or your email app. {emailInput ? `Recipient (${emailInput}) will be copied to your clipboard.` : ''}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '8px',
                padding: '14px 16px',
                fontSize: '12.5px',
                color: '#92400e',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={17} color="#d97706" style={{ flexShrink: 0 }} />
                <span>Native PDF File Sharing Unsupported in this Browser</span>
              </div>
              <div style={{ lineHeight: 1.45, color: '#b45309' }}>
                Your current browser does not support Web Share API with attached files (<code>navigator.canShare</code>).
                Direct sharing with attached PDFs requires a supported browser such as <strong>Google Chrome on Android</strong>, <strong>Safari on iOS</strong>, or <strong>Microsoft Edge</strong>.
              </div>
              <div style={{ fontSize: '12px', color: '#78350f', lineHeight: 1.4 }}>
                You can download the invoice PDF file manually using the <strong>Download PDF</strong> button below.
              </div>
            </div>
          )}

          {/* Contact Validation & Input Field */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '14px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              {isWhatsApp ? (
                <Phone size={15} style={{ color: '#16a34a' }} />
              ) : (
                <Mail size={15} style={{ color: '#2563eb' }} />
              )}
              <label
                className="form-label"
                style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', margin: 0 }}
              >
                {isWhatsApp ? "Client's WhatsApp Mobile Number *" : "Client's Email Address *"}
              </label>
            </div>

            {isWhatsApp ? (
              <input
                type="text"
                className="form-input"
                value={mobileInput}
                onChange={(e) => {
                  setMobileInput(e.target.value);
                  setContactError(null);
                }}
                placeholder="e.g. 9876543210 or +91 98765 43210"
                disabled={isProcessing}
                style={{ fontSize: '13.5px' }}
                autoFocus={!mobileInput}
              />
            ) : (
              <input
                type="email"
                className="form-input"
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  setContactError(null);
                }}
                placeholder="e.g. client@example.com"
                disabled={isProcessing}
                style={{ fontSize: '13.5px' }}
                autoFocus={!emailInput}
              />
            )}

            {/* Checkbox to persist contact into client record */}
            <div style={{ marginTop: '10px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  color: '#475569',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={saveToClient}
                  onChange={(e) => setSaveToClient(e.target.checked)}
                  disabled={isProcessing}
                />
                <span>Save this contact detail to the Client record for future invoices</span>
              </label>
            </div>
          </div>

          {/* Email Subject (Email Only) */}
          {!isWhatsApp && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '13px', fontWeight: 600 }}>
                Email Subject
              </label>
              <input
                type="text"
                className="form-input"
                value={subjectText}
                onChange={(e) => setSubjectText(e.target.value)}
                placeholder="Subject"
                disabled={isProcessing}
              />
            </div>
          )}

          {/* Message Preview & Customization */}
          <div className="form-group" style={{ margin: 0 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '6px',
              }}
            >
              <label className="form-label" style={{ fontSize: '13px', fontWeight: 600, margin: 0 }}>
                {isWhatsApp ? 'WhatsApp Message Text' : 'Email Message Body'}
              </label>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                Configurable from Settings
              </span>
            </div>
            <textarea
              className="form-textarea"
              rows={isWhatsApp ? 5 : 6}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              disabled={isProcessing}
              style={{ fontSize: '12.5px', lineHeight: 1.45, fontFamily: 'inherit' }}
            />
          </div>

          {/* PDF Filename Section */}
          <div className="form-group" style={{ margin: 0 }}>
            <label
              className="form-label"
              style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155' }}
            >
              PDF Attachment Filename
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={16} color="#64748b" style={{ flexShrink: 0 }} />
              <input
                type="text"
                className="form-input"
                value={filenameInput}
                onChange={(e) => setFilenameInput(e.target.value)}
                disabled={isProcessing}
                style={{ fontSize: '12.5px' }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="modal-footer"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '10px',
            borderTop: '1px solid #e2e8f0',
            padding: '14px 20px',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isProcessing || isDownloadingPdf}
            style={{ padding: '8px 16px', fontSize: '13px' }}
          >
            Cancel
          </button>

          {/* Copy Message Button */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCopyMessage}
            disabled={isProcessing}
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Copy prefilled message to clipboard"
          >
            <Copy size={14} />
            <span>Copy Message</span>
          </button>

          {/* Manual PDF Download Fallback Button */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleManualDownloadPdf}
            disabled={isProcessing || isDownloadingPdf}
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Download PDF directly to your device"
          >
            {isDownloadingPdf ? (
              <>
                <Loader2 size={14} className="spinner" />
                <span>Downloading...</span>
              </>
            ) : (
              <>
                <Download size={14} />
                <span>Download PDF</span>
              </>
            )}
          </button>

          {/* Primary Action Button: Opens native share menu with attached PDF */}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleNativeShare}
            disabled={isProcessing || isDownloadingPdf}
            title={
              !hasFileShareSupport
                ? 'Native file sharing is unsupported in this browser'
                : isWhatsApp
                ? 'Open native share menu with attached PDF for WhatsApp'
                : 'Open native share menu with attached PDF for Email'
            }
            style={{
              padding: '8px 18px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: isWhatsApp ? '#16a34a' : '#2563eb',
              borderColor: isWhatsApp ? '#15803d' : '#1d4ed8',
            }}
          >
            {isProcessing ? (
              <>
                <Loader2 size={15} className="spinner" />
                <span>Attaching PDF & Opening Share...</span>
              </>
            ) : (
              <>
                <Share2 size={15} />
                <span>{isWhatsApp ? 'Send WhatsApp' : 'Send Email'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
