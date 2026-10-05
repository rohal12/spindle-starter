import type { CapacitorConfig } from '@capacitor/cli';

// SPINDLE_* env vars are set by pack/scripts/build-capacitor.ts
const config: CapacitorConfig = {
  appId: process.env.SPINDLE_APP_ID ?? 'com.example.spindle_story',
  appName: process.env.SPINDLE_APP_NAME ?? 'Spindle Story',
  webDir: 'web-assets',
  server: {
    androidScheme: 'http',
  },
};

export default config;
