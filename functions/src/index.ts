import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import cors from 'cors';
import {
  REGION,
  DRIVE_SCOPE,
  driveClientId,
  driveClientSecret,
  DEFAULT_CALLBACK_URI,
  isAllowedRedirectUri,
} from './config/secrets';
import { authenticateAdmin } from './middleware/auth';
import {
  getOAuth2Client,
  generateAndSaveOAuthState,
  validateAndConsumeOAuthState,
  persistRefreshToken,
  updateDriveConnectionStatus,
} from './services/driveAuthService';

// Initialize Firebase Admin once
if (!admin.apps.length) {
  admin.initializeApp();
}

const corsHandler = cors({ origin: true });

/**
 * Endpoint 1: googleDriveAuthUrl (Protected)
 * Accessible only to authenticated administrators.
 * Generates an OAuth 2.0 authorization URL with offline access and a secure state nonce.
 */
export const googleDriveAuthUrl = onRequest(
  {
    region: REGION,
    secrets: [driveClientId, driveClientSecret],
    cors: true,
  },
  async (req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== 'POST' && req.method !== 'GET') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
      }

      // 1. Authenticate administrator
      const adminUser = await authenticateAdmin(req, res);
      if (!adminUser) return;

      const clientId = driveClientId.value();
      const clientSecret = driveClientSecret.value();

      if (!clientId || !clientSecret) {
        res.status(500).json({
          error: 'Misconfigured Secrets',
          message: 'GOOGLE_DRIVE_CLIENT_ID or GOOGLE_DRIVE_CLIENT_SECRET is not configured in Firebase Secrets.',
        });
        return;
      }

      // 2. Strictly validate redirect URI against explicit allowlist
      let redirectUri = DEFAULT_CALLBACK_URI;
      const requestedRedirectUri = (req.body?.redirectUri || req.query?.redirectUri) as string | undefined;

      if (requestedRedirectUri) {
        if (!isAllowedRedirectUri(requestedRedirectUri)) {
          res.status(400).json({
            error: 'Invalid Redirect URI',
            message: 'The requested redirect URI is not permitted. It must match an explicitly authorized URI in the allowlist.',
          });
          return;
        }
        redirectUri = requestedRedirectUri;
      }

      try {
        // 3. Generate cryptographic one-time state nonce
        const state = await generateAndSaveOAuthState(adminUser.uid, redirectUri);

        // 4. Construct OAuth2 Client and URL
        const oauth2Client = getOAuth2Client(clientId, clientSecret, redirectUri);
        const authUrl = oauth2Client.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent', // Required to reliably obtain refresh_token
          scope: [DRIVE_SCOPE],
          state,
          include_granted_scopes: true,
        });

        res.status(200).json({
          success: true,
          authUrl,
          state,
          redirectUri,
        });
      } catch (err: unknown) {
        console.error('Error generating authorization URL:', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        res.status(500).json({
          error: 'Internal Server Error',
          message,
        });
      }
    });
  }
);

/**
 * Endpoint 2: googleDriveCallback (Public OAuth Redirect)
 * Callback endpoint registered in Google Cloud Console OAuth 2.0 Web Client.
 * Validates state nonce, exchanges authorization code for tokens, and securely persists refresh token in Secret Manager.
 * Note: Does not bind driveRefreshToken because it only writes new versions to Secret Manager via SDK.
 */
export const googleDriveCallback = onRequest(
  {
    region: REGION,
    secrets: [driveClientId, driveClientSecret],
  },
  async (req, res) => {
    const { code, state, error } = req.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    if (error) {
      console.warn('OAuth consent error returned by Google:', error);
      res.status(400).send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding: 40px;">
            <h2 style="color: #dc2626;">Google Drive Authorization Denied</h2>
            <p>Error returned: ${error}</p>
            <p><a href="/" style="color: #2563eb;">Return to Manshi Invoice Portal</a></p>
          </body>
        </html>
      `);
      return;
    }

    if (!code || !state) {
      res.status(400).send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding: 40px;">
            <h2 style="color: #dc2626;">Invalid Callback Request</h2>
            <p>Missing required authorization 'code' or 'state' parameters.</p>
            <p><a href="/" style="color: #2563eb;">Return to Manshi Invoice Portal</a></p>
          </body>
        </html>
      `);
      return;
    }

    // 1. Validate and consume cryptographic state nonce (prevents CSRF and replay attacks)
    const stateRecord = await validateAndConsumeOAuthState(state);
    if (!stateRecord) {
      res.status(400).send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding: 40px;">
            <h2 style="color: #dc2626;">Authorization Expired or Invalid</h2>
            <p>The authorization state session was not recognized or has expired. Please try connecting again from the invoice portal.</p>
            <p><a href="/" style="color: #2563eb;">Return to Manshi Invoice Portal</a></p>
          </body>
        </html>
      `);
      return;
    }

    const clientId = driveClientId.value();
    const clientSecret = driveClientSecret.value();
    const redirectUri = stateRecord.redirectUri;

    try {
      // 2. Exchange authorization code for tokens
      const oauth2Client = getOAuth2Client(clientId, clientSecret, redirectUri);
      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens || (!tokens.refresh_token && !tokens.access_token)) {
        throw new Error('No tokens received from Google OAuth.');
      }

      oauth2Client.setCredentials(tokens);

      // 3. Securely store refresh token
      const projectId = process.env.GCLOUD_PROJECT || 'invoice-c797f';
      if (tokens.refresh_token) {
        await persistRefreshToken(projectId, tokens.refresh_token);
      } else {
        console.log('No new refresh_token returned (user may have already authorized previously).');
      }

      // 4. Update public connection status
      await updateDriveConnectionStatus();

      // 5. Present success screen and auto-redirect back to dashboard
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Google Drive Connected - Manshi Invoice Portal</title>
            <meta http-equiv="refresh" content="3;url=/" />
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
              .card { background: white; border-radius: 12px; padding: 36px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); text-align: center; max-width: 480px; width: 90%; }
              h2 { color: #16a34a; margin-top: 0; }
              p { color: #475569; font-size: 14px; line-height: 1.5; }
              .btn { display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; margin-top: 16px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>✓ Google Drive Connected!</h2>
              <p>Manshi Invoice Generator has successfully established a secure offline connection to Google Drive for invoice PDF backups.</p>
              <p style="font-size: 12px; color: #94a3b8;">Redirecting back to your invoice portal in 3 seconds...</p>
              <a href="/" class="btn">Return to Invoice Dashboard</a>
            </div>
          </body>
        </html>
      `);
    } catch (exchangeError: unknown) {
      console.error('Failed to exchange authorization code or persist credentials:', exchangeError);
      const errorMsg = exchangeError instanceof Error ? exchangeError.message : 'Unknown server error during OAuth exchange';
      res.status(500).send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding: 40px;">
            <h2 style="color: #dc2626;">Google Drive Authorization Failed</h2>
            <p>${errorMsg}</p>
            <p><a href="/" style="color: #2563eb;">Return to Manshi Invoice Portal</a></p>
          </body>
        </html>
      `);
    }
  }
);
