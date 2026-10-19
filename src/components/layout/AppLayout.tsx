import React, { useState, useEffect } from 'react';
import {
  FileText,
  History,
  Settings,
  Database,
  Menu,
  X,
} from 'lucide-react';
import type { CompanySettings } from '../../types';
import { getCompanySettingsFirestore, subscribeCompanySettings } from '../../services/firestoreService';

interface AppLayoutProps {
  currentTab: 'create' | 'history' | 'settings';
  onTabChange: (tab: 'create' | 'history' | 'settings') => void;
  onOpenBackup: () => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentTab,
  onTabChange,
  onOpenBackup,
  children,
}) => {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    getCompanySettingsFirestore().then(setSettings).catch(console.error);
    const unsub = subscribeCompanySettings((cloudSettings) => {
      setSettings(cloudSettings);
    });
    return () => unsub();
  }, []);

  // Close mobile drawer on resize to desktop width
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 900) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleNavClick = (tab: 'create' | 'history' | 'settings') => {
    onTabChange(tab);
    setIsMobileMenuOpen(false);
  };

  const handleOpenBackupMobile = () => {
    onOpenBackup();
    setIsMobileMenuOpen(false);
  };

  const logoSrc = settings?.logoUrl || settings?.logoDataUrl || '/assets/logo.png';

  return (
    <div className="app-container">
      {/* Sidebar Overlay Backdrop for Mobile */}
      <div
        className={`sidebar-overlay ${isMobileMenuOpen ? 'active' : ''}`}
        onClick={() => setIsMobileMenuOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar Navigation (Collapsible Drawer on Mobile) */}
      <aside className={`app-sidebar ${isMobileMenuOpen ? 'open' : ''}`} aria-label="Main Navigation">
        {/* Brand Header */}
        <div className="sidebar-brand">
          <img src={logoSrc} alt="Logo" className="sidebar-logo" />
          <div>
            <div className="sidebar-brand-title">Manshi Group</div>
            <div className="sidebar-brand-subtitle">Invoice Portal</div>
          </div>
          {/* Close button inside mobile drawer */}
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Close navigation menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="sidebar-nav">
          <button
            type="button"
            className={`nav-link ${currentTab === 'create' ? 'active' : ''}`}
            onClick={() => handleNavClick('create')}
          >
            <FileText size={18} />
            <span>Create Invoice</span>
          </button>

          <button
            type="button"
            className={`nav-link ${currentTab === 'history' ? 'active' : ''}`}
            onClick={() => handleNavClick('history')}
          >
            <History size={18} />
            <span>Invoice History</span>
          </button>

          <button
            type="button"
            className={`nav-link ${currentTab === 'settings' ? 'active' : ''}`}
            onClick={() => handleNavClick('settings')}
          >
            <Settings size={18} />
            <span>Invoice Settings</span>
          </button>
        </nav>

        {/* Sidebar Footer with Firestore Status & Backup */}
        <div className="sidebar-footer">
          <div className="db-status-pill" style={{ background: '#ecfdf5', borderColor: '#a7f3d0' }}>
            <div className="status-dot" style={{ background: '#10b981' }} />
            <span style={{ flex: 1, color: '#065f46', fontWeight: 600 }}>Firestore Connected</span>
          </div>

          <button
            type="button"
            className="btn-sidebar-backup"
            onClick={handleOpenBackupMobile}
          >
            <Database size={15} />
            <span>Backup & Migration</span>
          </button>

          <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.4, padding: '0 4px' }}>
            Cloud project: <code style={{ fontSize: '10.5px', color: '#1e3a8a' }}>invoice-c797f</code>
          </div>
        </div>
      </aside>

      {/* Main Panel */}
      <main className="app-main">
        {/* Top Header Bar */}
        <header className="app-topbar">
          <div className="topbar-left-group">
            {/* Hamburger button for mobile screens */}
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <div className="topbar-title-group">
              <h2>{settings?.companyName || 'Manshi Group Of Services'}</h2>
              <p>Official Invoice Management System</p>
            </div>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onOpenBackup}
              style={{ fontSize: '12.5px', padding: '6px 14px' }}
            >
              <Database size={14} color="#2563eb" />
              <span>Backup Data</span>
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="page-content-area">
          {children}
        </div>
      </main>
    </div>
  );
};
