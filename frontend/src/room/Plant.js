import * as PIXI from 'pixi.js';

const STATE_FLOWER_COLORS = {
    DEEP_FOCUS: 0x8000ff,
    STRESSED: 0xff5050,
    FATIGUED: 0xffa000,
    RELAXED: 0x00c864,
    WIRED: 0x0096ff,
};

function getStage(health) {
    if (health <= 15) return 'dead';
    if (health <= 30) return 'withering';
    if (health <= 50) return 'seedling';
    if (health <= 70) return 'sprout';
    if (health <= 85) return 'growing';
    return 'blooming';
}

export class Plant {
    constructor() {
        this.container = new PIXI.Container();
        this._health = 50;
        this._displayHealth = 50;
        this._lastDrawnHealth = -1;
        this._stage = 'seedling';
        this._flowerColor = 0x00c864;
        this._tick = 0;
        this._plantGfx = new PIXI.Graphics();
        this.container.addChild(this._plantGfx);
        this._particleContainer = new PIXI.Container();
        this.container.addChild(this._particleContainer);
        this._particles = [];
        this._draw();    
    }

    adjustHealth(delta) {
        this._health = Math.max(0, Math.min(100, this._health + delta));
        this._stage = getStage(this._health);
    }

    setHealth(health) {
        this._health = Math.max(0, Math.min(100, health));
        this._stage = getStage(this._health);
    }

    getStateColor(state) {
        this._flowerColor = STATE_FLOWER_COLORS[state] || 0x00c864;
    }

    update(delta) {
        this._tick += delta;

        this._displayHealth += (this._health - this._displayHealth) * 0.02 * delta;

        if (Math.abs(this._displayHealth - this._lastDrawnHealth) > 0.5) {
            this._draw();
        }
        if (this._stage == 'blooming' && Math.random() < 0.03 * delta) {
            this._spawnSparkle();

        }
        if ((this._stage == 'withering' || this._stage == 'dead') && Math.random() < 0.02 * delta) {
            this._spawnFallingLeaf();
        }
        this._updateParticles(delta);
    }

    _draw() {
        // console.log('plant stage:', this._stage)
        const g = this._plantGfx;
        const h = this._displayHealth;
        this._lastDrawnHealth = h;
        g.clear();
        const stage = getStage(h);
        if (stage == 'dead')    this._drawDead(g);
        else if (stage == 'withering') this._drawWithering(g, h);
        else if (stage == 'seedling') this._drawSeedling(g, h);
        else if (stage == 'sprout') this._drawSprout(g, h);
        else if (stage == 'growing') this._drawGrowing(g, h);
        else this._drawBlooming(g, h);
    }

    _drawDead(g) {
        g.beginFill(0x8B4513);
        g.drawRect(-1, -20, 3, 30);
        g.endFill();
        g.lineStyle(2, 0x6B3010);
        g.moveTo(1, -20);
        g.quadraticCurveTo(10, -24, 14, -14);
        g.lineStyle(0);
    }

    _drawWithering(g, h) {
        const t = (h - 16) / 14;
        const stemH = 16 + t * 8;
        g.beginFill(0x8B7530);
        g.drawRect(-1, -stemH + 10, 2, stemH);
        g.endFill();
        g.beginFill(0xA89030, 0.7);
        g.drawEllipse(-7, -stemH + 18, 6, 3);
        g.endFill();
        g.beginFill(0x998020, 0.6);
        g.drawEllipse(6, -stemH + 22, 5, 3);
        g.endFill();
    }

    _drawSeedling(g, h) {
        const t = (h - 31) / 19;
        const nubH = 4 + t * 8;
        g.beginFill(0x55cc44);
        g.drawRect(-1, 10 - nubH, 2, nubH);
        g.endFill();
        g.beginFill(0x66dd55);
        g.drawEllipse(-3, 10 - nubH, 3 + t * 2, 2);
        g.drawEllipse(3, 10 - nubH + 1, 3 + t, 2);
        g.endFill();
    }

    _drawSprout(g, h) {
        const t = (h - 51) / 19;
        const stemH = 14 + t * 10;
        g.beginFill(0x33aa28);
        g.drawRect(-1, 10 - stemH, 2, stemH);
        g.endFill();
        g.beginFill(0x44cc38);
        g.drawEllipse(-7, 10 - stemH * 0.4, 7 + t * 2, 4);
        g.endFill();
        g.beginFill(0x3bbb30);
        g.drawEllipse(7, 10 - stemH * 0.65, 6 + t * 2, 3.5);
        g.endFill();
    }

    _drawGrowing(g, h) {
        const t = (h - 71) / 14;
        const stemH = 26 + t * 10;

        g.beginFill(0x228B22);
        g.drawRect(-1, 10 - stemH, 3, stemH);
        g.endFill();
        g.beginFill(0x2da520);
        g.drawEllipse(-9, 10 - stemH * 0.3, 8, 5);
        g.drawEllipse(9, 10 - stemH * 0.5, 7, 4.5);
        g.drawEllipse(-7, 10 - stemH * 0.72, 7, 4);
        g.endFill();
        if (t > 0.5) {
            g.beginFill(0x35b830);
            g.drawEllipse(7, 10 - stemH * 0.88, 5, 3);
            g.endFill();
        }

        g.beginFill(0x55dd55);
        g.drawCircle(1, 10 - stemH, 3 + t * 2);
        g.endFill();
    }

    _drawBlooming(g, h) {
        const stemH = 40;
        const t = (h - 86) / 14;
        const sway = Math.sin(this._tick * 0.015) * 1.5;

        g.beginFill(0x1a7a15);
        g.drawRect(-1.5 + sway * 0.2, 10 - stemH, 3, stemH);
        g.endFill();

        g.beginFill(0x2da520);
        g.drawEllipse(-11 + sway, 10 - stemH * 0.25, 10, 6);
        g.drawEllipse(11 + sway,  10 - stemH * 0.42, 9, 5.5);
        g.drawEllipse(-9 + sway,  10 - stemH * 0.58, 9, 5);
        g.drawEllipse(9 + sway,   10 - stemH * 0.73, 8, 4);
        g.endFill();
        g.beginFill(0x35b830);
        g.drawEllipse(-6 + sway, 10 - stemH * 0.87, 6, 3.5);
        g.endFill();

        const flowerY = 10 - stemH - 5 + Math.sin(this._tick * 0.02) * 1;
        const petalSize = 5 + t * 3;

        g.beginFill(this._flowerColor, 0.9);
        for (let i = 0; i < 6; i++) {
            const angle = (i/6) * Math.PI * 2 + this._tick * 0.005;
            const px = sway + Math.cos(angle) * petalSize;
            const py = flowerY + Math.sin(angle) * petalSize * 0.7;
            g.drawEllipse(px, py, 4.5, 3.5);
        }
        g.endFill();
        g.beginFill(0xffee44);
        g.drawCircle(sway, flowerY, 3.5);
        g.endFill();
    }
    _spawnSparkle() {
        const g = new PIXI.Graphics();
        g.beginFill(this._flowerColor, 0.8);
        g.drawCircle(0, 0, 1 + Math.random() * 1.5);
        g.endFill();
        g.x = (Math.random() - 0.5) * 24;
        g.y = -30 + Math.random() * -10;
        this._particleContainer.addChild(g);
        this._particles.push({
            gfx: g,
            vy: -(0.2 + Math.random() * 0.3),
            vx: (Math.random() - 0.5) * 0.3,
            life: 0,
            maxLife: 60 + Math.random() * 40,
            type: 'sparkle',
        });
    }
    
    _spawnFallingLeaf() {
        const g = new PIXI.Graphics();
        const isYellow = this._stage == 'withering';
        g.beginFill(isYellow ? 0xBB9930 : 0x8B4513, 0.7);
        g.drawEllipse(0, 0, 3, 2);
        g.endFill();
        g.x = (Math.random() - 0.5) * 18;
        g.y = -8 - Math.random() * 18;
        this._particleContainer.addChild(g);
        this._particles.push({
            gfx: g,
            vy: 0.3 + Math.random() * 0.2,
            vx: (Math.random() - 0.5) * 0.5,
            life: 0,
            maxLife: 80 + Math.random() * 40,
            type: 'leaf',
        });
    }

    _updateParticles(delta) {
        for (let i = this._particles.length - 1; i >= 0; i--) {
            const p = this._particles[i];
            p.life += delta;
            p.gfx.x += p.vx * delta;
            p.gfx.y += p.vy * delta;
            const lifePct = p.life / p.maxLife;
            p.gfx.alpha = lifePct > 0.7 ? (1 - lifePct) / 0.3 : 0.8;
            if(p.type == 'leaf') {
                p.vx += (Math.random() - 0.5) * 0.05 * delta;
            }
            if(p.life >= p.maxLife) {
                p.gfx.destroy();
                this._particles.splice(i, 1);
            }
        }
    }
}