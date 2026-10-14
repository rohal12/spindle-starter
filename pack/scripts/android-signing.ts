import { statSync } from 'fs';
import { resolve } from 'path';

interface AndroidSigning {
  path: string;
  password: string;
  alias: string;
  keyPassword: string;
}

/** Validate before any native build work; partial signing must never become debug. */
export function androidSigning(env: NodeJS.ProcessEnv): AndroidSigning | null {
  const path = env.SPINDLE_KEYSTORE_PATH;
  const password = env.SPINDLE_KEYSTORE_PASSWORD;
  const configured = [path, password, env.SPINDLE_KEY_ALIAS, env.SPINDLE_KEY_PASSWORD].some(Boolean);
  if (!configured && env.SPINDLE_ANDROID_RELEASE !== '1') return null;

  if (!path || !password) {
    throw new Error(
      '[spindle-pack] Android signing requires both SPINDLE_KEYSTORE_PATH and ' +
      'SPINDLE_KEYSTORE_PASSWORD. Release builds cannot fall back to a debug key.'
    );
  }

  const absolutePath = resolve(path);
  let isFile = false;
  try {
    isFile = statSync(absolutePath).isFile();
  } catch {
    // Report the setting rather than credentials or secret values.
  }
  if (!isFile) {
    throw new Error('[spindle-pack] SPINDLE_KEYSTORE_PATH must point to an existing keystore file.');
  }

  return {
    path: absolutePath,
    password,
    alias: env.SPINDLE_KEY_ALIAS || 'release',
    keyPassword: env.SPINDLE_KEY_PASSWORD || password,
  };
}
