import Dexie, { type Table } from 'dexie';
import type { CompanySettings, InvoiceRecord, SequenceRecord, BackupData } from '../types';
import { getIndianFinancialYear, formatInvoiceNumber } from '../utils/financialYear';

export const DEFAULT_SETTINGS: CompanySettings = {
  companyName: 'Manshi Group Of Services',
  addressLine1: 'Office No. 2B, 2nd Floor, Bhawani Market,',
  addressLine2: 'Sector-27, Noida, Gautam Buddha Nagar,',
  addressLine3: 'Uttar Pradesh-201301',
  gstin: '09PQRPK4105E1ZG',
  phone: '8076187274',
  email: 'Info@Manshigroup.in',
  website: 'www.Manshigroup.in',
  paymentTerms: '1. 50% Advance & Balance 50% after completion of work.',
  bankName: 'Slice Small Finance Bank',
  accountNo: '033311501053615',
  accountHolderName: 'Manshi Group Of Services',
  ifscCode: 'NESF0000333',
  branch: 'Koramangala, Bengaluru',
  logoDataUrl: '/assets/logo.png',
  qrScannerDataUrl: '/assets/qr_scanner.jpg',
  invoicePrefix: 'MGS',
  nextSequence: 79,
};

class InvoiceDatabase extends Dexie {
  settings!: Table<CompanySettings, number | string>;
  invoices!: Table<InvoiceRecord, string>;
  sequences!: Table<SequenceRecord, string>;

  constructor() {
    super('ManshiInvoiceDB');
    this.version(1).stores({
      settings: '++id',
      invoices: 'id, invoiceNumber, date, customerName, status, createdAt',
      sequences: 'financialYear',
    });
  }
}

export const db = new InvoiceDatabase();

/**
 * Initialize database with default settings and sequence if first run
 */
export async function initializeDatabase(): Promise<CompanySettings> {
  const existingSettings = await db.settings.toCollection().first();
  if (!existingSettings) {
    const defaultData = { ...DEFAULT_SETTINGS };
    await db.settings.add(defaultData);
    
    // Initialize 2026-27 sequence starting at 79, with 78 registered as previous
    await db.sequences.put({
      financialYear: '2026-27',
      nextSequence: 79,
      usedNumbers: ['MGS/2026-27/078'],
    });
    
    return defaultData;
  }
  return existingSettings;
}

/**
 * Fetch company settings
 */
export async function getCompanySettings(): Promise<CompanySettings> {
  const settings = await db.settings.toCollection().first();
  if (!settings) {
    return initializeDatabase();
  }
  return settings;
}

/**
 * Update company settings
 */
export async function updateCompanySettings(updated: Partial<CompanySettings>): Promise<CompanySettings> {
  const current = await getCompanySettings();
  const merged: CompanySettings = {
    ...current,
    ...updated,
    updatedAt: new Date().toISOString(),
  };

  if (current.id) {
    await db.settings.update(current.id, merged);
  } else {
    await db.settings.add(merged);
  }

  // If nextSequence was updated manually in settings, update the sequence tracker for current FY
  if (updated.nextSequence !== undefined) {
    const currentFY = getIndianFinancialYear(new Date());
    const seqRecord = await db.sequences.get(currentFY);
    if (seqRecord) {
      await db.sequences.update(currentFY, {
        nextSequence: updated.nextSequence,
      });
    } else {
      await db.sequences.put({
        financialYear: currentFY,
        nextSequence: updated.nextSequence,
        usedNumbers: [],
      });
    }
  }

  return merged;
}

/**
 * Reset settings to original defaults
 */
export async function resetCompanySettings(): Promise<CompanySettings> {
  const current = await db.settings.toCollection().first();
  const resetData: CompanySettings = {
    ...DEFAULT_SETTINGS,
    updatedAt: new Date().toISOString(),
  };
  if (current?.id) {
    await db.settings.update(current.id, resetData);
  } else {
    await db.settings.add(resetData);
  }
  return resetData;
}

/**
 * Get next available invoice number for a given date, without committing it yet
 */
export async function previewNextInvoiceNumber(dateStr: string): Promise<string> {
  const settings = await getCompanySettings();
  const prefix = settings.invoicePrefix || 'MGS';
  const fy = getIndianFinancialYear(dateStr);

  const seqRecord = await db.sequences.get(fy);
  let nextSeq = seqRecord ? seqRecord.nextSequence : (fy === '2026-27' ? 79 : 1);

  // Check if this number was already used
  const used = seqRecord?.usedNumbers || [];
  let candidate = formatInvoiceNumber(prefix, fy, nextSeq);
  while (used.includes(candidate)) {
    nextSeq++;
    candidate = formatInvoiceNumber(prefix, fy, nextSeq);
  }

  return candidate;
}

/**
 * Reserve and commit the invoice number when permanently saving an invoice
 */
export async function reserveAndCommitInvoiceNumber(dateStr: string, manualInvoiceNo?: string): Promise<string> {
  const settings = await getCompanySettings();
  const prefix = settings.invoicePrefix || 'MGS';
  const fy = getIndianFinancialYear(dateStr);

  const seqRecord = await db.sequences.get(fy);
  let nextSeq = seqRecord ? seqRecord.nextSequence : (fy === '2026-27' ? 79 : 1);
  const used = new Set(seqRecord?.usedNumbers || []);

  let finalNumber = manualInvoiceNo?.trim();
  if (!finalNumber) {
    let candidate = formatInvoiceNumber(prefix, fy, nextSeq);
    while (used.has(candidate)) {
      nextSeq++;
      candidate = formatInvoiceNumber(prefix, fy, nextSeq);
    }
    finalNumber = candidate;
    nextSeq++;
  } else {
    // If manual number provided, parse sequence if applicable to keep sequence monotonic
    used.add(finalNumber);
    const parsed = finalNumber.split('/');
    if (parsed.length === 3 && parsed[1] === fy) {
      const num = parseInt(parsed[2], 10);
      if (!isNaN(num) && num >= nextSeq) {
        nextSeq = num + 1;
      }
    }
  }

  used.add(finalNumber);

  await db.sequences.put({
    financialYear: fy,
    nextSequence: nextSeq,
    usedNumbers: Array.from(used),
  });

  // Also update nextSequence in settings so it reflects current sequence state
  if (settings.id) {
    await db.settings.update(settings.id, { nextSequence: nextSeq });
  }

  return finalNumber;
}

/**
 * Save an invoice (create new or update existing)
 */
export async function saveInvoice(invoice: InvoiceRecord): Promise<InvoiceRecord> {
  const existing = await db.invoices.get(invoice.id);
  const now = new Date().toISOString();

  if (!existing) {
    // New invoice: ensure its invoiceNumber is in usedNumbers
    const fy = getIndianFinancialYear(invoice.date);
    const seqRecord = await db.sequences.get(fy);
    const used = new Set(seqRecord?.usedNumbers || []);
    used.add(invoice.invoiceNumber);
    
    await db.sequences.put({
      financialYear: fy,
      nextSequence: Math.max(seqRecord?.nextSequence || 1, (seqRecord?.nextSequence || 1)),
      usedNumbers: Array.from(used),
    });

    const toInsert = {
      ...invoice,
      createdAt: now,
      updatedAt: now,
    };
    await db.invoices.add(toInsert);
    return toInsert;
  } else {
    const toUpdate = {
      ...invoice,
      updatedAt: now,
    };
    await db.invoices.put(toUpdate);
    return toUpdate;
  }
}

/**
 * Delete an invoice permanently from history.
 * CRITICAL RULE: Never release or reuse its invoice number!
 */
export async function deleteInvoice(id: string): Promise<void> {
  const invoice = await db.invoices.get(id);
  if (invoice) {
    // Make sure the number stays in usedNumbers
    const fy = getIndianFinancialYear(invoice.date);
    const seqRecord = await db.sequences.get(fy);
    if (seqRecord) {
      const used = new Set(seqRecord.usedNumbers || []);
      used.add(invoice.invoiceNumber);
      await db.sequences.put({
        financialYear: fy,
        nextSequence: seqRecord.nextSequence,
        usedNumbers: Array.from(used),
      });
    }
    await db.invoices.delete(id);
  }
}

/**
 * Get all invoices sorted by date descending
 */
export async function getAllInvoices(): Promise<InvoiceRecord[]> {
  const invoices = await db.invoices.toArray();
  return invoices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.invoiceNumber.localeCompare(a.invoiceNumber));
}

/**
 * Get single invoice by ID
 */
export async function getInvoiceById(id: string): Promise<InvoiceRecord | undefined> {
  return db.invoices.get(id);
}

/**
 * Export complete backup
 */
export async function exportDatabaseBackup(): Promise<BackupData> {
  const settings = await getCompanySettings();
  const invoices = await db.invoices.toArray();
  const sequences = await db.sequences.toArray();

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    settings,
    invoices,
    sequences,
  };
}

/**
 * Import backup data safely
 */
export async function importDatabaseBackup(backup: BackupData): Promise<{ success: boolean; message: string }> {
  if (!backup || !backup.settings || !Array.isArray(backup.invoices)) {
    throw new Error('Invalid backup file format.');
  }

  await db.transaction('rw', db.settings, db.invoices, db.sequences, async () => {
    // Restore settings
    await db.settings.clear();
    const settingsToSave = { ...backup.settings };
    delete settingsToSave.id;
    await db.settings.add(settingsToSave);

    // Restore invoices
    await db.invoices.clear();
    for (const inv of backup.invoices) {
      await db.invoices.put(inv);
    }

    // Restore sequences
    if (Array.isArray(backup.sequences)) {
      await db.sequences.clear();
      for (const seq of backup.sequences) {
        await db.sequences.put(seq);
      }
    }
  });

  return {
    success: true,
    message: `Restored ${backup.invoices.length} invoices and company settings successfully.`,
  };
}
