import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  type Unsubscribe,
} from 'firebase/firestore';
import { firestore } from '../lib/firebase';
import type { ClientRecord, InvoiceRecord } from '../types';
import { sanitizeForFirestore } from './firestoreService';

const CLIENTS_COLL_REF = collection(firestore, 'clients');

/**
 * Normalizes a company / customer name for accurate duplicate matching:
 * - Lowercases and trims
 * - Removes common prefixes like "m/s.", "m/s ", "messrs"
 * - Removes non-alphanumeric punctuation and collapses whitespace
 */
export function normalizeClientName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/^m\/s\.?\s+/i, '')
    .replace(/^messrs\.?\s+/i, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes mobile number to digits only
 */
export function normalizeMobile(mobile?: string): string {
  if (!mobile) return '';
  const digits = mobile.replace(/\D/g, '');
  // Return last 10 digits for Indian phone number matching
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Normalizes GSTIN (uppercase, whitespace-stripped)
 */
export function normalizeGstin(gstin?: string): string {
  if (!gstin) return '';
  return gstin.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Checks whether a candidate client matches an existing client record
 * by normalized name, GSTIN, or mobile number.
 */
export function isDuplicateClient(
  existing: ClientRecord,
  candidate: { companyName: string; mobile?: string; gstin?: string; id?: string }
): boolean {
  if (candidate.id && existing.id === candidate.id) {
    return false;
  }

  const existingGstin = normalizeGstin(existing.gstin);
  const candidateGstin = normalizeGstin(candidate.gstin);
  if (existingGstin && candidateGstin && existingGstin === candidateGstin) {
    return true;
  }

  const existingNormName = normalizeClientName(existing.companyName);
  const candidateNormName = normalizeClientName(candidate.companyName);

  if (existingNormName && candidateNormName && existingNormName === candidateNormName) {
    return true;
  }

  const existingMobile = normalizeMobile(existing.mobile);
  const candidateMobile = normalizeMobile(candidate.mobile);
  if (existingMobile && candidateMobile && existingMobile.length === 10 && existingMobile === candidateMobile) {
    // If mobile matches and names share substantial similarity
    if (
      existingNormName.includes(candidateNormName) ||
      candidateNormName.includes(existingNormName)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Real-time subscription to clients collection
 */
export function subscribeClients(
  callback: (clients: ClientRecord[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(CLIENTS_COLL_REF, orderBy('companyName', 'asc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: ClientRecord[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as ClientRecord);
      });
      callback(list);
    },
    (err) => {
      console.error('Firestore clients subscription error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Get all clients from Firestore
 */
export async function getAllClientsFirestore(): Promise<ClientRecord[]> {
  try {
    const q = query(CLIENTS_COLL_REF, orderBy('companyName', 'asc'));
    const snap = await getDocs(q);
    const list: ClientRecord[] = [];
    snap.forEach((d) => {
      list.push({ id: d.id, ...d.data() } as ClientRecord);
    });
    return list;
  } catch (err) {
    console.error('Failed to get clients from Firestore:', err);
    return [];
  }
}

/**
 * Save (create or update) a client in Firestore
 */
export async function saveClientFirestore(
  client: Partial<ClientRecord> & { companyName: string; address: string }
): Promise<ClientRecord> {
  const now = new Date().toISOString();
  const id = client.id || `client-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  const clientRef = doc(firestore, 'clients', id);

  const existingSnap = await getDoc(clientRef);
  const isExisting = existingSnap.exists();

  const prepared: ClientRecord = {
    id,
    companyName: (client.companyName || '').trim(),
    address: (client.address || '').trim(),
    mobile: client.mobile ? client.mobile.trim() : '',
    gstin: client.gstin ? client.gstin.trim().toUpperCase() : '',
    createdAt: isExisting ? (existingSnap.data() as ClientRecord).createdAt || now : client.createdAt || now,
    updatedAt: now,
  };

  await setDoc(clientRef, sanitizeForFirestore(prepared), { merge: true });
  return prepared;
}

/**
 * Delete a client by ID
 */
export async function deleteClientFirestore(id: string): Promise<void> {
  await deleteDoc(doc(firestore, 'clients', id));
}

/**
 * Automatically extracts unique clients from all invoices and synchronizes them to Firestore.
 * Preserves existing invoices and prevents duplicate records.
 */
export async function syncClientsFromInvoices(
  invoices: InvoiceRecord[]
): Promise<{ added: number; updated: number; total: number }> {
  const existingClients = await getAllClientsFirestore();
  let added = 0;
  let updated = 0;

  for (const inv of invoices) {
    const rawName = (inv.customerName || '').trim();
    const rawAddress = (inv.customerAddress || '').trim();
    if (!rawName || !rawAddress) continue;

    const rawMobile = inv.customerMobile ? inv.customerMobile.trim() : '';
    const rawGstin = inv.customerGstin ? inv.customerGstin.trim().toUpperCase() : '';

    // Find if already exists
    const match = existingClients.find((c) =>
      isDuplicateClient(c, {
        companyName: rawName,
        mobile: rawMobile,
        gstin: rawGstin,
      })
    );

    if (match) {
      // Check if we can enrich missing fields
      let needsUpdate = false;
      const enriched: ClientRecord = { ...match };

      if (!match.mobile && rawMobile) {
        enriched.mobile = rawMobile;
        needsUpdate = true;
      }
      if (!match.gstin && rawGstin) {
        enriched.gstin = rawGstin;
        needsUpdate = true;
      }
      if (match.address.length < rawAddress.length && rawAddress.includes(match.address)) {
        enriched.address = rawAddress;
        needsUpdate = true;
      }

      if (needsUpdate) {
        enriched.updatedAt = new Date().toISOString();
        await saveClientFirestore(enriched);
        const idx = existingClients.findIndex((c) => c.id === match.id);
        if (idx !== -1) existingClients[idx] = enriched;
        updated++;
      }
    } else {
      // Create new client record
      const newClient = await saveClientFirestore({
        companyName: rawName,
        address: rawAddress,
        mobile: rawMobile,
        gstin: rawGstin,
      });
      existingClients.push(newClient);
      added++;
    }
  }

  return { added, updated, total: existingClients.length };
}

/**
 * Automatically ensures a client exists in Firestore when an invoice is created or edited.
 */
export async function autoUpsertClientFromInvoice(invoice: InvoiceRecord): Promise<ClientRecord | null> {
  const rawName = (invoice.customerName || '').trim();
  const rawAddress = (invoice.customerAddress || '').trim();
  if (!rawName) return null;

  const rawMobile = invoice.customerMobile ? invoice.customerMobile.trim() : '';
  const rawGstin = invoice.customerGstin ? invoice.customerGstin.trim().toUpperCase() : '';

  try {
    const existing = await getAllClientsFirestore();
    const match = existing.find((c) =>
      isDuplicateClient(c, {
        companyName: rawName,
        mobile: rawMobile,
        gstin: rawGstin,
      })
    );

    if (match) {
      let needsUpdate = false;
      const updatedClient: ClientRecord = { ...match };
      if (!match.mobile && rawMobile) {
        updatedClient.mobile = rawMobile;
        needsUpdate = true;
      }
      if (!match.gstin && rawGstin) {
        updatedClient.gstin = rawGstin;
        needsUpdate = true;
      }
      if (!match.address && rawAddress) {
        updatedClient.address = rawAddress;
        needsUpdate = true;
      }
      if (needsUpdate) {
        return await saveClientFirestore(updatedClient);
      }
      return match;
    } else {
      return await saveClientFirestore({
        companyName: rawName,
        address: rawAddress,
        mobile: rawMobile,
        gstin: rawGstin,
      });
    }
  } catch (err) {
    console.warn('Could not auto-upsert client from invoice:', err);
    return null;
  }
}

