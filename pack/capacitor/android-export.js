// Injected into the Android build's index.html (see pack/scripts/build-capacitor.ts).
//
// Spindle exports a save by clicking a hidden <a download href="blob:...">. An
// Android WebView ignores that, so the "Save exported" message appears but no
// file is written. Inside the packaged app, hand the blob to the native
// SpindleExport plugin (SpindleExportPlugin.java), which lets the user pick
// where the file goes. Anywhere else (no Capacitor) this does nothing.
(function () {
  var cap = window.Capacitor;
  if (!cap || !cap.nativePromise || window.__spindleExportPatched) return;
  if (cap.isNativePlatform && !cap.isNativePlatform()) return;
  window.__spindleExportPatched = true;

  var nativeClick = HTMLAnchorElement.prototype.click;

  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute('download') && /^blob:/.test(this.href)) {
      var name = this.download || 'download';
      // fetch() resolves the blob URL right here, so the caller may revoke it
      // immediately after click() as Spindle does.
      fetch(this.href)
        .then(function (response) { return response.blob(); })
        .then(function (blob) {
          return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () {
              resolve({ type: blob.type, data: String(reader.result).split(',')[1] || '' });
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        })
        .then(function (file) {
          return cap.nativePromise('SpindleExport', 'saveFile', {
            name: name,
            mimeType: file.type || 'application/octet-stream',
            data: file.data,
          });
        })
        .catch(function (error) {
          // A cancelled picker rejects too; the plugin already showed a message
          console.warn('spindle-pack: export not saved', error);
        });
      return;
    }
    return nativeClick.apply(this, arguments);
  };
})();
