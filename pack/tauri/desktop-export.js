// Runs before the story. Spindle clicks a Blob download anchor and immediately
// revokes its URL; fetch it synchronously, then pass the bytes to a native picker.
(function () {
  var tauri = window.__TAURI_INTERNALS__;
  if (!tauri || !tauri.invoke) return;

  function report(message) {
    tauri.invoke('export_status', { message: message })
      .catch(function (error) { console.error('Could not display export status', error); });
  }

  function exportDownload(anchor) {
    if (!anchor.hasAttribute('download') || !/^blob:/.test(anchor.href)) return false;
    var name = anchor.download || 'save.json';
    fetch(anchor.href)
      .then(function (response) { return response.arrayBuffer(); })
      .then(function (buffer) {
        return tauri.invoke('export_save', { name: name, data: Array.from(new Uint8Array(buffer)) });
      })
      .then(function (path) {
        // Spindle's toast precedes the native picker. Report the actual outcome.
        report(path ? 'Save exported to ' + path : 'Save export cancelled. No file was saved.');
      })
      .catch(function (error) { report('Save export failed: ' + String(error)); });
    return true;
  }

  var nativeClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (exportDownload(this)) return;
    return nativeClick.apply(this, arguments);
  };
  document.addEventListener('click', function (event) {
    var anchor = event.target.closest && event.target.closest('a[download]');
    if (anchor && exportDownload(anchor)) event.preventDefault();
  }, true);
})();
