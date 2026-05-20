// Focused LSP client: connects Monaco to pyright / typescript-language-server (via the
// backend /lsp bridge) for real diagnostics, completion and hover. Hand-rolled JSON-RPC
// over WebSocket — avoids the heavy @codingame vscode-services migration while still
// giving genuine language intelligence. (Go-to-definition across files would need a
// custom editor opener; not included.)
import { privilegedWsUrl, getFeatures, getWorkspaceRoot } from '../../network/session.js';

function mapLang(monacoLangId) {
    if (monacoLangId === 'python') return 'python';
    if (monacoLangId === 'typescript' || monacoLangId === 'javascript') return 'typescript';
    return null;
}

function lspSeverityToMonaco(monaco, sev) {
    switch (sev) {
        case 1: return monaco.MarkerSeverity.Error;
        case 2: return monaco.MarkerSeverity.Warning;
        case 3: return monaco.MarkerSeverity.Info;
        default: return monaco.MarkerSeverity.Hint;
    }
}

// LSP CompletionItemKind (1..25) -> Monaco CompletionItemKind
function lspKindToMonaco(monaco, kind) {
    const K = monaco.languages.CompletionItemKind;
    const map = {
        1: K.Text, 2: K.Method, 3: K.Function, 4: K.Constructor, 5: K.Field, 6: K.Variable,
        7: K.Class, 8: K.Interface, 9: K.Module, 10: K.Property, 11: K.Unit, 12: K.Value,
        13: K.Enum, 14: K.Keyword, 15: K.Snippet, 16: K.Color, 17: K.File, 18: K.Reference,
        19: K.Folder, 20: K.EnumMember, 21: K.Constant, 22: K.Struct, 23: K.Event,
        24: K.Operator, 25: K.TypeParameter,
    };
    return map[kind] || K.Text;
}

function hoverContentsToMarkdown(contents) {
    if (!contents) return [];
    const toStr = (c) => (typeof c === 'string' ? c : (c && c.value) ? c.value : '');
    if (Array.isArray(contents)) return contents.map(c => ({ value: toStr(c) })).filter(x => x.value);
    if (typeof contents === 'object' && contents.kind) return [{ value: contents.value || '' }];
    return [{ value: toStr(contents) }];
}

class LspConnection {
    constructor(monaco, serverLang) {
        this.monaco = monaco;
        this.serverLang = serverLang;
        this.ws = null;
        this.seq = 1;
        this.pending = new Map();
        this.openDocs = new Map(); // uri -> version
        this.ready = false;
        this._readyResolve = null;
        this._readyPromise = new Promise(r => { this._readyResolve = r; });
    }

    connect() {
        try { this.ws = new WebSocket(privilegedWsUrl('/lsp/' + this.serverLang)); }
        catch (_) { return; }
        this.ws.onopen = () => this._initialize();
        this.ws.onmessage = (e) => this._onMessage(e.data);
        this.ws.onclose = () => { this.ready = false; };
        this.ws.onerror = () => {};
    }

    whenReady() { return this._readyPromise; }

    _send(obj) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj)); }
    _notify(method, params) { this._send({ jsonrpc: '2.0', method, params }); }
    _request(method, params) {
        const id = this.seq++;
        this._send({ jsonrpc: '2.0', id, method, params });
        return new Promise((resolve) => this.pending.set(id, resolve));
    }

    async _initialize() {
        const root = getWorkspaceRoot();
        const rootUri = root ? this.monaco.Uri.file(root).toString() : null;
        await this._request('initialize', {
            processId: null,
            rootUri,
            workspaceFolders: rootUri ? [{ uri: rootUri, name: 'workspace' }] : null,
            capabilities: {
                textDocument: {
                    synchronization: { dynamicRegistration: false },
                    completion: { completionItem: { snippetSupport: false, documentationFormat: ['markdown', 'plaintext'] } },
                    hover: { contentFormat: ['markdown', 'plaintext'] },
                    publishDiagnostics: {},
                },
                workspace: { configuration: true, workspaceFolders: true },
            },
        });
        this._notify('initialized', {});
        this.ready = true;
        this._readyResolve();
    }

    _onMessage(text) {
        let msg;
        try { msg = JSON.parse(text); } catch (_) { return; }

        // response to one of our requests
        if (msg.id !== undefined && msg.method === undefined) {
            const resolve = this.pending.get(msg.id);
            if (resolve) { this.pending.delete(msg.id); resolve(msg.error ? null : msg.result); }
            return;
        }
        // server -> client request: must reply or the server stalls
        if (msg.id !== undefined && msg.method) {
            let result = null;
            if (msg.method === 'workspace/configuration' && msg.params && Array.isArray(msg.params.items)) {
                result = msg.params.items.map(() => ({}));
            }
            this._send({ jsonrpc: '2.0', id: msg.id, result });
            return;
        }
        // notification
        if (msg.method === 'textDocument/publishDiagnostics') this._applyDiagnostics(msg.params);
    }

    _applyDiagnostics(params) {
        const model = this.monaco.editor.getModels().find(m => m.uri.toString() === params.uri);
        if (!model) return;
        const markers = (params.diagnostics || []).map(d => ({
            severity: lspSeverityToMonaco(this.monaco, d.severity),
            message: d.message,
            source: d.source,
            startLineNumber: d.range.start.line + 1,
            startColumn: d.range.start.character + 1,
            endLineNumber: d.range.end.line + 1,
            endColumn: d.range.end.character + 1,
        }));
        this.monaco.editor.setModelMarkers(model, 'lsp', markers);
    }

    didOpen(model) {
        const uri = model.uri.toString();
        if (this.openDocs.has(uri)) return;
        this.openDocs.set(uri, 1);
        this._notify('textDocument/didOpen', {
            textDocument: { uri, languageId: model.getLanguageId(), version: 1, text: model.getValue() },
        });
    }

    didChange(model) {
        const uri = model.uri.toString();
        if (!this.openDocs.has(uri)) { this.didOpen(model); return; }
        const version = this.openDocs.get(uri) + 1;
        this.openDocs.set(uri, version);
        this._notify('textDocument/didChange', {
            textDocument: { uri, version },
            contentChanges: [{ text: model.getValue() }],
        });
    }

    async completion(model, position) {
        if (!this.ready) return null;
        return this._request('textDocument/completion', {
            textDocument: { uri: model.uri.toString() },
            position: { line: position.lineNumber - 1, character: position.column - 1 },
        });
    }

    async hover(model, position) {
        if (!this.ready) return null;
        return this._request('textDocument/hover', {
            textDocument: { uri: model.uri.toString() },
            position: { line: position.lineNumber - 1, character: position.column - 1 },
        });
    }

    close() { try { this.ws && this.ws.close(); } catch (_) {} }
}

export class LspManager {
    constructor(monaco) {
        this.monaco = monaco;
        this.conns = new Map(); // serverLang -> LspConnection
        this._registered = false;
    }

    _connFor(monacoLangId) {
        const serverLang = mapLang(monacoLangId);
        if (!serverLang) return null;
        if (!this.conns.has(serverLang)) {
            const c = new LspConnection(this.monaco, serverLang);
            c.connect();
            this.conns.set(serverLang, c);
        }
        return this.conns.get(serverLang);
    }

    async onModelOpen(model) {
        if (!getFeatures().lsp) return;
        const c = this._connFor(model.getLanguageId());
        if (!c) return;
        await c.whenReady();
        c.didOpen(model);
    }

    onModelChange(model) {
        if (!getFeatures().lsp) return;
        const c = this.conns.get(mapLang(model.getLanguageId()));
        if (c && c.ready) c.didChange(model);
    }

    registerProviders() {
        if (this._registered || !getFeatures().lsp) return;
        this._registered = true;
        const monaco = this.monaco;

        const completionProvider = {
            triggerCharacters: ['.'],
            provideCompletionItems: async (model, position) => {
                const c = this.conns.get(mapLang(model.getLanguageId()));
                if (!c) return { suggestions: [] };
                const res = await c.completion(model, position);
                const items = Array.isArray(res) ? res : (res && res.items) || [];
                const word = model.getWordUntilPosition(position);
                const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
                return {
                    suggestions: items.slice(0, 200).map(it => ({
                        label: it.label,
                        kind: lspKindToMonaco(monaco, it.kind),
                        insertText: it.insertText || it.label,
                        detail: it.detail,
                        documentation: it.documentation && (it.documentation.value || it.documentation),
                        sortText: it.sortText,
                        range,
                    })),
                };
            },
        };

        const hoverProvider = {
            provideHover: async (model, position) => {
                const c = this.conns.get(mapLang(model.getLanguageId()));
                if (!c) return null;
                const res = await c.hover(model, position);
                if (!res || !res.contents) return null;
                return { contents: hoverContentsToMarkdown(res.contents) };
            },
        };

        for (const lang of ['python', 'javascript', 'typescript']) {
            monaco.languages.registerCompletionItemProvider(lang, completionProvider);
            monaco.languages.registerHoverProvider(lang, hoverProvider);
        }
    }

    dispose() {
        for (const c of this.conns.values()) c.close();
        this.conns.clear();
    }
}
