import * as PIXI from 'pixi.js';
const STATE_CONFIG = {
    DEEP_FOCUS: { color: 0x8000ff, r: 128, g: 0,   b: 255, particleSpeed: 0.3, particleCount: 18, alpha: 0.10 },
    STRESSED:   { color: 0xff5050, r: 255, g: 80,  b: 80,  particleSpeed: 2.0, particleCount: 40, alpha: 0.14 },
    FATIGUED:   { color: 0xffa000, r: 255, g: 160, b: 0,   particleSpeed: 0.2, particleCount: 12, alpha: 0.12 },
    RELAXED:    { color: 0x00c864, r: 0,   g: 200, b: 100, particleSpeed: 0.5, particleCount: 22, alpha: 0.08 },
    WIRED:      { color: 0x0096ff, r: 0,   g: 150, b: 255, particleSpeed: 3.0, particleCount: 35, alpha: 0.13 },
};

const DEFAULT_STATE = 'RELAXED';

export class Atmosphere {
    constructor(stage) {
        this.container = new PIXI.Container();
        stage.addChild(this.container);

        this._currentState = DEFAULT_STATE;
        this._targetState = DEFAULT_STATE;

        this._overlay = new PIXI.Graphics();
        this.container.addChild(this._overlay);

        this._particleContainer = new PIXI.Container();
        this.container.addChild(this._particleContainer);

        this._particles = [];
        this._lerpT = 1;

        const cfg = STATE_CONFIG[DEFAULT_STATE];
        this._curR = cfg.r; this._curG = cfg.g; this._curB = cfg.b;
        this._curAlpha = cfg.alpha;

        this._shake = null;

        this._flashAlpha = 0;
        this._flashColor = 0xffffff;
        this._flashOverlay = new PIXI.Graphics();
        this.container.addChild(this._flashOverlay);

        // Vignette overlay — darkened edges
        this._vignetteContainer = new PIXI.Container();
        this.container.addChild(this._vignetteContainer);
        this._buildVignette();

        // Ambient flicker
        this._flickerBase = 0;

        // State-transition burst particles
        this._burstParticles = [];
        this._burstContainer = new PIXI.Container();
        this.container.addChild(this._burstContainer);

        this._dustMotes = [];
        this._initDustMotes();
        this._initParticles();
        this._redrawOverlay();

        window.addEventListener('resize', () => this._buildVignette());
    }

    _initDustMotes() {
        for (let i = 0; i < 10; i++) {
            const g = new PIXI.Graphics();
            const alpha = 0.03 + Math.random() * 0.04;
            g.beginFill(0xffffff, alpha);
            g.drawCircle(0, 0, 1.5);
            g.endFill();
            g.x = Math.random() * window.innerWidth;
            g.y = Math.random() * window.innerHeight;
            this.container.addChild(g);
            this._dustMotes.push({
                gfx: g,
                vx: 0.05 + Math.random() * 0.1,
                baseY: g.y,
                sineAmp: 5,
                sinePeriod: 4 + Math.random() * 2,
                phase: Math.random() * Math.PI * 2,
            });
        }
    }

    // ── Vignette: darkened screen edges ──

    _buildVignette() {
        this._vignetteContainer.removeChildren();

        const w = window.innerWidth;
        const h = window.innerHeight;
        const STRIPS = 12;
        const edgeX = w * 0.15;
        const edgeY = h * 0.15;

        // Top edge
        for (let i = 0; i < STRIPS; i++) {
            const t = i / STRIPS;
            const alpha = 0.4 * (1 - t) * (1 - t); // quadratic falloff
            const stripH = edgeY / STRIPS;
            const g = new PIXI.Graphics();
            g.beginFill(0x000000, alpha);
            g.drawRect(0, t * edgeY, w, stripH);
            g.endFill();
            this._vignetteContainer.addChild(g);
        }

        // Bottom edge
        for (let i = 0; i < STRIPS; i++) {
            const t = i / STRIPS;
            const alpha = 0.4 * (1 - t) * (1 - t);
            const stripH = edgeY / STRIPS;
            const g = new PIXI.Graphics();
            g.beginFill(0x000000, alpha);
            g.drawRect(0, h - edgeY + t * edgeY, w, stripH);
            g.endFill();
            this._vignetteContainer.addChild(g);
        }

        // Left edge
        for (let i = 0; i < STRIPS; i++) {
            const t = i / STRIPS;
            const alpha = 0.35 * (1 - t) * (1 - t);
            const stripW = edgeX / STRIPS;
            const g = new PIXI.Graphics();
            g.beginFill(0x000000, alpha);
            g.drawRect(t * edgeX, 0, stripW, h);
            g.endFill();
            this._vignetteContainer.addChild(g);
        }

        // Right edge
        for (let i = 0; i < STRIPS; i++) {
            const t = i / STRIPS;
            const alpha = 0.35 * (1 - t) * (1 - t);
            const stripW = edgeX / STRIPS;
            const g = new PIXI.Graphics();
            g.beginFill(0x000000, alpha);
            g.drawRect(w - edgeX + t * edgeX, 0, stripW, h);
            g.endFill();
            this._vignetteContainer.addChild(g);
        }

        // Corners: extra darkness in the 4 corners (layered on top)
        const cornerAlpha = 0.25;
        const corners = [
            [0, 0],
            [w - edgeX, 0],
            [0, h - edgeY],
            [w - edgeX, h - edgeY],
        ];
        for (const [cx, cy] of corners) {
            const g = new PIXI.Graphics();
            g.beginFill(0x000000, cornerAlpha);
            g.drawRect(cx, cy, edgeX, edgeY);
            g.endFill();
            this._vignetteContainer.addChild(g);
        }
    }

    // ── State transition burst particles ──

    _spawnBurst(color) {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        for (let i = 0; i < 30; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 4;
            const size = 2 + Math.random() * 1.5;
            const g = new PIXI.Graphics();
            g.beginFill(color, 0.7 + Math.random() * 0.3);
            g.drawCircle(0, 0, size);
            g.endFill();
            g.x = cx;
            g.y = cy;
            this._burstContainer.addChild(g);
            this._burstParticles.push({
                gfx: g,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0,
                maxLife: 40,
            });
        }
    }

    setState(stateName) {
        if (!STATE_CONFIG[stateName]) return;
        if (stateName === this._currentState && this._lerpT >= 1) return;
        this._targetState = stateName;
        if (this._lerpT >= 1) {
            this._lerpT = 0;
            this._flashAlpha = 0.22;
            this._flashColor = STATE_CONFIG[stateName].color;
            this._spawnBurst(STATE_CONFIG[stateName].color);
        }
    }

    triggerShake(duration = 500, intensity = 4) {
        this._shake = { duration, maxDuration: duration, intensity };
    }

    applyScreenShake(gameContainer) {
        if (!this._shake || this._shake.duration <= 0) return;
        const pct = this._shake.duration / this._shake.maxDuration;
        const strength = this._shake.intensity * pct;
        gameContainer.x += (Math.random() - 0.5) * strength * 2;
        gameContainer.y += (Math.random() - 0.5) * strength * 2;
        this._shake.duration -= 16;
        if (this._shake.duration <= 0) this._shake = null;
    }

    transition(from, to) {
        this.setState(to);
    }

    setSleepMode(active) {
        this._sleepMode = active;
        this._sleepLerp = active ? 0 : 1;
    }

    // particle colors look weird on some monitors
    _initParticles() {
        const cfg = STATE_CONFIG[this._currentState];
        this._particles = [];
        this._particleContainer.removeChildren();
        for (let i = 0; i < 50; i++) {
            this._spawnParticle(cfg, true);
        }
    }

    _spawnParticle(cfg, randomY = false) {
        const g = new PIXI.Graphics();
        const size = 1.5 + Math.random() * 2.5;
        g.beginFill(cfg.color, 0.5 + Math.random() * 0.3);
        g.drawCircle(0, 0, size);
        g.endFill();

        const p = {
            gfx: g,
            x: Math.random() * window.innerWidth,
            y: randomY ? Math.random() * window.innerHeight : window.innerHeight + 10,
            vx: (Math.random() - 0.5) * cfg.particleSpeed,
            vy: -(0.2 + Math.random() * cfg.particleSpeed),
            life: 0,
            maxLife: 200 + Math.random() * 400,
            size,
        };

        p.gfx.x = p.x;
        p.gfx.y = p.y;
        this._particleContainer.addChild(p.gfx);
        this._particles.push(p);
    }

    _redrawOverlay() {
        const r = Math.round(this._curR);
        const g = Math.round(this._curG);
        const b = Math.round(this._curB);
        const color = (r << 16) | (g << 8) | b;

        this._overlay.clear();
        this._overlay.beginFill(color, this._curAlpha);
        this._overlay.drawRect(0, 0, window.innerWidth, window.innerHeight);
        this._overlay.endFill();
    }

    // TODO: this is kinda janky on resize
    update(delta) {
        if (this._sleepMode !== undefined) {
            const target = this._sleepMode ? 1 : 0;
            const speed = 0.006 * delta;
            if (this._sleepLerp < target) this._sleepLerp = Math.min(target, this._sleepLerp + speed);
            else if (this._sleepLerp > target) this._sleepLerp = Math.max(target, this._sleepLerp - speed * 2);

            if (this._sleepLerp > 0.01) {
                if (!this._sleepOverlay) {
                    this._sleepOverlay = new PIXI.Graphics();
                    this.container.addChild(this._sleepOverlay);
                }
                this._sleepOverlay.clear();
                this._sleepOverlay.beginFill(0x050510, 0.55 * this._sleepLerp);
                this._sleepOverlay.drawRect(0, 0, window.innerWidth, window.innerHeight);
                this._sleepOverlay.endFill();

                if (!this._sleepStars) this._sleepStars = [];
                while (this._sleepStars.length < 30) {
                    const star = new PIXI.Graphics();
                    const sz = 0.8 + Math.random() * 1.5;
                    star.beginFill(0xffffff, 0.4 + Math.random() * 0.4);
                    star.drawCircle(0, 0, sz);
                    star.endFill();
                    star.x = Math.random() * window.innerWidth;
                    star.y = Math.random() * window.innerHeight * 0.6;
                    star.alpha = 0;
                    this.container.addChild(star);
                    this._sleepStars.push({ gfx: star, phase: Math.random() * Math.PI * 2, speed: 0.3 + Math.random() * 0.7 });
                }
                for (const s of this._sleepStars) {
                    s.phase += 0.02 * s.speed * delta;
                    s.gfx.alpha = (0.3 + Math.sin(s.phase) * 0.3) * this._sleepLerp;
                }
            } else if (this._sleepStars) {
                for (const s of this._sleepStars) s.gfx.destroy();
                this._sleepStars = null;
                if (this._sleepOverlay) { this._sleepOverlay.clear(); }
            }
        }

        if (this._lerpT < 1) {
            this._lerpT = Math.min(1, this._lerpT + delta * 0.008);

            const fromCfg = STATE_CONFIG[this._currentState] || STATE_CONFIG[DEFAULT_STATE];
            const toCfg   = STATE_CONFIG[this._targetState]  || STATE_CONFIG[DEFAULT_STATE];

            this._curR     = fromCfg.r     + (toCfg.r     - fromCfg.r)     * this._lerpT;
            this._curG     = fromCfg.g     + (toCfg.g     - fromCfg.g)     * this._lerpT;
            this._curB     = fromCfg.b     + (toCfg.b     - fromCfg.b)     * this._lerpT;
            this._curAlpha = fromCfg.alpha + (toCfg.alpha - fromCfg.alpha) * this._lerpT;

            this._redrawOverlay();

            if (this._lerpT >= 1) {
                this._currentState = this._targetState;
            }
        }

        if (this._flashAlpha > 0) {
            this._flashAlpha = Math.max(0, this._flashAlpha - 0.018 * delta);
            this._flashOverlay.clear();
            if (this._flashAlpha > 0) {
                this._flashOverlay.beginFill(this._flashColor, this._flashAlpha);
                this._flashOverlay.drawRect(0, 0, window.innerWidth, window.innerHeight);
                this._flashOverlay.endFill();
            }
        }

        // dust motes — slow drift
        for (const d of this._dustMotes) {
            d.phase += (delta / 60) * (Math.PI * 2 / d.sinePeriod);
            d.gfx.x += d.vx * delta;
            d.gfx.y = d.baseY + Math.sin(d.phase) * d.sineAmp;
            if (d.gfx.x > window.innerWidth + 10) {
                d.gfx.x = -10;
                d.baseY = Math.random() * window.innerHeight;
            }
        }

        const cfg = STATE_CONFIG[this._currentState];
        const targetCount = cfg.particleCount;

        while (this._particles.length < targetCount) {
            this._spawnParticle(cfg, false);
        }

        for (let i = this._particles.length - 1; i >= 0; i--) {
            const p = this._particles[i];

            if (this._currentState === 'WIRED') {
                p.vx += (Math.random() - 0.5) * 0.4;
                p.vy += (Math.random() - 0.5) * 0.2;
                p.vx = Math.max(-4, Math.min(4, p.vx));
            }

            p.x += p.vx * delta;
            p.y += p.vy * delta;
            p.life += delta;

            const lifePct = p.life / p.maxLife;
            p.gfx.alpha = lifePct < 0.1
                ? lifePct / 0.1
                : lifePct > 0.8
                    ? (1 - lifePct) / 0.2
                    : 0.6;

            p.gfx.x = p.x;
            p.gfx.y = p.y;

            if (p.life >= p.maxLife || p.y < -20 || p.x < -20 || p.x > window.innerWidth + 20) {
                p.gfx.destroy();
                this._particles.splice(i, 1);
            }
        }

        while (this._particles.length > targetCount + 10) {
            const p = this._particles.shift();
            p.gfx.destroy();
        }

        // ── Ambient light flicker ──
        this._flickerBase += delta;
        const flicker = (Math.random() - 0.5) * 0.01;
        this._overlay.alpha = Math.max(0, Math.min(1, this._curAlpha + flicker));

        // ── State-transition burst particles ──
        for (let i = this._burstParticles.length - 1; i >= 0; i--) {
            const bp = this._burstParticles[i];
            bp.gfx.x += bp.vx * delta;
            bp.gfx.y += bp.vy * delta;
            bp.life += delta;
            const pct = bp.life / bp.maxLife;
            bp.gfx.alpha = 1 - pct;
            bp.gfx.scale.set(1 - pct * 0.5);
            if (bp.life >= bp.maxLife) {
                bp.gfx.destroy();
                this._burstParticles.splice(i, 1);
            }
        }
    }
}
