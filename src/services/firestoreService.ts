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
import type { CompanySettings, InvoiceRecord, NumberingMetadata } from '../types';
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
  logoUrl: '/assets/logo.png',
  logoDataUrl: '/assets/logo.png',
  qrScannerUrl: '/assets/qr_scanner.jpg',
  qrScannerDataUrl: '/assets/qr_scanner.jpg',
  invoicePrefix: 'MGS',
  nextSequence: 79,
};

// Document references
const SETTINGS_DOC_REF = doc(firestore, 'companySettings', 'main');
const NUMBERING_DOC_REF = doc(firestore, 'invoiceMetadata', 'numbering');
const INVOICES_COLL_REF = collection(firestore, 'invoices');

/**
 * 1. COMPANY SETTINGS
 */

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
    return {
      ...DEFAULT_SETTINGS,
      ...data,
      logoUrl: data.logoUrl || data.logoDataUrl || '/assets/logo.png',
      qrScannerUrl: data.qrScannerUrl || data.qrScannerDataUrl || '/assets/qr_scanner.jpg',
      logoDataUrl: data.logoUrl || data.logoDataUrl || '/assets/logo.png',
      qrScannerDataUrl: data.qrScannerUrl || data.qrScannerDataUrl || '/assets/qr_scanner.jpg',
    };
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
        callback({
          ...DEFAULT_SETTINGS,
          ...data,
          logoUrl: data.logoUrl || data.logoDataUrl || '/assets/logo.png',
          qrScannerUrl: data.qrScannerUrl || data.qrScannerDataUrl || '/assets/qr_scanner.jpg',
          logoDataUrl: data.logoUrl || data.logoDataUrl || '/assets/logo.png',
          qrScannerDataUrl: data.qrScannerUrl || data.qrScannerDataUrl || '/assets/qr_scanner.jpg',
        });
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
  const merged: CompanySettings = {
    ...current,
    ...updated,
    logoUrl: updated.logoUrl || updated.logoDataUrl || current.logoUrl || '/assets/logo.png',
    qrScannerUrl: updated.qrScannerUrl || updated.qrScannerDataUrl || current.qrScannerUrl || '/assets/qr_scanner.jpg',
    logoDataUrl: updated.logoUrl || updated.logoDataUrl || current.logoDataUrl || '/assets/logo.png',
    qrScannerDataUrl: updated.qrScannerUrl || updated.qrScannerDataUrl || current.qrScannerDataUrl || '/assets/qr_scanner.jpg',
    updatedAt: new Date().toISOString(),
  };

  await setDoc(SETTINGS_DOC_REF, sanitizeForFirestore(merged));

  // If nextSequence was explicitly changed, update invoiceMetadata/numbering as well
  if (updated.nextSequence !== undefined) {
    try {
      const snap = await getDoc(NUMBERING_DOC_REF);
      const curFY = getIndianFinancialYear(new Date());
      if (snap.exists()) {
        await updateDoc(NUMBERING_DOC_REF, sanitizeForFirestore({
          nextSequence: updated.nextSequence,
          updatedAt: new Date().toISOString(),
        }));
      } else {
        await setDoc(NUMBERING_DOC_REF, sanitizeForFirestore({
          financialYear: curFY,
          nextSequence: updated.nextSequence,
          usedNumbers: ['MGS/2026-27/078'],
          updatedAt: new Date().toISOString(),
        }));
      }
    } catch (e) {
      console.warn('Could not update numbering metadata sequence:', e);
    }
  }

  return merged;
}

/**
 * 2. NUMBERING SEQUENCE & RESERVATION (TRANSACTIONAL)
 */

export async function previewNextInvoiceNumberFirestore(dateStr: string): Promise<string> {
  const settings = await getCompanySettingsFirestore();
  const prefix = settings.invoicePrefix || 'MGS';
  const fy = getIndianFinancialYear(dateStr);

  try {
    const snap = await getDoc(NUMBERING_DOC_REF);
    let nextSeq = fy === '2026-27' ? 79 : 1;
    let used: string[] = [];

    if (snap.exists()) {
      const data = snap.data() as NumberingMetadata;
      if (data.financialYear === fy && data.nextSequence) {
        nextSeq = data.nextSequence;
      }
      used = data.usedNumbers || [];
    }

    let candidate = formatInvoiceNumber(prefix, fy, nextSeq);
    while (used.includes(candidate)) {
      nextSeq++;
      candidate = formatInvoiceNumber(prefix, fy, nextSeq);
    }

    return candidate;
  } catch (err) {
    console.warn('Error reading numbering metadata from Firestore, falling back to local calculation:', err);
    return formatInvoiceNumber(prefix, fy, 79);
  }
}

/**
 * Safely reserve an invoice number using a Firestore Transaction to prevent race conditions
 */
export async function reserveAndCommitInvoiceNumberFirestore(
  dateStr: string,
  manualInvoiceNo?: string
): Promise<string> {
  const settings = await getCompanySettingsFirestore();
  const prefix = settings.invoicePrefix || 'MGS';
  const fy = getIndianFinancialYear(dateStr);

  return runTransaction(firestore, async (transaction) => {
    const snap = await transaction.get(NUMBERING_DOC_REF);
    let nextSeq = fy === '2026-27' ? 79 : 1;
    let used: string[] = ['MGS/2026-27/078'];

    if (snap.exists()) {
      const data = snap.data() as NumberingMetadata;
      if (data.financialYear === fy && typeof data.nextSequence === 'number') {
        nextSeq = data.nextSequence;
      }
      used = Array.isArray(data.usedNumbers) ? [...data.usedNumbers] : used;
    }

    let finalNumber = manualInvoiceNo?.trim();
    if (!finalNumber) {
      let candidate = formatInvoiceNumber(prefix, fy, nextSeq);
      while (used.includes(candidate)) {
        nextSeq++;
        candidate = formatInvoiceNumber(prefix, fy, nextSeq);
      }
      finalNumber = candidate;
      nextSeq++;
    } else {
      const parsed = finalNumber.split('/');
      if (parsed.length === 3 && parsed[1] === fy) {
        const num = parseInt(parsed[2], 10);
        if (!isNaN(num) && num >= nextSeq) {
          nextSeq = num + 1;
        }
      }
    }

    if (!used.includes(finalNumber)) {
      used.push(finalNumber);
    }

    transaction.set(NUMBERING_DOC_REF, sanitizeForFirestore({
      financialYear: fy,
      nextSequence: nextSeq,
      usedNumbers: used,
      updatedAt: new Date().toISOString(),
    }));

    transaction.update(SETTINGS_DOC_REF, sanitizeForFirestore({
      nextSequence: nextSeq,
      updatedAt: new Date().toISOString(),
    }));

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

  if (!snap.exists()) {
    // New invoice: ensure invoiceNumber is in usedNumbers
    try {
      const numSnap = await getDoc(NUMBERING_DOC_REF);
      const fy = getIndianFinancialYear(sanitizedInvoice.date);
      if (numSnap.exists()) {
        const data = numSnap.data() as NumberingMetadata;
        const used = new Set(data.usedNumbers || []);
        used.add(sanitizedInvoice.invoiceNumber);
        await updateDoc(NUMBERING_DOC_REF, sanitizeForFirestore({
          usedNumbers: Array.from(used),
          updatedAt: now,
        }));
      } else {
        await setDoc(NUMBERING_DOC_REF, sanitizeForFirestore({
          financialYear: fy,
          nextSequence: 80,
          usedNumbers: ['MGS/2026-27/078', sanitizedInvoice.invoiceNumber],
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
        await updateDoc(NUMBERING_DOC_REF, sanitizeForFirestore({
          usedNumbers: Array.from(used),
          updatedAt: new Date().toISOString(),
        }));
      }
    } catch (e) {
      console.warn('Failed to lock deleted invoice number in numbering metadata:', e);
    }

    await deleteDoc(invRef);
  }
}
