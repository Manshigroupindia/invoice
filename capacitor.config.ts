import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.manshigroup.manshiinvoice',
  appName: 'Manshi Invoice',
  webDir: 'dist',
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      style: 'LIGHT',
      hidden: false
    },
    CapacitorUpdater: {
      appId: 'in.manshigroup.manshiinvoice'
    }
  }
};

export default config;
