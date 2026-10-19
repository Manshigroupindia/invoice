import { defineSecret } from 'firebase-functions/params';

export const driveClientId = defineSecret('GOOGLE_DRIVE_CLIENT_ID');
export const driveClientSecret = defineSecret('GOOGLE_DRIVE_CLIENT_SECRET');
export const driveRefreshToken = defineSecret('GOOGLE_DRIVE_REFRESH_TOKEN');

export const REGION = 'asia-south1';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/**
 * Explicit allowlist of authorized redirect URIs.
 * Never allow browser-supplied input to specify an arbitrary redirect target.
 */
export const ALLOWED_REDIRECT_URIS: readonly string[] = [
  'https://asia-south1-invoice-c797f.cloudfunctions.net/googleDriveCallback',
  'https://invoice-c797f.web.app/google-drive/callback',
  'https://invoice-c797f.firebaseapp.com/google-drive/callback',
  'http://localhost:5173/google-drive/callback',
  'http://127.0.0.1:5173/google-drive/callback',
];

export const DEFAULT_CALLBACK_URI = 'https://asia-south1-invoice-c797f.cloudfunctions.net/googleDriveCallback';

export function isAllowedRedirectUri(uri: string): boolean {
  return typeof uri === 'string' && ALLOWED_REDIRECT_URIS.includes(uri.trim());
}
