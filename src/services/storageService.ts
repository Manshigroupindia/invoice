import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];

export async function uploadBrandAsset(
  file: File,
  folder: 'logos' | 'scanners'
): Promise<string> {
  // 1. Validation
  if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    throw new Error('Unsupported image format. Please select a PNG, JPG, WEBP, or SVG file.');
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Image size exceeds 5MB limit. Please upload a smaller image.');
  }

  // 2. Upload to Firebase Storage
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `brand_assets/${folder}/${Date.now()}_${sanitizedName}`;
  const assetRef = ref(storage, storagePath);

  try {
    const uploadResult = await uploadBytes(assetRef, file, {
      contentType: file.type,
      customMetadata: {
        originalName: file.name,
        uploadedAt: new Date().toISOString(),
      },
    });

    const downloadUrl = await getDownloadURL(uploadResult.ref);
    return downloadUrl;
  } catch (err: unknown) {
    const firebaseErr = err as { code?: string; message?: string };
    console.error('Firebase Storage upload error:', firebaseErr);

    if (firebaseErr.code === 'storage/unauthorized') {
      throw new Error(
        'Permission denied by Firebase Storage. Please publish appropriate storage.rules in Firebase Console, or paste a public image URL instead.'
      );
    } else if (firebaseErr.code === 'storage/bucket-not-found' || firebaseErr.code === 'storage/project-not-found') {
      throw new Error(
        'Firebase Storage is not enabled for project invoice-c797f. Please enable Storage in Firebase Console, or paste a public image URL instead.'
      );
    } else {
      throw new Error(
        `Storage upload failed: ${firebaseErr.message || 'Unknown network error'}. You can paste a public image URL instead.`
      );
    }
  }
}

/**
 * Validates whether an image URL can be loaded successfully by the browser
 */
export function validateImageUrl(url: string): Promise<boolean> {
  if (!url || !url.trim()) return Promise.resolve(false);
  const cleanUrl = url.trim();

  // Basic protocol check
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('/')) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = cleanUrl;
  });
}
