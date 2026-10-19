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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOAuth2Client = getOAuth2Client;
exports.generateAndSaveOAuthState = generateAndSaveOAuthState;
exports.validateAndConsumeOAuthState = validateAndConsumeOAuthState;
exports.persistRefreshToken = persistRefreshToken;
exports.updateDriveConnectionStatus = updateDriveConnectionStatus;
const crypto = __importStar(require("crypto"));
const admin = __importStar(require("firebase-admin"));
const googleapis_1 = require("googleapis");
const secret_manager_1 = require("@google-cloud/secret-manager");
const secrets_1 = require("../config/secrets");
const secretClient = new secret_manager_1.SecretManagerServiceClient();
/**
 * Creates an instance of Google OAuth2 client with provided credentials.
 */
function getOAuth2Client(clientId, clientSecret, redirectUri) {
    return new googleapis_1.google.auth.OAuth2(clientId, clientSecret, redirectUri);
}
/**
 * Generates a 32-byte cryptographically secure random state nonce,
 * persists it in Firestore with a 10-minute expiry, and returns the state string.
 */
async function generateAndSaveOAuthState(adminUid, redirectUri) {
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
async function validateAndConsumeOAuthState(state) {
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
        if (!data)
            return null;
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
            uid: data.uid,
            redirectUri: data.redirectUri,
        };
    });
}
/**
 * Securely persists the Google Drive refresh token exclusively in Google Cloud Secret Manager.
 * Fails safely with an explicit error if Secret Manager is not configured.
 * Never stores raw tokens in Firestore documents.
 */
async function persistRefreshToken(projectId, refreshToken) {
    const secretName = `projects/${projectId}/secrets/GOOGLE_DRIVE_REFRESH_TOKEN`;
    try {
        await secretClient.addSecretVersion({
            parent: secretName,
            payload: {
                data: Buffer.from(refreshToken, 'utf8'),
            },
        });
        console.log('Refresh token successfully stored in Google Cloud Secret Manager.');
    }
    catch (error) {
        console.error('Failed to store refresh token in Google Cloud Secret Manager:', error);
        const msg = error instanceof Error ? error.message : 'Unknown Secret Manager error';
        throw new Error(`Failed to securely persist OAuth refresh token in Google Cloud Secret Manager (${msg}). ` +
            `Ensure secret 'GOOGLE_DRIVE_REFRESH_TOKEN' exists and the service account has 'roles/secretmanager.secretVersionManager'.`);
    }
}
/**
 * Updates public connection status metadata for the frontend.
 * Never includes tokens or client secrets.
 */
async function updateDriveConnectionStatus(connectedEmail) {
    await admin.firestore().collection('systemStatus').doc('googleDrive').set({
        connected: true,
        connectedEmail: connectedEmail || 'Authorized Administrator',
        scope: secrets_1.DRIVE_SCOPE,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}
//# sourceMappingURL=driveAuthService.js.map