import { doc, getDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { firestore, auth } from '../lib/firebase';

export interface DriveStatus {
  connected: boolean;
  connectedEmail?: string;
  scope?: string;
  updatedAt?: string;
}

const STATUS_DOC_REF = doc(firestore, 'systemStatus', 'googleDrive');

// Cloud Functions endpoint in asia-south1
const FUNCTION_REGION = 'asia-south1';
const PROJECT_ID = 'invoice-c797f';
const AUTH_URL_ENDPOINT = `https://${FUNCTION_REGION}-${PROJECT_ID}.cloudfunctions.net/googleDriveAuthUrl`;

/**
 * Reads Google Drive connection status from public system status collection
 */
export async function getDriveConnectionStatus(): Promise<DriveStatus> {
  try {
    const snap = await getDoc(STATUS_DOC_REF);
    if (!snap.exists()) {
      return { connected: false };
    }
    return snap.data() as DriveStatus;
  } catch (err) {
    console.warn('Could not read drive connection status:', err);
    return { connected: false };
  }
}

/**
 * Real-time listener for Google Drive connection state
 */
export function subscribeDriveConnectionStatus(
  callback: (status: DriveStatus) => void
): Unsubscribe {
  return onSnapshot(
    STATUS_DOC_REF,
    (snap) => {
      if (snap.exists()) {
        callback(snap.data() as DriveStatus);
      } else {
        callback({ connected: false });
      }
    },
    (err) => {
      console.warn('Drive status subscription error:', err);
      callback({ connected: false });
    }
  );
}

/**
 * Initiates the Google OAuth 2.0 flow by requesting an authorization URL from the Cloud Function.
 * Automatically retrieves the current signed-in administrator's Firebase ID token.
 */
export async function initiateDriveAuthorization(customToken?: string): Promise<{ authUrl: string }> {
  // 1. Obtain Firebase Auth ID token
  let token = customToken;
  if (!token && auth.currentUser) {
    token = await auth.currentUser.getIdToken();
  }

  if (!token) {
    throw new Error('Authentication required: Please sign in with an authorized administrator account to configure Google Drive.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // 2. Select trusted redirect URI matching the active host
  const currentHost = window.location.host;
  let redirectUri = `https://${FUNCTION_REGION}-${PROJECT_ID}.cloudfunctions.net/googleDriveCallback`;

  if (currentHost.includes('web.app') || currentHost.includes('firebaseapp.com')) {
    redirectUri = `https://${currentHost}/google-drive/callback`;
  } else if (currentHost.includes('localhost') || currentHost.includes('127.0.0.1')) {
    redirectUri = `http://${currentHost}/google-drive/callback`;
  }

  const response = await fetch(AUTH_URL_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ redirectUri }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to initiate authorization (${response.status}: ${response.statusText})`);
  }

  const data = await response.json();
  return { authUrl: data.authUrl };
}
