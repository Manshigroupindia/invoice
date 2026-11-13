export interface ClientRecord {
  id: string;
  companyName: string;
  address: string;
  mobile?: string;
  gstin?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanySettings {
  id?: number | string;
  companyName: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  gstin: string;
  phone: string;
  email: string;
  website: string;
  logoUrl?: string;
  logoDataUrl?: string; // fallback / legacy field
  paymentTerms: string;
  bankName: string;
  accountNo: string;
  accountHolderName: string;
  ifscCode: string;
  branch: string;
  qrScannerUrl?: string;
  qrScannerDataUrl?: string; // fallback / legacy field
  invoicePrefix: string; // e.g. "MGS" (fallback / legacy field)
  nextSequence: number; // e.g. 22 (fallback / legacy field)
  taxInvoicePrefix?: string; // Prefix for Tax Invoices (default: 'MGS')
  taxNextSequence?: number; // Next sequence for Tax Invoices
  normalInvoicePrefix?: string; // Prefix for Normal Invoices (default: 'MGS')
  normalNextSequence?: number; // Next sequence for Normal Invoices
  updatedAt?: string;
  googleDriveClientId?: string; // Optional client-side OAuth Client ID override
  appPin?: string; // 4-digit website PIN lock (default: '1234')
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  hsnSac: string;
  amount: number | string;
}

export type InvoiceStatus = 'draft' | 'issued';

export type InvoiceType = 'regular' | 'tax';
export type TaxMode = 'cgst_sgst' | 'igst';

export type DriveBackupStatus = 'backed_up' | 'pending' | 'failed' | 'not_connected';

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  date: string; // YYYY-MM-DD
  clientId?: string; // Permanent link to ClientRecord in Firestore
  isCustomerOverridden?: boolean; // True if customer details were manually customized on this invoice
  customerName: string;
  customerAddress: string;
  customerMobile?: string;
  customerGstin?: string;
  items: InvoiceLineItem[];
  subtotal: number;
  status: InvoiceStatus;
  companySnapshot: CompanySettings;
  createdAt: string;
  updatedAt: string;
  driveBackupStatus?: DriveBackupStatus;
  driveFileId?: string;
  driveBackupAt?: string;
  driveBackupError?: string;
  // Tax invoice fields
  invoiceType?: InvoiceType;
  taxMode?: TaxMode;
  cgstRate?: number;
  sgstRate?: number;
  igstRate?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  cgstHsnSac?: string;
  sgstHsnSac?: string;
  igstHsnSac?: string;
  totalTax?: number;
  grandTotal?: number;
}

export interface SequenceRecord {
  financialYear: string; // e.g. "2026-27"
  nextSequence: number; // e.g. 79
  usedNumbers: string[]; // List of numbers ever generated/reserved
  updatedAt?: string;
}

export interface NumberingMetadata {
  financialYear: string;
  nextSequence: number;
  usedNumbers: string[];
  taxNextSequence?: number;
  taxUsedNumbers?: string[];
  normalNextSequence?: number;
  normalUsedNumbers?: string[];
  updatedAt?: string;
}

export interface BackupData {
  version: string;
  exportedAt: string;
  settings: CompanySettings;
  invoices: InvoiceRecord[];
  sequences: SequenceRecord[];
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  message: string;
}

export interface MigrationResult {
  success: boolean;
  message: string;
  settingsMigrated: boolean;
  invoicesMigratedCount: number;
  alreadyMigrated?: boolean;
}
