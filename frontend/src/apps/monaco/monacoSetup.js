// Bundled Monaco (ESM) — replaces the old CDN/AMD loader so the editor works offline
// and can be wired to inline AI + LSP later. Vite's ?worker imports build the language
// workers as separate chunks; MonacoEnvironment routes each language to its worker.
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

let _inited = false;

export function initMonaco() {
    if (!_inited) {
        self.MonacoEnvironment = {
            getWorker(_workerId, label) {
                if (label === 'json') return new jsonWorker();
                if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
                if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
                if (label === 'typescript' || label === 'javascript') return new tsWorker();
                return new editorWorker();
            },
        };
        _inited = true;
    }
    return monaco;
}

export { monaco };
