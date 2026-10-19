import * as admin from 'firebase-admin';
import type { Request, Response } from 'express';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  isAdmin: boolean;
}

/**
 * Validates Firebase Authentication ID token and ensures user has administrator rights.
 */
export async function authenticateAdmin(req: Request, res: Response): Promise<AuthenticatedUser | null> {
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
  } catch (error) {
    console.error('Authentication verification error:', error);
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired authentication credentials.',
    });
    return null;
  }
}
