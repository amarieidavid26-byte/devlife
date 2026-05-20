import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        proxy: {
            '/ws': {
                target: 'ws://localhost:8000',
                ws: true
            }
        }
    },
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: false,
        // esbuild minify is much lighter/faster than terser on the large Monaco bundle
        minify: 'esbuild',
        chunkSizeWarningLimit: 6000,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('monaco-editor')) return 'monaco';
                    if (id.includes('@xterm')) return 'xterm';
                    if (id.includes('pixi.js')) return 'pixi';
                },
            },
        },
    },
});
