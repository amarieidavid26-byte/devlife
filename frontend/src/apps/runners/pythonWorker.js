// loads Pyodide and runs user Python in a dedicated worker
// stdout/stderr redirected to io.StringIO; stdin fed from user input

importScripts('/lib/pyodide/pyodide.js');

let pyodideReady = null;

function init() {
    if (pyodideReady) return pyodideReady;
    pyodideReady = loadPyodide({ indexURL: '/lib/pyodide/' }).then((py) => {
        // pre-import once so first run is faster
        py.runPython('import io, sys, traceback');
        return py;
    });
    return pyodideReady;
}

self.onmessage = async (e) => {
    const { type, code, stdin } = e.data;

    if (type === 'preload') {
        try {
            await init();
            self.postMessage({ type: 'ready' });
        } catch (err) {
            self.postMessage({
                type: 'preload_error',
                error: (err && err.message) ? err.message : String(err),
            });
        }
        return;
    }

    if (type === 'run') {
        const t0 = performance.now();
        try {
            const pyodide = await init();

            pyodide.runPython(`
_stdout_buf = io.StringIO()
_stderr_buf = io.StringIO()
sys.stdout = _stdout_buf
sys.stderr = _stderr_buf
`);
            pyodide.globals.set('_stdin_value', stdin || '');
            pyodide.runPython('sys.stdin = io.StringIO(_stdin_value)');

            let exit = 0;
            try {
                await pyodide.runPythonAsync(code);
            } catch (err) {
                exit = 1;
                const msg = (err && err.message) ? err.message : String(err);
                pyodide.globals.set('_runtime_err', msg);
                pyodide.runPython('_stderr_buf.write(_runtime_err)');
            }

            const stdout = pyodide.runPython('_stdout_buf.getvalue()');
            const stderr = pyodide.runPython('_stderr_buf.getvalue()');

            self.postMessage({
                type: 'result',
                stdout,
                stderr,
                exit,
                ms: Math.round(performance.now() - t0),
            });
        } catch (err) {
            self.postMessage({
                type: 'result',
                stdout: '',
                stderr: (err && err.stack) ? err.stack : String(err),
                exit: 1,
                ms: Math.round(performance.now() - t0),
            });
        }
    }
};
