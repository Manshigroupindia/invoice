import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
  type Unsubscribe,
} from 'firebase/firestore';
import { firestore } from '../lib/firebase';
import type { CompanySettings, InvoiceRecord, NumberingMetadata, InvoiceType } from '../types';
import {
  getIndianFinancialYear,
  formatInvoiceNumber,
  extractInvoiceSequenceNumber,
  parseInvoiceNumber,
} from '../utils/financialYear';
import { autoUpsertClientFromInvoice } from './clientService';

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
  logoUrl: '/assets/logo.png',
  logoDataUrl: '/assets/logo.png',
  qrScannerUrl: '/assets/qr_scanner.jpg',
  qrScannerDataUrl: '/assets/qr_scanner.jpg',
  invoicePrefix: 'MGS',
  nextSequence: 22,
  taxInvoicePrefix: 'MGS',
  taxNextSequence: 22,
  normalInvoicePrefix: 'MGS',
  normalNextSequence: 1,
  appPin: '1234',
};

// Document references
const SETTINGS_DOC_REF = doc(firestore, 'companySettings', 'main');
const NUMBERING_DOC_REF = doc(firestore, 'invoiceMetadata', 'numbering');
const INVOICES_COLL_REF = collection(firestore, 'invoices');

/**
 * 1. COMPANY SETTINGS
 */

export function normalizeCompanySettings(data: Partial<CompanySettings>): CompanySettings {
  const taxPrefix = data.taxInvoicePrefix || data.invoicePrefix || 'MGS';
  const taxSeq = data.taxNextSequence !== undefined
    ? data.taxNextSequence
    : (data.nextSequence !== undefined ? data.nextSequence : 22);
  const normalPrefix = data.normalInvoicePrefix || 'MGS';
  const normalSeq = data.normalNextSequence !== undefined ? data.normalNextSequence : 1;

  return {
    ...DEFAULT_SETTINGS,
    ...data,
    taxInvoicePrefix: taxPrefix,
    taxNextSequence: taxSeq,
    normalInvoicePrefix: normalPrefix,
    normalNextSequence: normalSeq,
    invoicePrefix: taxPrefix, // keep legacy field in sync with tax
    nextSequence: taxSeq,     // keep legacy field in sync with tax
    logoUrl: data.logoUrl || data.logoDataUrl || '/assets/logo.png',
    qrScannerUrl: data.qrScannerUrl || data.qrScannerDataUrl || '/assets/qr_scanner.jpg',
    logoDataUrl: data.logoUrl || data.logoDataUrl || '/assets/logo.png',
    qrScannerDataUrl: data.qrScannerUrl || data.qrScannerDataUrl || '/assets/qr_scanner.jpg',
  };
}

export async function getCompanySettingsFirestore(): Promise<CompanySettings> {
  try {
    const snap = await getDoc(SETTINGS_DOC_REF);
    if (!snap.exists()) {
      const defaultData: CompanySettings = {
        ...DEFAULT_SETTINGS,
        updatedAt: new Date().toISOString(),
      };
      await setDoc(SETTINGS_DOC_REF, defaultData);
      return defaultData;
    }
    const data = snap.data() as CompanySettings;
    return normalizeCompanySettings(data);
  } catch (err) {
    console.warn('Error reading settings from Firestore, returning defaults:', err);
    return DEFAULT_SETTINGS;
  }
}

export function subscribeCompanySettings(
  callback: (settings: CompanySettings) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    SETTINGS_DOC_REF,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as CompanySettings;
        callback(normalizeCompanySettings(data));
      } else {
        callback(DEFAULT_SETTINGS);
      }
    },
    (err) => {
      console.error('Firestore settings subscription error:', err);
      if (onError) onError(err);
    }
  );
}

export async function saveCompanySettingsFirestore(
  updated: Partial<CompanySettings>
): Promise<CompanySettings> {
  const current = await getCompanySettingsFirestore();
  const taxPrefix = updated.taxInvoicePrefix || updated.invoicePrefix || current.taxInvoicePrefix || 'MGS';
  const taxSeq = updated.taxNextSequence !== undefined
    ? updated.taxNextSequence
    : (updated.nextSequence !== undefined ? updated.nextSequence : current.taxNextSequence || 22);
  const normalPrefix = updated.normalInvoicePrefix || current.normalInvoicePrefix || 'MGS';
  const normalSeq = updated.normalNextSequence !== undefined ? updated.normalNextSequence : current.normalNextSequence || 1;

  const merged: CompanySettings = {
    ...current,
    ...updated,
    taxInvoicePrefix: taxPrefix,
    taxNextSequence: taxSeq,
    normalInvoicePrefix: normalPrefix,
    normalNextSequence: normalSeq,
    invoicePrefix: taxPrefix, // keep legacy field in sync with tax
    nextSequence: taxSeq,     // keep legacy field in sync with tax
    logoUrl: updated.logoUrl || updated.logoDataUrl || current.logoUrl || '/assets/logo.png',
    qrScannerUrl: updated.qrScannerUrl || updated.qrScannerDataUrl || current.qrScannerUrl || '/assets/qr_scanner.jpg',
    logoDataUrl: updated.logoUrl || updated.logoDataUrl || current.logoDataUrl || '/assets/logo.png',
    qrScannerDataUrl: updated.qrScannerUrl || updated.qrScannerDataUrl || current.qrScannerDataUrl || '/assets/qr_scanner.jpg',
    updatedAt: new Date().toISOString(),
  };

  await setDoc(SETTINGS_DOC_REF, sanitizeForFirestore(merged));

  // Sync sequences to invoiceMetadata/numbering
  try {
    const snap = await getDoc(NUMBERING_DOC_REF);
    const curFY = getIndianFinancialYear(new Date());
    if (snap.exists()) {
      const updateData: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
        taxNextSequence: taxSeq,
        nextSequence: taxSeq, // satisfies isValidNumbering rule
        normalNextSequence: normalSeq,
      };
      await updateDoc(NUMBERING_DOC_REF, sanitizeForFirestore(updateData));
    } else {
      await setDoc(NUMBERING_DOC_REF, sanitizeForFirestore({
        financialYear: curFY,
        nextSequence: taxSeq,
        taxNextSequence: taxSeq,
        normalNextSequence: normalSeq,
        usedNumbers: [],
        taxUsedNumbers: [],
        normalUsedNumbers: [],
        updatedAt: new Date().toISOString(),
      }));
    }
  } catch (e) {
    console.warn('Could not update numbering metadata sequence:', e);
  }

  return merged;
}

/**
 * 2. NUMBERING SEQUENCE & RESERVATION (TRANSACTIONAL)
 */

/**
 * Helper to determine whether an invoice record is Tax or Normal (Regular)
 */
export function isInvoiceOfType(inv: InvoiceRecord, type: InvoiceType): boolean {
  if (type === 'tax') {
    return (
      inv.invoiceType === 'tax' ||
      (!inv.invoiceType &&
        !!(
          (inv.totalTax && inv.totalTax > 0) ||
          (inv.cgstRate && inv.cgstRate > 0) ||
          (inv.sgstRate && inv.sgstRate > 0) ||
          (inv.igstRate && inv.igstRate > 0)
        ))
    );
  }
  // 'regular' (Normal Invoice)
  return (
    inv.invoiceType === 'regular' ||
    (!inv.invoiceType &&
      !inv.totalTax &&
      !inv.cgstRate &&
      !inv.sgstRate &&
      !inv.igstRate)
  );
}

export async function getHighestSequenceForFinancialYear(
  fy: string,
  type: InvoiceType = 'tax'
): Promise<{ maxSeq: number; padLength: number; usedNumbers: string[] }> {
  try {
    const invoicesSnap = await getDocs(INVOICES_COLL_REF);
    const used = new Set<string>();
    let maxSeq = 0;
    let maxPad = 2;

    invoicesSnap.forEach((d) => {
      const inv = d.data() as InvoiceRecord;
      if (inv.invoiceNumber && isInvoiceOfType(inv, type)) {
        const numStr = inv.invoiceNumber.trim();
        used.add(numStr);
        const invFy = numStr.includes(`/${fy}/`)
          ? fy
          : getIndianFinancialYear(inv.date || new Date().toISOString());

        if (invFy === fy) {
          const parsed = parseInvoiceNumber(numStr);
          if (parsed) {
            if (parsed.sequence > maxSeq) {
              maxSeq = parsed.sequence;
              maxPad = parsed.padLength;
            }
          } else {
            const seq = extractInvoiceSequenceNumber(numStr);
            if (seq > maxSeq) {
              maxSeq = seq;
            }
          }
        }
      }
    });

    return { maxSeq, padLength: maxPad, usedNumbers: Array.from(used) };
  } catch (err) {
    console.warn(`Error reading highest sequence for financial year (${type}):`, err);
    return { maxSeq: 0, padLength: 2, usedNumbers: [] };
  }
}

export async function checkInvoiceNumberExistsFirestore(
  invoiceNumber: string,
  excludeId?: string,
  type?: InvoiceType
): Promise<boolean> {
  if (!invoiceNumber || !invoiceNumber.trim()) return false;
  const target = invoiceNumber.trim().toLowerCase();
  try {
    const snap = await getDocs(INVOICES_COLL_REF);
    let exists = false;
    snap.forEach((d) => {
      if (!excludeId || d.id !== excludeId) {
        const inv = d.data() as InvoiceRecord;
        if (inv.invoiceNumber && inv.invoiceNumber.trim().toLowerCase() === target) {
          if (!type || isInvoiceOfType(inv, type)) {
            exists = true;
          }
        }
      }
    });
    return exists;
  } catch (err) {
    console.warn('Error checking if invoice number exists in Firestore:', err);
    return false;
  }
}

export async function previewNextInvoiceNumberFirestore(
  dateStr: string,
  type: InvoiceType = 'tax'
): Promise<string> {
  const settings = await getCompanySettingsFirestore();
  const prefix = type === 'tax'
    ? (settings.taxInvoicePrefix || settings.invoicePrefix || 'MGS')
    : (settings.normalInvoicePrefix || 'MGS');
  const configuredSeq = type === 'tax'
    ? (settings.taxNextSequence || settings.nextSequence || 22)
    : (settings.normalNextSequence || 1);
  const fy = getIndianFinancialYear(dateStr);

  try {
    const { maxSeq, padLength, usedNumbers } = await getHighestSequenceForFinancialYear(fy, type);
    let nextSeq = maxSeq > 0 ? maxSeq + 1 : configuredSeq;
    const targetPad = Math.max(2, padLength);
    let candidate = formatInvoiceNumber(prefix, fy, nextSeq, targetPad);

    while (usedNumbers.some((u) => u.toLowerCase() === candidate.toLowerCase())) {
      nextSeq++;
      candidate = formatInvoiceNumber(prefix, fy, nextSeq, targetPad);
    }

    return candidate;
  } catch (err) {
    console.warn(`Error previewing next invoice number for ${type}, falling back to 01:`, err);
    return formatInvoiceNumber(prefix, fy, 1, 2);
  }
}

/**
 * Safely reserve an invoice number using a Firestore Transaction to prevent race conditions.
 * Normal Invoices and Tax Invoices maintain completely independent numbering sequences.
 */
export async function reserveAndCommitInvoiceNumberFirestore(
  dateStr: string,
  manualInvoiceNo?: string,
  excludeId?: string,
  type: InvoiceType = 'tax'
): Promise<string> {
  const settings = await getCompanySettingsFirestore();
  const prefix = type === 'tax'
    ? (settings.taxInvoicePrefix || settings.invoicePrefix || 'MGS')
    : (settings.normalInvoicePrefix || 'MGS');
  const configuredSeq = type === 'tax'
    ? (settings.taxNextSequence || settings.nextSequence || 22)
    : (settings.normalNextSequence || 1);
  const fy = getIndianFinancialYear(dateStr);

  const { maxSeq, padLength, usedNumbers } = await getHighestSequenceForFinancialYear(fy, type);
  const targetPad = Math.max(2, padLength);

  return runTransaction(firestore, async (transaction) => {
    const snap = await transaction.get(NUMBERING_DOC_REF);
    let nextSeq = maxSeq > 0 ? maxSeq + 1 : configuredSeq;
    const used = new Set<string>(usedNumbers);

    let docTaxUsed: string[] = [];
    let docNormalUsed: string[] = [];
    let docGeneralUsed: string[] = [];
    let docTaxNext = maxSeq > 0 ? maxSeq + 1 : (settings.taxNextSequence || 22);
    let docNormalNext = settings.normalNextSequence || 1;

    if (snap.exists()) {
      const data = snap.data() as NumberingMetadata;
      docGeneralUsed = Array.isArray(data.usedNumbers) ? [...data.usedNumbers] : [];
      docTaxUsed = Array.isArray(data.taxUsedNumbers) ? [...data.taxUsedNumbers] : [...docGeneralUsed];
      docNormalUsed = Array.isArray(data.normalUsedNumbers) ? [...data.normalUsedNumbers] : [];
      if (typeof data.taxNextSequence === 'number') {
        docTaxNext = data.taxNextSequence;
      } else if (typeof data.nextSequence === 'number') {
        docTaxNext = data.nextSequence;
      }
      if (typeof data.normalNextSequence === 'number') {
        docNormalNext = data.normalNextSequence;
      }

      if (type === 'tax') {
        docTaxUsed.forEach((n) => n && n.trim() && used.add(n.trim()));
        if (data.financialYear === fy && typeof docTaxNext === 'number') {
          if (docTaxNext >= nextSeq && docTaxNext <= maxSeq + 5) {
            nextSeq = docTaxNext;
          }
        }
      } else {
        docNormalUsed.forEach((n) => n && n.trim() && used.add(n.trim()));
        if (data.financialYear === fy && typeof docNormalNext === 'number') {
          if (docNormalNext >= nextSeq && docNormalNext <= maxSeq + 5) {
            nextSeq = docNormalNext;
          }
        }
      }
    }

    let finalNumber = manualInvoiceNo ? manualInvoiceNo.trim() : '';
    if (!finalNumber) {
      let candidate = formatInvoiceNumber(prefix, fy, nextSeq, targetPad);
      while (Array.from(used).some((u) => u.toLowerCase() === candidate.toLowerCase())) {
        nextSeq++;
        candidate = formatInvoiceNumber(prefix, fy, nextSeq, targetPad);
      }
      finalNumber = candidate;
      nextSeq++;
    } else {
      const isUsed = Array.from(used).some((u) => u.toLowerCase() === finalNumber.toLowerCase());
      if (isUsed && !excludeId) {
        throw new Error(`This invoice number already exists for ${type === 'tax' ? 'Tax' : 'Normal'} Invoices.`);
      }

      const seq = extractInvoiceSequenceNumber(finalNumber);
      if (seq >= nextSeq) {
        nextSeq = seq + 1;
      }
    }

    used.add(finalNumber);

    if (type === 'tax') {
      docTaxNext = nextSeq;
      if (!docTaxUsed.includes(finalNumber)) docTaxUsed.push(finalNumber);
      if (!docGeneralUsed.includes(finalNumber)) docGeneralUsed.push(finalNumber);
    } else {
      docNormalNext = nextSeq;
      if (!docNormalUsed.includes(finalNumber)) docNormalUsed.push(finalNumber);
    }

    // Update numbering document in Firestore (always maintains nextSequence & usedNumbers for rules compliance)
    transaction.set(NUMBERING_DOC_REF, sanitizeForFirestore({
      financialYear: fy,
      nextSequence: docTaxNext,
      usedNumbers: docGeneralUsed,
      taxNextSequence: docTaxNext,
      taxUsedNumbers: docTaxUsed,
      normalNextSequence: docNormalNext,
      normalUsedNumbers: docNormalUsed,
      updatedAt: new Date().toISOString(),
    }));

    // Update companySettings/main in Firestore
    const settingsUpdate: Partial<CompanySettings> = {
      updatedAt: new Date().toISOString(),
    };
    if (type === 'tax') {
      settingsUpdate.taxNextSequence = nextSeq;
      settingsUpdate.nextSequence = nextSeq;
    } else {
      settingsUpdate.normalNextSequence = nextSeq;
    }
    transaction.update(SETTINGS_DOC_REF, sanitizeForFirestore(settingsUpdate));

    return finalNumber;
  });
}

/**
 * Recursively strips keys with `undefined` values so Firestore setDoc / updateDoc
 * never throws "Unsupported field value: undefined".
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object') {
    if (data instanceof Date) {
      return data;
    }
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        result[key] = sanitizeForFirestore(val);
      }
    }
    return result as T;
  }
  return data;
}

/**
 * Prepares an InvoiceRecord for Firestore:
 * 1. Ensures optional HSN/SAC fields (`cgstHsnSac`, `sgstHsnSac`, `igstHsnSac`) never contain `undefined`.
 *    Missing or empty values are converted to an empty string `""` or omitted.
 * 2. Ensures optional customer fields (`customerMobile`, `customerGstin`) never contain `undefined`.
 * 3. Ensures line items and company snapshots have no undefined properties.
 * 4. Strips any lingering `undefined` fields from the payload so Firestore writes never fail.
 */
export function prepareInvoiceForFirestore(invoice: InvoiceRecord): InvoiceRecord {
  const isTax = invoice.invoiceType === 'tax';

  const cleanItems = (invoice.items || []).map((it, idx) => ({
    id: it.id || `item-${Date.now()}-${idx}`,
    description: it.description !== undefined && it.description !== null ? String(it.description) : '',
    hsnSac: it.hsnSac !== undefined && it.hsnSac !== null ? String(it.hsnSac).trim() : '',
    amount: it.amount === undefined || it.amount === null ? '' : it.amount,
  }));

  const prepared: InvoiceRecord = {
    ...invoice,
    invoiceType: isTax ? 'tax' : 'regular',
    taxMode: invoice.taxMode || 'cgst_sgst',
    customerName: (invoice.customerName || '').trim(),
    customerAddress: (invoice.customerAddress || '').trim(),
    customerMobile: invoice.customerMobile !== undefined && invoice.customerMobile !== null ? String(invoice.customerMobile).trim() : '',
    customerGstin: invoice.customerGstin !== undefined && invoice.customerGstin !== null ? String(invoice.customerGstin).trim() : '',
    cgstHsnSac: invoice.cgstHsnSac !== undefined && invoice.cgstHsnSac !== null ? String(invoice.cgstHsnSac).trim() : '',
    sgstHsnSac: invoice.sgstHsnSac !== undefined && invoice.sgstHsnSac !== null ? String(invoice.sgstHsnSac).trim() : '',
    igstHsnSac: invoice.igstHsnSac !== undefined && invoice.igstHsnSac !== null ? String(invoice.igstHsnSac).trim() : '',
    items: cleanItems,
    companySnapshot: invoice.companySnapshot ? sanitizeForFirestore(invoice.companySnapshot) : invoice.companySnapshot,
  };

  return sanitizeForFirestore(prepared);
}

/**
 * 3. INVOICE CRUD
 */

export async function saveInvoiceFirestore(invoice: InvoiceRecord): Promise<InvoiceRecord> {
  const now = new Date().toISOString();
  const invRef = doc(firestore, 'invoices', invoice.id);
  const snap = await getDoc(invRef);

  const sanitizedInvoice = prepareInvoiceForFirestore(invoice);

  // Validate duplicate invoice number before saving
  const isDuplicate = await checkInvoiceNumberExistsFirestore(
    sanitizedInvoice.invoiceNumber,
    invoice.id,
    sanitizedInvoice.invoiceType
  );
  if (isDuplicate) {
    throw new Error(`This invoice number already exists for ${sanitizedInvoice.invoiceType === 'tax' ? 'Tax' : 'Normal'} Invoices.`);
  }

  // Auto-make customer available in Clients collection
  autoUpsertClientFromInvoice(sanitizedInvoice).catch((err) => {
    console.warn('Auto client sync error:', err);
  });

  if (!snap.exists()) {
    // New invoice: ensure invoiceNumber is in usedNumbers
    try {
      const numSnap = await getDoc(NUMBERING_DOC_REF);
      const fy = getIndianFinancialYear(sanitizedInvoice.date);
      if (numSnap.exists()) {
        const data = numSnap.data() as NumberingMetadata;
        const used = new Set(data.usedNumbers || []);
        used.add(sanitizedInvoice.invoiceNumber);

        const updateObj: Record<string, unknown> = {
          usedNumbers: Array.from(used),
          updatedAt: now,
        };

        if (sanitizedInvoice.invoiceType === 'tax') {
          const taxUsed = new Set(data.taxUsedNumbers || data.usedNumbers || []);
          taxUsed.add(sanitizedInvoice.invoiceNumber);
          updateObj.taxUsedNumbers = Array.from(taxUsed);
        } else {
          const normUsed = new Set(data.normalUsedNumbers || []);
          normUsed.add(sanitizedInvoice.invoiceNumber);
          updateObj.normalUsedNumbers = Array.from(normUsed);
        }

        await updateDoc(NUMBERING_DOC_REF, sanitizeForFirestore(updateObj));
      } else {
        await setDoc(NUMBERING_DOC_REF, sanitizeForFirestore({
          financialYear: fy,
          nextSequence: 1,
          taxNextSequence: sanitizedInvoice.invoiceType === 'tax' ? 1 : 22,
          normalNextSequence: sanitizedInvoice.invoiceType === 'regular' ? 1 : 1,
          usedNumbers: [sanitizedInvoice.invoiceNumber],
          taxUsedNumbers: sanitizedInvoice.invoiceType === 'tax' ? [sanitizedInvoice.invoiceNumber] : [],
          normalUsedNumbers: sanitizedInvoice.invoiceType === 'regular' ? [sanitizedInvoice.invoiceNumber] : [],
          updatedAt: now,
        }));
      }
    } catch (e) {
      console.warn('Could not update usedNumbers list:', e);
    }

    const toInsert: InvoiceRecord = {
      ...sanitizedInvoice,
      createdAt: sanitizedInvoice.createdAt || now,
      updatedAt: now,
    };
    await setDoc(invRef, toInsert);
    return toInsert;
  } else {
    // Update existing invoice
    const toUpdate: InvoiceRecord = {
      ...sanitizedInvoice,
      updatedAt: now,
    };
    await setDoc(invRef, toUpdate, { merge: true });
    return toUpdate;
  }
}

export function subscribeInvoices(
  callback: (invoices: InvoiceRecord[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(INVOICES_COLL_REF, orderBy('date', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: InvoiceRecord[] = [];
      snapshot.forEach((d) => {
        list.push(d.data() as InvoiceRecord);
      });
      callback(list);
    },
    (err) => {
      console.error('Firestore invoices subscription error:', err);
      if (onError) onError(err);
    }
  );
}

export async function getAllInvoicesFirestore(): Promise<InvoiceRecord[]> {
  try {
    const q = query(INVOICES_COLL_REF, orderBy('date', 'desc'));
    const snap = await getDocs(q);
    const list: InvoiceRecord[] = [];
    snap.forEach((d) => {
      list.push(d.data() as InvoiceRecord);
    });
    return list;
  } catch (err) {
    console.error('Failed to get invoices from Firestore:', err);
    return [];
  }
}

export async function getInvoiceByIdFirestore(id: string): Promise<InvoiceRecord | undefined> {
  const snap = await getDoc(doc(firestore, 'invoices', id));
  if (!snap.exists()) return undefined;
  return snap.data() as InvoiceRecord;
}

/**
 * Permanently delete an invoice document.
 * CRITICAL RULE: NEVER remove the invoiceNumber from usedNumbers!
 */
export async function deleteInvoiceFirestore(id: string): Promise<void> {
  const invRef = doc(firestore, 'invoices', id);
  const snap = await getDoc(invRef);
  if (snap.exists()) {
    const invoice = snap.data() as InvoiceRecord;
    // Ensure invoiceNumber is preserved in usedNumbers in invoiceMetadata/numbering
    try {
      const numSnap = await getDoc(NUMBERING_DOC_REF);
      if (numSnap.exists()) {
        const data = numSnap.data() as NumberingMetadata;
        const used = new Set(data.usedNumbers || []);
        used.add(invoice.invoiceNumber);
        const updateObj: Record<string, unknown> = {
          usedNumbers: Array.from(used),
          updatedAt: new Date().toISOString(),
        };
        if (invoice.invoiceType === 'tax') {
          const taxUsed = new Set(data.taxUsedNumbers || data.usedNumbers || []);
          taxUsed.add(invoice.invoiceNumber);
          updateObj.taxUsedNumbers = Array.from(taxUsed);
        } else {
          const normUsed = new Set(data.normalUsedNumbers || []);
          normUsed.add(invoice.invoiceNumber);
          updateObj.normalUsedNumbers = Array.from(normUsed);
        }
        await updateDoc(NUMBERING_DOC_REF, sanitizeForFirestore(updateObj));
      }
    } catch (e) {
      console.warn('Failed to lock deleted invoice number in numbering metadata:', e);
    }

    await deleteDoc(invRef);
  }
}

/**
 * 4. WEBSITE SECURITY & PIN AUTHENTICATION
 */

export async function getAppPinFirestore(): Promise<string> {
  try {
    const snap = await getDoc(SETTINGS_DOC_REF);
    if (snap.exists()) {
      const data = snap.data() as CompanySettings;
      if (data.appPin && typeof data.appPin === 'string' && data.appPin.trim()) {
        return data.appPin.trim();
      }
    }
    return DEFAULT_SETTINGS.appPin || '1234';
  } catch (err) {
    console.warn('Could not read appPin from Firestore, using default:', err);
    return DEFAULT_SETTINGS.appPin || '1234';
  }
}

export async function updateAppPinFirestore(newPin: string): Promise<void> {
  const trimmed = newPin.trim();
  if (!/^\d{4}$/.test(trimmed)) {
    throw new Error('PIN must be exactly 4 numeric digits.');
  }
  await saveCompanySettingsFirestore({ appPin: trimmed });
}
