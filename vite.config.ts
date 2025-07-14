import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: './', // Required for Capacitor
      publicDir: 'public',
      assetsInclude: ['**/*.wav', '**/*.mp3', '**/*.json'],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      server: {
        host: true, // Listen on all network interfaces
        port: 3000, // Default port, change if needed
        strictPort: true
      },
      build: {
        outDir: 'dist',
        assetsDir: './', // Put assets in the root of the build directory
        emptyOutDir: true
      }
    };
});
