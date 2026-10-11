import { existsSync } from 'fs';
import { resolve } from 'path';
import type { BuildContext } from '../types.js';

/** Icon used when the configured icon doesn't exist */
const FALLBACK_ICON = 'src/assets/media/favicon.svg';

/** Absolute path of the configured icon, or of the favicon if that is missing. */
export function resolveIcon(ctx: BuildContext): string {
  const icon = resolve(ctx.projectRoot, ctx.config.icon);
  if (existsSync(icon)) return icon;

  console.warn(
    `[spindle-pack] Icon not found: ${ctx.config.icon}, using ${FALLBACK_ICON}`
  );
  return resolve(ctx.projectRoot, FALLBACK_ICON);
}
