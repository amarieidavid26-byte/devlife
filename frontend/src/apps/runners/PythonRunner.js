import { i18n } from '../../i18n/index.js';

const TIMEOUT_MS = 5000;

export class PythonRunner {
    constructor() {
        this.worker = null;
        this.pendingResolve = null;
        this.timeoutId = null;
        this._startedAt = 0;
        this._readyPromise = null;
        this._loadError = null;
    }

    static instance = null;
    static get() {
        if (!PythonRunner.instance) PythonRunner.instance = new PythonRunner();
        return PythonRunner.instance;
    }

    preload() {
        if (this._readyPromise) return this._readyPromise;
        this._ensureWorker();

        this._readyPromise = new Promise((resolve, reject) => {
            const handler = (e) => {
                if (!e.data) return;
                if (e.data.type === 'ready') {
                    this.worker.removeEventListener('message', handler);
                    resolve();
                } else if (e.data.type === 'preload_error') {
                    this.worker.removeEventListener('message', handler);
                    this._loadError = e.data.error;
                    reject(new Error(e.data.error));
                }
            };
            this.worker.addEventListener('message', handler);
            // worker may also fail with onerror (e.g. pyodide.js 404)
            const errHandler = (err) => {
                this.worker.removeEventListener('error', errHandler);
                this._loadError = err.message || 'Failed to load Pyodide';
                reject(new Error(this._loadError));
            };
            this.worker.addEventListener('error', errHandler);
            this.worker.postMessage({ type: 'preload' });
        });
        return this._readyPromise;
    }

    isReady() {
        // best-effort: only true after preload promise has resolved
        return !!this._readyPromise && !this._loadError;
    }

    async run(code, stdin) {
        try {
            await this.preload();
        } catch (err) {
            return {
                stdout: '',
                stderr: i18n.t('runner.pyodide_unavailable', { msg: err.message }),
                exit: 1,
                ms: 0,
            };
        }

        return new Promise((resolve) => {
            this.pendingResolve = resolve;
            this._startedAt = performance.now();

            this.timeoutId = setTimeout(() => {
                this._terminate();
                this._settle({
                    stdout: '',
                    stderr: i18n.t('runner.timeout'),
                    exit: 124,
                    ms: TIMEOUT_MS,
                });
            }, TIMEOUT_MS);

            this.worker.onmessage = (e) => {
                if (e.data && e.data.type === 'result') {
                    clearTimeout(this.timeoutId);
                    this._settle({
                        stdout: e.data.stdout || '',
                        stderr: e.data.stderr || '',
                        exit: e.data.exit,
                        ms: e.data.ms,
                    });
                }
            };

            this.worker.onerror = (e) => {
                clearTimeout(this.timeoutId);
                this._settle({
                    stdout: '',
                    stderr: e.message || i18n.t('runner.worker_error'),
                    exit: 1,
                    ms: Math.round(performance.now() - this._startedAt),
                });
            };

            this.worker.postMessage({ type: 'run', code, stdin: stdin || '' });
        });
    }

    stop() {
        if (!this.worker) return;
        clearTimeout(this.timeoutId);
        this._terminate();
        this._settle({
            stdout: '',
            stderr: i18n.t('runner.interrupted'),
            exit: 130,
            ms: Math.round(performance.now() - this._startedAt),
        });
    }

    _ensureWorker() {
        if (this.worker) return;
        this.worker = new Worker(new URL('./pythonWorker.js', import.meta.url));
    }

    _terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            this._readyPromise = null;
            this._loadError = null;
        }
    }

    _settle(result) {
        if (this.pendingResolve) {
            const r = this.pendingResolve;
            this.pendingResolve = null;
            r(result);
        }
    }
}
