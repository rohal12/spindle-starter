import { cpSync, existsSync, mkdirSync, rmSync } from "fs";
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
