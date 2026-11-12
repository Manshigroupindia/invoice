import { useState, useEffect } from 'react';
import type { InvoiceRecord, ToastMessage, ClientRecord } from './types';
import { initializeDatabase } from './db';
import { runLocalToFirestoreMigration } from './services/migrationService';
import { AppLayout } from './components/layout/AppLayout';
import { CreateInvoicePage } from './pages/CreateInvoicePage';
import { InvoiceHistoryPage } from './pages/InvoiceHistoryPage';
import { ClientsPage } from './pages/ClientsPage';
import { SettingsPage } from './pages/SettingsPage';
import { PinLockScreen } from './components/auth/PinLockScreen';
import { ToastContainer } from './components/common/Feedback';
import { BackupModal } from './components/common/BackupModal';

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('mgs_portal_authenticated') === 'true';
  });
  const [currentTab, setCurrentTab] = useState<'create' | 'history' | 'clients' | 'settings'>('create');
  const [editingInvoice, setEditingInvoice] = useState<InvoiceRecord | null>(null);
  const [selectedClientForNewInvoice, setSelectedClientForNewInvoice] = useState<ClientRecord | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  const addToast = (type: 'success' | 'error' | 'info' | 'warning', message: string, title?: string) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message, title }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const handleDismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    async function init() {
      try {
        await initializeDatabase();
        const migration = await runLocalToFirestoreMigration();
        if (migration.success && (migration.invoicesMigratedCount > 0 || migration.settingsMigrated)) {
          addToast('success', migration.message, 'Cloud Migration Complete');
        }
      } catch (err) {
        console.warn('Initial setup or migration error:', err);
      }
    }
    init();
  }, []);

  const handleEditInvoice = (invoice: InvoiceRecord) => {
    setEditingInvoice(invoice);
    setCurrentTab('create');
  };

  const handleDuplicateInvoice = (invoice: InvoiceRecord) => {
    // Clone with empty invoiceNumber so a fresh one is assigned
    const cloned: InvoiceRecord = {
      ...invoice,
      id: `inv-${Date.now()}`,
      invoiceNumber: '',
      date: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditingInvoice(cloned);
    setCurrentTab('create');
    addToast('info', `Duplicating invoice for ${invoice.customerName}. Assigning next available invoice number.`);
  };


  if (!isAuthenticated) {
    return <PinLockScreen onUnlock={() => setIsAuthenticated(true)} />;
  }

  return (
    <>
      <AppLayout
        currentTab={currentTab}
        onTabChange={(tab) => {
          if (tab === 'create' && currentTab !== 'create') {
            setEditingInvoice(null);
            setSelectedClientForNewInvoice(null);
          }
          setCurrentTab(tab);
        }}
        onOpenBackup={() => setIsBackupModalOpen(true)}
      >
        {currentTab === 'create' && (
          <CreateInvoicePage
            initialInvoice={editingInvoice}
            initialClient={selectedClientForNewInvoice}
            onSuccessToast={(msg) => addToast('success', msg)}
            onErrorToast={(msg) => addToast('error', msg)}
            onNavigateToHistory={() => {
              setEditingInvoice(null);
              setSelectedClientForNewInvoice(null);
              setCurrentTab('history');
            }}
          />
        )}

        {currentTab === 'history' && (
          <InvoiceHistoryPage
            onSuccessToast={(msg) => addToast('success', msg)}
            onErrorToast={(msg) => addToast('error', msg)}
            onEditInvoice={handleEditInvoice}
            onDuplicateInvoice={handleDuplicateInvoice}
          />
        )}

        {currentTab === 'clients' && (
          <ClientsPage
            onSuccessToast={(msg) => addToast('success', msg)}
            onErrorToast={(msg) => addToast('error', msg)}
            onCreateInvoiceForClient={(client) => {
              setEditingInvoice(null);
              setSelectedClientForNewInvoice(client);
              setCurrentTab('create');
            }}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsPage
            onSuccessToast={(msg) => addToast('success', msg)}
            onErrorToast={(msg) => addToast('error', msg)}
          />
        )}
      </AppLayout>

      {/* Floating Toast Alerts */}
      <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />

      {/* Backup and Restore Modal */}
      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onSuccess={(msg) => addToast('success', msg)}
        onError={(msg) => addToast('error', msg)}
      />
    </>
  );
}

export default App;
