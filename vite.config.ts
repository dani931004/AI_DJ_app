import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    // Load env variables based on the current mode
    const env = loadEnv(mode, process.cwd(), '');
    
    // Expose env variables to the client
    const envWithProcessPrefix = {
        'process.env': `(${JSON.stringify(env)})`
    };
    
    return {
        base: '/AI_DJ_app/',
        define: envWithProcessPrefix,
        resolve: {
            alias: {
                '@': path.resolve(__dirname, '.'),
            }
        },
        // Server configuration for development
        server: {
            port: 3000,
            open: true
        },
        // Build configuration
        build: {
            outDir: 'dist',
            assetsDir: 'assets',
            sourcemap: mode !== 'production',
        }
    };
});
