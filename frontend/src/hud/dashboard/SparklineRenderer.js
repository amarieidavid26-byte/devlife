// HRV trend sparkline (last 30 readings)

export const HRV_MAX_POINTS = 30;

export function hexToRgba(hex, a) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
}

export class SparklineRenderer {
    constructor(canvas) {
        this._canvas = canvas;
        this._ctx = canvas.getContext('2d');
        this.values = [];
    }

    push(v) {
        this.values.push(v);
        if (this.values.length > HRV_MAX_POINTS) this.values.shift();
    }

    resize() {
        const canvas = this._canvas;
        const rect   = canvas.parentElement.getBoundingClientRect();
        const dpr    = window.devicePixelRatio || 1;
        canvas.width  = rect.width * dpr;
        canvas.height = 80 * dpr;
        this._ctx.setTransform(1, 0, 0, 1, 0, 0);
        this._ctx.scale(dpr, dpr);
        canvas._w = rect.width;
        canvas._h = 80;
    }

    draw(color) {
        const canvas = this._canvas;
        const W = canvas._w, H = canvas._h;
        if (!W || this.values.length < 2) return;
        const ctx = this._ctx;
        const vals = this.values;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(30,24,16,0.3)'; ctx.fillRect(0, 0, W, H);
        const min  = Math.max(0, Math.min(...vals) - 5);
        const max  = Math.max(...vals) + 5;
        const range = max - min || 1;
        const padX = 6, padY = 14;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(padX, H - padY);
        for (let i = 0; i < vals.length; i++) {
            const x = padX + (i / (HRV_MAX_POINTS - 1)) * (W - padX * 2);
            const y = H - padY - ((vals[i] - min) / range) * (H - padY * 2);
            ctx.lineTo(x,y);
        }
        ctx.lineTo(padX + ((vals.length-1) / (HRV_MAX_POINTS-1)) * (W - padX*2), H - padY);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(color, 0.08);
        ctx.fill(); ctx.restore();

        ctx.save();
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
        ctx.shadowBlur = 8; ctx.shadowColor = color; ctx.beginPath();
        for (let i = 0; i < vals.length; i++) {
            const x = padX + (i / (HRV_MAX_POINTS - 1)) * (W - padX * 2);
            const y = H - padY - ((vals[i] - min) / range) * (H - padY * 2);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0; ctx.fillStyle = color;
        for (let i = 0; i < vals.length; i++) {
            const x = padX + (i / (HRV_MAX_POINTS - 1)) * (W - padX * 2);
            const y = H - padY - ((vals[i] - min) / range) * (H - padY * 2);
            ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = '#B8A88C'; ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(max) + ' ms', W - 8, 12);
        ctx.textAlign = 'left'; ctx.fillStyle = color;
        ctx.fillText(Math.round(vals[vals.length - 1]) + ' ms', 8, 12);
    }
}
