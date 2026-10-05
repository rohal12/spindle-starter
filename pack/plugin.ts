import { resolve } from 'path';
import { mkdirSync } from 'fs';
import type { Plugin } from 'vite';
import type { SpindlePackConfig, BuildContext, Target } from './types.js';
import { buildJoiPlay } from './scripts/build-joiplay.js';
import { buildTauri } from './scripts/build-tauri.js';
import { buildCapacitor } from './scripts/build-capacitor.js';

const TARGETS: readonly Target[] = ['windows', 'macos', 'linux', 'android', 'joiplay'];

const DEFAULT_WINDOW = {
  width: 960,
  height: 600,
  minWidth: 480,
  minHeight: 320,
};

function resolveConfig(config: SpindlePackConfig): Required<SpindlePackConfig> {
  return {
    ...config,
    window: { ...DEFAULT_WINDOW, ...config.window },
  };
}

export function spindlePack(config: SpindlePackConfig): Plugin {
  const resolved = resolveConfig(config);

  return {
    name: 'vite-plugin-spindle-pack',
    apply: 'build',

    // Run after the story compiler has written dist/index.html
    closeBundle: {
      order: 'post',
      sequential: true,
      handler: () => pack(resolved),
    },
  };
}

async function pack(config: Required<SpindlePackConfig>): Promise<void> {
  // Only run in production builds
  if (process.env.NODE_ENV !== 'production') return;

  const projectRoot = resolve(import.meta.dirname!, '..');
  const distDir = resolve(projectRoot, 'dist');
  const outDir = resolve(distDir, 'pack');

  mkdirSync(outDir, { recursive: true });

  const ctx: BuildContext = {
    config,
    projectRoot,
    distDir,
    outDir,
  };

  for (const target of resolveTargets(config.targets)) {
    try {
      await buildTarget(target, ctx);
    } catch (err) {
      console.error(`[spindle-pack] Failed to build target '${target}':`, err);
      throw err;
    }
  }
}

/**
 * CI can override the configured targets via env var, e.g.
 * SPINDLE_PACK_TARGETS=windows, or SPINDLE_PACK_TARGETS=none to skip packing.
 */
function resolveTargets(configTargets: Target[]): Target[] {
  const envTargets = process.env.SPINDLE_PACK_TARGETS?.trim();
  if (envTargets === 'none') return [];

  const targets = envTargets
    ? envTargets.split(',').map((t) => t.trim()).filter(Boolean)
    : configTargets;

  for (const target of targets) {
    if (!TARGETS.includes(target as Target)) {
      throw new Error(
        `[spindle-pack] Unknown target: ${target} (expected one of: ${TARGETS.join(', ')})`
      );
    }
  }
  return targets as Target[];
}

async function buildTarget(target: Target, ctx: BuildContext): Promise<void> {
  switch (target) {
    case 'joiplay':
      await buildJoiPlay(ctx);
      break;

    case 'windows':
    case 'macos':
    case 'linux':
      await buildTauri(target, ctx);
      break;

    case 'android':
      await buildCapacitor(ctx);
      break;
  }
}
