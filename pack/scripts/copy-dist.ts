import { cpSync, rmSync } from 'fs';
import { resolve } from 'path';
import type { BuildContext } from '../types.js';

/**
 * Replace `dest` with a fresh copy of dist/, leaving out dist/pack/ so outputs
 * of earlier targets (zips, executables, APKs) never end up inside an app.
 */
export function copyDistAssets(ctx: BuildContext, dest: string): void {
  rmSync(dest, { recursive: true, force: true });
  cpSync(ctx.distDir, dest, {
    recursive: true,
    filter: (src) => resolve(src) !== resolve(ctx.outDir),
  });
}
