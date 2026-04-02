import { execSync } from 'child_process';
import type { Plugin } from 'vite';

export type PublishTarget = 'pages' | 'itch';

export interface ItchConfig {
  /** itch.io username (or set ITCH_USER env var) */
  user?: string;
  /** itch.io game/project name (or set ITCH_GAME env var) */
  game?: string;
  /** Butler channel (default: 'html5') */
  channel?: string;
}

export interface SpindlePublishConfig {
  /** itch.io configuration (required if 'itch' target is used) */
  itch?: ItchConfig;
}

export function spindlePublish(config: SpindlePublishConfig = {}): Plugin {
  return {
    name: 'vite-plugin-spindle-publish',
    apply: 'build',

    async closeBundle() {
      const envTargets = process.env.SPINDLE_PUBLISH;
      if (!envTargets) return;

      const targets = envTargets.split(',') as PublishTarget[];

      for (const target of targets) {
        switch (target) {
          case 'pages':
            deployPages();
            break;
          case 'itch':
            deployItch(config.itch);
            break;
          default:
            throw new Error(`[spindle-publish] Unknown target: ${target}`);
        }
      }
    },
  };
}

function deployPages(): void {
  try {
    execSync('gh --version', { stdio: 'ignore' });
  } catch {
    throw new Error(
      '[spindle-publish] GitHub CLI (gh) is required. Install from https://cli.github.com'
    );
  }

  console.log('[spindle-publish] Triggering GitHub Pages deployment...');
  execSync('gh workflow run deploy-pages.yml', { stdio: 'inherit' });
  console.log(
    '[spindle-publish] Deployment triggered. Check status with: gh run list --workflow=deploy-pages.yml'
  );
}

function deployItch(config?: ItchConfig): void {
  const user = config?.user ?? process.env.ITCH_USER;
  const game = config?.game ?? process.env.ITCH_GAME;
  const channel = config?.channel ?? 'html5';

  if (!user || !game) {
    throw new Error(
      '[spindle-publish] itch.io username and game name are required.\n' +
        'Set ITCH_USER/ITCH_GAME env vars or pass itch: { user, game } in plugin config.'
    );
  }

  try {
    execSync('butler --version', { stdio: 'ignore' });
  } catch {
    throw new Error(
      '[spindle-publish] butler is required. Install from https://itch.io/docs/butler/'
    );
  }

  const target = `${user}/${game}:${channel}`;
  console.log(`[spindle-publish] Pushing to itch.io: ${target}`);
  execSync(`butler push dist/ ${target}`, { stdio: 'inherit' });
  console.log(`[spindle-publish] Published to https://${user}.itch.io/${game}`);
}
