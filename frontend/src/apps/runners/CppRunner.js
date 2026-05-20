import { i18n } from '../../i18n/index.js';

const TIMEOUT_MS = 5000;

export class CppRunner {
    static instance = null;
    static get() {
        if (!CppRunner.instance) CppRunner.instance = new CppRunner();
        return CppRunner.instance;
    }

    constructor() {
        this.worker = null;
        this.pendingResolve = null;
        this.timeoutId = null;
        this._startedAt = 0;
    }

    run(code, stdin) {
        return new Promise((resolve) => {
            this._ensureWorker();
            this.pendingResolve = resolve;
            this._startedAt = performance.now();

            // JSCPP enforces maxTimeout=5000 internally; the outer guard catches a stuck worker.
            this.timeoutId = setTimeout(() => {
                this._terminate();
                this._settle({
                    stdout: '',
                    stderr: i18n.t('runner.timeout'),
                    exit: 124,
                    ms: TIMEOUT_MS,
                });
            }, TIMEOUT_MS + 1000);

            this.worker.onmessage = (e) => {
                clearTimeout(this.timeoutId);
                this._settle(e.data);
            };

            this.worker.onerror = (e) => {
                clearTimeout(this.timeoutId);
                this._settle({
                    stdout: '',
                    stderr: e.message || 'Worker error',
                    exit: 1,
                    ms: Math.round(performance.now() - this._startedAt),
                });
            };

            this.worker.postMessage({ code, stdin: stdin || '' });
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
        // module worker so Vite can bundle the JSCPP ES import
        this.worker = new Worker(new URL('./cppWorker.js', import.meta.url), { type: 'module' });
    }

    _terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
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
