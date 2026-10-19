"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleDriveCallback = exports.googleDriveAuthUrl = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const cors_1 = __importDefault(require("cors"));
const secrets_1 = require("./config/secrets");
const auth_1 = require("./middleware/auth");
const driveAuthService_1 = require("./services/driveAuthService");
// Initialize Firebase Admin once
if (!admin.apps.length) {
    admin.initializeApp();
}
const corsHandler = (0, cors_1.default)({ origin: true });
/**
 * Endpoint 1: googleDriveAuthUrl (Protected)
 * Accessible only to authenticated administrators.
 * Generates an OAuth 2.0 authorization URL with offline access and a secure state nonce.
 */
exports.googleDriveAuthUrl = (0, https_1.onRequest)({
    region: secrets_1.REGION,
    secrets: [secrets_1.driveClientId, secrets_1.driveClientSecret],
    cors: true,
}, async (req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== 'POST' && req.method !== 'GET') {
            res.status(405).json({ error: 'Method Not Allowed' });
            return;
        }
        // 1. Authenticate administrator
        const adminUser = await (0, auth_1.authenticateAdmin)(req, res);
        if (!adminUser)
            return;
        const clientId = secrets_1.driveClientId.value();
        const clientSecret = secrets_1.driveClientSecret.value();
        if (!clientId || !clientSecret) {
            res.status(500).json({
                error: 'Misconfigured Secrets',
                message: 'GOOGLE_DRIVE_CLIENT_ID or GOOGLE_DRIVE_CLIENT_SECRET is not configured in Firebase Secrets.',
            });
            return;
        }
        // 2. Strictly validate redirect URI against explicit allowlist
        let redirectUri = secrets_1.DEFAULT_CALLBACK_URI;
        const requestedRedirectUri = (req.body?.redirectUri || req.query?.redirectUri);
        if (requestedRedirectUri) {
            if (!(0, secrets_1.isAllowedRedirectUri)(requestedRedirectUri)) {
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
            const state = await (0, driveAuthService_1.generateAndSaveOAuthState)(adminUser.uid, redirectUri);
            // 4. Construct OAuth2 Client and URL
            const oauth2Client = (0, driveAuthService_1.getOAuth2Client)(clientId, clientSecret, redirectUri);
            const authUrl = oauth2Client.generateAuthUrl({
                access_type: 'offline',
                prompt: 'consent', // Required to reliably obtain refresh_token
                scope: [secrets_1.DRIVE_SCOPE],
                state,
                include_granted_scopes: true,
            });
            res.status(200).json({
                success: true,
                authUrl,
                state,
                redirectUri,
            });
        }
        catch (err) {
            console.error('Error generating authorization URL:', err);
            const message = err instanceof Error ? err.message : 'Unknown error';
            res.status(500).json({
                error: 'Internal Server Error',
                message,
            });
        }
    });
});
/**
 * Endpoint 2: googleDriveCallback (Public OAuth Redirect)
 * Callback endpoint registered in Google Cloud Console OAuth 2.0 Web Client.
 * Validates state nonce, exchanges authorization code for tokens, and securely persists refresh token in Secret Manager.
 * Note: Does not bind driveRefreshToken because it only writes new versions to Secret Manager via SDK.
 */
exports.googleDriveCallback = (0, https_1.onRequest)({
    region: secrets_1.REGION,
    secrets: [secrets_1.driveClientId, secrets_1.driveClientSecret],
}, async (req, res) => {
    const { code, state, error } = req.query;
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
    const stateRecord = await (0, driveAuthService_1.validateAndConsumeOAuthState)(state);
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
    const clientId = secrets_1.driveClientId.value();
    const clientSecret = secrets_1.driveClientSecret.value();
    const redirectUri = stateRecord.redirectUri;
    try {
        // 2. Exchange authorization code for tokens
        const oauth2Client = (0, driveAuthService_1.getOAuth2Client)(clientId, clientSecret, redirectUri);
        const { tokens } = await oauth2Client.getToken(code);
        if (!tokens || (!tokens.refresh_token && !tokens.access_token)) {
            throw new Error('No tokens received from Google OAuth.');
        }
        oauth2Client.setCredentials(tokens);
        // 3. Securely store refresh token
        const projectId = process.env.GCLOUD_PROJECT || 'invoice-c797f';
        if (tokens.refresh_token) {
            await (0, driveAuthService_1.persistRefreshToken)(projectId, tokens.refresh_token);
        }
        else {
            console.log('No new refresh_token returned (user may have already authorized previously).');
        }
        // 4. Update public connection status
        await (0, driveAuthService_1.updateDriveConnectionStatus)();
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
    }
    catch (exchangeError) {
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
});
//# sourceMappingURL=index.js.map