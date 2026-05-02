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
        minify: 'terser'
    }
});
