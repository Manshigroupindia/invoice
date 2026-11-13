import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  Phone,
  Loader2,
} from 'lucide-react';
import type { ClientRecord, InvoiceRecord } from '../types';
import {
  subscribeClients,
  deleteClientFirestore,
  syncClientsFromInvoices,
  updateClientAndSyncInvoices,
  getClientLinkedInvoices,
} from '../services/clientService';
import { getAllInvoicesFirestore, subscribeInvoices } from '../services/firestoreService';
import { ClientModal } from '../components/clients/ClientModal';
import { ConfirmModal } from '../components/common/Feedback';

interface ClientsPageProps {
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
  onCreateInvoiceForClient?: (client: ClientRecord) => void;
}

export const ClientsPage: React.FC<ClientsPageProps> = ({
  onSuccessToast,
  onErrorToast,
  onCreateInvoiceForClient,
}) => {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [clientToDelete, setClientToDelete] = useState<ClientRecord | null>(null);
  const [isSavingClient, setIsSavingClient] = useState(false);

  useEffect(() => {
    // 1. Subscribe to clients collection
    setIsLoading(true);
    const unsub = subscribeClients(
      async (cloudClients) => {
        setClients(cloudClients);
        setIsLoading(false);

        // If no clients yet in Firestore, auto-extract from existing invoices
        if (cloudClients.length === 0) {
          try {
            const allInvoices = await getAllInvoicesFirestore();
            setInvoices(allInvoices);
            if (allInvoices.length > 0) {
              setIsSyncing(true);
              const result = await syncClientsFromInvoices(allInvoices);
              if (result.added > 0) {
                onSuccessToast(`Auto-extracted ${result.added} unique client(s) from existing invoices.`);
              }
              setIsSyncing(false);
            }
          } catch (e) {
            console.warn('Initial client extraction notice:', e);
            setIsSyncing(false);
          }
        }
      },
      (err) => {
        onErrorToast('Failed to sync clients: ' + err.message);
        setIsLoading(false);
      }
    );

    // 2. Real-time subscription to invoices for invoice counts and syncing
    const unsubInvoices = subscribeInvoices(
      (cloudInvoices) => {
        setInvoices(cloudInvoices);
      },
      (err) => console.warn('Could not subscribe to invoices for clients page:', err)
    );

    return () => {
      unsub();
      unsubInvoices();
    };
  }, []);

  // Compute how many invoices each client has using permanent clientId with fallback matching
  const clientInvoiceCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of clients) {
      const { linked } = getClientLinkedInvoices(c, invoices);
      map.set(c.id, linked.length);
      map.set(c.companyName.toLowerCase().trim(), linked.length);
    }
    return map;
  }, [clients, invoices]);

  const handleManualSync = async () => {
    try {
      setIsSyncing(true);
      const allInvoices = await getAllInvoicesFirestore();
      setInvoices(allInvoices);
      const result = await syncClientsFromInvoices(allInvoices);
      if (result.added > 0 || result.updated > 0) {
        onSuccessToast(`Sync complete: ${result.added} added, ${result.updated} updated.`);
      } else {
        onSuccessToast('All clients are already up to date with existing invoices.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to sync clients from invoices';
      onErrorToast(msg);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveClient = async (
    clientData: Partial<ClientRecord> & { companyName: string; address: string },
    forceSyncOverridden: boolean = false
  ) => {
    try {
      setIsSavingClient(true);
      const result = await updateClientAndSyncInvoices(clientData, forceSyncOverridden);
      let msg = `Client "${result.client.companyName}" saved.`;
      if (result.updatedInvoicesCount > 0) {
        msg = `Updated "${result.client.companyName}" and synchronized ${result.updatedInvoicesCount} linked invoice(s).`;
      }
      if (result.skippedOverriddenCount > 0) {
        msg += ` (${result.skippedOverriddenCount} customized override(s) preserved)`;
      }
      onSuccessToast(msg);
      setIsModalOpen(false);
      setSelectedClient(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save client';
      onErrorToast(msg);
    } finally {
      setIsSavingClient(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!clientToDelete) return;
    try {
      await deleteClientFirestore(clientToDelete.id);
      onSuccessToast(`Client "${clientToDelete.companyName}" deleted.`);
      setClientToDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete client';
      onErrorToast(msg);
    }
  };

  // Filter clients by search query
  const filteredClients = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.companyName.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        (c.mobile && c.mobile.includes(q)) ||
        (c.gstin && c.gstin.toLowerCase().includes(q))
    );
  }, [clients, searchQuery]);

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Header Bar */}
      <div className="history-top-bar">
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a' }}>Clients Directory</h2>
          <p style={{ fontSize: '13px', color: '#64748b' }}>
            Manage client records. Automatically extracted and synchronized from all saved invoice details.
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Search Box */}
          <div className="history-search-box" style={{ minWidth: '240px' }}>
            <Search
              size={16}
              color="#94a3b8"
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              className="form-input"
              placeholder="Search clients by name, GSTIN, mobile..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '36px' }}
            />
          </div>

          {/* Sync Button */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleManualSync}
            disabled={isSyncing}
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '42px',
            }}
            title="Scan all invoices in Firestore and import any new or missing clients"
          >
            <RefreshCw size={15} className={isSyncing ? 'spinner' : ''} />
            <span>{isSyncing ? 'Syncing...' : 'Sync from Invoices'}</span>
          </button>

          {/* Add Client Button */}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setSelectedClient(null);
              setIsModalOpen(true);
            }}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '42px',
              whiteSpace: 'nowrap',
            }}
          >
            <Plus size={16} />
            <span>Add Client</span>
          </button>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="ui-card" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
            <Loader2 size={28} className="spinner" style={{ margin: '0 auto 10px auto', color: '#1e3a8a' }} />
            <div>Loading client directory...</div>
          </div>
        ) : filteredClients.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Users size={44} color="#cbd5e1" style={{ margin: '0 auto 12px auto' }} />
            <h4 style={{ fontSize: '16px', color: '#0f172a', marginBottom: '6px' }}>
              {searchQuery ? 'No Matching Clients' : 'No Clients Found'}
            </h4>
            <p style={{ fontSize: '13px', color: '#64748b', maxWidth: '420px', margin: '0 auto 20px auto' }}>
              {searchQuery
                ? 'Try adjusting your search query.'
                : 'Click "Sync from Invoices" to extract customer details from all existing invoices, or click "Add Client" to create one manually.'}
            </p>
            {!searchQuery && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleManualSync}
                  disabled={isSyncing}
                >
                  <RefreshCw size={15} className={isSyncing ? 'spinner' : ''} />
                  <span>Sync from Invoices</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setSelectedClient(null);
                    setIsModalOpen(true);
                  }}
                >
                  <Plus size={15} />
                  <span>Add First Client</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table View (>= 768px) */}
            <div className="table-responsive desktop-only">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                    <th style={{ padding: '14px 20px' }}>Company / Customer Name</th>
                    <th style={{ padding: '14px 20px' }}>Complete Address</th>
                    <th style={{ padding: '14px 20px' }}>Mobile Number</th>
                    <th style={{ padding: '14px 20px' }}>GSTIN</th>
                    <th style={{ padding: '14px 20px', textAlign: 'center' }}>Invoices</th>
                    <th style={{ padding: '14px 20px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((client) => {
                    const invCount = clientInvoiceCounts.get(client.companyName.toLowerCase().trim()) || 0;
                    return (
                      <tr
                        key={client.id}
                        style={{ borderBottom: '1px solid #f1f5f9', transition: 'background-color 0.1s' }}
                        className="table-row-hover"
                      >
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '34px',
                                height: '34px',
                                borderRadius: '8px',
                                background: '#eff6ff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#1e3a8a',
                                flexShrink: 0,
                                fontWeight: 700,
                                fontSize: '13px',
                              }}
                            >
                              {client.companyName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, color: '#0f172a' }}>{client.companyName}</div>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: '14px 20px', maxWidth: '300px' }}>
                          <div
                            style={{
                              color: '#475569',
                              whiteSpace: 'pre-line',
                              lineHeight: 1.4,
                              fontSize: '12.5px',
                            }}
                          >
                            {client.address || '—'}
                          </div>
                        </td>

                        <td style={{ padding: '14px 20px', whiteSpace: 'nowrap' }}>
                          {client.mobile ? (
                            <span style={{ color: '#334155', fontWeight: 500 }}>{client.mobile}</span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>N/A</span>
                          )}
                        </td>

                        <td style={{ padding: '14px 20px', whiteSpace: 'nowrap' }}>
                          {client.gstin ? (
                            <code
                              style={{
                                background: '#f1f5f9',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                color: '#0f172a',
                                fontWeight: 600,
                              }}
                            >
                              {client.gstin}
                            </code>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>N/A</span>
                          )}
                        </td>

                        <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '12px',
                              fontWeight: 600,
                              background: invCount > 0 ? '#e0f2fe' : '#f1f5f9',
                              color: invCount > 0 ? '#0369a1' : '#64748b',
                            }}
                          >
                            {invCount}
                          </span>
                        </td>

                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            {onCreateInvoiceForClient && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '6px 10px', fontSize: '12px', color: '#1e3a8a', borderColor: '#bfdbfe' }}
                                onClick={() => onCreateInvoiceForClient(client)}
                                title="Create New Invoice for this Client"
                              >
                                <Plus size={13} />
                                <span>Invoice</span>
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '6px 10px', fontSize: '12px' }}
                              onClick={() => {
                                setSelectedClient(client);
                                setIsModalOpen(true);
                              }}
                              title="Edit Client Details"
                            >
                              <Edit2 size={13} />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '6px 10px', fontSize: '12px', color: '#ef4444' }}
                              onClick={() => setClientToDelete(client)}
                              title="Delete Client Record"
                            >
                              <Trash2 size={13} />
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View (< 768px) */}
            <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '14px' }}>
              {filteredClients.map((client) => {
                const invCount = clientInvoiceCounts.get(client.companyName.toLowerCase().trim()) || 0;
                return (
                  <div
                    key={client.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '16px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '8px',
                            background: '#eff6ff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#1e3a8a',
                            fontWeight: 700,
                          }}
                        >
                          {client.companyName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 style={{ fontSize: '14.5px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                            {client.companyName}
                          </h4>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>
                            {invCount} Invoice{invCount === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '5px 8px', fontSize: '11px' }}
                          onClick={() => {
                            setSelectedClient(client);
                            setIsModalOpen(true);
                          }}
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '5px 8px', fontSize: '11px', color: '#ef4444' }}
                          onClick={() => setClientToDelete(client)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    <div style={{ fontSize: '12.5px', color: '#475569', marginBottom: '8px', whiteSpace: 'pre-line' }}>
                      {client.address}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '12px', color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                      {client.mobile && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Phone size={12} />
                          <span>{client.mobile}</span>
                        </div>
                      )}
                      {client.gstin && (
                        <div>
                          <strong>GSTIN:</strong> <code>{client.gstin}</code>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Add / Edit Client Modal */}
      <ClientModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedClient(null);
        }}
        client={selectedClient}
        existingClients={clients}
        invoices={invoices}
        onSave={handleSaveClient}
        isLoading={isSavingClient}
      />

      {/* Delete Confirmation Modal */}
      {clientToDelete && (
        <ConfirmModal
          isOpen={true}
          title="Delete Client Record?"
          message={
            <div>
              <p style={{ marginBottom: '8px' }}>
                Are you sure you want to delete client record for <strong>{clientToDelete.companyName}</strong>?
              </p>
              <p style={{ fontSize: '12.5px', color: '#64748b' }}>
                Existing invoices associated with this client will remain completely intact.
              </p>
            </div>
          }
          confirmText="Yes, Delete Client"
          isDanger={true}
          onConfirm={handleDeleteClient}
          onCancel={() => setClientToDelete(null)}
        />
      )}
    </div>
  );
};
