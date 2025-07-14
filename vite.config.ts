import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const isProduction = mode === 'production';
    
    return {
      base: isProduction ? './' : '/',
      publicDir: 'public',
      assetsInclude: ['**/*.wav', '**/*.mp3', '**/*.json'],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      server: {
        host: true,
        port: 3000,
        strictPort: true
      },
      build: {
        outDir: 'dist',
        assetsDir: 'assets',
        emptyOutDir: true,
        sourcemap: isProduction ? false : 'inline',
        minify: isProduction ? 'esbuild' : false,
        rollupOptions: {
          output: {
            entryFileNames: 'assets/[name].[hash].js',
            chunkFileNames: 'assets/[name].[hash].js',
            assetFileNames: 'assets/[name].[hash][extname]',
            manualChunks: undefined
          }
        },
        // Ensure proper chunking for better performance
        chunkSizeWarningLimit: 1000,
        // Ensure proper handling of dynamic imports
        commonjsOptions: {
          transformMixedEsModules: true
        }
      }
    };
});
