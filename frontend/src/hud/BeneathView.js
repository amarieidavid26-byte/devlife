// "Beneath the Surface" — TAB overlay that reveals the invisible biometric layer

const STATE_COLORS = {
    DEEP_FOCUS: '#8000ff',
    STRESSED:   '#ff5050',
    FATIGUED:   '#ffa000',
    RELAXED:    '#00c864',
    WIRED:      '#0096ff',
};

export class BeneathView {
    constructor() {
        this._visible    = false;
        this._data       = { heartRate: '—', hrv: '—', recovery: '—', state: 'RELAXED' };
        this._playerPos  = { x: window.innerWidth / 2,       y: window.innerHeight / 2 };
        this._ghostPos   = { x: window.innerWidth / 2 + 120, y: window.innerHeight / 2 - 40 };
        this._animFrame  = null;
        this._startTs    = 0;
        this._particles  = [];
        this._floaters   = [];
        this._lastParticleSpawn = 0;
        this._lastFloaterSpawn  = 0;

        this._canvas = document.createElement('canvas');
        this._canvas.style.cssText = [
            'position:fixed;top:0;left:0',
            'width:100vw;height:100vh',
            'pointer-events:none',
            'z-index:500',
            'display:none',
        ].join(';');
        this._resize();
        document.body.appendChild(this._canvas);
        this._ctx = this._canvas.getContext('2d');

        window.addEventListener('resize', () => this._resize());
    }

    _resize() {
        this._canvas.width  = window.innerWidth;
        this._canvas.height = window.innerHeight;
    }

    update(data) {
        this._data = { ...this._data, ...data };
    }

    setPositions(playerScreen, ghostScreen) {
        this._playerPos = playerScreen;
        this._ghostPos  = ghostScreen;
    }

    toggle() {
        this._visible ? this.hide() : this.show();
        return this._visible;
    }

    show() {
        this._visible   = true;
        this._particles = [];
        this._floaters  = [];
        this._lastParticleSpawn = 0;
        this._lastFloaterSpawn  = 0;
        this._canvas.style.display = 'block';
        this._startTs = performance.now();
        const tick = (ts) => {
            if (!this._visible) return;
            this._draw(ts);
            this._animFrame = requestAnimationFrame(tick);
        };
        this._animFrame = requestAnimationFrame(tick);
    }

    hide() {
        this._visible = false;
        this._canvas.style.display = 'none';
        if (this._animFrame) { cancelAnimationFrame(this._animFrame); this._animFrame = null; }
    }

    _col() {
        return STATE_COLORS[this._data.state] || '#ffffff';
    }

    _draw(ts) {
        const ctx = this._ctx;
        const W   = this._canvas.width;
        const H   = this._canvas.height;
        const col = this._col();
        const t   = (ts - this._startTs) / 1000;
        const px  = this._playerPos.x;
        const py  = this._playerPos.y;
        const gx  = this._ghostPos.x;
        const gy  = this._ghostPos.y;

        ctx.clearRect(0, 0, W, H);

        // ── 1. Dark translucent overlay ────────────────────────────────────────
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 0, W, H);

        // ── 2. Scanline grid (X-ray / thermal feel) ────────────────────────────
        ctx.save();
        ctx.globalAlpha = 0.035;
        ctx.fillStyle   = col;
        for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
        ctx.restore();

        // ── 3. Pulsing heartbeat rings around player ───────────────────────────
        const bpm          = parseFloat(this._data.heartRate) || 72;
        const beatInterval = 60 / bpm;
        const beatPhase    = (t % beatInterval) / beatInterval; // 0..1

        for (let ring = 0; ring < 3; ring++) {
            const phase  = (beatPhase + ring * 0.18) % 1;
            const radius = 55 + phase * 130;
            const alpha  = (1 - phase) * 0.4;
            ctx.save();
            ctx.strokeStyle  = col;
            ctx.lineWidth    = 2.5 - phase * 2;
            ctx.globalAlpha  = alpha;
            ctx.shadowColor  = col;
            ctx.shadowBlur   = 14;
            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Inner steady glow ring
        const innerScale = 0.88 + Math.sin(t * (bpm / 60) * Math.PI * 2) * 0.12;
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth   = 2.5;
        ctx.globalAlpha = 0.75;
        ctx.shadowColor = col;
        ctx.shadowBlur  = 20;
        ctx.beginPath();
        ctx.arc(px, py, 32 * innerScale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // ── 4. Particle streams (veins) player → ghost ─────────────────────────
        if (ts - this._lastParticleSpawn > 160) {
            this._lastParticleSpawn = ts;
            const angle  = Math.atan2(gy - py, gx - px);
            const spread = (Math.random() - 0.5) * 0.55;
            this._particles.push({
                x:    px + (Math.random() - 0.5) * 18,
                y:    py + (Math.random() - 0.5) * 18,
                vx:   Math.cos(angle + spread) * (2.2 + Math.random() * 2),
                vy:   Math.sin(angle + spread) * (2.2 + Math.random() * 2),
                life: 1.0,
                size: 2 + Math.random() * 2.5,
            });
        }

        this._particles = this._particles.filter(p => p.life > 0);
        for (const p of this._particles) {
            p.x    += p.vx;
            p.y    += p.vy;
            p.life -= 0.011;
            ctx.save();
            ctx.globalAlpha = p.life * 0.85;
            ctx.fillStyle   = col;
            ctx.shadowColor = col;
            ctx.shadowBlur  = 7;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // ── 5. Floating biometric numbers near player ─────────────────────────
        if (ts - this._lastFloaterSpawn > 2200) {
            this._lastFloaterSpawn = ts;
            const labels = [
                `❤ ${Math.round(parseFloat(this._data.heartRate) || 0)} bpm`,
                `HRV ${Math.round(parseFloat(this._data.hrv) || 0)}ms`,
                `REC ${parseFloat(this._data.recovery) || 0}%`,
            ];
            labels.forEach((text, i) => {
                this._floaters.push({
                    text,
                    x:     px + (Math.random() - 0.5) * 90,
                    y:     py - 30 - i * 22,
                    vy:    -(0.28 + Math.random() * 0.25),
                    alpha: 1.0,
                    born:  ts + i * 250,
                });
            });
        }

        this._floaters = this._floaters.filter(f => f.alpha > 0);
        for (const f of this._floaters) {
            const age = ts - f.born;
            if (age < 0) continue;
            f.y    += f.vy;
            f.alpha = Math.max(0, 1 - age / 3200);
            ctx.save();
            ctx.globalAlpha = f.alpha;
            ctx.font        = 'bold 15px monospace';
            ctx.fillStyle   = col;
            ctx.shadowColor = col;
            ctx.shadowBlur  = 10;
            ctx.textAlign   = 'center';
            ctx.fillText(f.text, f.x, f.y);
            ctx.restore();
        }

        // ── 6. State label above player ────────────────────────────────────────
        ctx.save();
        ctx.font        = 'bold 12px monospace';
        ctx.fillStyle   = col;
        ctx.shadowColor = col;
        ctx.shadowBlur  = 10;
        ctx.globalAlpha = 0.75;
        ctx.textAlign   = 'center';
        ctx.fillText(this._data.state, px, py - 50);
        ctx.restore();

        // ── 7. Title at top center ─────────────────────────────────────────────
        const titleAlpha = 0.85 + Math.sin(t * 1.6) * 0.12;
        ctx.save();
        ctx.font        = 'bold 20px "Segoe UI", monospace';
        ctx.fillStyle   = col;
        ctx.shadowColor = col;
        ctx.shadowBlur  = 24;
        ctx.globalAlpha = titleAlpha;
        ctx.textAlign   = 'center';
        ctx.fillText('👁  BENEATH THE SURFACE', W / 2, 52);

        // Subtitle
        ctx.font        = '12px monospace';
        ctx.fillStyle   = '#aaaaaa';
        ctx.shadowBlur  = 0;
        ctx.globalAlpha = 0.5;
        ctx.fillText('what ghost sees — press TAB to hide', W / 2, 72);
        ctx.restore();

        // ── 8. Large biometric readout (bottom center) ────────────────────────
        const stats = [
            { label: 'HEART RATE', value: `${Math.round(parseFloat(this._data.heartRate) || 0)}`, unit: 'bpm' },
            { label: 'HRV',        value: `${Math.round(parseFloat(this._data.hrv) || 0)}`,        unit: 'ms'  },
            { label: 'RECOVERY',   value: `${parseFloat(this._data.recovery) || 0}`,               unit: '%'   },
        ];

        const blockW  = 180;
        const totalW  = blockW * stats.length;
        const startX  = W / 2 - totalW / 2 + blockW / 2;
        const baseY   = H - 72;

        stats.forEach((s, i) => {
            const bx = startX + i * blockW;
            ctx.save();
            ctx.textAlign   = 'center';
            ctx.globalAlpha = 0.85;

            ctx.font      = '10px monospace';
            ctx.fillStyle = '#777';
            ctx.shadowBlur = 0;
            ctx.fillText(s.label, bx, baseY - 34);

            ctx.font        = 'bold 40px monospace';
            ctx.fillStyle   = col;
            ctx.shadowColor = col;
            ctx.shadowBlur  = 18;
            ctx.fillText(s.value, bx, baseY);

            ctx.font        = '13px monospace';
            ctx.fillStyle   = '#aaaaaa';
            ctx.shadowBlur  = 0;
            ctx.fillText(s.unit, bx, baseY + 20);
            ctx.restore();
        });
    }
}
