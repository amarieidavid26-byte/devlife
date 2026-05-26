import { defineConfig } from 'vite';

export default defineConfig({
    // read the project-root .env so VITE_* vars live next to the backend ones
    envDir: '..',
    server: {
        // listen on all interfaces so the game is reachable on BOTH
        // http://127.0.0.1:5173 (required — Spotify rejects `localhost` redirect URIs)
        // and http://localhost:5173. Default Vite binds only one of them.
        host: true,
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
