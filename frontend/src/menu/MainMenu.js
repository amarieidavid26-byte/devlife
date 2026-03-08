import * as PIXI from 'pixi.js';

const STATE_COLORS = [0x6AD89A, 0x9B6AFF, 0xFF7A6A, 0xFFB84A, 0x6AB8FF];

// ECG waveform points — P wave, QRS complex, T wave pattern
function buildECGPoints(width, cy) {
    const points = [];
    const beatWidth = width / 3.5;
    for (let b = 0; b < 4; b++) {
        const ox = b * beatWidth;
        // flat lead-in
        for (let i = 0; i < 12; i++) points.push({ x: ox + i * (beatWidth * 0.18 / 12), y: cy });
        // P wave
        const px = ox + beatWidth * 0.18;
        points.push({ x: px, y: cy - 4 });
        points.push({ x: px + beatWidth * 0.06, y: cy - 8 });
        points.push({ x: px + beatWidth * 0.12, y: cy - 4 });
        points.push({ x: px + beatWidth * 0.18, y: cy });
        // flat before QRS
        for (let i = 0; i < 4; i++) points.push({ x: px + beatWidth * 0.18 + i * (beatWidth * 0.06 / 4), y: cy });
        // QRS complex
        const qx = ox + beatWidth * 0.42;
        points.push({ x: qx, y: cy + 6 });
        points.push({ x: qx + beatWidth * 0.04, y: cy - 45 });
        points.push({ x: qx + beatWidth * 0.08, y: cy + 30 });
        points.push({ x: qx + beatWidth * 0.12, y: cy });
        // flat after QRS
        for (let i = 0; i < 6; i++) points.push({ x: qx + beatWidth * 0.12 + i * (beatWidth * 0.08 / 6), y: cy });
        // T wave
        const tx = ox + beatWidth * 0.62;
        points.push({ x: tx, y: cy - 3 });
        points.push({ x: tx + beatWidth * 0.06, y: cy - 14 });
        points.push({ x: tx + beatWidth * 0.12, y: cy - 3 });
        points.push({ x: tx + beatWidth * 0.18, y: cy });
        // flat tail
        const tail = ox + beatWidth * 0.80;
        const tailEnd = ox + beatWidth;
        const tailSteps = 8;
        for (let i = 0; i < tailSteps; i++) points.push({ x: tail + i * ((tailEnd - tail) / tailSteps), y: cy });
    }
    return points;
}

function lerpColor(a, b, t) {
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return (r << 16) | (g << 8) | bl;
}

function easeOutQuad(t) { return t * (2 - t); }
function easeOutElastic(t) {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t - 0.1) * 5 * Math.PI) + 1;
}

export class MainMenu {
    constructor(pixiApp) {
        this._app = pixiApp;
        this._container = new PIXI.Container();
        this._domEls = [];
        this._ticker = null;
        this._startTime = 0;
        this._onStart = null;
        this._destroyed = false;

        // particles
        this._bgCircles = [];
        this._codeParticles = [];
        // pulse
        this._pulsePhase = 0;
        // ghost
        this._ghostContainer = null;
        this._ghostScale = 0;
        this._ghostBobTick = 0;
        this._ghostColorIdx = 0;
        this._ghostColorTime = 0;
        this._ghostBlinkTimer = 3 + Math.random() * 2;
        this._ghostBlinking = false;
        this._ghostBlinkDur = 0;
        // ecg
        this._ecgPoints = [];
        this._ecgDrawIdx = 0;
        this._ecgGlow = null;
        this._ecgLine = null;
        // title
        this._titleRevealed = false;
        this._titleMask = null;
        this._titleText = null;
        this._titleGlow = null;
        this._subtitleText = null;
    }

    show(onStart, onDemo, onSettings) {
        this._onStart = onStart;
        this._onDemo = onDemo || null;
        this._onSettings = onSettings || null;
        this._startTime = Date.now();
        this._app.stage.addChild(this._container);

        this._buildLayer1();
        this._buildLayer2();
        this._buildLayer3();
        this._buildLayer4();
        this._buildLayer5();
        this._buildLayer6();
        this._buildLayer7();
        this._buildLayer8();

        this._ticker = (delta) => this._update(delta);
        this._app.ticker.add(this._ticker);
    }

    hide() {
        if (this._destroyed) return;
        this._destroyed = true;
        const start = Date.now();
        const fade = () => {
            const t = Math.min(1, (Date.now() - start) / 1000);
            this._container.alpha = 1 - t;
            this._domEls.forEach(el => { el.style.opacity = String(1 - t); });
            if (t < 1) {
                requestAnimationFrame(fade);
            } else {
                this._cleanup();
            }
        };
        requestAnimationFrame(fade);
    }

    _cleanup() {
        if (this._ticker) this._app.ticker.remove(this._ticker);
        this._domEls.forEach(el => el.remove());
        this._domEls = [];
        if (this._container.parent) this._container.parent.removeChild(this._container);
        this._container.destroy({ children: true });
        if (this._onStart) this._onStart();
    }

    // LAYER 1 — deep background
    _buildLayer1() {
        const w = this._app.screen.width;
        const h = this._app.screen.height;

        const bg = new PIXI.Graphics();
        bg.beginFill(0x0a0a14);
        bg.drawRect(0, 0, w, h);
        bg.endFill();
        this._container.addChild(bg);
        this._bgRect = bg;

        // radial gradient approximation
        const grad = new PIXI.Graphics();
        grad.beginFill(0x1a1a2e, 0.3);
        grad.drawCircle(w / 2, h / 2, Math.max(w, h) * 0.3);
        grad.endFill();
        this._container.addChild(grad);

        // drifting faint circles
        for (let i = 0; i < 18; i++) {
            const c = new PIXI.Graphics();
            const color = STATE_COLORS[Math.floor(Math.random() * STATE_COLORS.length)];
            const radius = 100 + Math.random() * 300;
            const alpha = 0.02 + Math.random() * 0.03;
            c.beginFill(color, alpha);
            c.drawCircle(0, 0, radius);
            c.endFill();
            c.x = Math.random() * w;
            c.y = Math.random() * h;
            this._container.addChild(c);
            this._bgCircles.push({
                gfx: c,
                vx: (Math.random() - 0.5) * 0.25,
                vy: (Math.random() - 0.5) * 0.25,
            });
        }
    }

    // LAYER 2 — room silhouette
    _buildLayer2() {
        const w = this._app.screen.width;
        const h = this._app.screen.height;
        const cx = w / 2;
        const by = h * 0.52;
        const sil = new PIXI.Graphics();

        // chair (behind desk, dark shape)
        sil.beginFill(0x1a1510);
        sil.drawRoundedRect(cx - 35, by - 35, 70, 80, 8);
        sil.endFill();
        // chair back
        sil.beginFill(0x1a1510);
        sil.drawRoundedRect(cx - 30, by - 80, 60, 55, 6);
        sil.endFill();

        // desk — isometric parallelogram (280px wide)
        sil.beginFill(0x2A2015);
        sil.moveTo(cx - 140, by);
        sil.lineTo(cx + 140, by);
        sil.lineTo(cx + 120, by + 44);
        sil.lineTo(cx - 160, by + 44);
        sil.closePath();
        sil.endFill();

        // desk legs
        sil.beginFill(0x2A2015);
        sil.drawRect(cx - 130, by + 44, 8, 32);
        sil.drawRect(cx + 100, by + 44, 8, 32);
        sil.endFill();

        // monitor light cone hitting desk surface
        sil.beginFill(0x9B6AFF, 0.04);
        sil.moveTo(cx - 50, by - 30);
        sil.lineTo(cx + 50, by - 30);
        sil.lineTo(cx + 90, by);
        sil.lineTo(cx - 90, by);
        sil.closePath();
        sil.endFill();

        // monitor glow (behind monitor)
        sil.beginFill(0x9B6AFF, 0.08);
        sil.drawRect(cx - 55, by - 115, 110, 90);
        sil.endFill();

        // monitor (90px wide)
        sil.beginFill(0x2A2015);
        sil.drawRect(cx - 45, by - 105, 90, 70);
        sil.endFill();
        sil.lineStyle(1, 0x9B6AFF, 0.6);
        sil.drawRect(cx - 45, by - 105, 90, 70);
        sil.lineStyle(0);

        // screen glow inside monitor
        sil.beginFill(0x9B6AFF, 0.2);
        sil.drawRect(cx - 39, by - 99, 78, 58);
        sil.endFill();

        // code lines on screen
        sil.beginFill(0x6AD89A, 0.15);
        sil.drawRect(cx - 32, by - 92, 40, 2);
        sil.drawRect(cx - 32, by - 84, 55, 2);
        sil.drawRect(cx - 32, by - 76, 35, 2);
        sil.drawRect(cx - 32, by - 68, 48, 2);
        sil.endFill();

        // monitor stand
        sil.beginFill(0x2A2015);
        sil.drawRect(cx - 7, by - 35, 14, 35);
        sil.endFill();

        this._container.addChild(sil);
    }

    // LAYER 3 — ECG title
    _buildLayer3() {
        const w = this._app.screen.width;
        const h = this._app.screen.height;
        const cy = h * 0.28;

        this._ecgPoints = buildECGPoints(w, cy);

        this._ecgGlow = new PIXI.Graphics();
        this._container.addChild(this._ecgGlow);
        this._ecgLine = new PIXI.Graphics();
        this._container.addChild(this._ecgLine);

        // title text
        this._titleText = new PIXI.Text('DEVLIFE', {
            fontFamily: "'Courier New', monospace",
            fontWeight: 'bold',
            fontSize: 80,
            fill: 0x6AD89A,
        });
        this._titleText.anchor.set(0.5);
        this._titleText.x = w / 2;
        this._titleText.y = cy;
        this._container.addChild(this._titleText);

        // glow text behind title
        this._titleGlow = new PIXI.Text('DEVLIFE', {
            fontFamily: "'Courier New', monospace",
            fontWeight: 'bold',
            fontSize: 80,
            fill: 0x6AD89A,
        });
        this._titleGlow.anchor.set(0.5);
        this._titleGlow.x = w / 2;
        this._titleGlow.y = cy;
        this._titleGlow.alpha = 0;
        this._container.addChildAt(this._titleGlow, this._container.children.indexOf(this._titleText));

        // mask for title reveal
        this._titleMask = new PIXI.Graphics();
        this._titleMask.beginFill(0xffffff);
        this._titleMask.drawRect(0, 0, 0, h);
        this._titleMask.endFill();
        this._container.addChild(this._titleMask);
        this._titleText.mask = this._titleMask;
        this._titleGlow.mask = null; // glow is unmasked but starts at alpha 0

        // subtitle
        this._subtitleText = new PIXI.Text('The Biometric Developer Simulator', {
            fontFamily: 'monospace',
            fontSize: 20,
            fill: 0xB8A88C,
        });
        this._subtitleText.anchor.set(0.5);
        this._subtitleText.x = w / 2;
        this._subtitleText.y = cy + 60;
        this._subtitleText.alpha = 0;
        this._container.addChild(this._subtitleText);
    }

    // LAYER 4 — ghost
    _buildLayer4() {
        const w = this._app.screen.width;
        const h = this._app.screen.height;
        const cy = h * 0.28;

        this._ghostContainer = new PIXI.Container();
        this._ghostContainer.x = w / 2 + 250;
        this._ghostContainer.y = cy;
        this._ghostContainer.scale.set(0);
        this._container.addChild(this._ghostContainer);

        // scale ~100px tall means scale factor of about 1.5 from the original (-26 to +38 = 64px)
        const sc = 1.56;

        // glow body
        this._ghostGlowGfx = new PIXI.Graphics();
        this._ghostGlowGfx.scale.set(sc * 1.08);
        this._ghostContainer.addChild(this._ghostGlowGfx);

        // solid body
        this._ghostBodyGfx = new PIXI.Graphics();
        this._ghostBodyGfx.scale.set(sc);
        this._ghostContainer.addChild(this._ghostBodyGfx);

        // eyes container
        this._ghostEyes = new PIXI.Graphics();
        this._ghostEyes.scale.set(sc);
        this._ghostContainer.addChild(this._ghostEyes);

        this._drawMenuGhostShape(this._ghostGlowGfx, 0x6AD89A, 0.15);
        this._drawMenuGhostShape(this._ghostBodyGfx, 0x6AD89A, 0.9);
        this._drawMenuGhostEyes(false);
    }

    _drawMenuGhostShape(g, color, alpha) {
        g.clear();
        g.beginFill(0xffffff, alpha * 0.25);
        g.moveTo(0, -26);
        g.bezierCurveTo( 13, -26,  22, -14,  22,   2);
        g.bezierCurveTo( 22,  32,  10,  38,   6,  16);
        g.bezierCurveTo(  2,  34,  -2,  34,  -6,  16);
        g.bezierCurveTo(-10,  38, -22,  32, -22,   2);
        g.bezierCurveTo(-22, -14, -13, -26,   0, -26);
        g.closePath();
        g.endFill();

        g.lineStyle(2.2, color, alpha * 0.8);
        g.moveTo(0, -26);
        g.bezierCurveTo( 13, -26,  22, -14,  22,   2);
        g.bezierCurveTo( 22,  32,  10,  38,   6,  16);
        g.bezierCurveTo(  2,  34,  -2,  34,  -6,  16);
        g.bezierCurveTo(-10,  38, -22,  32, -22,   2);
        g.bezierCurveTo(-22, -14, -13, -26,   0, -26);
        g.closePath();

        g.lineStyle(0);
        g.beginFill(0xffffff, alpha * 0.09);
        g.drawEllipse(0, -8, 10, 13);
        g.endFill();
    }

    _drawMenuGhostEyes(blinking) {
        const g = this._ghostEyes;
        g.clear();
        if (blinking) {
            // closed eyes — horizontal lines
            g.lineStyle(2, 0xffffff, 0.9);
            g.moveTo(-13, -6); g.lineTo(-5, -6);
            g.moveTo(5, -6); g.lineTo(13, -6);
            g.lineStyle(0);
        } else {
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
        }
    }

    // LAYER 5 — code particles
    _buildLayer5() {
        const snippets = [
            'const', 'async', '=>', 'import', '{}', '//TODO', 'npm run', 'git push',
            '0xff', 'while(true)', 'return', 'await', 'export', 'null', '===', '&&',
            '.then(', 'catch(e)', 'let x =', 'for(i)', 'break;', 'new Map()', 'yield',
            'fetch(', 'stdin',
        ];
        const w = this._app.screen.width;
        const h = this._app.screen.height;

        for (let i = 0; i < 25; i++) {
            const text = snippets[Math.floor(Math.random() * snippets.length)];
            const color = STATE_COLORS[Math.floor(Math.random() * STATE_COLORS.length)];
            const t = new PIXI.Text(text, {
                fontFamily: 'monospace',
                fontSize: 11,
                fill: color,
            });
            t.alpha = 0.08 + Math.random() * 0.12;
            t.x = Math.random() * w;
            t.y = h + Math.random() * h;
            this._container.addChild(t);
            this._codeParticles.push({
                gfx: t,
                speed: 0.2 + Math.random() * 0.4,
                driftAmp: 10 + Math.random() * 20,
                driftPeriod: 3 + Math.random() * 5,
                baseX: t.x,
                time: Math.random() * 100,
            });
        }
    }

    // LAYER 6 — heartbeat pulse
    _buildLayer6() {
        this._pulseGfx = new PIXI.Graphics();
        this._container.addChild(this._pulseGfx);
    }

    // LAYER 7 — DOM buttons
    _buildLayer7() {
        const wrap = document.createElement('div');
        wrap.id = 'menu-buttons';
        wrap.style.cssText = [
            'position:fixed', 'bottom:15vh', 'left:50%', 'transform:translateX(-50%)',
            'display:flex', 'flex-direction:column', 'align-items:center', 'gap:12px',
            'z-index:10000', 'opacity:0', 'transition:opacity 0.5s ease',
        ].join(';');

        const btnStyle = [
            'background:rgba(10,10,20,0.85)',
            'border:1px solid rgba(106,216,154,0.2)',
            'color:#b0b0b0',
            "font:500 15px 'Courier New',monospace",
            'padding:14px 56px',
            'min-width:240px',
            'text-align:center',
            'letter-spacing:3px',
            'text-transform:uppercase',
            'cursor:pointer',
            'transition:all 0.25s ease',
            'border-radius:2px',
        ].join(';');

        const hoverCSS = document.createElement('style');
        hoverCSS.textContent = `
            #menu-buttons button:hover {
                border-color: rgba(106,216,154,0.6) !important;
                color: #6AD89A !important;
                background: rgba(106,216,154,0.06) !important;
                box-shadow: 0 0 20px rgba(106,216,154,0.1);
            }
        `;
        document.head.appendChild(hoverCSS);
        this._domEls.push(hoverCSS);

        const btns = [
            { label: '\u25B6  START', action: () => this.hide() },
            { label: '\u25C9  DEMO MODE', action: () => { if (this._onDemo) { this._onStart = this._onDemo; this.hide(); } } },
            { label: '\u2699  SETTINGS', action: () => { if (this._onSettings) this._onSettings(); } },
        ];

        btns.forEach(({ label, action }) => {
            const b = document.createElement('button');
            b.textContent = label;
            b.style.cssText = btnStyle;
            b.addEventListener('click', action);
            wrap.appendChild(b);
        });

        document.body.appendChild(wrap);
        this._domEls.push(wrap);
        this._btnWrap = wrap;
    }

    // LAYER 8 — corner text
    _buildLayer8() {
        const cornerStyle = "position:fixed;bottom:20px;font:11px 'Courier New',monospace;color:#333;z-index:10000;opacity:0;transition:opacity 0.5s ease";

        const right = document.createElement('div');
        right.style.cssText = cornerStyle + ';right:20px';
        right.textContent = 'Joc realizat pentru ROG 20-Year Coding Challenge 2026';
        document.body.appendChild(right);
        this._domEls.push(right);

        const left = document.createElement('div');
        left.style.cssText = cornerStyle + ';left:20px';
        left.textContent = 'v0.1 \u2014 David Amariei';
        document.body.appendChild(left);
        this._domEls.push(left);

        this._cornerEls = [right, left];
    }

    _update(delta) {
        if (this._destroyed) return;
        const elapsed = (Date.now() - this._startTime) / 1000;
        const w = this._app.screen.width;
        const h = this._app.screen.height;

        // --- Layer 1: drift circles ---
        for (const c of this._bgCircles) {
            c.gfx.x += c.vx * delta;
            c.gfx.y += c.vy * delta;
            if (c.gfx.x < -400) c.gfx.x = w + 400;
            if (c.gfx.x > w + 400) c.gfx.x = -400;
            if (c.gfx.y < -400) c.gfx.y = h + 400;
            if (c.gfx.y > h + 400) c.gfx.y = -400;
        }

        // --- Layer 3: ECG drawing ---
        if (elapsed > 0.3 && this._ecgDrawIdx < this._ecgPoints.length) {
            const ecgElapsed = elapsed - 0.3;
            const ecgDuration = 1.7; // 0.3 to 2.0
            const targetIdx = Math.min(
                this._ecgPoints.length,
                Math.floor((ecgElapsed / ecgDuration) * this._ecgPoints.length)
            );

            if (targetIdx > this._ecgDrawIdx) {
                this._ecgDrawIdx = targetIdx;
                const pts = this._ecgPoints.slice(0, this._ecgDrawIdx);

                // glow
                this._ecgGlow.clear();
                if (pts.length > 1) {
                    this._ecgGlow.lineStyle(6, 0x6AD89A, 0.3);
                    this._ecgGlow.moveTo(pts[0].x, pts[0].y);
                    for (let i = 1; i < pts.length; i++) this._ecgGlow.lineTo(pts[i].x, pts[i].y);
                }

                // main line
                this._ecgLine.clear();
                if (pts.length > 1) {
                    this._ecgLine.lineStyle(2, 0x6AD89A, 1.0);
                    this._ecgLine.moveTo(pts[0].x, pts[0].y);
                    for (let i = 1; i < pts.length; i++) this._ecgLine.lineTo(pts[i].x, pts[i].y);
                }

                // title mask — reveal as ECG passes center
                if (pts.length > 0) {
                    const lastX = pts[pts.length - 1].x;
                    this._titleMask.clear();
                    this._titleMask.beginFill(0xffffff);
                    this._titleMask.drawRect(0, 0, lastX, h);
                    this._titleMask.endFill();
                }
            }
        }

        // title glow pulse after reveal (at 72bpm)
        if (elapsed > 2.0) {
            const pulse = Math.sin((elapsed - 2.0) * (72 / 60) * Math.PI * 2) * 0.5 + 0.5;
            this._titleGlow.alpha = 0.08 + pulse * 0.07;
            this._titleGlow.scale.set(1.0 + pulse * 0.04);
        }

        // subtitle fade in (2.0 to 2.5)
        if (elapsed > 2.0 && elapsed < 2.5) {
            this._subtitleText.alpha = easeOutQuad((elapsed - 2.0) / 0.5);
        } else if (elapsed >= 2.5) {
            this._subtitleText.alpha = 1;
        }

        // --- Layer 4: ghost ---
        if (elapsed > 2.0) {
            const ghostElapsed = Math.min(elapsed - 2.0, 0.6);
            const t = ghostElapsed / 0.6;
            this._ghostScale = easeOutElastic(t);
            this._ghostContainer.scale.set(this._ghostScale);

            // bob
            this._ghostBobTick += delta;
            const bob = Math.sin((this._ghostBobTick / 150) * Math.PI * 2) * 6;
            this._ghostContainer.y = this._app.screen.height * 0.28 + bob;

            // color cycling (12s full cycle)
            this._ghostColorTime += delta / 60;
            const cyclePos = (this._ghostColorTime / 12) % 1;
            const totalColors = STATE_COLORS.length;
            const colorFloat = cyclePos * totalColors;
            const ci = Math.floor(colorFloat) % totalColors;
            const ni = (ci + 1) % totalColors;
            const cf = colorFloat - Math.floor(colorFloat);
            const ghostColor = lerpColor(STATE_COLORS[ci], STATE_COLORS[ni], cf);
            this._drawMenuGhostShape(this._ghostGlowGfx, ghostColor, 0.15);
            this._drawMenuGhostShape(this._ghostBodyGfx, ghostColor, 0.9);

            // blink
            this._ghostBlinkTimer -= delta / 60;
            if (this._ghostBlinking) {
                this._ghostBlinkDur -= delta / 60;
                if (this._ghostBlinkDur <= 0) {
                    this._ghostBlinking = false;
                    this._ghostBlinkTimer = 3 + Math.random() * 2;
                    this._drawMenuGhostEyes(false);
                }
            } else if (this._ghostBlinkTimer <= 0) {
                this._ghostBlinking = true;
                this._ghostBlinkDur = 0.15;
                this._drawMenuGhostEyes(true);
            }
        }

        // --- Layer 5: code particles ---
        for (const p of this._codeParticles) {
            p.time += delta / 60;
            p.gfx.y -= p.speed * delta;
            p.gfx.x = p.baseX + Math.sin(p.time * (Math.PI * 2) / p.driftPeriod) * p.driftAmp;
            if (p.gfx.y < -20) {
                p.gfx.y = h + 20;
                p.baseX = Math.random() * w;
                p.gfx.x = p.baseX;
            }
        }

        // --- Layer 6: heartbeat pulse ---
        this._pulsePhase += (delta / 60) / 0.833; // 72bpm = 0.833s per beat
        if (this._pulsePhase >= 1) this._pulsePhase -= 1;
        this._pulseGfx.clear();
        if (this._pulsePhase < 0.48) {
            const pt = this._pulsePhase / 0.48;
            const eased = easeOutQuad(pt);
            const radius = eased * 400;
            const alpha = 0.04 * (1 - eased);
            if (alpha > 0.001) {
                this._pulseGfx.beginFill(0x6AD89A, alpha);
                this._pulseGfx.drawCircle(w / 2, h / 2, radius);
                this._pulseGfx.endFill();
            }
        }

        // --- Layer 7+8: DOM fade-in at t=2.5s ---
        if (elapsed >= 2.5 && this._btnWrap && this._btnWrap.style.opacity === '0') {
            this._btnWrap.style.opacity = '1';
            if (this._cornerEls) this._cornerEls.forEach(el => { el.style.opacity = '1'; });
        }
    }
}
