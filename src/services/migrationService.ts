import { doc, getDoc, setDoc } from 'firebase/firestore';
import { firestore } from '../lib/firebase';
import { db } from '../db';
import type { CompanySettings, InvoiceRecord, MigrationResult, NumberingMetadata } from '../types';
import { getIndianFinancialYear } from '../utils/financialYear';

const MIGRATION_FLAG_KEY = 'manshi_firestore_migration_done';
const SETTINGS_DOC_REF = doc(firestore, 'companySettings', 'main');
const NUMBERING_DOC_REF = doc(firestore, 'invoiceMetadata', 'numbering');

export function isMigrationDone(): boolean {
  return !!localStorage.getItem(MIGRATION_FLAG_KEY);
}

export async function runLocalToFirestoreMigration(force = false): Promise<MigrationResult> {
  if (!force && isMigrationDone()) {
    return {
      success: true,
      message: 'Local data was already migrated to Firestore.',
      settingsMigrated: false,
      invoicesMigratedCount: 0,
      alreadyMigrated: true,
    };
  }

  try {
    // 1. Read existing local data from IndexedDB
    const localSettings = await db.settings.toCollection().first();
    const localInvoices = await db.invoices.toArray();
    const localSequences = await db.sequences.toArray();

    let settingsMigrated = false;
    let invoicesMigratedCount = 0;

    // 2. Migrate Company Settings
    const cloudSettingsSnap = await getDoc(SETTINGS_DOC_REF);
    if (!cloudSettingsSnap.exists()) {
      if (localSettings) {
        const settingsToUpload: CompanySettings = {
          ...localSettings,
          logoUrl: localSettings.logoUrl || localSettings.logoDataUrl || '/assets/logo.png',
          qrScannerUrl: localSettings.qrScannerUrl || localSettings.qrScannerDataUrl || '/assets/qr_scanner.jpg',
          updatedAt: localSettings.updatedAt || new Date().toISOString(),
        };
        await setDoc(SETTINGS_DOC_REF, settingsToUpload);
        settingsMigrated = true;
      }
    } else {
      // Cloud settings exist: do not overwrite newer cloud settings with stale local settings
      const cloudData = cloudSettingsSnap.data() as CompanySettings;
      const cloudTime = new Date(cloudData.updatedAt || 0).getTime();
      const localTime = new Date(localSettings?.updatedAt || 0).getTime();

      if (localSettings && localTime > cloudTime) {
        await setDoc(SETTINGS_DOC_REF, {
          ...cloudData,
          ...localSettings,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
        settingsMigrated = true;
      }
    }

    // 3. Migrate Invoices (idempotent, preserving IDs and numbers)
    for (const inv of localInvoices) {
      const invDocRef = doc(firestore, 'invoices', inv.id);
      const invSnap = await getDoc(invDocRef);

      if (!invSnap.exists()) {
        const cleanedInvoice: InvoiceRecord = {
          ...inv,
          companySnapshot: inv.companySnapshot || localSettings || (cloudSettingsSnap.data() as CompanySettings),
        };
        await setDoc(invDocRef, cleanedInvoice);
        invoicesMigratedCount++;
      }
    }

    // 4. Migrate and Synchronize Numbering Sequence
    const numberingSnap = await getDoc(NUMBERING_DOC_REF);
    const curFY = getIndianFinancialYear(new Date());

    const allUsedNumbers = new Set<string>(['MGS/2026-27/078']);
    let highestSeq = 79;

    // Collect from local sequences
    for (const seq of localSequences) {
      if (Array.isArray(seq.usedNumbers)) {
        seq.usedNumbers.forEach((n) => allUsedNumbers.add(n));
      }
      if (seq.nextSequence && seq.nextSequence > highestSeq) {
        highestSeq = seq.nextSequence;
      }
    }

    // Collect from local invoices
    for (const inv of localInvoices) {
      if (inv.invoiceNumber) {
        allUsedNumbers.add(inv.invoiceNumber);
      }
    }

    if (numberingSnap.exists()) {
      const cloudNumbering = numberingSnap.data() as NumberingMetadata;
      if (Array.isArray(cloudNumbering.usedNumbers)) {
        cloudNumbering.usedNumbers.forEach((n) => allUsedNumbers.add(n));
      }
      if (cloudNumbering.nextSequence && cloudNumbering.nextSequence > highestSeq) {
        highestSeq = cloudNumbering.nextSequence;
      }
    }

    await setDoc(NUMBERING_DOC_REF, {
      financialYear: curFY,
      nextSequence: highestSeq,
      usedNumbers: Array.from(allUsedNumbers),
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    // 5. Mark migration as completed locally without deleting IndexedDB records
    localStorage.setItem(MIGRATION_FLAG_KEY, new Date().toISOString());

    return {
      success: true,
      message: `Migration completed: ${invoicesMigratedCount} invoice(s) and company sequence synced with Firestore.`,
      settingsMigrated,
      invoicesMigratedCount,
      alreadyMigrated: false,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown migration error';
    console.error('Migration error:', err);
    return {
      success: false,
      message: `Migration error: ${errorMsg}`,
      settingsMigrated: false,
      invoicesMigratedCount: 0,
      alreadyMigrated: false,
    };
  }
}
