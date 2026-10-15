import { cpSync, existsSync, mkdirSync, rmSync, statSync, watch, type FSWatcher } from "fs";
import { resolve } from "path";

/**
 * Make dist/media/ an exact copy of src/assets/media/, so stories and head
 * content can use "media/..." URLs. (Vite's publicDir would copy the files to
 * the dist/ root.) Files removed from the source are removed from dist too.
 */
export function syncMedia(root: string): void {
  const src = resolve(root, "src/assets/media");
  const dest = resolve(root, "dist/media");
  rmSync(dest, { recursive: true, force: true });
  if (existsSync(src)) {
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true });
  }
}

/** Watch a stable ancestor so removing or replacing media/ keeps working. */
export function watchMedia(root: string, onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  let mediaWatcher: FSWatcher | undefined;
  let identity: string | undefined;
  const mediaDir = resolve(root, "src/assets/media");
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      reconcile();
      syncMedia(root);
      onChange();
    }, 100);
  };
  const reconcile = () => {
    const stat = statSync(mediaDir, { throwIfNoEntry: false });
    const next = stat?.isDirectory() ? `${stat.dev}:${stat.ino}` : undefined;
    if (next === identity) return;
    mediaWatcher?.close();
    mediaWatcher = next ? watch(mediaDir, { recursive: true }, changed) : undefined;
    const attached = mediaWatcher;
    attached?.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPERM" && error.code !== "ENOENT") throw error;
      if (mediaWatcher !== attached) return;
      // Windows may report deletion as EPERM before the parent change event.
      attached.close();
      mediaWatcher = undefined;
      identity = undefined;
      changed();
    });
    identity = next;
  };
  // A recursive ancestor watcher can itself keep stale child handles after a
  // replacement. Watch the parent non-recursively and attach a fresh watcher
  // whenever media/ acquires a new filesystem identity.
  const parentWatcher = watch(resolve(root, "src/assets"), (_event, filename) => {
    if (filename && filename.toString() !== "media") return;
    reconcile();
    changed();
  });
  reconcile();
  return () => {
    clearTimeout(timer);
    parentWatcher.close();
    mediaWatcher?.close();
  };
}
