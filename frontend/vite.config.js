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
    optimizeDeps: {
        // Pre-bundle the heavy deps up front. Otherwise Vite can discover one lazily mid-session
        // (e.g. the first time the code editor or terminal opens), re-optimize, and push a FULL
        // page reload to EVERY open tab -- which silently kills the live Web Bluetooth (BLE) link,
        // since a Web Bluetooth connection only lives as long as the page. This is the most likely
        // cause of being "refreshed off the page" during a session. Dev-only: the production build
        // bundles everything ahead of time and never does this.
        include: ['pixi.js', 'monaco-editor', '@xterm/xterm', '@xterm/addon-fit', 'howler'],
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
