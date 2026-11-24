import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vanta.app',
  appName: 'vanta-trade-ai',
  webDir: 'dist',
   server: {
    url: 'https://vanta.syncexc.com',
    cleartext: false
  }
};

export default config;
