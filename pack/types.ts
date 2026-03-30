export type Target = 'windows' | 'macos' | 'linux' | 'android' | 'joiplay';

export interface WindowConfig {
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
}

export interface SpindlePackConfig {
  /** Display name for the app (used in window title, binary name, APK label) */
  name: string;
  /** Reverse-domain identifier (e.g. 'com.author.mystory') */
  identifier: string;
  /** Path to source icon PNG (minimum 1024x1024) */
  icon: string;
  /** App version string */
  version: string;
  /** Which platforms to build */
  targets: Target[];
  /** Window dimensions for desktop builds */
  window?: WindowConfig;
}

export interface BuildContext {
  /** Resolved plugin config with defaults applied */
  config: Required<SpindlePackConfig>;
  /** Absolute path to the project root */
  projectRoot: string;
  /** Absolute path to the Vite output directory (dist/) */
  distDir: string;
  /** Absolute path to the pack output directory (dist/pack/) */
  outDir: string;
}
