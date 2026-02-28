// DevLife — Browser App (real iframe-based browser overlay)
// Player walks to second_monitor → this opens.

const BOOKMARKS = {
    'Stack Overflow': 'https://stackoverflow.com',
    'MDN': 'https://developer.mozilla.org',
    'GitHub': 'https://github.com',
    'Claude': 'https://claude.ai'
};

const HOME_HTML = `
<div style="max-width:720px;margin:80px auto;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a2e">
    <h1 style="font-size:32px;margin-bottom:8px">DevLife Browser</h1>
    <p style="color:#666;margin-bottom:48px">Click a bookmark or type a URL</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:480px;margin:0 auto">
        <div data-url="https://stackoverflow.com" style="background:#f8f0e3;border-radius:12px;padding:24px;cursor:pointer;border:1px solid #e8e0d3;transition:transform 0.15s">
            <div style="font-size:28px;margin-bottom:8px">📋</div>
            <div style="font-weight:600">Stack Overflow</div>
            <div style="font-size:12px;color:#888;margin-top:4px">Q&A for developers</div>
        </div>
        <div data-url="https://developer.mozilla.org" style="background:#e3f0f8;border-radius:12px;padding:24px;cursor:pointer;border:1px solid #d3e0e8;transition:transform 0.15s">
            <div style="font-size:28px;margin-bottom:8px">📖</div>
            <div style="font-weight:600">MDN Web Docs</div>
            <div style="font-size:12px;color:#888;margin-top:4px">Web documentation</div>
        </div>
        <div data-url="https://github.com" style="background:#e8e3f8;border-radius:12px;padding:24px;cursor:pointer;border:1px solid #d8d3e8;transition:transform 0.15s">
            <div style="font-size:28px;margin-bottom:8px">🐙</div>
            <div style="font-weight:600">GitHub</div>
            <div style="font-size:12px;color:#888;margin-top:4px">Code repository</div>
        </div>
        <div data-url="https://claude.ai" style="background:#f8e8e3;border-radius:12px;padding:24px;cursor:pointer;border:1px solid #e8d8d3;transition:transform 0.15s">
            <div style="font-size:28px;margin-bottom:8px">🤖</div>
            <div style="font-weight:600">Claude</div>
            <div style="font-size:12px;color:#888;margin-top:4px">AI assistant</div>
        </div>
    </div>
</div>
`;

export class BrowserApp {
    constructor(socket) {
        this.socket = socket;
        this.appType = 'browser';
        this.isOpen = false;
        this.overlay = null;
        this.addressBar = null;
        this.iframe = null;
        this.homeDiv = null;
        this.backBtn = null;
        this.forwardBtn = null;
        this.refreshBtn = null;
        this.blockedDiv = null;
        this.loadTimeout = null;
    }

    open() {
        if (this.isOpen) return;

        this.overlay = document.createElement('div');
        this.overlay.id = 'browser-overlay';
        Object.assign(this.overlay.style, {
            position: 'fixed',
            inset: '0',
            background: '#1a1a2e',
            zIndex: '1000',
            display: 'flex',
            flexDirection: 'column'
        });
        document.getElementById('app-overlay-root').appendChild(this.overlay);
        ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(evt =>
            this.overlay.addEventListener(evt, e => e.stopPropagation())
        );

        // Top chrome
        const chrome = document.createElement('div');
        chrome.style.background = '#2d2d2d';
        chrome.style.flexShrink = '0';

        // Row 1: nav + address bar + close
        const row1 = document.createElement('div');
        Object.assign(row1.style, {
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            gap: '8px'
        });

        const navBtnStyle = {
            background: '#3c3c3c',
            color: '#aaa',
            border: 'none',
            borderRadius: '4px',
            width: '28px',
            height: '28px',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        };

        // Back button
        this.backBtn = document.createElement('button');
        Object.assign(this.backBtn.style, navBtnStyle);
        this.backBtn.textContent = '\u2190';
        this.backBtn.addEventListener('click', () => {
            if (this.iframe && this.iframe.style.display !== 'none') {
                try { this.iframe.contentWindow.history.back(); } catch (e) {}
            } else {
                this.showHome();
            }
        });
        row1.appendChild(this.backBtn);

        // Forward button
        this.forwardBtn = document.createElement('button');
        Object.assign(this.forwardBtn.style, navBtnStyle);
        this.forwardBtn.textContent = '\u2192';
        this.forwardBtn.addEventListener('click', () => {
            if (this.iframe && this.iframe.style.display !== 'none') {
                try { this.iframe.contentWindow.history.forward(); } catch (e) {}
            }
        });
        row1.appendChild(this.forwardBtn);

        // Refresh button
        this.refreshBtn = document.createElement('button');
        Object.assign(this.refreshBtn.style, navBtnStyle);
        this.refreshBtn.textContent = '\u21BB';
        this.refreshBtn.addEventListener('click', () => {
            if (this.iframe && this.iframe.style.display !== 'none') {
                try { this.iframe.contentWindow.location.reload(); } catch (e) {
                    this.iframe.src = this.iframe.src;
                }
            }
        });
        row1.appendChild(this.refreshBtn);

        // Address bar
        this.addressBar = document.createElement('input');
        this.addressBar.placeholder = 'Search or enter URL...';
        Object.assign(this.addressBar.style, {
            flex: '1',
            background: '#3c3c3c',
            color: '#fff',
            border: 'none',
            borderRadius: '20px',
            padding: '6px 16px',
            fontSize: '13px',
            outline: 'none'
        });
        this.addressBar.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                let url = this.addressBar.value.trim();
                if (url && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('devlife://')) {
                    if (url.includes('.') && !url.includes(' ')) {
                        url = 'https://' + url;
                    } else {
                        url = 'https://www.google.com/search?igu=1&q=' + encodeURIComponent(url);
                    }
                }
                if (url === 'devlife://home' || url === '') {
                    this.showHome();
                } else {
                    this.navigate(url);
                }
            }
        });
        row1.appendChild(this.addressBar);

        // Close button
        const closeBtn = document.createElement('button');
        Object.assign(closeBtn.style, {
            background: 'transparent',
            color: '#888',
            fontSize: '13px',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 8px',
            whiteSpace: 'nowrap'
        });
        closeBtn.textContent = 'ESC to close';
        closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#ffffff'; });
        closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = '#888'; });
        closeBtn.addEventListener('click', () => this.close());
        row1.appendChild(closeBtn);

        chrome.appendChild(row1);

        // Row 2: Bookmarks bar
        const row2 = document.createElement('div');
        Object.assign(row2.style, {
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            gap: '4px',
            borderTop: '1px solid #3c3c3c'
        });

        Object.entries(BOOKMARKS).forEach(([name, url]) => {
            const btn = document.createElement('button');
            Object.assign(btn.style, {
                background: 'transparent',
                color: '#8ab4f8',
                border: 'none',
                fontSize: '12px',
                padding: '4px 12px',
                borderRadius: '4px',
                cursor: 'pointer'
            });
            btn.textContent = name;
            btn.addEventListener('mouseenter', () => { btn.style.background = '#3c3c3c'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
            btn.addEventListener('click', () => this.navigate(url));
            row2.appendChild(btn);
        });

        chrome.appendChild(row2);
        this.overlay.appendChild(chrome);

        // Content wrapper (holds both home page and iframe)
        const contentWrapper = document.createElement('div');
        Object.assign(contentWrapper.style, {
            flex: '1',
            position: 'relative',
            overflow: 'hidden'
        });

        // Home page div
        this.homeDiv = document.createElement('div');
        Object.assign(this.homeDiv.style, {
            width: '100%',
            height: '100%',
            overflowY: 'auto',
            background: '#ffffff',
            position: 'absolute',
            inset: '0'
        });
        this.homeDiv.innerHTML = HOME_HTML;
        this.homeDiv.addEventListener('click', (e) => {
            const tile = e.target.closest('[data-url]');
            if (tile) this.navigate(tile.dataset.url);
        });
        this.homeDiv.querySelectorAll('[data-url]').forEach(tile => {
            tile.addEventListener('mouseenter', () => { tile.style.transform = 'scale(1.03)'; });
            tile.addEventListener('mouseleave', () => { tile.style.transform = 'scale(1)'; });
        });
        contentWrapper.appendChild(this.homeDiv);

        // Iframe for real sites
        this.iframe = document.createElement('iframe');
        Object.assign(this.iframe.style, {
            width: '100%',
            height: '100%',
            border: 'none',
            background: '#ffffff',
            position: 'absolute',
            inset: '0',
            display: 'none'
        });
        this.iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-popups allow-forms allow-modals');
        this.iframe.setAttribute('referrerpolicy', 'no-referrer');
        this.iframe.addEventListener('load', () => {
            if (!this.iframe || this.iframe.src === 'about:blank') return;
            try {
                const iframeUrl = this.iframe.contentWindow.location.href;
                if (iframeUrl && iframeUrl !== 'about:blank') {
                    this.addressBar.value = iframeUrl;
                }
                // Check if the page actually loaded content
                const doc = this.iframe.contentDocument;
                if (doc && doc.body && doc.body.innerHTML.length < 10) {
                    this.showBlockedMessage(this.addressBar.value);
                }
            } catch (e) {
                // Cross-origin: can't access contentDocument = site loaded but blocks reading
                // This is actually SUCCESS (site rendered in iframe but is cross-origin)
                // Only show blocked message if we detect a known blocking pattern
            }
        });
        this.iframe.addEventListener('error', () => {
            if (this.iframe && this.iframe.src !== 'about:blank') {
                this.showBlockedMessage(this.addressBar.value);
            }
        });
        contentWrapper.appendChild(this.iframe);

        // Blocked message overlay (hidden by default)
        this.blockedDiv = document.createElement('div');
        Object.assign(this.blockedDiv.style, {
            width: '100%',
            height: '100%',
            background: '#ffffff',
            position: 'absolute',
            inset: '0',
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            color: '#1a1a2e',
            textAlign: 'center',
            padding: '40px'
        });
        contentWrapper.appendChild(this.blockedDiv);

        this.overlay.appendChild(contentWrapper);

        this.showHome();
        this.isOpen = true;
    }

    showHome() {
        this.addressBar.value = 'devlife://home';
        this.homeDiv.style.display = 'block';
        this.iframe.style.display = 'none';
        this.blockedDiv.style.display = 'none';
        this.iframe.src = 'about:blank';
        this.socket.sendContentUpdate(this.appType, 'devlife://home\nDevLife Browser Home Page', { url: 'devlife://home' });
    }

    navigate(url) {
        this.addressBar.value = url;
        this.homeDiv.style.display = 'none';
        this.blockedDiv.style.display = 'none';
        this.iframe.style.display = 'block';
        this.iframe.src = url;
        this.socket.sendContentUpdate(this.appType, url + '\nBrowsing: ' + url, { url: url });

        // Timeout: if iframe hasn't loaded in 8s, site probably blocks embedding
        clearTimeout(this.loadTimeout);
        this.loadTimeout = setTimeout(() => {
            if (!this.iframe) return;
            try {
                const doc = this.iframe.contentDocument;
                if (doc && doc.body && doc.body.innerHTML.length < 10) {
                    this.showBlockedMessage(url);
                }
            } catch (e) {
                // Cross-origin = site actually loaded, just can't read it — that's OK
            }
        }, 8000);
    }

    showBlockedMessage(url) {
        if (!this.blockedDiv) return;
        this.iframe.style.display = 'none';
        this.blockedDiv.style.display = 'flex';
        this.blockedDiv.innerHTML = `
            <div>
                <div style="font-size:48px;margin-bottom:16px">🚫</div>
                <h2 style="font-size:20px;margin-bottom:8px">This site blocks embedding</h2>
                <p style="color:#666;margin-bottom:24px;font-size:14px">${url.replace(/</g, '&lt;')}</p>
                <a href="${url.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer"
                   style="display:inline-block;background:#0096FF;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
                    Open in new tab
                </a>
                <div style="margin-top:12px">
                    <button id="browser-go-home" style="background:transparent;border:1px solid #ddd;color:#666;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px">
                        Back to home
                    </button>
                </div>
            </div>
        `;
        this.blockedDiv.querySelector('#browser-go-home').addEventListener('click', () => this.showHome());
    }

    close() {
        if (!this.isOpen) return;
        clearTimeout(this.loadTimeout);
        if (this.iframe) {
            this.iframe.src = 'about:blank';
        }
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        this.addressBar = null;
        this.iframe = null;
        this.homeDiv = null;
        this.blockedDiv = null;
        this.isOpen = false;
    }
}
