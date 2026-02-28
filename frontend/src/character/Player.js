import * as PIXI from 'pixi.js';
import { cartToIso, TILE_WIDTH, TILE_HEIGHT } from '../utils/isometric.js';
import { GRID_SIZE } from '../room/Room.js';

// WASD isometric direction mapping (per spec)
const DIRECTIONS = {
    w: { dx: -1, dy: -1 }, // north
    s: { dx:  1, dy:  1 }, // south
    a: { dx: -1, dy:  1 }, // west
    d: { dx:  1, dy: -1 }, // east
};

const SPEED = 0.08; // grid units per frame tick
const WALK_CYCLE = 40; // frames for one full bob cycle

export class Player {
    constructor(stage, room, furniture = null) {
        this.room = room;
        this.container = new PIXI.Container();
        stage.addChild(this.container);

        // Grid position (float for smooth movement)
        this.gx = 5.5;
        this.gy = 5.5;

        // Current grid cell (integer)
        this.gridX = 5;
        this.gridY = 5;

        this._keys = {};
        this._walkTick = 0;
        this._isMoving = false;
        this._isSitting = false;
        this._bobOffset = 0;
        this._furniture = furniture ?? null;

        // Dust particles
        this._dustParticles  = [];
        this._dustAccum      = 0;
        this._dustFootToggle = false;

        // Shadow — added before sprite so it renders behind
        this._shadow = new PIXI.Graphics();
        this._shadow.beginFill(0x000000, 0.22);
        this._shadow.drawEllipse(0, 0, 14, 5);
        this._shadow.endFill();
        this._shadow.y = 18;
        this.container.addChild(this._shadow);

        this._sprite = this._buildSprite();
        this.container.addChild(this._sprite);

        this._bindKeys();
        this._updateScreenPos();
    }

    _buildSprite() {
        const container = new PIXI.Container();

        // ── Legs behind body ────────────────────────────────────────────────────
        this._legLeft  = new PIXI.Graphics();
        this._legRight = new PIXI.Graphics();
        this._drawLegs(0);
        container.addChild(this._legLeft);
        container.addChild(this._legRight);

        // ── Body: dark navy hoodie ───────────────────────────────────────────────
        const body = new PIXI.Graphics();
        body.beginFill(0x1e3556);
        body.drawRoundedRect(-11, -26, 22, 26, 4);
        body.endFill();
        // Hood collar dip
        body.beginFill(0x162844);
        body.drawEllipse(0, -26, 7, 4);
        body.endFill();
        // Kangaroo pocket
        body.beginFill(0x162844);
        body.drawRoundedRect(-7, -12, 14, 9, 2);
        body.endFill();
        // Zipper line
        body.lineStyle(1, 0x2a4060, 0.55);
        body.moveTo(0, -26); body.lineTo(0, -3);
        container.addChild(body);

        // ── Arms in front of body ────────────────────────────────────────────────
        this._armLeft  = new PIXI.Graphics();
        this._armRight = new PIXI.Graphics();
        this._drawArms(0);
        container.addChild(this._armLeft);
        container.addChild(this._armRight);

        // ── Head ─────────────────────────────────────────────────────────────────
        const head = new PIXI.Graphics();
        // Face
        head.beginFill(0xf5c99a);
        head.drawEllipse(0, -36, 11, 13);
        head.endFill();
        // Eye whites
        head.beginFill(0xffffff, 0.9);
        head.drawCircle(-3.5, -37, 3);
        head.drawCircle(3.5, -37, 3);
        head.endFill();
        // Pupils
        head.beginFill(0x1a1440);
        head.drawCircle(-3, -37, 1.8);
        head.drawCircle(4, -37, 1.8);
        head.endFill();
        // Glasses frames
        head.lineStyle(1.5, 0x1a1a28, 0.92);
        head.drawRoundedRect(-8, -41, 6, 5, 1);
        head.drawRoundedRect(2, -41, 6, 5, 1);
        head.moveTo(-2, -39); head.lineTo(2, -39); // bridge
        head.lineStyle(1, 0x1a1a28, 0.6);
        head.moveTo(-8, -39); head.lineTo(-10, -37); // left temple
        head.moveTo(8, -39);  head.lineTo(10, -37);  // right temple
        // Subtle smile
        head.lineStyle(1.2, 0xb8885a, 0.7);
        head.moveTo(-2.5, -31);
        head.bezierCurveTo(-1, -29.5, 1, -29.5, 2.5, -31);
        container.addChild(head);

        // ── Hair ─────────────────────────────────────────────────────────────────
        const hair = new PIXI.Graphics();
        hair.beginFill(0x180d04);
        hair.drawEllipse(0, -46, 11, 7);
        hair.drawRect(-11, -48, 22, 9);
        hair.drawEllipse(-10, -42, 3.5, 5);
        hair.drawEllipse(10, -42, 3.5, 5);
        hair.endFill();
        container.addChild(hair);

        return container;
    }

    _drawLegs(walkPhase) {
        const lOff =  Math.sin(walkPhase) * 4;
        const rOff = -Math.sin(walkPhase) * 4;

        // Dark denim jeans
        this._legLeft.clear();
        this._legLeft.beginFill(0x1a2840);
        this._legLeft.drawRoundedRect(-7, -2 + lOff, 6, 14, 2);
        this._legLeft.endFill();

        this._legRight.clear();
        this._legRight.beginFill(0x1a2840);
        this._legRight.drawRoundedRect(1, -2 + rOff, 6, 14, 2);
        this._legRight.endFill();

        // White sneakers with blue stripe
        this._legLeft.beginFill(0xe8e8f0);
        this._legLeft.drawRoundedRect(-8.5, 12 + lOff, 9, 5, 2);
        this._legLeft.endFill();
        this._legLeft.beginFill(0x4477cc);
        this._legLeft.drawRect(-8, 15 + lOff, 8, 1.5);
        this._legLeft.endFill();

        this._legRight.beginFill(0xe8e8f0);
        this._legRight.drawRoundedRect(0, 12 + rOff, 9, 5, 2);
        this._legRight.endFill();
        this._legRight.beginFill(0x4477cc);
        this._legRight.drawRect(1, 15 + rOff, 8, 1.5);
        this._legRight.endFill();
    }

    _drawArms(walkPhase) {
        const lOff =  Math.sin(walkPhase + Math.PI) * 3;
        const rOff = -Math.sin(walkPhase + Math.PI) * 3;

        // Hoodie sleeves
        this._armLeft.clear();
        this._armLeft.beginFill(0x1e3556);
        this._armLeft.drawRoundedRect(-17, -24 + lOff, 7, 15, 2);
        this._armLeft.endFill();
        // Hand (skin)
        this._armLeft.beginFill(0xf0c090);
        this._armLeft.drawEllipse(-13, -9 + lOff, 4, 3);
        this._armLeft.endFill();

        this._armRight.clear();
        this._armRight.beginFill(0x1e3556);
        this._armRight.drawRoundedRect(10, -24 + rOff, 7, 15, 2);
        this._armRight.endFill();
        // Hand (skin)
        this._armRight.beginFill(0xf0c090);
        this._armRight.drawEllipse(14, -9 + rOff, 4, 3);
        this._armRight.endFill();
    }

    _bindKeys() {
        window.addEventListener('keydown', (e) => {
            // Don't move while typing in an app's input fields
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
            // Normalize diagonal movement
            const len = Math.sqrt(dx * dx + dy * dy);
            dx /= len; dy /= len;

            const nx = this.gx + dx * SPEED * delta;
            const ny = this.gy + dy * SPEED * delta;

            // Wall + boundary collision + furniture collision
            const inBoundsX = nx >= 1 && nx <= GRID_SIZE - 2;
            const inBoundsY = ny >= 1 && ny <= GRID_SIZE - 2;
            if (inBoundsX && !this._furniture?.isBlocked(nx, this.gy)) this.gx = nx;
            if (inBoundsY && !this._furniture?.isBlocked(this.gx, ny)) this.gy = ny;

            // Update integer grid cell
            this.gridX = Math.round(this.gx);
            this.gridY = Math.round(this.gy);

            // Walking animation
            this._walkTick += delta;
            this._bobOffset = 0;
            const phase = (this._walkTick / WALK_CYCLE) * Math.PI * 2;
            this._drawLegs(phase);
            this._drawArms(phase);

            // Footstep dust puffs
            this._dustAccum += delta;
            if (this._dustAccum >= 14) {
                this._spawnDust();
                this._dustAccum = 0;
            }
        } else {
            // Idle bob — stored as offset, applied in _updateScreenPos
            this._walkTick += delta * 0.5;
            this._bobOffset = Math.sin(this._walkTick / 60 * Math.PI) * 1.5;
            this._drawLegs(0);
            this._drawArms(0);
            this._dustAccum = 0; // reset so first step always triggers dust
        }

        // Update dust particles
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

        // Animate shadow: lower = wider/darker, higher = smaller/lighter
        const bobT = (this._bobOffset + 1.5) / 3; // 0..1
        this._shadow.scale.x = 0.8 + bobT * 0.35;
        this._shadow.alpha   = 0.14 + bobT * 0.10;

        this._updateScreenPos();
    }

    _updateScreenPos() {
        const { x, y } = this.room.getTileCenter(this.gx, this.gy);
        this.container.x = x;
        this.container.y = y - 16 + this._bobOffset; // bob applied here, not overwritten
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
        this._keys = {}; // discard any keys registered while sitting
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
            // Insert between shadow (index 0) and sprite (index 1) → at feet level
            this.container.addChildAt(g, 1);
            this._dustParticles.push(p);
        }
    }
}
