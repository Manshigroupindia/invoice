import * as crypto from 'crypto';
import * as admin from 'firebase-admin';
import { google } from 'googleapis';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { DRIVE_SCOPE } from '../config/secrets';

const secretClient = new SecretManagerServiceClient();

/**
 * Creates an instance of Google OAuth2 client with provided credentials.
 */
export function getOAuth2Client(clientId: string, clientSecret: string, redirectUri: string) {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generates a 32-byte cryptographically secure random state nonce,
 * persists it in Firestore with a 10-minute expiry, and returns the state string.
 */
export async function generateAndSaveOAuthState(adminUid: string, redirectUri: string): Promise<string> {
  const state = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes TTL

  await admin.firestore().collection('_oauthPendingStates').doc(state).set({
    uid: adminUid,
    redirectUri,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
  });

  return state;
}

/**
 * Validates the state from the OAuth redirect callback atomically using a Firestore transaction.
 * Ensures the state exists, is unexpired, and is atomically deleted to prevent concurrent replay.
 */
export async function validateAndConsumeOAuthState(state: string): Promise<{ uid: string; redirectUri: string } | null> {
  if (!state || typeof state !== 'string' || state.length !== 64) {
    return null;
  }

  const docRef = admin.firestore().collection('_oauthPendingStates').doc(state);

  return admin.firestore().runTransaction(async (transaction) => {
    const snap = await transaction.get(docRef);
    if (!snap.exists) {
      return null;
    }

    const data = snap.data();
    // Delete atomically inside the transaction so concurrent callback requests cannot both succeed
    transaction.delete(docRef);

    if (!data) return null;

    const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(0);
    if (Date.now() > expiresAt.getTime()) {
      console.warn('OAuth state nonce expired');
      return null;
    }

    if (!data.uid || !data.redirectUri) {
      console.warn('OAuth state record missing required uid or redirectUri bindings');
      return null;
    }

    return {
      uid: data.uid as string,
      redirectUri: data.redirectUri as string,
    };
  });
}

/**
 * Securely persists the Google Drive refresh token exclusively in Google Cloud Secret Manager.
 * Fails safely with an explicit error if Secret Manager is not configured.
 * Never stores raw tokens in Firestore documents.
 */
export async function persistRefreshToken(projectId: string, refreshToken: string): Promise<void> {
  const secretName = `projects/${projectId}/secrets/GOOGLE_DRIVE_REFRESH_TOKEN`;

  try {
    await secretClient.addSecretVersion({
      parent: secretName,
      payload: {
        data: Buffer.from(refreshToken, 'utf8'),
      },
    });
    console.log('Refresh token successfully stored in Google Cloud Secret Manager.');
  } catch (error: unknown) {
    console.error('Failed to store refresh token in Google Cloud Secret Manager:', error);
    const msg = error instanceof Error ? error.message : 'Unknown Secret Manager error';
    throw new Error(
      `Failed to securely persist OAuth refresh token in Google Cloud Secret Manager (${msg}). ` +
      `Ensure secret 'GOOGLE_DRIVE_REFRESH_TOKEN' exists and the service account has 'roles/secretmanager.secretVersionManager'.`
    );
  }
}

/**
 * Updates public connection status metadata for the frontend.
 * Never includes tokens or client secrets.
 */
export async function updateDriveConnectionStatus(connectedEmail?: string): Promise<void> {
  await admin.firestore().collection('systemStatus').doc('googleDrive').set({
    connected: true,
    connectedEmail: connectedEmail || 'Authorized Administrator',
    scope: DRIVE_SCOPE,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}
