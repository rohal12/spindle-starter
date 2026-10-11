package com.example.spindle_story;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.widget.Toast;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import java.io.IOException;
import java.io.OutputStream;

/**
 * Lets the story export a file (Spindle's save export). The WebView ignores
 * the download Spindle triggers, so android-export.js hands the file to this
 * plugin, which asks the user where to put it with the system file picker and
 * resolves the call only once the file is written.
 */
@CapacitorPlugin(name = "SpindleExport")
public class SpindleExportPlugin extends Plugin {
    @PluginMethod
    public void saveFile(PluginCall call) {
        if (call.getString("data") == null) {
            call.reject("No data to export");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(call.getString("mimeType", "application/octet-stream"))
                .putExtra(Intent.EXTRA_TITLE, call.getString("name", "download"));
        startActivityForResult(call, intent, "finishExport");
    }

    @ActivityCallback
    private void finishExport(PluginCall call, ActivityResult result) {
        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        if (call == null) return;
        if (result.getResultCode() != android.app.Activity.RESULT_OK || uri == null) {
            toast("Export cancelled");
            call.reject("cancelled");
            return;
        }
        byte[] bytes = Base64.decode(call.getString("data"), Base64.DEFAULT);
        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "w")) {
            if (out == null) throw new IOException("Cannot open " + uri);
            out.write(bytes);
        } catch (IOException e) {
            toast("Could not export: " + e.getMessage());
            call.reject("Could not export: " + e.getMessage());
            return;
        }
        toast("Saved");
        call.resolve(new JSObject().put("saved", true));
    }

    private void toast(String message) {
        getActivity().runOnUiThread(
                () -> Toast.makeText(getContext(), message, Toast.LENGTH_SHORT).show());
    }
}
