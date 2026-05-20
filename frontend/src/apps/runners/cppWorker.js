// runs C/C++ source via JSCPP, a pure-JS interpreter
// supports cin/cout/printf, basic STL containers, classes, pointers
// stdin is drained once by JSCPP when it needs input
import JSCPP from 'JSCPP';

self.onmessage = (e) => {
    const { code, stdin } = e.data;
    const t0 = performance.now();
    const stdoutChunks = [];
    let exit = 0;
    let stderr = '';

    const config = {
        stdio: {
            write: (s) => stdoutChunks.push(String(s)),
        },
        unsigned_overflow: 'warn',
        maxTimeout: 5000,
    };

    try {
        const ret = JSCPP.run(code, stdin || '', config);
        if (typeof ret === 'number') exit = ret;
    } catch (err) {
        exit = 1;
        stderr = (err && err.message) ? err.message : String(err);
    }

    self.postMessage({
        stdout: stdoutChunks.join(''),
        stderr,
        exit,
        ms: Math.round(performance.now() - t0),
    });
};
