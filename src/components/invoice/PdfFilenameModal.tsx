import React, { useState, useEffect, useRef } from 'react';
import { Download, X, FileText, Loader2 } from 'lucide-react';
import { sanitizePdfFilename } from '../../utils/pdfGenerator';

interface PdfFilenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultFilename: string;
  onConfirm: (filename: string) => Promise<void> | void;
  isLoading?: boolean;
}

export const PdfFilenameModal: React.FC<PdfFilenameModalProps> = ({
  isOpen,
  onClose,
  defaultFilename,
  onConfirm,
  isLoading = false,
}) => {
  const [filename, setFilename] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFilename(defaultFilename);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          // Select file base name without .pdf
          const dotIndex = defaultFilename.lastIndexOf('.');
          if (dotIndex > 0) {
            inputRef.current.setSelectionRange(0, dotIndex);
          } else {
            inputRef.current.select();
          }
        }
      }, 50);
    }
  }, [isOpen, defaultFilename]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    const sanitized = sanitizePdfFilename(filename);
    onConfirm(sanitized);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isLoading) {
      onClose();
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!isLoading) onClose();
      }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-filename-dialog-title"
    >
      <div
        className="modal-container"
        style={{ maxWidth: '480px', width: '100%', margin: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: '#eff6ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563eb',
            }}>
              <FileText size={20} />
            </div>
            <div>
              <h3 id="pdf-filename-dialog-title" style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                What would you like to name this PDF?
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              color: '#64748b',
              padding: '4px',
              borderRadius: '6px',
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: '20px 24px' }}>
            <label
              htmlFor="pdf-filename-input"
              className="form-label"
              style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}
            >
              PDF File Name
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="pdf-filename-input"
                ref={inputRef}
                type="text"
                className="form-input"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                disabled={isLoading}
                placeholder="e.g. Brushspace Invoice.pdf"
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  fontSize: '14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                }}
              />
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px', lineHeight: 1.4 }}>
              The <code>.pdf</code> extension will be added automatically if omitted. Invalid characters (like <code>/ \ : * ? " &lt; &gt; |</code>) will be replaced with dashes.
            </p>
          </div>

          {/* Footer Buttons */}
          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isLoading}
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading || !filename.trim()}
              style={{
                padding: '8px 20px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={15} className="spinner" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Download size={15} />
                  <span>Download</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

