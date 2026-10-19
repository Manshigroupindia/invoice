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
exports.authenticateAdmin = authenticateAdmin;
const admin = __importStar(require("firebase-admin"));
/**
 * Validates Firebase Authentication ID token and ensures user has administrator rights.
 */
async function authenticateAdmin(req, res) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Authorization Bearer token is required.',
        });
        return null;
    }
    const idToken = authHeader.split('Bearer ')[1].trim();
    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        // Check admin authorization strictly via custom claims or provisioned systemRoles document
        let isAdmin = Boolean(decoded.admin);
        if (!isAdmin) {
            // Check if user has an explicitly provisioned admin record in Firestore 'systemRoles/{uid}'
            const roleDoc = await admin.firestore().collection('systemRoles').doc(decoded.uid).get();
            if (roleDoc.exists && roleDoc.data()?.role === 'admin') {
                isAdmin = true;
            }
        }
        if (!isAdmin) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'Administrator authorization required. User is authenticated but does not possess an administrator role or custom claim.',
            });
            return null;
        }
        return {
            uid: decoded.uid,
            email: decoded.email,
            isAdmin: true,
        };
    }
    catch (error) {
        console.error('Authentication verification error:', error);
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or expired authentication credentials.',
        });
        return null;
    }
}
//# sourceMappingURL=auth.js.map