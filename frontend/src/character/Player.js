import * as PIXI from 'pixi.js';
import { cartToIso, TILE_WIDTH, TILE_HEIGHT } from '../utils/isometric.js';
import { GRID_SIZE } from '../room/Room.js';

const DIRECTIONS = {
    w: { dx: -1, dy: -1 },
    s: { dx:  1, dy:  1 },
    a: { dx: -1, dy:  1 },
    d: { dx:  1, dy: -1 },
};

const SPEED = 0.08;
const WALK_CYCLE = 40;

export class Player {
    constructor(stage, room, furniture = null) {
        this.room = room;
        this.container = new PIXI.Container();
        stage.addChild(this.container);

        this.gx = 5.5;
        this.gy = 5.5;

        this.gridX = 5;
        this.gridY = 5;

        this._keys = {};
        this._walkTick = 0;
        this._isMoving = false;
        this._isSitting = false;
        this._bobOffset = 0;
        this._furniture = furniture ?? null;

        this._dustParticles  = [];
        this._dustAccum      = 0;
        this._dustFootToggle = false;

        this._sleeping     = false;
        this._sleepTick    = 0;
        this._zzzParticles = [];

        this._shadow = new PIXI.Graphics();
        this._shadow.beginFill(0x000000, 0.28);
        this._shadow.drawEllipse(0, 0, 16, 6);
        this._shadow.endFill();
        this._shadow.y = 20;
        this.container.addChild(this._shadow);

        this._sprite = this._buildSprite();
        this.container.addChild(this._sprite);

        this._bindKeys();
        this._updateScreenPos();
    }

    _buildSprite() {
        const container = new PIXI.Container();
        const OL_C = 0x0d0d1a;

        this._legLeft  = new PIXI.Graphics();
        this._legRight = new PIXI.Graphics();
        this._drawLegs(0);
        container.addChild(this._legLeft);
        container.addChild(this._legRight);

        const body = new PIXI.Graphics();
        body.lineStyle(1.8, OL_C, 0.88);
        body.beginFill(0x4a6fa5);
        body.drawRoundedRect(-12, -28, 24, 28, 5);
        body.endFill();
        body.lineStyle(0);
        body.beginFill(0x3a5588);
        body.drawEllipse(0, -28, 8, 4.5);
        body.endFill();
        body.lineStyle(1, OL_C, 0.45);
        body.beginFill(0x3a5588);
        body.drawRoundedRect(-8, -14, 16, 10, 3);
        body.endFill();
        body.lineStyle(1, 0x1e3060, 0.5);
        body.moveTo(0, -28); body.lineTo(0, -4);
        container.addChild(body);

        this._armLeft  = new PIXI.Graphics();
        this._armRight = new PIXI.Graphics();
        this._drawArms(0);
        container.addChild(this._armLeft);
        container.addChild(this._armRight);

        const head = new PIXI.Graphics();
        head.lineStyle(1.8, OL_C, 0.88);
        head.beginFill(0xf8c9a0);
        head.drawEllipse(0, -38, 13, 14);
        head.endFill();
        head.lineStyle(0);
        head.beginFill(0xffffff, 0.95);
        head.drawCircle(-4,   -39.5, 3.5);
        head.drawCircle( 4,   -39.5, 3.5);
        head.endFill();
        head.beginFill(0x1a1440);
        head.drawCircle(-3.5, -39.5, 2.0);
        head.drawCircle( 4.5, -39.5, 2.0);
        head.endFill();
        head.beginFill(0xffffff, 0.75);
        head.drawCircle(-2.8, -40.5, 0.85);
        head.drawCircle( 5.2, -40.5, 0.85);
        head.endFill();
        head.lineStyle(1.5, 0xb8885a, 0.82);
        head.moveTo(-3, -32);
        head.bezierCurveTo(-1, -30, 1, -30, 3, -32);
        head.lineStyle(0);
        head.beginFill(0xd4a070, 0.45);
        head.drawCircle(0, -35.5, 1.3);
        head.endFill();
        container.addChild(head);

        const hair = new PIXI.Graphics();
        hair.lineStyle(1.5, OL_C, 0.75);
        hair.beginFill(0x2c1800);
        hair.drawEllipse(0, -52, 13, 5);
        hair.endFill();
        hair.lineStyle(0);
        hair.beginFill(0x2c1800);
        hair.drawRect(-13, -52, 26, 8);
        hair.drawEllipse(-12, -47, 4, 5);
        hair.drawEllipse( 12, -47, 4, 5);
        hair.endFill();
        container.addChild(hair);

        return container;
    }

    _drawLegs(walkPhase) {
        const lOff =  Math.sin(walkPhase) * 5;
        const rOff = -Math.sin(walkPhase) * 5;
        const OL_C = 0x0d0d1a;

        this._legLeft.clear();
        this._legLeft.lineStyle(1.5, OL_C, 0.85);
        this._legLeft.beginFill(0x2a4a7f);
        this._legLeft.drawRoundedRect(-8, -2 + lOff, 7, 15, 2.5);
        this._legLeft.endFill();

        this._legRight.clear();
        this._legRight.lineStyle(1.5, OL_C, 0.85);
        this._legRight.beginFill(0x2a4a7f);
        this._legRight.drawRoundedRect(1, -2 + rOff, 7, 15, 2.5);
        this._legRight.endFill();

        this._legLeft.lineStyle(1.2, OL_C, 0.8);
        this._legLeft.beginFill(0xf0f0f8);
        this._legLeft.drawRoundedRect(-9.5, 13 + lOff, 10, 6, 2.5);
        this._legLeft.endFill();
        this._legLeft.lineStyle(0);
        this._legLeft.beginFill(0xe94560);
        this._legLeft.drawRect(-9, 16.5 + lOff, 9, 1.5);
        this._legLeft.endFill();

        this._legRight.lineStyle(1.2, OL_C, 0.8);
        this._legRight.beginFill(0xf0f0f8);
        this._legRight.drawRoundedRect(0, 13 + rOff, 10, 6, 2.5);
        this._legRight.endFill();
        this._legRight.lineStyle(0);
        this._legRight.beginFill(0xe94560);
        this._legRight.drawRect(1, 16.5 + rOff, 9, 1.5);
        this._legRight.endFill();
    }

    _drawArms(walkPhase) {
        const lOff =  Math.sin(walkPhase + Math.PI) * 4;
        const rOff = -Math.sin(walkPhase + Math.PI) * 4;
        const OL_C = 0x0d0d1a;

        this._armLeft.clear();
        this._armLeft.lineStyle(1.5, OL_C, 0.85);
        this._armLeft.beginFill(0x4a6fa5);
        this._armLeft.drawRoundedRect(-19, -26 + lOff, 8, 16, 3);
        this._armLeft.endFill();
        this._armLeft.lineStyle(1, OL_C, 0.65);
        this._armLeft.beginFill(0xf8c9a0);
        this._armLeft.drawEllipse(-15, -10 + lOff, 4.5, 3.5);
        this._armLeft.endFill();

        this._armRight.clear();
        this._armRight.lineStyle(1.5, OL_C, 0.85);
        this._armRight.beginFill(0x4a6fa5);
        this._armRight.drawRoundedRect(11, -26 + rOff, 8, 16, 3);
        this._armRight.endFill();
        this._armRight.lineStyle(1, OL_C, 0.65);
        this._armRight.beginFill(0xf8c9a0);
        this._armRight.drawEllipse(15, -10 + rOff, 4.5, 3.5);
        this._armRight.endFill();
    }

    _bindKeys() {
        window.addEventListener('keydown', (e) => {
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
            const k = e.key.toLowerCase();
            if (DIRECTIONS[k]) this._keys[k] = true;
        });
        window.addEventListener('keyup', (e) => {
            const k = e.key.toLowerCase();
            if (DIRECTIONS[k]) this._keys[k] = false;
        });
    }

    update(delta) {
        if (this._sleeping) {
            this._sleepTick += delta;
            this._sprite.y = -28 + Math.sin(this._sleepTick / 60) * 2;
            if (this._sleepTick % 80 < delta) this._spawnZzz();
            this._updateZzz(delta);
            return;
        }
        if (this._isSitting) return;

        let dx = 0, dy = 0;
        for (const [key, dir] of Object.entries(DIRECTIONS)) {
            if (this._keys[key]) {
                dx += dir.dx;
                dy += dir.dy;
            }
        }

        this._isMoving = dx !== 0 || dy !== 0;

        if (this._isMoving) {
            const len = Math.sqrt(dx * dx + dy * dy);
            dx /= len; dy /= len;

            const nx = this.gx + dx * SPEED * delta;
            const ny = this.gy + dy * SPEED * delta;

            const inBoundsX = nx >= 1 && nx <= GRID_SIZE - 2;
            const inBoundsY = ny >= 1 && ny <= GRID_SIZE - 2;
            if (inBoundsX && !this._furniture?.isBlocked(nx, this.gy)) this.gx = nx;
            if (inBoundsY && !this._furniture?.isBlocked(this.gx, ny)) this.gy = ny;

            this.gridX = Math.round(this.gx);
            this.gridY = Math.round(this.gy);

            this._walkTick += delta;
            this._bobOffset = 0;
            const phase = (this._walkTick / WALK_CYCLE) * Math.PI * 2;
            this._drawLegs(phase);
            this._drawArms(phase);

            this._dustAccum += delta;
            if (this._dustAccum >= 14) {
                this._spawnDust();
                this._dustAccum = 0;
            }
        } else {
            this._walkTick += delta * 0.5;
            this._bobOffset = Math.sin(this._walkTick / 60 * Math.PI) * 1.5;
            this._drawLegs(0);
            this._drawArms(0);
            this._dustAccum = 0;
        }

        for (let i = this._dustParticles.length - 1; i >= 0; i--) {
            const p = this._dustParticles[i];
            p.x    += p.vx * delta;
            p.y    += p.vy * delta;
            p.life += delta;
            p.gfx.x     = p.x;
            p.gfx.y     = p.y;
            p.gfx.alpha = p.initAlpha * (1 - p.life / p.maxLife);
            if (p.life >= p.maxLife) {
                p.gfx.parent?.removeChild(p.gfx);
                p.gfx.destroy();
                this._dustParticles.splice(i, 1);
            }
        }

        const bobT = (this._bobOffset + 1.5) / 3;
        this._shadow.scale.x = 0.8 + bobT * 0.35;
        this._shadow.alpha   = 0.14 + bobT * 0.10;

        this._updateScreenPos();
    }

    _updateScreenPos() {
        const { x, y } = this.room.getTileCenter(this.gx, this.gy);
        this.container.x = x;
        this.container.y = y - 16 + this._bobOffset;
    }

    get position() {
        return { x: this.container.x, y: this.container.y, gx: this.gx, gy: this.gy };
    }

    sit() {
        this._isSitting = true;
        this._drawLegs(0);
        this._drawArms(0);
    }

    stand() {
        this._isSitting = false;
        this._keys = {};
    }

    _spawnDust() {
        this._dustFootToggle = !this._dustFootToggle;
        const side = this._dustFootToggle ? -4 : 4;
        for (let i = 0; i < 2; i++) {
            const g = new PIXI.Graphics();
            const r = 1.5 + Math.random() * 1.2;
            g.beginFill(0x7a7060, 0.28 + Math.random() * 0.15);
            g.drawCircle(0, 0, r);
            g.endFill();
            const p = {
                gfx:       g,
                x:         side + (Math.random() - 0.5) * 5,
                y:         15,
                vx:        side * (0.06 + Math.random() * 0.08),
                vy:        -(0.05 + Math.random() * 0.1),
                initAlpha: 0.28 + Math.random() * 0.18,
                life:      0,
                maxLife:   22 + Math.random() * 12,
            };
            g.x = p.x; g.y = p.y;
            g.alpha = p.initAlpha;
            this.container.addChildAt(g, 1);
            this._dustParticles.push(p);
        }
    }

    setSleepMode(active) {
        this._sleeping = active;
        if (active) {
            this._sleepTick = 0;
            this._sprite.alpha = 0.6;
            this._keys = {};
        } else {
            this._sprite.alpha = 1.0;
            this._sprite.y = -28;
            this._zzzParticles.forEach(p => { p.txt.parent?.removeChild(p.txt); p.txt.destroy(); });
            this._zzzParticles = [];
        }
    }

    _spawnZzz() {
        const txt = new PIXI.Text('💤', { fontSize: 10 + Math.random() * 6 });
        txt.anchor.set(0.5);
        txt.x = (Math.random() - 0.5) * 16;
        txt.y = -40;
        txt.alpha = 0.8;
        this.container.addChild(txt);
        this._zzzParticles.push({ txt, life: 0, maxLife: 90 + Math.random() * 40, vx: (Math.random() - 0.5) * 0.3 });
    }

    _updateZzz(delta) {
        for (let i = this._zzzParticles.length - 1; i >= 0; i--) {
            const p = this._zzzParticles[i];
            p.life += delta;
            p.txt.y -= 0.4 * delta;
            p.txt.x += p.vx * delta;
            p.txt.alpha = 0.8 * (1 - p.life / p.maxLife);
            if (p.life >= p.maxLife) {
                p.txt.parent?.removeChild(p.txt);
                p.txt.destroy();
                this._zzzParticles.splice(i, 1);
            }
        }
    }
}
