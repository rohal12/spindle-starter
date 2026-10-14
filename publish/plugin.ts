import { execFileSync } from 'child_process';
import type { Plugin } from 'vite';

export type PublishTarget = 'pages' | 'itch';

const PUBLISH_TARGETS: readonly PublishTarget[] = ['pages', 'itch'];

export interface ItchConfig {
  /** itch.io username (or set ITCH_USER env var) */
  user?: string;
  /** itch.io game/project name (or set ITCH_GAME env var) */
  game?: string;
  /** Butler channel (or set ITCH_CHANNEL env var, default: 'html5') */
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

    // Run after the story compiler has written dist/index.html
    closeBundle: {
      order: 'post',
      sequential: true,
      async handler() {
        const envTargets = process.env.SPINDLE_PUBLISH;
        if (!envTargets) return;

        for (const target of parseTargets(envTargets)) {
          switch (target) {
            case 'pages':
              deployPages();
              break;
            case 'itch':
              deployItch(config.itch);
              break;
          }
        }
      },
    },
  };
}

function parseTargets(value: string): PublishTarget[] {
  const targets = value.split(',').map((t) => t.trim()).filter(Boolean);
  for (const target of targets) {
    if (!PUBLISH_TARGETS.includes(target as PublishTarget)) {
      throw new Error(
        `[spindle-publish] Unknown target: ${target} (expected one of: ${PUBLISH_TARGETS.join(', ')})`
      );
    }
  }
  return targets as PublishTarget[];
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function deployPages(): void {
  try {
    execFileSync('gh', ['--version'], { stdio: 'ignore' });
  } catch {
    throw new Error(
      '[spindle-publish] GitHub CLI (gh) is required. Install from https://cli.github.com'
    );
  }

  // The workflow builds from GitHub, not from this machine, so local changes
  // that haven't been pushed would silently be left out of the deployment.
  if (git('status', '--porcelain')) {
    throw new Error(
      '[spindle-publish] You have uncommitted changes. Commit and push them before publishing to GitHub Pages.'
    );
  }

  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  let unpushed: string;
  try {
    unpushed = git('rev-list', '--count', '@{upstream}..HEAD');
  } catch {
    throw new Error(
      `[spindle-publish] Branch '${branch}' has no upstream. Push it before publishing to GitHub Pages.`
    );
  }
  if (unpushed !== '0') {
    throw new Error(
      `[spindle-publish] Branch '${branch}' has ${unpushed} unpushed commit(s). Push them before publishing to GitHub Pages.`
    );
  }

  // Dispatch to the repository the branch was just checked against. Without
  // --repo, gh picks its own default, which in a fork checkout can be the
  // upstream (template) repository instead of the project.
  const repo = upstreamRepository(branch);
  const mergeRef = git('config', '--get', `branch.${branch}.merge`);
  if (!mergeRef.startsWith('refs/heads/')) {
    throw new Error('[spindle-publish] The upstream must be a remote branch to deploy GitHub Pages.');
  }
  const remoteBranch = mergeRef.slice('refs/heads/'.length);

  console.log(`[spindle-publish] Triggering GitHub Pages deployment of ${repo} from '${remoteBranch}'...`);
  execFileSync('gh', ['workflow', 'run', 'deploy-pages.yml', '--repo', repo, '--ref', remoteBranch], {
    stdio: 'inherit',
  });
  console.log(
    `[spindle-publish] Deployment triggered. Check status with: gh run list --repo ${repo} --workflow=deploy-pages.yml`
  );
}

/** "owner/name" of the GitHub repository behind the remote that `branch` tracks. */
function upstreamRepository(branch: string): string {
  const remote = git('config', '--get', `branch.${branch}.remote`);
  const url = git('remote', 'get-url', remote);
  const repo = parseGitHubRepository(url);
  if (!repo) {
    throw new Error(
      `[spindle-publish] Remote '${remote}' (${url}) is not a GitHub repository, so GitHub Pages cannot be deployed to it.`
    );
  }
  return repo;
}

/** Accepts https://github.com/o/r(.git), git@github.com:o/r(.git) and ssh://git@github.com/o/r(.git). */
export function parseGitHubRepository(url: string): string | null {
  const match = url.trim().match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

function deployItch(config?: ItchConfig): void {
  const user = config?.user ?? process.env.ITCH_USER;
  const game = config?.game ?? process.env.ITCH_GAME;
  const channel = config?.channel ?? process.env.ITCH_CHANNEL ?? 'html5';

  if (!user || !game) {
    throw new Error(
      '[spindle-publish] itch.io username and game name are required.\n' +
        'Set ITCH_USER/ITCH_GAME env vars or pass itch: { user, game } in plugin config.'
    );
  }

  try {
    execFileSync('butler', ['--version'], { stdio: 'ignore' });
  } catch {
    throw new Error(
      '[spindle-publish] butler is required. Install from https://itch.io/docs/butler/'
    );
  }

  const target = `${user}/${game}:${channel}`;
  console.log(`[spindle-publish] Pushing to itch.io: ${target}`);
  // Exclude pack/ output (desktop/Android/JoiPlay builds) from the web upload
  execFileSync('butler', ['push', 'dist/', target, '--ignore', 'pack'], { stdio: 'inherit' });
  console.log(`[spindle-publish] Published to https://${user}.itch.io/${game}`);
}
