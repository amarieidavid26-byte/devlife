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
const BOB_PERIOD = 180;

export class Ghost {
    constructor(stage) {
        this.container = new PIXI.Container();
        stage.addChild(this.container);

        this._state = 'RELAXED';
        this._bobTick = 0;

        this._tx = 300;
        this._ty = 300;
        this._x  = 300;
        this._y  = 300;

        this._prevX     = 300;
        this._prevY     = 300;
        this._leanAngle = 0;

        this._shadow = new PIXI.Graphics();
        this._shadow.beginFill(0x000000, 0.06);
        this._shadow.drawEllipse(0, 0, 34, 12);
        this._shadow.endFill();
        this._shadow.beginFill(0x000000, 0.10);
        this._shadow.drawEllipse(0, 0, 24, 8);
        this._shadow.endFill();
        this._shadow.beginFill(0x000000, 0.18);
        this._shadow.drawEllipse(0, 0, 14, 5);
        this._shadow.endFill();
        this._shadow.y = 38;
        this.container.addChild(this._shadow);

        this._sprite = this._buildSprite();
        this.container.addChild(this._sprite);

        this._bubble = null;
        this._bubbleRoot = document.getElementById('ghost-bubble-root');
        this._currentData = null;

        this._vignette = null;
        this._vignetteStyle = null;
        this._atmosphere = null;

        this._stateInitialized = false;
    }

    _buildSprite() {
        const c = new PIXI.Container();

        const body = new PIXI.Graphics();
        this._drawGhostShape(body, STATE_COLORS[this._state]);

        const eyes = new PIXI.Graphics();
        eyes.beginFill(0xffffff, 0.92);
        eyes.drawCircle(-9, -6, 6);
        eyes.drawCircle( 9, -6, 6);
        eyes.endFill();
        eyes.beginFill(0x1a1a40, 0.95);
        eyes.drawCircle(-9, -6, 3.5);
        eyes.drawCircle( 9, -6, 3.5);
        eyes.endFill();
        eyes.beginFill(0xffffff, 0.75);
        eyes.drawCircle(-7.2, -8, 1.4);
        eyes.drawCircle(10.8, -8, 1.4);
        eyes.endFill();

        this._bodyGfx = body;
        this._eyesGfx = eyes;
        c.addChild(body);
        c.addChild(eyes);
        return c;
    }

    _drawGhostShape(g, color) {
        g.clear();

        g.beginFill(0xffffff, 0.22);
        g.moveTo(0, -26);
        g.bezierCurveTo( 13, -26,  22, -14,  22,   2);
        g.bezierCurveTo( 22,  32,  10,  38,   6,  16);
        g.bezierCurveTo(  2,  34,  -2,  34,  -6,  16);
        g.bezierCurveTo(-10,  38, -22,  32, -22,   2);
        g.bezierCurveTo(-22, -14, -13, -26,   0, -26);
        g.closePath();
        g.endFill();

        g.lineStyle(2.2, color, 0.72);
        g.moveTo(0, -26);
        g.bezierCurveTo( 13, -26,  22, -14,  22,   2);
        g.bezierCurveTo( 22,  32,  10,  38,   6,  16);
        g.bezierCurveTo(  2,  34,  -2,  34,  -6,  16);
        g.bezierCurveTo(-10,  38, -22,  32, -22,   2);
        g.bezierCurveTo(-22, -14, -13, -26,   0, -26);
        g.closePath();

        g.lineStyle(0);
        g.beginFill(0xffffff, 0.08);
        g.drawEllipse(0, -8, 10, 13);
        g.endFill();
    }

    _redrawEyes(state) {
        const g = this._eyesGfx;
        g.clear();
        switch (state) {
            case 'STRESSED':
                g.beginFill(0xffffff, 0.9);
                g.drawEllipse(-9, -6, 6, 4.5);
                g.drawEllipse( 9, -6, 6, 4.5);
                g.endFill();
                g.beginFill(0x1a1a40, 0.95);
                g.drawCircle(-9, -5, 3.0);
                g.drawCircle( 9, -5, 3.0);
                g.endFill();
                g.lineStyle(1.8, 0xffffff, 0.7);
                g.moveTo(-14, -13); g.lineTo(-5, -10);
                g.moveTo(  5, -10); g.lineTo(14, -13);
                break;

            case 'FATIGUED':
                g.beginFill(0xffffff, 0.9);
                g.drawEllipse(-9, -5, 6, 3.5);
                g.drawEllipse( 9, -5, 6, 3.5);
                g.endFill();
                g.beginFill(0x1a1a40, 0.95);
                g.drawEllipse(-9, -4, 3.5, 2.5);
                g.drawEllipse( 9, -4, 3.5, 2.5);
                g.endFill();
                g.beginFill(0xffffff, 0.18);
                g.drawEllipse(-9, -7.5, 6.5, 3);
                g.drawEllipse( 9, -7.5, 6.5, 3);
                g.endFill();
                break;

            case 'WIRED':
                g.beginFill(0xffffff, 0.98);
                g.drawCircle(-9, -6, 7.5);
                g.drawCircle( 9, -6, 7.5);
                g.endFill();
                g.beginFill(0x1a1a40, 0.98);
                g.drawCircle(-9, -6, 4.2);
                g.drawCircle( 9, -6, 4.2);
                g.endFill();
                g.beginFill(0xffffff, 0.85);
                g.drawCircle(-7,  -8.5, 1.5);
                g.drawCircle(11,  -8.5, 1.5);
                g.endFill();
                break;

            case 'DEEP_FOCUS':
                g.beginFill(0xffffff, 0.9);
                g.drawEllipse(-9, -6, 6, 4);
                g.drawEllipse( 9, -6, 6, 4);
                g.endFill();
                g.beginFill(0x1a1a40, 0.95);
                g.drawCircle(-9, -6, 3.0);
                g.drawCircle( 9, -6, 3.0);
                g.endFill();
                g.beginFill(0x8000ff, 0.5);
                g.drawCircle(-7,  -8, 1.2);
                g.drawCircle(11,  -8, 1.2);
                g.endFill();
                break;

            default:
                g.beginFill(0xffffff, 0.92);
                g.drawCircle(-9, -6, 6);
                g.drawCircle( 9, -6, 6);
                g.endFill();
                g.beginFill(0x1a1a40, 0.95);
                g.drawCircle(-9, -6, 3.5);
                g.drawCircle( 9, -6, 3.5);
                g.endFill();
                g.beginFill(0xffffff, 0.75);
                g.drawCircle(-7.2, -8, 1.4);
                g.drawCircle(10.8, -8, 1.4);
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

        this._drawGhostShape(this._bodyGfx, STATE_COLORS[stateName]);

        this._sprite.tint = STATE_COLORS[stateName];

        this._redrawEyes(stateName);

        if (this._bubble) {
            const glow = STATE_GLOW_CSS[stateName] || 'rgba(255,255,255,0.1)';
            this._bubble.style.boxShadow = `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${glow}`;
        }
    }

    update(delta, playerPos) {
        const offsetX = 80;
        const offsetY = -40;
        this._tx = playerPos.x + offsetX;
        this._ty = playerPos.y + offsetY;

        if (this._rushing) {
            this._rushTimer -= delta;
            if (this._rushTimer <= 0) this._rushing = false;
        }
        const followSpeed = (this._rushing ? 0.25 : 0.06) * delta;
        this._x += (this._tx - this._x) * followSpeed;
        this._y += (this._ty - this._y) * followSpeed;

        const vx = this._x - this._prevX;
        this._prevX = this._x;
        this._prevY = this._y;
        const targetLean = Math.max(-0.14, Math.min(0.14, vx * 0.045));
        this._leanAngle += (targetLean - this._leanAngle) * 0.1;
        this._sprite.rotation = this._leanAngle;

        this._bobTick += delta;
        const bob = Math.sin((this._bobTick / BOB_PERIOD) * Math.PI * 2) * 5;
        this._sprite.y = bob;

        const t = (bob + 5) / 10;
        this._shadow.scale.x = 0.85 + t * 0.3;
        this._shadow.alpha  = 0.12 + t * 0.12;

        this.container.x = this._x;
        this.container.y = this._y;
    }

    showSpeechBubble(data) {
        this.dismissBubble(false);
        this._currentData = data;

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

        const buttons = (data.buttons || ['Not Now']).map(label => `
            <button class="ghost-btn" data-label="${label}">${label}</button>
        `).join('');

        const trailingBtn = data.trailingButton
            ? `<button class="ghost-btn ghost-btn-trailing" data-label="${data.trailingButton}">${data.trailingButton}</button>`
            : '';

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
            z-index: 9999;
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-size: 14px;
            overflow: hidden;
            transform: translateX(60px);
            opacity: 0;
            transition: transform 300ms ease-out, opacity 300ms ease-out;
        `;

        if (isCritical) {
            el.style.top  = '50%';
            el.style.left = '50%';
            el.style.transform = 'translate(-50%, -60%) scale(0.95)';
            el.style.transition = 'transform 300ms ease-out, opacity 300ms ease-out';
        } else {
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
                .ghost-btn-trailing {
                    margin-left: auto;
                    opacity: 0.45;
                    font-size: 11px;
                    padding: 4px 10px;
                }
                .ghost-btn-trailing:hover {
                    opacity: 0.8;
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
            <div class="ghost-bubble-footer">${buttons}${trailingBtn}</div>
        `;

        this._bubbleRoot.appendChild(el);
        this._bubble = el;
        this._bubbleIsCritical = isCritical;

        if (isCritical) {
            this._removeVignette();
            if (!document.getElementById('vignette-kf')) {
                const ks = document.createElement('style');
                ks.id = 'vignette-kf';
                ks.textContent = `@keyframes vignetteFlash { 0%,100%{opacity:0.5} 50%{opacity:1} }`;
                document.head.appendChild(ks);
                this._vignetteStyle = ks;
            }
            const vignette = document.createElement('div');
            vignette.style.cssText = [
                'position:fixed;top:0;left:0;width:100vw;height:100vh',
                'pointer-events:none;z-index:9998',
                'background:radial-gradient(ellipse at center,transparent 40%,rgba(255,50,50,0.5) 100%)',
                'animation:vignetteFlash 1.5s ease-in-out infinite',
            ].join(';');
            document.body.appendChild(vignette);
            this._vignette = vignette;
            if (this._atmosphere) this._atmosphere.triggerShake(400, 5);
        }

        this._typewriterEffect(document.getElementById('ghost-msg'), data.message || '');

        requestAnimationFrame(() => {
            if (isCritical) {
                el.style.transform = 'translate(-50%, -50%) scale(1)';
                el.style.opacity   = '1';
            } else {
                el.style.transform = 'translateX(0)';
                el.style.opacity   = '1';
            }
        });

        el.querySelectorAll('.ghost-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const label = e.currentTarget.getAttribute('data-label');
                this._onButtonClick(label);
            });
        });

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

    setFeedbackHandler(fn) { this._onFeedback = fn; }
    setApplyFixHandler(fn) { this._onApplyFix = fn; }

    setAtmosphere(atm) { this._atmosphere = atm; }

    setSleepMode(active) {
        this._sleepMode = active;
        if (active) {
            this._sprite.alpha = 0.5;
            this._shadow.alpha = 0.05;
            this.showSpeechBubble({
                message: "Shhh... resting. Recovery in progress. \uD83C\uDF19",
                priority: 'low',
                state: 'FATIGUED',
                buttons: [],
                biometric: {},
            });
            this._sleepFollowUp = setTimeout(() => {
                this.showSpeechBubble({
                    message: "Sleep is the best performance optimizer. Rest well. \uD83D\uDCA4",
                    priority: 'low',
                    state: 'FATIGUED',
                    buttons: [],
                    biometric: {},
                });
            }, 10000);
        } else {
            clearTimeout(this._sleepFollowUp);
            this._sprite.alpha = 1.0;
            this._shadow.alpha = 0.18;
            this.showSpeechBubble({
                message: "Welcome back! Ready to code? \u2600\uFE0F",
                priority: 'low',
                state: 'RELAXED',
                buttons: ['Let\'s go!'],
                biometric: {},
            });
        }
    }
}
