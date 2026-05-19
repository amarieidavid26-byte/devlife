// runs user JavaScript in a dedicated worker context
// captures console.log/info/debug -> stdout, console.warn/error -> stderr
// supports `await` at the top level via AsyncFunction wrap

self.onmessage = async (e) => {
    const { code, stdin } = e.data;
    const stdoutChunks = [];
    const stderrChunks = [];
    const t0 = performance.now();

    const fmt = (args) => args.map(a => {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return a.stack || a.message;
        try { return JSON.stringify(a); } catch (_) { return String(a); }
    }).join(' ');

    console.log = (...args) => stdoutChunks.push(fmt(args));
    console.info = (...args) => stdoutChunks.push(fmt(args));
    console.debug = (...args) => stdoutChunks.push(fmt(args));
    console.warn = (...args) => stderrChunks.push(fmt(args));
    console.error = (...args) => stderrChunks.push(fmt(args));

    // python-flavored print alias
    self.print = (...args) => stdoutChunks.push(fmt(args));

    const reply = (exit, errStr) => {
        if (errStr) stderrChunks.push(errStr);
        self.postMessage({
            stdout: stdoutChunks.join('\n'),
            stderr: stderrChunks.join('\n'),
            exit,
            ms: Math.round(performance.now() - t0),
        });
    };

    try {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const fn = new AsyncFunction('stdin', code);
        const ret = await fn(stdin);
        if (ret !== undefined) stdoutChunks.push(fmt([ret]));
        reply(0, null);
    } catch (err) {
        reply(1, (err && err.stack) ? err.stack : String(err));
    }
};
