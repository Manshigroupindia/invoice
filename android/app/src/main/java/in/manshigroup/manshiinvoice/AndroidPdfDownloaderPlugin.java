package in.manshigroup.manshiinvoice;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "AndroidPdfDownloader")
public class AndroidPdfDownloaderPlugin extends Plugin {

    @PluginMethod
    public void savePdfToDownloads(PluginCall call) {
        String base64Data = call.getString("base64Data");
        String filename = call.getString("filename");

        if (base64Data == null || base64Data.trim().isEmpty()) {
            call.reject("Base64 PDF data is required");
            return;
        }

        if (filename == null || filename.trim().isEmpty()) {
            filename = "Invoice.pdf";
        }
        filename = filename.trim();
        if (!filename.toLowerCase().endsWith(".pdf")) {
            filename = filename + ".pdf";
        }

        try {
            // Strip data URL scheme prefix if present (e.g. "data:application/pdf;base64,")
            if (base64Data.contains(",")) {
                base64Data = base64Data.substring(base64Data.indexOf(",") + 1);
            }

            byte[] pdfBytes = Base64.decode(base64Data, Base64.DEFAULT);
            if (pdfBytes == null || pdfBytes.length == 0) {
                call.reject("Decoded PDF binary content is empty");
                return;
            }

            String displayLocation = "Downloads/Manshi Invoice/";
            Uri savedUri = null;
            String savedFilename = filename;

            // Modern Android (API 29+ Android 10, 11, 12, 13, 14, 15, 16): MediaStore Scoped Storage
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues contentValues = new ContentValues();
                contentValues.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                contentValues.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");
                contentValues.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Manshi Invoice");
                contentValues.put(MediaStore.Downloads.IS_PENDING, 1);

                Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                savedUri = resolver.insert(collection, contentValues);

                if (savedUri == null) {
                    call.reject("Could not create MediaStore entry in Downloads/Manshi Invoice");
                    return;
                }

                try (OutputStream os = resolver.openOutputStream(savedUri)) {
                    if (os == null) {
                        call.reject("Could not open destination output stream");
                        return;
                    }
                    os.write(pdfBytes);
                    os.flush();
                }

                contentValues.clear();
                contentValues.put(MediaStore.Downloads.IS_PENDING, 0);
                resolver.update(savedUri, contentValues, null, null);
            } else {
                // Fallback for Android 9 and below (API 24 - 28)
                File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                File targetDir = new File(downloadsDir, "Manshi Invoice");
                if (!targetDir.exists()) {
                    targetDir.mkdirs();
                }

                File destFile = new File(targetDir, filename);
                int counter = 1;
                String baseName = filename.substring(0, filename.length() - 4);
                while (destFile.exists()) {
                    destFile = new File(targetDir, baseName + " (" + counter + ").pdf");
                    counter++;
                }
                savedFilename = destFile.getName();

                try (FileOutputStream fos = new FileOutputStream(destFile)) {
                    fos.write(pdfBytes);
                    fos.flush();
                }

                savedUri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    destFile
                );
            }

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("filename", savedFilename);
            result.put("location", displayLocation);
            result.put("uri", savedUri.toString());
            result.put("bytesWritten", pdfBytes.length);

            call.resolve(result);

        } catch (Exception e) {
            call.reject("Error saving PDF to Downloads: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void openPdf(PluginCall call) {
        String uriString = call.getString("uri");
        if (uriString == null || uriString.trim().isEmpty()) {
            call.reject("File URI is required to open PDF");
            return;
        }

        try {
            Uri pdfUri = Uri.parse(uriString);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(pdfUri, "application/pdf");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            Intent chooser = Intent.createChooser(intent, "Open Invoice PDF");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Unable to open PDF viewer: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void sharePdf(PluginCall call) {
        String uriString = call.getString("uri");
        String filename = call.getString("filename", "Invoice.pdf");

        if (uriString == null || uriString.trim().isEmpty()) {
            call.reject("File URI is required to share PDF");
            return;
        }

        try {
            Uri pdfUri = Uri.parse(uriString);
            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("application/pdf");
            shareIntent.putExtra(Intent.EXTRA_STREAM, pdfUri);
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, filename);
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            shareIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            Intent chooser = Intent.createChooser(shareIntent, "Share Invoice PDF");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Unable to share PDF: " + e.getMessage(), e);
        }
    }
}
