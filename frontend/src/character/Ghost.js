import * as PIXI from 'pixi.js';

const STATE_COLORS = {
    DEEP_FOCUS: 0x8000ff,
    STRESSED:   0xff5050,
    FATIGUED:   0xffa000,
    RELAXED:    0x00c864,
    WIRED:      0x0096ff,
};

const STATE_GLOW_CSS = {
    DEEP_FOCUS: 'rgba(128,0,255,0.3)',
    STRESSED:   'rgba(255,80,80,0.3)',
    FATIGUED:   'rgba(255,160,0,0.3)',
    RELAXED:    'rgba(0,200,100,0.3)',
    WIRED:      'rgba(0,150,255,0.3)',
};

const FOLLOW_DIST_TILES = 3.5;
const BOB_PERIOD = 180; // frames for one 3-second bob at 60fps

export class Ghost {
    constructor(stage) {
        this.container = new PIXI.Container();
        stage.addChild(this.container);

        this._state = 'RELAXED';
        this._bobTick = 0;

        // Screen position (follows player)
        this._tx = 300;
        this._ty = 300;
        this._x  = 300;
        this._y  = 300;

        // Shadow on floor — added BEFORE sprite so it renders behind
        this._shadow = new PIXI.Graphics();
        this._shadow.beginFill(0x000000, 0.2);
        this._shadow.drawEllipse(0, 0, 20, 7);
        this._shadow.endFill();
        this._shadow.y = 32;
        this.container.addChild(this._shadow);

        this._sprite = this._buildSprite();
        this.container.addChild(this._sprite);

        // Speech bubble is an HTML element (glassmorphism)
        this._bubble = null;
        this._bubbleRoot = document.getElementById('ghost-bubble-root');
        this._currentData = null;

        // Critical intervention extras
        this._vignette = null;
        this._vignetteStyle = null;
        this._atmosphere = null;

        // Reaction tracking
        this._stateInitialized = false;
    }

    _buildSprite() {
        const c = new PIXI.Container();

        // Body — semi-transparent oval
        const body = new PIXI.Graphics();
        body.beginFill(0xffffff, 0.15);
        body.drawEllipse(0, 0, 22, 28);
        body.endFill();
        // Outer glow ring
        body.lineStyle(2, STATE_COLORS[this._state], 0.6);
        body.drawEllipse(0, 0, 22, 28);

        // Wavy bottom (ghost tail) — 3 bumps
        const tail = new PIXI.Graphics();
        tail.beginFill(0xffffff, 0.12);
        tail.moveTo(-22, 10);
        tail.bezierCurveTo(-22, 30, -12, 38, -7, 28);
        tail.bezierCurveTo(-2, 18, 2, 38, 7, 28);
        tail.bezierCurveTo(12, 18, 22, 38, 22, 28);
        tail.lineTo(22, 10);
        tail.closePath();
        tail.endFill();

        // Eyes
        const eyes = new PIXI.Graphics();
        eyes.beginFill(0xffffff, 0.9);
        eyes.drawCircle(-7, -4, 5);
        eyes.drawCircle( 7, -4, 5);
        eyes.endFill();
        eyes.beginFill(0x1a1a40, 0.95);
        eyes.drawCircle(-7, -4, 3);
        eyes.drawCircle( 7, -4, 3);
        eyes.endFill();

        this._bodyGfx = body;
        this._eyesGfx = eyes;
        c.addChild(tail);
        c.addChild(body);
        c.addChild(eyes);
        return c;
    }

    _redrawEyes(state) {
        const g = this._eyesGfx;
        g.clear();
        switch (state) {
            case 'STRESSED':
                // Worried whites + furrowed brows
                g.beginFill(0xffffff, 0.9);
                g.drawEllipse(-7, -4, 5, 4);
                g.drawEllipse( 7, -4, 5, 4);
                g.endFill();
                g.beginFill(0x1a1a40, 0.95);
                g.drawCircle(-7, -3, 2.8); // pupils slightly low
                g.drawCircle( 7, -3, 2.8);
                g.endFill();
                // Furrowed brow — lines angling inward
                g.lineStyle(1.5, 0xffffff, 0.65);
                g.moveTo(-10, -10); g.lineTo(-4,  -8);
                g.moveTo(  4,  -8); g.lineTo(10, -10);
                break;

            case 'FATIGUED':
                // Half-closed droopy eyes
                g.beginFill(0xffffff, 0.9);
                g.drawEllipse(-7, -3, 5, 3);
                g.drawEllipse( 7, -3, 5, 3);
                g.endFill();
                g.beginFill(0x1a1a40, 0.95);
                g.drawEllipse(-7, -2, 3, 2); // oval pupils looking down
                g.drawEllipse( 7, -2, 3, 2);
                g.endFill();
                // Heavy eyelid overlay
                g.beginFill(0xffffff, 0.18);
                g.drawEllipse(-7, -4.5, 5.5, 2.5);
                g.drawEllipse( 7, -4.5, 5.5, 2.5);
                g.endFill();
                break;

            case 'WIRED':
                // Wide-open, hyper-alert
                g.beginFill(0xffffff, 0.98);
                g.drawCircle(-7, -4, 6.5);
                g.drawCircle( 7, -4, 6.5);
                g.endFill();
                g.beginFill(0x1a1a40, 0.98);
                g.drawCircle(-7, -4, 3.5);
                g.drawCircle( 7, -4, 3.5);
                g.endFill();
                // Sharp highlight dots
                g.beginFill(0xffffff, 0.85);
                g.drawCircle(-5.5, -5.5, 1.2);
                g.drawCircle( 8.5, -5.5, 1.2);
                g.endFill();
                break;

            case 'DEEP_FOCUS':
                // Narrowed, intent
                g.beginFill(0xffffff, 0.9);
                g.drawEllipse(-7, -4, 5, 3.5);
                g.drawEllipse( 7, -4, 5, 3.5);
                g.endFill();
                g.beginFill(0x1a1a40, 0.95);
                g.drawCircle(-7, -4, 2.5); // smaller focused pupils
                g.drawCircle( 7, -4, 2.5);
                g.endFill();
                // Purple focus glint
                g.beginFill(0x8000ff, 0.45);
                g.drawCircle(-5.5, -5.5, 1);
                g.drawCircle( 8.5, -5.5, 1);
                g.endFill();
                break;

            default: // RELAXED — original look
                g.beginFill(0xffffff, 0.9);
                g.drawCircle(-7, -4, 5);
                g.drawCircle( 7, -4, 5);
                g.endFill();
                g.beginFill(0x1a1a40, 0.95);
                g.drawCircle(-7, -4, 3);
                g.drawCircle( 7, -4, 3);
                g.endFill();
                break;
        }
    }

    _showStateReaction(state) {
        const STATE_EMOJIS = {
            DEEP_FOCUS: '🟣',
            STRESSED:   '😰',
            FATIGUED:   '😴',
            RELAXED:    '🧘',
            WIRED:      '⚡',
        };
        const emoji = STATE_EMOJIS[state];
        if (!emoji || !this.container.parent) return;

        const reaction = new PIXI.Text(emoji, { fontSize: 36 });
        reaction.anchor.set(0.5);
        reaction.x = this.container.x;
        reaction.y = this.container.y - 55;
        reaction.zIndex = 99999;
        this.container.parent.addChild(reaction);

        const startY = reaction.y;
        const startTime = Date.now();
        const animate = () => {
            const progress = (Date.now() - startTime) / 1400;
            reaction.y = startY - progress * 45;
            reaction.alpha = 1 - progress;
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                if (reaction.parent) reaction.parent.removeChild(reaction);
                reaction.destroy();
            }
        };
        requestAnimationFrame(animate);
    }

    setStateTint(stateName) {
        if (!STATE_COLORS[stateName]) return;
        const changed = stateName !== this._state;
        this._state = stateName;
        if (changed && this._stateInitialized) this._showStateReaction(stateName);
        this._stateInitialized = true;

        // Redraw body outline color
        this._bodyGfx.clear();
        this._bodyGfx.beginFill(0xffffff, 0.15);
        this._bodyGfx.drawEllipse(0, 0, 22, 28);
        this._bodyGfx.endFill();
        this._bodyGfx.lineStyle(2, STATE_COLORS[stateName], 0.7);
        this._bodyGfx.drawEllipse(0, 0, 22, 28);

        // Also update the tint
        this._sprite.tint = STATE_COLORS[stateName];

        // Redraw eye expression for this state
        this._redrawEyes(stateName);

        // Update bubble border if open
        if (this._bubble) {
            const glow = STATE_GLOW_CSS[stateName] || 'rgba(255,255,255,0.1)';
            this._bubble.style.boxShadow = `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${glow}`;
        }
    }

    update(delta, playerPos) {
        // Target: offset from player by fixed distance
        const offsetX = 80;
        const offsetY = -40;
        this._tx = playerPos.x + offsetX;
        this._ty = playerPos.y + offsetY;

        // Rush to player when intervention arrives, then settle back to normal speed
        if (this._rushing) {
            this._rushTimer -= delta;
            if (this._rushTimer <= 0) this._rushing = false;
        }
        const followSpeed = (this._rushing ? 0.25 : 0.06) * delta;
        this._x += (this._tx - this._x) * followSpeed;
        this._y += (this._ty - this._y) * followSpeed;

        // Bob animation (5px up-down, 3s loop) — applied to sprite only, not container
        this._bobTick += delta;
        const bob = Math.sin((this._bobTick / BOB_PERIOD) * Math.PI * 2) * 5;
        this._sprite.y = bob;

        // Shadow breathes opposite to bob (lower ghost → bigger/darker shadow)
        const t = (bob + 5) / 10; // 0=top, 1=bottom
        this._shadow.scale.x = 0.85 + t * 0.3;
        this._shadow.alpha  = 0.12 + t * 0.12;

        this.container.x = this._x;
        this.container.y = this._y; // no bob on container — shadow stays fixed
    }

    // ─── SPEECH BUBBLE ──────────────────────────────────────────────────────────

    showSpeechBubble(data) {
        this.dismissBubble(false);
        this._currentData = data;

        // Rush Ghost to player position (60 frames ≈ 1s at 60fps)
        this._rushing = true;
        this._rushTimer = 60;

        const isCritical = data.priority === 'critical';
        const glowColor  = STATE_GLOW_CSS[data.state] || 'rgba(255,255,255,0.1)';
        const borderColor = isCritical ? '#ff5050' : 'rgba(255,255,255,0.1)';
        const boxShadow   = isCritical
            ? '0 8px 32px rgba(0,0,0,0.6), 0 0 30px rgba(255,80,80,0.6)'
            : `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${glowColor}`;

        const bpm      = data.biometric?.heartRate ?? '—';
        const recovery = data.biometric?.recovery   ?? '—';
        const recDot   = recovery >= 66 ? '🟢' : recovery >= 33 ? '🟡' : '🔴';

        // Build button HTML
        const buttons = (data.buttons || ['Not Now']).map(label => `
            <button class="ghost-btn" data-label="${label}">${label}</button>
        `).join('');

        const el = document.createElement('div');
        el.className = 'ghost-bubble';
        el.style.cssText = `
            position: fixed;
            background: rgba(20,20,40,0.85);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 16px;
            border: 1px solid ${borderColor};
            box-shadow: ${boxShadow};
            color: #e0e0e0;
            max-width: 420px;
            min-width: 300px;
            pointer-events: all;
            z-index: 200;
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-size: 14px;
            overflow: hidden;
            transform: translateX(60px);
            opacity: 0;
            transition: transform 300ms ease-out, opacity 300ms ease-out;
        `;

        if (isCritical) {
            // Center screen for critical
            el.style.top  = '50%';
            el.style.left = '50%';
            el.style.transform = 'translate(-50%, -60%) scale(0.95)';
            el.style.transition = 'transform 300ms ease-out, opacity 300ms ease-out';
        } else {
            // Near Ghost sprite — right side
            el.style.right  = '24px';
            el.style.bottom = '120px';
        }

        el.innerHTML = `
            <style>
                .ghost-bubble-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 16px 8px;
                    border-bottom: 1px solid rgba(255,255,255,0.08);
                }
                .ghost-bubble-title {
                    font-weight: 700;
                    font-size: 13px;
                    letter-spacing: 0.05em;
                    color: #ffffff;
                }
                .ghost-bubble-bio {
                    font-size: 12px;
                    color: #aaaaaa;
                    text-align: right;
                    line-height: 1.5;
                }
                .ghost-bubble-body {
                    padding: 14px 16px;
                    line-height: 1.6;
                    color: #e0e0e0;
                }
                .ghost-bubble-footer {
                    padding: 10px 16px 14px;
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                    border-top: 1px solid rgba(255,255,255,0.08);
                }
                .ghost-btn {
                    background: rgba(255,255,255,0.08);
                    color: #e0e0e0;
                    border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 8px;
                    padding: 6px 14px;
                    font-size: 13px;
                    cursor: pointer;
                    transition: background 0.15s;
                }
                .ghost-btn:hover {
                    background: rgba(255,255,255,0.15);
                }
                .ghost-btn:first-child {
                    background: rgba(100,180,255,0.15);
                    border-color: rgba(100,180,255,0.3);
                }
                ${isCritical ? `
                @keyframes pulse-border {
                    0%, 100% { box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 30px rgba(255,80,80,0.6); }
                    50%       { box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 50px rgba(255,80,80,0.9); }
                }
                .ghost-bubble { animation: pulse-border 1.4s ease-in-out infinite; }
                ` : ''}
            </style>
            <div class="ghost-bubble-header">
                <div class="ghost-bubble-title">👻 GHOST</div>
                <div class="ghost-bubble-bio">❤️ ${bpm} bpm<br>${recDot} Rec: ${recovery}%</div>
            </div>
            <div class="ghost-bubble-body" id="ghost-msg"></div>
            <div class="ghost-bubble-footer">${buttons}</div>
        `;

        this._bubbleRoot.appendChild(el);
        this._bubble = el;
        this._bubbleIsCritical = isCritical;

        // Critical: red vignette + screen shake
        if (isCritical) {
            this._removeVignette();
            if (!document.getElementById('vignette-kf')) {
                const ks = document.createElement('style');
                ks.id = 'vignette-kf';
                ks.textContent = `@keyframes vignetteFlash { 0%{opacity:.55} 100%{opacity:1} }`;
                document.head.appendChild(ks);
                this._vignetteStyle = ks;
            }
            const vignette = document.createElement('div');
            vignette.style.cssText = [
                'position:fixed;top:0;left:0;width:100vw;height:100vh',
                'pointer-events:none;z-index:199',
                'background:radial-gradient(ellipse at center,transparent 45%,rgba(255,40,40,0.38) 100%)',
                'animation:vignetteFlash 1s ease-in-out infinite alternate',
            ].join(';');
            document.body.appendChild(vignette);
            this._vignette = vignette;
            if (this._atmosphere) this._atmosphere.triggerShake(520, 5);
        }

        // Typewriter effect on message
        this._typewriterEffect(document.getElementById('ghost-msg'), data.message || '');

        // Animate in
        requestAnimationFrame(() => {
            if (isCritical) {
                el.style.transform = 'translate(-50%, -50%) scale(1)';
                el.style.opacity   = '1';
            } else {
                el.style.transform = 'translateX(0)';
                el.style.opacity   = '1';
            }
        });

        // Button listeners
        el.querySelectorAll('.ghost-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const label = e.currentTarget.getAttribute('data-label');
                this._onButtonClick(label);
            });
        });

        // Auto-dismiss non-critical after 15s
        if (!isCritical) {
            this._autoDismissTimer = setTimeout(() => this.dismissBubble(true), 15000);
        }

        this.setStateTint(data.state || this._state);
    }

    _typewriterEffect(el, text) {
        el.textContent = '';
        let i = 0;
        const interval = setInterval(() => {
            el.textContent += text[i];
            i++;
            if (i >= text.length) clearInterval(interval);
        }, 18);
        this._typewriterInterval = interval;
    }

    _onButtonClick(label) {
        // Dispatch to WebSocket — main.js wires this up via callback
        if (this._onFeedback) this._onFeedback(label);

        if (label === 'Apply Fix' && this._onApplyFix && this._currentData?.code_suggestion) {
            this._onApplyFix(this._currentData.code_suggestion);
        }

        this.dismissBubble(true);
    }

    _removeVignette() {
        if (this._vignette) { this._vignette.remove(); this._vignette = null; }
    }

    dismissBubble(animate = true) {
        clearTimeout(this._autoDismissTimer);
        clearInterval(this._typewriterInterval);
        this._removeVignette();

        if (!this._bubble) return;
        const el = this._bubble;
        this._bubble = null;

        if (animate) {
            el.style.transition = 'transform 200ms ease-in, opacity 200ms ease-in';
            if (this._bubbleIsCritical) {
                el.style.transform = 'translate(-50%, -50%) scale(0.92)';
            } else {
                el.style.transform = 'translateX(60px)';
            }
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 220);
        } else {
            el.remove();
        }
    }

    // Called by main.js to wire up feedback sending
    setFeedbackHandler(fn) { this._onFeedback = fn; }
    setApplyFixHandler(fn) { this._onApplyFix = fn; }

    // Link atmosphere for screen-shake on critical interventions
    setAtmosphere(atm) { this._atmosphere = atm; }
}
