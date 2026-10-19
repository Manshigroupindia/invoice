import { doc, updateDoc } from 'firebase/firestore';
import { firestore } from '../lib/firebase';
import { db } from '../db';
import type { InvoiceRecord, CompanySettings, DriveBackupStatus } from '../types';
import { createInvoicePDFDocument } from '../utils/pdfGenerator';

// Google Drive API Configuration
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FOLDER_NAME = 'Manshi Invoices';
const CONNECTION_FLAG_KEY = 'manshi_google_drive_connected';
const CONNECTED_EMAIL_KEY = 'manshi_google_drive_email';

/**
 * Returns configured Google OAuth 2.0 Web Client ID
 */
export function getGoogleClientId(overrideId?: string): string {
  if (overrideId && overrideId.trim()) {
    return overrideId.trim();
  }
  const local = localStorage.getItem('manshi_google_client_id');
  if (local && local.trim()) {
    return local.trim();
  }
  return (
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    '631933281935-webclient.apps.googleusercontent.com'
  );
}

export function setLocalGoogleClientId(clientId: string): void {
  if (clientId && clientId.trim()) {
    localStorage.setItem('manshi_google_client_id', clientId.trim());
  } else {
    localStorage.removeItem('manshi_google_client_id');
  }
}

// Strictly IN-MEMORY access token storage.
// Short-lived access tokens are NEVER written to localStorage or Firestore.
let inMemoryAccessToken: string | null = null;
let inMemoryTokenExpiresAt: number = 0;

// Subscribers for connection state changes
type ConnectionChangeCallback = (connected: boolean, email?: string) => void;
const subscribers = new Set<ConnectionChangeCallback>();

export function subscribeDriveConnection(callback: ConnectionChangeCallback): () => void {
  subscribers.add(callback);
  callback(isDriveConnected(), getConnectedDriveEmail());
  return () => {
    subscribers.delete(callback);
  };
}

function notifySubscribers() {
  const connected = isDriveConnected();
  const email = getConnectedDriveEmail();
  subscribers.forEach((cb) => cb(connected, email));
}

export function isDriveConnected(): boolean {
  return localStorage.getItem(CONNECTION_FLAG_KEY) === 'true';
}

export function getConnectedDriveEmail(): string | undefined {
  return localStorage.getItem(CONNECTED_EMAIL_KEY) || undefined;
}

/**
 * Ensures Google Identity Services (GIS) client script is ready.
 */
function ensureGisScriptLoaded(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('Window not defined'));
    const win = window as any;
    if (win.google?.accounts?.oauth2) {
      return resolve();
    }

    const existingScript = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services script')));
      // In case it finished loading in between
      if (win.google?.accounts?.oauth2) return resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

/**
 * Requests a Google Drive OAuth access token using Google Identity Services Token Client.
 * Token is kept purely in memory and valid for ~60 minutes.
 */
export async function requestDriveAccessToken(promptConsent = false, clientIdOverride?: string): Promise<string> {
  // If we already have a valid in-memory token, return it
  if (inMemoryAccessToken && Date.now() < inMemoryTokenExpiresAt - 60000) {
    return inMemoryAccessToken;
  }

  await ensureGisScriptLoaded();
  const win = window as any;

  const clientId = getGoogleClientId(clientIdOverride);
  if (!clientId || clientId.includes('placeholder')) {
    throw new Error('Google OAuth Client ID is not configured. Set VITE_GOOGLE_CLIENT_ID or specify your Client ID.');
  }

  return new Promise((resolve, reject) => {
    try {
      const tokenClient = win.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: (response: any) => {
          if (response.error) {
            console.error('Google OAuth error:', response);
            return reject(new Error(response.error_description || response.error));
          }
          if (!response.access_token) {
            return reject(new Error('No access token returned from Google.'));
          }

          inMemoryAccessToken = response.access_token;
          const expiresInSec = Number(response.expires_in) || 3599;
          inMemoryTokenExpiresAt = Date.now() + expiresInSec * 1000;

          // Record connection flag safely (without token)
          localStorage.setItem(CONNECTION_FLAG_KEY, 'true');

          // Optionally fetch profile email
          fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${response.access_token}` },
          })
            .then((r) => r.json())
            .then((info) => {
              if (info?.email) {
                localStorage.setItem(CONNECTED_EMAIL_KEY, info.email);
              }
              notifySubscribers();
            })
            .catch(() => {
              notifySubscribers();
            });

          resolve(response.access_token);
        },
      });

      tokenClient.requestAccessToken({
        prompt: promptConsent ? 'consent' : '',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to initialize Google token client';
      reject(new Error(msg));
    }
  });
}

/**
 * Connect Google Drive (triggers interactive user consent)
 */
export async function connectGoogleDrive(clientIdOverride?: string): Promise<void> {
  await requestDriveAccessToken(true, clientIdOverride);
}

/**
 * Disconnect Google Drive
 */
export function disconnectGoogleDrive(): void {
  if (inMemoryAccessToken) {
    try {
      const win = window as any;
      if (win.google?.accounts?.oauth2?.revoke) {
        win.google.accounts.oauth2.revoke(inMemoryAccessToken, () => {});
      }
    } catch (e) {
      console.warn('Token revocation warning:', e);
    }
  }

  inMemoryAccessToken = null;
  inMemoryTokenExpiresAt = 0;
  localStorage.removeItem(CONNECTION_FLAG_KEY);
  localStorage.removeItem(CONNECTED_EMAIL_KEY);
  notifySubscribers();
}

/**
 * Finds or creates the "Manshi Invoices" folder in user's Google Drive
 */
async function getOrCreateManshiFolder(token: string): Promise<string> {
  const query = encodeURIComponent(`name = '${DRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!searchRes.ok) {
    throw new Error(`Failed to query Google Drive folder: ${searchRes.statusText}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create folder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create Google Drive folder: ${createRes.statusText}`);
  }

  const createData = await createRes.json();
  return createData.id;
}

/**
 * Deduplication: searches for an existing file in the folder matching invoice number or ID
 */
async function findExistingInvoiceFile(
  token: string,
  folderId: string,
  invoice: InvoiceRecord,
  filename: string
): Promise<string | null> {
  const query = encodeURIComponent(
    `'${folderId}' in parents and (name = '${filename}' or appProperties has { key='invoiceId' and value='${invoice.id}' }) and trashed = false`
  );
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;

  const res = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.warn('Could not check existing file in Drive, proceeding with upload');
    return null;
  }

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

/**
 * Uploads or updates an invoice PDF on Google Drive in the background.
 * - Reuses existing PDF generator.
 * - Deduplicates using invoice ID and number.
 * - Updates Firestore and IndexedDB status without blocking.
 */
export async function uploadInvoicePdfToDrive(
  invoice: InvoiceRecord,
  settings?: CompanySettings
): Promise<{ fileId: string; status: DriveBackupStatus }> {
  // 1. If not connected, mark as not_connected
  if (!isDriveConnected()) {
    await updateInvoiceBackupStatus(invoice.id, 'not_connected', undefined, 'Google Drive is not connected');
    return { fileId: '', status: 'not_connected' };
  }

  try {
    // 2. Obtain in-memory access token
    let token = inMemoryAccessToken;
    if (!token || Date.now() >= inMemoryTokenExpiresAt - 60000) {
      // Prompt user or renew
      token = await requestDriveAccessToken(false, settings?.googleDriveClientId);
    }

    // 3. Generate PDF Blob reusing exact existing layout generator
    const doc = await createInvoicePDFDocument(invoice, settings);
    const pdfBlob: Blob = doc.output('blob');

    const safeInvoiceNo = invoice.invoiceNumber.replace(/\//g, '_');
    const safeCustomerName = invoice.customerName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    const filename = `${safeInvoiceNo}_${safeCustomerName}.pdf`;

    // 4. Get or create folder
    const folderId = await getOrCreateManshiFolder(token);

    // 5. Deduplication check: see if file already exists in Drive
    const existingFileId = await findExistingInvoiceFile(token, folderId, invoice, filename);

    const metadata = {
      name: filename,
      mimeType: 'application/pdf',
      parents: existingFileId ? undefined : [folderId],
      appProperties: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
      },
    };

    // Multipart upload
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
    const payload = new Blob([
      delimiter,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      metadataBlob,
      delimiter,
      'Content-Type: application/pdf\r\n\r\n',
      pdfBlob,
      closeDelimiter,
    ]);

    const uploadUrl = existingFileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

    const method = existingFileId ? 'PATCH' : 'POST';

    const uploadRes = await fetch(uploadUrl, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: payload,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Google Drive upload failed (${uploadRes.status}): ${errText}`);
    }

    const uploadData = await uploadRes.json();
    const fileId = uploadData.id || existingFileId;

    // 6. Update Firestore and IndexedDB records
    await updateInvoiceBackupStatus(invoice.id, 'backed_up', fileId);

    return { fileId, status: 'backed_up' };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown Google Drive upload error';
    console.error('Invoice Drive backup error:', errorMsg);

    // Record failure status safely without blocking invoice save
    await updateInvoiceBackupStatus(invoice.id, 'failed', undefined, errorMsg);

    return { fileId: '', status: 'failed' };
  }
}

/**
 * Updates invoice document in Firestore and IndexedDB with Drive backup status
 */
async function updateInvoiceBackupStatus(
  invoiceId: string,
  status: DriveBackupStatus,
  fileId?: string,
  errorMsg?: string
): Promise<void> {
  const now = new Date().toISOString();
  const updateData: Record<string, any> = {
    driveBackupStatus: status,
    updatedAt: now,
  };

  if (fileId) {
    updateData.driveFileId = fileId;
    updateData.driveBackupAt = now;
    updateData.driveBackupError = null;
  }

  if (errorMsg) {
    updateData.driveBackupError = errorMsg;
  }

  // 1. Update Firestore
  try {
    const invRef = doc(firestore, 'invoices', invoiceId);
    await updateDoc(invRef, updateData);
  } catch (e) {
    console.warn('Could not update invoice Drive status in Firestore:', e);
  }

  // 2. Update local IndexedDB
  try {
    await db.invoices.update(invoiceId, updateData);
  } catch (e) {
    console.warn('Could not update invoice Drive status in IndexedDB:', e);
  }
}
