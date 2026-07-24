// DevLife Bridge: streams live editor context to the DevLife backend over the same WS protocol as the game;
// interventions surface as notifications, cognitive state in the status bar.
// privacy: keystrokes are sent as (interval, category) pairs only, never key contents
// (same contract as the game's KeystrokeCapture -- see keystroke_dynamics.py)

const vscode = require('vscode');
const WebSocket = require('ws');

const CONTENT_DEBOUNCE_MS = 1500;
const KEYSTROKE_FLUSH_MS = 5000;
const MAX_CONTENT_CHARS = 50000;
const RECONNECT_BASE_MS = 2000;
// content_update leaves the machine, so obvious secret files never stream
const SENSITIVE_FILE_RE = /(^|\/)(\.env[^/]*|[^/]*\.pem|id_rsa[^/]*|[^/]*credentials[^/]*|COMMIT_EDITMSG)$/i;

let ws = null;
let statusBar = null;
let contentTimer = null;
let keystrokeTimer = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let keystrokeBatch = [];
let lastKeyTime = 0;
let disposed = false;
let selfEdit = false;
let previewSeq = 0;
const previewDocs = new Map();

function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
    }
}

function apiBase() {
    const url = vscode.workspace.getConfiguration('devlife').get('backendUrl');
    return url.replace(/^ws/, 'http').replace(/\/ws\/?$/, '');
}

// same contract as the game's applyFixFlow.js: preview (validator) -> confirm -> apply,
// rollback via the audited endpoint; the edit itself is a WorkspaceEdit, so Cmd+Z also works
async function applyFixFlow(msg) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !msg.code_suggestion) {
        vscode.window.showWarningMessage('DevLife: no active editor to apply the fix to.');
        return;
    }
    const doc = editor.document;
    const originalText = doc.getText();
    const baseVersion = doc.version;
    if (originalText.length > 50000) {
        // the patch contract caps original_text at 50k; truncating would corrupt rollback
        vscode.window.showWarningMessage('DevLife: file too large for apply-fix (max 50k chars).');
        return;
    }
    if (doc.lineCount > 500) {
        // mirrors the server validator's MAX_LINES cap (apply_fix/validator.py)
        vscode.window.showWarningMessage('DevLife: apply-fix works on files up to 500 lines.');
        return;
    }

    let patchHash;
    try {
        const res = await fetch(apiBase() + '/api/apply-fix/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file: vscode.workspace.asRelativePath(doc.uri).slice(0, 500),
                language: doc.languageId,
                range: { start_line: 1, end_line: Math.max(1, doc.lineCount) },
                replacement_text: msg.code_suggestion,
                rationale: (msg.message || 'ghost suggestion').slice(0, 1000),
                severity: msg.priority === 'critical' ? 'critical' : 'medium',
                original_text: originalText,
            }),
        });
        const json = await res.json();
        if (!res.ok || !json.valid) {
            vscode.window.showWarningMessage('DevLife: fix rejected by validator' + (json.reason ? ': ' + json.reason : ''));
            return;
        }
        patchHash = json.patch_hash;
    } catch (e) {
        vscode.window.showWarningMessage('DevLife: backend unreachable, fix not applied.');
        return;
    }

    // side-by-side diff preview; the right side is a virtual doc so nothing touches disk
    const previewUri = vscode.Uri.from({
        scheme: 'devlife-fix',
        path: '/' + (++previewSeq) + '-' + doc.uri.path.split('/').pop(),
    });
    previewDocs.set(previewUri.toString(), msg.code_suggestion);
    await vscode.commands.executeCommand('vscode.diff', doc.uri, previewUri, 'DevLife: current ↔ proposed');
    const choice = await vscode.window.showInformationMessage('👻 ' + (msg.message || ''), 'Apply', 'Cancel');
    await closeDiffTab(previewUri);
    previewDocs.delete(previewUri.toString());
    if (choice !== 'Apply') {
        // close out the pending pre-image + audit trail server-side
        fetch(apiBase() + '/api/apply-fix/rollback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patch_hash: patchHash }),
        }).catch(() => {});
        vscode.window.setStatusBarMessage('DevLife: fix cancelled, nothing changed', 3000);
        return;
    }
    if (doc.version !== baseVersion) {
        // the validator approved the fix against a buffer that no longer exists
        fetch(apiBase() + '/api/apply-fix/rollback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patch_hash: patchHash }),
        }).catch(() => {});
        vscode.window.showWarningMessage('DevLife: file changed while previewing, fix not applied. Re-run it from a fresh intervention.');
        return;
    }

    fetch(apiBase() + '/api/apply-fix/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch_hash: patchHash }),
    }).catch(() => {});

    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, fullRange, msg.code_suggestion);
    selfEdit = true;
    const ok = await vscode.workspace.applyEdit(edit);
    selfEdit = false;
    if (!ok) {
        vscode.window.showWarningMessage('DevLife: could not apply the edit.');
        return;
    }
    send({ type: 'feedback', action: 'Apply Fix' });

    vscode.window.showInformationMessage('DevLife: fix applied.', 'Revert').then(async (c) => {
        if (c !== 'Revert') return;
        if (doc.getText() !== msg.code_suggestion) {
            // the notification can be answered long after; never wipe newer edits
            vscode.window.showWarningMessage('DevLife: buffer changed since the fix was applied, use Undo instead.');
            return;
        }
        let restored = originalText;
        try {
            const res = await fetch(apiBase() + '/api/apply-fix/rollback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patch_hash: patchHash }),
            });
            const json = await res.json();
            if (res.ok && json.original_text != null) restored = json.original_text;
        } catch (e) { /* fall back to the local pre-image */ }
        const range = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
        const revert = new vscode.WorkspaceEdit();
        revert.replace(doc.uri, range, restored);
        selfEdit = true;
        await vscode.workspace.applyEdit(revert);
        selfEdit = false;
    });
}

async function closeDiffTab(previewUri) {
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            if (tab.input instanceof vscode.TabInputTextDiff
                && tab.input.modified.toString() === previewUri.toString()) {
                await vscode.window.tabGroups.close(tab);
                return;
            }
        }
    }
}

function connect(context) {
    const url = vscode.workspace.getConfiguration('devlife').get('backendUrl');
    let sock;
    try {
        sock = new WebSocket(url);
    } catch (e) {
        scheduleReconnect(context);
        return;
    }
    ws = sock;

    // every handler checks it still belongs to the current socket, so a replaced
    // socket (DevLife: Reconnect) can neither duplicate messages nor re-schedule
    sock.on('open', () => {
        if (ws !== sock) return;
        reconnectAttempt = 0;
        statusBar.text = '$(pulse) DevLife: connected';
        statusBar.show();
    });

    sock.on('message', (raw) => {
        if (ws !== sock) return;
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch (e) { return; }

        if (msg.type === 'biometric_update') {
            const hr = msg.heartRate ? `$(heart) ${msg.heartRate}` : '$(pulse)';
            const typing = msg.typing && msg.typing.active ? ' $(keyboard)' : '';
            statusBar.text = `${hr} ${msg.state || ''}${typing}`;
            statusBar.tooltip = `DevLife -- stress ${msg.estimated_stress}/3.0, HRV ${msg.hrv}ms`;
        }

        if (msg.type === 'intervention') {
            const buttons = (msg.buttons || []).slice(0, 3);
            const show = msg.priority === 'critical'
                ? vscode.window.showErrorMessage
                : vscode.window.showInformationMessage;
            show(`👻 ${msg.message}`, ...buttons).then(async (choice) => {
                if (!choice) return;
                if (choice === 'Apply Fix' && msg.code_suggestion) { applyFixFlow(msg); return; }
                if (choice === 'Show More' && msg.code_suggestion) {
                    // the brain counts Show More as accepted, so show the code before reporting it
                    const preview = await vscode.workspace.openTextDocument({ content: msg.code_suggestion });
                    await vscode.window.showTextDocument(preview, { preview: true });
                }
                send({ type: 'feedback', action: choice });
            });
        }
    });

    sock.on('close', () => { if (ws === sock) scheduleReconnect(context); });
    sock.on('error', () => { /* close fires next; reconnect happens there */ });
}

function scheduleReconnect(context) {
    if (disposed || reconnectTimer) return;
    statusBar.text = '$(debug-disconnect) DevLife: offline';
    const delay = Math.min(30000, RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt++));
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect(context);
    }, delay);
}

function onDocChange(e) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || e.document !== editor.document) return;
    if (e.document.uri.scheme !== 'file' || SENSITIVE_FILE_RE.test(e.document.uri.path)) return;

    // keystroke rhythm (intervals + categories only, never contents);
    // our own WorkspaceEdits are programmatic, not typing, so they stay out of the rhythm
    if (!selfEdit) {
        const now = Date.now();
        for (const change of e.contentChanges) {
            let cat = null;
            if (change.text === '' && change.rangeLength > 0) cat = 'backspace';
            else if (change.text.includes('\n')) cat = 'enter';
            else if (change.text.length === 1) cat = 'char';
            if (!cat) continue;
            const iki = lastKeyTime ? Math.min(10000, now - lastKeyTime) : 0;
            lastKeyTime = now;
            if (keystrokeBatch.length < 300) keystrokeBatch.push([iki, cat]);
        }
    }

    // debounced content snapshot for the ghost's analyzer
    clearTimeout(contentTimer);
    contentTimer = setTimeout(() => {
        const doc = editor.document;
        send({
            type: 'content_update',
            app_type: 'code',
            content: doc.getText().slice(0, MAX_CONTENT_CHARS),
            language: doc.languageId,
            timestamp: new Date().toISOString(),
        });
    }, CONTENT_DEBOUNCE_MS);
}

function activate(context) {
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = '$(pulse) DevLife: connecting...';
    statusBar.show();
    context.subscriptions.push(statusBar);

    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(onDocChange));

    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('devlife-fix', {
        provideTextDocumentContent: (uri) => previewDocs.get(uri.toString()) || '',
    }));

    // an ignored notification never resolves, so the diff tab closing is the
    // last reliable moment to drop the stored suggestion
    context.subscriptions.push(vscode.window.tabGroups.onDidChangeTabs((e) => {
        for (const tab of e.closed) {
            if (tab.input instanceof vscode.TabInputTextDiff && tab.input.modified.scheme === 'devlife-fix') {
                previewDocs.delete(tab.input.modified.toString());
            }
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('devlife.reconnect', () => {
        if (ws) try { ws.close(); } catch (e) { /* already closed */ }
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
        reconnectAttempt = 0;
        connect(context);
    }));

    keystrokeTimer = setInterval(() => {
        if (keystrokeBatch.length) {
            send({ type: 'keystrokes', events: keystrokeBatch });
            keystrokeBatch = [];
        }
    }, KEYSTROKE_FLUSH_MS);

    connect(context);
}

function deactivate() {
    disposed = true;
    clearTimeout(contentTimer);
    clearTimeout(reconnectTimer);
    clearInterval(keystrokeTimer);
    if (ws) try { ws.close(); } catch (e) { /* already closed */ }
}

module.exports = { activate, deactivate };
