const STATE_COLORS = {
    DEEP_FOCUS: '#8000ff',
    STRESSED:   '#ff5050',
    FATIGUED:   '#ffa000',
    RELAXED:    '#00c864',
    WIRED:      '#0096ff',
};

export class BeneathView {
    constructor() {
        this._visible   = false;
        this._data      = { heartRate: '—', hrv: '—', recovery: '—', state: 'RELAXED' };
        this._playerPos = { x: window.innerWidth / 2,       y: window.innerHeight / 2 };
        this._ghostPos  = { x: window.innerWidth / 2 + 120, y: window.innerHeight / 2 - 40 };
        this._animFrame = null;
        this._startTs   = 0;
        this._particles = [];
        this._lastParticleSpawn = 0;

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
        if (this._animFrame) { cancelAnimationFrame(this._animFrame); this._animFrame = null; }
        this._visible   = true;
        this._particles = [];
        this._lastParticleSpawn = 0;
        this._canvas.style.display = 'block';
        this._startTs = performance.now();
        const tick = (ts) => {
            if (!this._visible) return;
            try { this._draw(ts); } catch (e) { console.warn('[BeneathView]', e); }
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

        ctx.globalAlpha     = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.shadowBlur      = 0;
        ctx.shadowColor     = 'transparent';
        ctx.clearRect(0, 0, W, H);

        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.globalAlpha = 0.03;
        ctx.fillStyle   = col;
        for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
        ctx.restore();

        const bpm          = parseFloat(this._data.heartRate) || 72;
        const beatInterval = 60 / bpm;
        const beatPhase    = (t % beatInterval) / beatInterval;

        for (let ring = 0; ring < 3; ring++) {
            const phase  = (beatPhase + ring * 0.18) % 1;
            const radius = 55 + phase * 130;
            const alpha  = (1 - phase) * 0.4;
            ctx.save();
            ctx.strokeStyle = col;
            ctx.lineWidth   = Math.max(0.1, 2.5 - phase * 2);
            ctx.globalAlpha = alpha;
            ctx.shadowColor = col;
            ctx.shadowBlur  = 14;
            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

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

        this._particles = this._particles.filter(p => p.life > 0.01);
        for (const p of this._particles) {
            p.x    += p.vx;
            p.y    += p.vy;
            p.life -= 0.011;
            const r = Math.max(0.1, p.size * p.life);
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.life * 0.85);
            ctx.fillStyle   = col;
            ctx.shadowColor = col;
            ctx.shadowBlur  = 7;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        const hrv      = parseFloat(this._data.hrv)      || 0;
        const recovery = parseFloat(this._data.recovery)  || 0;
        const metrics  = [
            `❤  ${Math.round(bpm)} bpm`,
            `HRV  ${Math.round(hrv)} ms`,
            `REC  ${recovery}%`,
        ];

        metrics.forEach((text, i) => {
            const ox = Math.sin(t * 0.7 + i * 1.8) * 8;
            const oy = Math.sin(t * 0.5 + i * 2.2) * 4;
            const ax = px - 110 + i * 110 + ox;
            const ay = py - 48 + oy;
            ctx.save();
            ctx.globalAlpha = 0.88;
            ctx.font        = 'bold 14px monospace';
            ctx.fillStyle   = col;
            ctx.shadowColor = col;
            ctx.shadowBlur  = 10;
            ctx.textAlign   = 'center';
            ctx.fillText(text, ax, ay);
            ctx.restore();
        });

        ctx.save();
        ctx.font        = 'bold 12px monospace';
        ctx.fillStyle   = col;
        ctx.shadowColor = col;
        ctx.shadowBlur  = 10;
        ctx.globalAlpha = 0.65;
        ctx.textAlign   = 'center';
        ctx.fillText(this._data.state, px, py - 90);
        ctx.restore();

        ctx.save();
        ctx.font        = 'bold 20px "Segoe UI", monospace';
        ctx.fillStyle   = col;
        ctx.shadowColor = col;
        ctx.shadowBlur  = 24;
        ctx.globalAlpha = 0.85 + Math.sin(t * 1.6) * 0.1;
        ctx.textAlign   = 'center';
        ctx.fillText('👁  BENEATH THE SURFACE', W / 2, 52);
        ctx.restore();

        ctx.save();
        ctx.font        = '12px monospace';
        ctx.fillStyle   = '#aaaaaa';
        ctx.globalAlpha = 0.5;
        ctx.textAlign   = 'center';
        ctx.fillText('what ghost sees — press TAB to hide', W / 2, 72);
        ctx.restore();

        const stats = [
            { label: 'HEART RATE', value: `${Math.round(bpm)}`,        unit: 'bpm' },
            { label: 'HRV',        value: `${Math.round(hrv)}`,         unit: 'ms'  },
            { label: 'RECOVERY',   value: `${Math.round(recovery)}`,    unit: '%'   },
        ];

        const blockW = 180;
        const startX = W / 2 - blockW * (stats.length - 1) / 2;
        const baseY  = H - 72;

        stats.forEach((s, i) => {
            const bx = startX + i * blockW;
            ctx.save();
            ctx.textAlign   = 'center';
            ctx.globalAlpha = 0.9;

            ctx.font        = '10px monospace';
            ctx.fillStyle   = '#777777';
            ctx.shadowBlur  = 0;
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
