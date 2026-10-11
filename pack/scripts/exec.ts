import { execFileSync, execSync } from 'child_process';

/**
 * Run `npx` with the arguments passed through verbatim (no shell on POSIX, so
 * `$`, quotes and spaces in paths or titles mean nothing special).
 *
 * On Windows npx is a .cmd shim, which Node refuses to start without a shell,
 * so there every argument is double-quoted for cmd.exe instead. `$` has no
 * meaning to cmd.exe; embedded quotes are doubled.
 */
export function npx(args: string[], cwd: string): void {
  if (process.platform === 'win32') {
    const quoted = args.map((a) => `"${a.replace(/"/g, '""')}"`);
    execSync(['npx', ...quoted].join(' '), { cwd, stdio: 'inherit' });
  } else {
    execFileSync('npx', args, { cwd, stdio: 'inherit' });
  }
}
