import { i18n } from '../../i18n/index.js';

const TIMEOUT_MS = 5000;

export class JsRunner {
    constructor() {
        this.worker = null;
        this.timeoutId = null;
        this.pendingResolve = null;
        this._startedAt = 0;
    }

    run(code, stdin) {
        return new Promise((resolve) => {
            this._ensureWorker();
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
        this.worker = new Worker(new URL('./jsWorker.js', import.meta.url));
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
