import { registerPlugin, Capacitor } from '@capacitor/core';
import type { InvoiceRecord, CompanySettings } from '../types';
import {
  getInvoicePDFBlob,
  sanitizePdfFilename,
  getInvoicePdfFilename,
} from './pdfGenerator';

export interface AndroidDownloadResult {
  success: boolean;
  filename: string;
  location: string;
  uri: string;
  bytesWritten?: number;
}

export interface AndroidPdfDownloaderPlugin {
  savePdfToDownloads(options: {
    base64Data: string;
    filename: string;
  }): Promise<AndroidDownloadResult>;
  openPdf(options: { uri: string }): Promise<{ success: boolean }>;
  sharePdf(options: { uri: string; filename?: string }): Promise<{ success: boolean }>;
}

export const AndroidPdfDownloader = registerPlugin<AndroidPdfDownloaderPlugin>(
  'AndroidPdfDownloader'
);

/**
 * Checks whether the current runtime environment is the native Android app.
 */
export const isAndroidApp = (): boolean => {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
};

/**
 * Converts a standard binary Blob into a clean base64 data string.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = (reader.result as string) || '';
      const base64 = dataUrl.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Unified PDF Downloader:
 * - On native Android app: Saves the PDF directly to "Internal Storage/Download/Manshi Invoice/"
 *   using Android MediaStore Scoped Storage and returns file & URI metadata.
 * - On normal web browser / Vercel: Preserves standard browser download behavior (doc.save).
 */
export async function downloadInvoicePDFUnified(
  invoice: InvoiceRecord,
  companySettings?: CompanySettings,
  customFilename?: string
): Promise<{ isNative: boolean; result?: AndroidDownloadResult; filename: string }> {
  const { blob, doc } = await getInvoicePDFBlob(invoice, companySettings);
  const filename = customFilename
    ? sanitizePdfFilename(customFilename)
    : getInvoicePdfFilename(invoice);

  if (isAndroidApp()) {
    const base64Data = await blobToBase64(blob);
    const nativeRes = await AndroidPdfDownloader.savePdfToDownloads({
      base64Data,
      filename,
    });
    return {
      isNative: true,
      result: nativeRes,
      filename: nativeRes.filename || filename,
    };
  } else {
    // Normal browser download on Vercel / Desktop / Mobile Web
    doc.save(filename);
    return {
      isNative: false,
      filename,
    };
  }
}
