// the fake-but-plausible ECG trace at the bottom of the dashboard
// one PQRST-ish beat shape stamped into a scrolling buffer at the live BPM

const BEAT_SHAPE = [
    0.5, 0.5, 0.5, 0.5,
    0.44, 0.38, 0.38, 0.44,
    0.5, 0.5,
    0.58,
    0.14, 0.07, 0.14,
    0.64, 0.58,
    0.5, 0.5, 0.5,
    0.40, 0.33, 0.30, 0.33, 0.40,
    0.5, 0.5, 0.5, 0.5,
];

export class ECGRenderer {
    constructor(canvas) {
        this._canvas = canvas;
        this._ctx = canvas.getContext('2d');
        this.color = '#6AD89A';
        this.targetBPM = 72;
        this.bpm = 72;
        this._buffer = [];
        this._beatIndex = -1;
        this._msSinceBeat = 0;
        this._lastTs = null;
    }

    resize() {
        const canvas = this._canvas;
        const rect   = canvas.parentElement.getBoundingClientRect();
        const dpr    = window.devicePixelRatio || 1;
        canvas.width  = rect.width  * dpr;
        canvas.height = rect.height * dpr;
        this._ctx.setTransform(1, 0, 0, 1, 0, 0);
        this._ctx.scale(dpr, dpr);
        canvas._w = rect.width;
        canvas._h = rect.height;
        const newLen = Math.ceil(rect.width);
        const old    = this._buffer;
        this._buffer = new Array(newLen).fill(0.5);
        if (old.length) {
            const start = Math.max(0, old.length - newLen);
            for (let i = start; i < old.length; i++) this._buffer[newLen - (old.length - i)] = old[i];
        }
    }

    tick(ts) {
        if (this._lastTs !== null && this._buffer.length > 0) {
            const delta = Math.min(ts - this._lastTs, 50);
            this.bpm += (this.targetBPM - this.bpm) * 0.05;
            const beatInterval = 60000 / Math.max(30, Math.min(150, this.bpm));
            this._msSinceBeat += delta;
            if (this._beatIndex < 0 && this._msSinceBeat >= beatInterval) {
                this._msSinceBeat -= beatInterval;
                this._beatIndex = 0;
            }
            this._buffer.shift();
            if (this._beatIndex >= 0 && this._beatIndex < BEAT_SHAPE.length) {
                this._buffer.push(BEAT_SHAPE[this._beatIndex++]);
            } else {
                this._buffer.push(0.5);
                if (this._beatIndex >= BEAT_SHAPE.length) this._beatIndex = -1;
            }
            this._draw();
        }
        this._lastTs = ts;
    }

    _draw() {
        const canvas = this._canvas;
        const W = canvas._w, H = canvas._h;
        if (!W) return;
        const ctx = this._ctx;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(30,24,16,0.45)';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(255,228,181,0.025)'; ctx.lineWidth = 0.5;
        for (let x = 0; x < W; x += 20) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
        for (let y = 0; y < H; y += 20) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,228,181,0.05)'; ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 100) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
        for (let y = 0; y < H; y += 100) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,228,181,0.06)';
        ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke();
        const buf = this._buffer, len = buf.length, pad = 12;
        ctx.save();
        ctx.strokeStyle = this.color; ctx.globalAlpha = 0.15; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.beginPath();
        for (let i = 0; i < len; i++) { const x=(i/len)*W, y=buf[i]*(H-pad*2)+pad; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); }
        ctx.stroke(); ctx.restore();

        ctx.save();
        ctx.shadowBlur = 10; ctx.shadowColor = this.color;
        ctx.strokeStyle = this.color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < len; i++) { const x=(i/len)*W, y=buf[i]*(H-pad*2)+pad; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); }
        ctx.stroke();
        const lastY = buf[len-1]*(H-pad*2)+pad;
        ctx.shadowBlur = 16; ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(W-1, lastY, 3.5, 0, Math.PI*2); ctx.fill();
        ctx.restore();
    }
}
