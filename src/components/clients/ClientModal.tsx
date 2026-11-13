import React, { useState, useEffect, useMemo } from 'react';
import { X, Building2, Save, Loader2, AlertCircle, FileText } from 'lucide-react';
import type { ClientRecord, InvoiceRecord } from '../../types';
import { isDuplicateClient, getClientLinkedInvoices } from '../../services/clientService';

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  client?: ClientRecord | null;
  existingClients: ClientRecord[];
  invoices?: InvoiceRecord[];
  onSave: (
    clientData: Partial<ClientRecord> & { companyName: string; address: string },
    forceSyncOverridden?: boolean
  ) => Promise<void>;
  isLoading?: boolean;
}

export const ClientModal: React.FC<ClientModalProps> = ({
  isOpen,
  onClose,
  client,
  existingClients,
  invoices = [],
  onSave,
  isLoading = false,
}) => {
  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');
  const [mobile, setMobile] = useState('');
  const [gstin, setGstin] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [forceSyncOverridden, setForceSyncOverridden] = useState(false);

  // Compute linked invoices and overridden count for this client
  const { linked, overridden, taxCount, normalCount } = useMemo(() => {
    if (!client) return { linked: [], overridden: [], taxCount: 0, normalCount: 0 };
    return getClientLinkedInvoices(client, invoices);
  }, [client, invoices]);

  useEffect(() => {
    if (isOpen) {
      if (client) {
        setCompanyName(client.companyName || '');
        setAddress(client.address || '');
        setMobile(client.mobile || '');
        setGstin(client.gstin || '');
      } else {
        setCompanyName('');
        setAddress('');
        setMobile('');
        setGstin('');
      }
      setDuplicateWarning(null);
      setForceSyncOverridden(false);
    }
  }, [isOpen, client]);

  // Check for duplicate client as user types
  useEffect(() => {
    if (!companyName.trim()) {
      setDuplicateWarning(null);
      return;
    }

    const candidate = {
      id: client?.id,
      companyName: companyName.trim(),
      mobile: mobile.trim(),
      gstin: gstin.trim(),
    };

    const duplicate = existingClients.find((c) => isDuplicateClient(c, candidate));
    if (duplicate && duplicate.id !== client?.id) {
      setDuplicateWarning(`A client named "${duplicate.companyName}" already exists with similar details.`);
    } else {
      setDuplicateWarning(null);
    }
  }, [companyName, mobile, gstin, existingClients, client]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !address.trim() || isLoading) return;

    await onSave(
      {
        ...(client ? { id: client.id, createdAt: client.createdAt } : {}),
        companyName: companyName.trim(),
        address: address.trim(),
        mobile: mobile.trim(),
        gstin: gstin.trim().toUpperCase(),
      },
      forceSyncOverridden
    );
  };

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!isLoading) onClose();
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
                background: '#eff6ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563eb',
              }}
            >
              <Building2 size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                {client ? 'Edit Client Record' : 'Add New Client'}
              </h3>
              <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                {client ? 'Update saved customer information' : 'Create customer details for quick invoice selection'}
              </p>
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

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {duplicateWarning && (
              <div
                style={{
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12.5px',
                  color: '#92400e',
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{duplicateWarning}</span>
              </div>
            )}

            {client && linked.length > 0 && (
              <div
                style={{
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  fontSize: '12.5px',
                  color: '#0369a1',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                  <FileText size={16} style={{ color: '#0284c7', flexShrink: 0 }} />
                  <span>
                    Linked to {linked.length} existing invoice{linked.length > 1 ? 's' : ''} (
                    {[
                      taxCount > 0 ? `${taxCount} Tax` : null,
                      normalCount > 0 ? `${normalCount} Normal` : null,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                    )
                  </span>
                </div>
                <div style={{ fontSize: '11.5px', color: '#0284c7', lineHeight: 1.4 }}>
                  Updating this client will automatically sync Name, Address, Mobile, and GSTIN across all linked invoices in Firestore and newly generated PDFs.
                </div>

                {overridden.length > 0 && (
                  <div
                    style={{
                      marginTop: '6px',
                      padding: '10px 12px',
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: '6px',
                      color: '#92400e',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '4px' }}>
                      ⚠️ {overridden.length} invoice{overridden.length > 1 ? 's have' : ' has'} manually customized details
                    </div>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        userSelect: 'none',
                        lineHeight: 1.35,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={forceSyncOverridden}
                        onChange={(e) => setForceSyncOverridden(e.target.checked)}
                        style={{ marginTop: '2px', cursor: 'pointer' }}
                      />
                      <span>
                        Also overwrite and update the {overridden.length} customized invoice{overridden.length > 1 ? 's' : ''}. (Unchecked preserves individual custom details).
                      </span>
                    </label>
                  </div>
                )}
              </div>
            )}

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '13px', fontWeight: 600 }}>
                Company / Customer Name *
              </label>
              <input
                type="text"
                className="form-input"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. M/s. Brushspace"
                required
                disabled={isLoading}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '13px', fontWeight: 600 }}>
                Complete Address *
              </label>
              <textarea
                className="form-textarea"
                rows={3}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Full billing address&#10;Sector, City, State - PIN"
                required
                disabled={isLoading}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '13px', fontWeight: 600 }}>
                  Mobile Number
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="e.g. +91 88604 30075"
                  disabled={isLoading}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '13px', fontWeight: 600 }}>
                  GSTIN
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="e.g. 09ARJPY9074A1Z9"
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
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
              disabled={isLoading || !companyName.trim() || !address.trim()}
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
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save size={15} />
                  <span>{client ? 'Update Client' : 'Save Client'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

