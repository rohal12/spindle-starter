import { resolve } from 'path';
import { mkdirSync } from 'fs';
import type { Plugin } from 'vite';
import type { SpindlePackConfig, BuildContext, Target } from './types.js';
import { buildJoiPlay } from './scripts/build-joiplay.js';

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

    async closeBundle() {
      // Only run in production builds
      if (process.env.NODE_ENV !== 'production') return;

      const projectRoot = resolve(import.meta.dirname!, '..');
      const distDir = resolve(projectRoot, 'dist');
      const outDir = resolve(distDir, 'pack');

      mkdirSync(outDir, { recursive: true });

      const ctx: BuildContext = {
        config: resolved,
        projectRoot,
        distDir,
        outDir,
      };

      // Allow CI to override targets via env var (e.g. SPINDLE_PACK_TARGETS=windows)
      const envTargets = process.env.SPINDLE_PACK_TARGETS;
      const targets: Target[] = envTargets
        ? (envTargets.split(',') as Target[])
        : resolved.targets;

      for (const target of targets) {
        try {
          await buildTarget(target, ctx);
        } catch (err) {
          console.error(`[spindle-pack] Failed to build target '${target}':`, err);
          throw err;
        }
      }
    },
  };
}

async function buildTarget(target: Target, ctx: BuildContext): Promise<void> {
  switch (target) {
    case 'joiplay':
      await buildJoiPlay(ctx);
      break;

    case 'windows':
    case 'macos':
    case 'linux': {
      // Use a variable so bundlers don't try to resolve the not-yet-created file
      const mod = './scripts/build-tauri.js';
      const { buildTauri } = await import(mod);
      await buildTauri(target, ctx);
      break;
    }

    case 'android': {
      // Use a variable so bundlers don't try to resolve the not-yet-created file
      const mod = './scripts/build-capacitor.js';
      const { buildCapacitor } = await import(mod);
      await buildCapacitor(ctx);
      break;
    }
  }
}
