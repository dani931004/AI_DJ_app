/// <reference types="@capacitor/cli" />

declare const process: {
  env: {
    KEYSTORE_PASSWORD?: string;
    KEY_PASSWORD?: string;
  };
};

type CapacitorConfig = import('@capacitor/cli').CapacitorConfig;

const config: CapacitorConfig = {
  appId: 'com.promptdj.midi',
  appName: 'PromptDJ MIDI',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    buildOptions: {
      keystorePath: 'release.keystore',
      keystoreAlias: 'release',
      keystorePassword: process.env.KEYSTORE_PASSWORD || '',
      keystoreAliasPassword: process.env.KEY_PASSWORD || '',
    },
    webContentsDebuggingEnabled: true,
    captureInput: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: '#000000',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
      layoutName: 'launch_screen',
      useDialog: true,
    }
  }
};

export default config;
