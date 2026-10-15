import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';

/**
 * Run `npx` with the arguments passed through verbatim (no shell on POSIX, so
 * `$`, quotes and spaces in paths or titles mean nothing special).
 *
 * On Windows bypass the .cmd shim and run npm's npx CLI through Node. Quoting
 * cmd.exe arguments cannot prevent expansion of literal %VARIABLE% filenames.
 */
export function npx(args: string[], cwd: string): void {
  if (process.platform === 'win32') {
    const candidates = [
      ...(process.env.npm_execpath ? [join(dirname(process.env.npm_execpath), 'npx-cli.js')] : []),
      join(dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js'),
      ...(process.env.APPDATA ? [join(process.env.APPDATA, 'npm/node_modules/npm/bin/npx-cli.js')] : []),
    ];
    const cli = candidates.find((path) => existsSync(path));
    if (!cli) throw new Error('[spindle-pack] Could not locate npm\'s npx-cli.js. Run the build with npm run build.');
    execFileSync(process.execPath, [cli, ...args], { cwd, stdio: 'inherit' });
  } else {
    execFileSync('npx', args, { cwd, stdio: 'inherit' });
  }
}
