"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CALLBACK_URI = exports.ALLOWED_REDIRECT_URIS = exports.DRIVE_SCOPE = exports.REGION = exports.driveRefreshToken = exports.driveClientSecret = exports.driveClientId = void 0;
exports.isAllowedRedirectUri = isAllowedRedirectUri;
const params_1 = require("firebase-functions/params");
exports.driveClientId = (0, params_1.defineSecret)('GOOGLE_DRIVE_CLIENT_ID');
exports.driveClientSecret = (0, params_1.defineSecret)('GOOGLE_DRIVE_CLIENT_SECRET');
exports.driveRefreshToken = (0, params_1.defineSecret)('GOOGLE_DRIVE_REFRESH_TOKEN');
exports.REGION = 'asia-south1';
exports.DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
/**
 * Explicit allowlist of authorized redirect URIs.
 * Never allow browser-supplied input to specify an arbitrary redirect target.
 */
exports.ALLOWED_REDIRECT_URIS = [
    'https://asia-south1-invoice-c797f.cloudfunctions.net/googleDriveCallback',
    'https://invoice-c797f.web.app/google-drive/callback',
    'https://invoice-c797f.firebaseapp.com/google-drive/callback',
    'http://localhost:5173/google-drive/callback',
    'http://127.0.0.1:5173/google-drive/callback',
];
exports.DEFAULT_CALLBACK_URI = 'https://asia-south1-invoice-c797f.cloudfunctions.net/googleDriveCallback';
function isAllowedRedirectUri(uri) {
    return typeof uri === 'string' && exports.ALLOWED_REDIRECT_URIS.includes(uri.trim());
}
//# sourceMappingURL=secrets.js.map