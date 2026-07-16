// DevLife Bridge - streams REAL editor context to the DevLife backend over the same
// WS protocol the game uses. the ghost analyzes what you actually code in VS Code,
// interventions come back as notifications, your cognitive state sits in the status bar.
// privacy: keystrokes are sent as (interval, category) pairs only, never key contents
// (same contract as the game's KeystrokeCapture -- see keystroke_dynamics.py)

const vscode = require('vscode');
const WebSocket = require('ws');

const CONTENT_DEBOUNCE_MS = 1500;
const KEYSTROKE_FLUSH_MS = 5000;
const MAX_CONTENT_CHARS = 50000;
const RECONNECT_BASE_MS = 2000;

let ws = null;
let statusBar = null;
let contentTimer = null;
let keystrokeTimer = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let keystrokeBatch = [];
let lastKeyTime = 0;
let disposed = false;

function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
    }
}

function connect(context) {
    const url = vscode.workspace.getConfiguration('devlife').get('backendUrl');
    try {
        ws = new WebSocket(url);
    } catch (e) {
        scheduleReconnect(context);
        return;
    }

    ws.on('open', () => {
        reconnectAttempt = 0;
        statusBar.text = '$(pulse) DevLife: connected';
        statusBar.show();
    });

    ws.on('message', (raw) => {
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
            show(`👻 ${msg.message}`, ...buttons).then((choice) => {
                if (choice) send({ type: 'feedback', action: choice });
            });
        }
    });

    ws.on('close', () => scheduleReconnect(context));
    ws.on('error', () => { /* close fires next; reconnect happens there */ });
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

    // keystroke rhythm (intervals + categories only, never contents)
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
