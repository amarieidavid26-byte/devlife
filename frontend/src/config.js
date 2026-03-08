export const CONFIG = {
    // In production, connect to deployed backend. In dev, use localhost.
    WS_URL: import.meta.env.PROD
        ? 'wss://devlife-rog-backend.up.railway.app/ws'
        : 'ws://localhost:8000/ws',
    BACKEND_URL: import.meta.env.PROD
        ? 'https://devlife-rog-backend.up.railway.app'
        : 'http://localhost:8000',
    IS_PROD: import.meta.env.PROD,
    // If backend is unreachable, game should still work in demo mode
    OFFLINE_FALLBACK: true,
};
