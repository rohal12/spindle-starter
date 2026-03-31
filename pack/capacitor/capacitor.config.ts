import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.spindle_story',
  appName: 'Spindle Story',
  webDir: 'web-assets',
  server: {
    androidScheme: 'http',
  },
};

export default config;
