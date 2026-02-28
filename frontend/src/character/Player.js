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
        this._shadow.beginFill(0x000000, 0.28);
        this._shadow.drawEllipse(0, 0, 16, 6);
        this._shadow.endFill();
        this._shadow.y = 20;
        this.container.addChild(this._shadow);

        this._sprite = this._buildSprite();
        this.container.addChild(this._sprite);
        // Container order: 0=shadow, 1=sprite — dust spawns at index 1 (between them)

        this._bindKeys();
        this._updateScreenPos();
    }

    _buildSprite() {
        const container = new PIXI.Container();
        const OL_C = 0x0d0d1a; // outline colour

        // ── Legs behind body ────────────────────────────────────────────────────
        this._legLeft  = new PIXI.Graphics();
        this._legRight = new PIXI.Graphics();
        this._drawLegs(0);
        container.addChild(this._legLeft);
        container.addChild(this._legRight);

        // ── Body: hoodie (medium slate-blue) ────────────────────────────────────
        const body = new PIXI.Graphics();
        // Main hoodie body
        body.lineStyle(1.8, OL_C, 0.88);
        body.beginFill(0x4a6fa5);
        body.drawRoundedRect(-12, -28, 24, 28, 5);
        body.endFill();
        // Hood collar dip
        body.lineStyle(0);
        body.beginFill(0x3a5588);
        body.drawEllipse(0, -28, 8, 4.5);
        body.endFill();
        // Kangaroo pocket
        body.lineStyle(1, OL_C, 0.45);
        body.beginFill(0x3a5588);
        body.drawRoundedRect(-8, -14, 16, 10, 3);
        body.endFill();
        // Zipper line
        body.lineStyle(1, 0x1e3060, 0.5);
        body.moveTo(0, -28); body.lineTo(0, -4);
        container.addChild(body);

        // ── Arms in front of body ────────────────────────────────────────────────
        this._armLeft  = new PIXI.Graphics();
        this._armRight = new PIXI.Graphics();
        this._drawArms(0);
        container.addChild(this._armLeft);
        container.addChild(this._armRight);

        // ── Head ─────────────────────────────────────────────────────────────────
        const head = new PIXI.Graphics();
        // Face — bigger (rx 13, ry 14) and lifted slightly
        head.lineStyle(1.8, OL_C, 0.88);
        head.beginFill(0xf8c9a0);
        head.drawEllipse(0, -38, 13, 14);
        head.endFill();
        // Eye whites
        head.lineStyle(0);
        head.beginFill(0xffffff, 0.95);
        head.drawCircle(-4,   -39.5, 3.5);
        head.drawCircle( 4,   -39.5, 3.5);
        head.endFill();
        // Pupils
        head.beginFill(0x1a1440);
        head.drawCircle(-3.5, -39.5, 2.0);
        head.drawCircle( 4.5, -39.5, 2.0);
        head.endFill();
        // Eye-shine dots
        head.beginFill(0xffffff, 0.75);
        head.drawCircle(-2.8, -40.5, 0.85);
        head.drawCircle( 5.2, -40.5, 0.85);
        head.endFill();
        // Smile
        head.lineStyle(1.5, 0xb8885a, 0.82);
        head.moveTo(-3, -32);
        head.bezierCurveTo(-1, -30, 1, -30, 3, -32);
        // Nose hint
        head.lineStyle(0);
        head.beginFill(0xd4a070, 0.45);
        head.drawCircle(0, -35.5, 1.3);
        head.endFill();
        container.addChild(head);

        // ── Hair — clean rounded cap ──────────────────────────────────────────────
        const hair = new PIXI.Graphics();
        hair.lineStyle(1.5, OL_C, 0.75);
        hair.beginFill(0x2c1800);
        hair.drawEllipse(0, -52, 13, 5);   // top dome — short
        hair.endFill();
        hair.lineStyle(0);
        hair.beginFill(0x2c1800);
        hair.drawRect(-13, -52, 26, 8);    // fill connecting dome to head
        hair.drawEllipse(-12, -47, 4, 5);  // left side
        hair.drawEllipse( 12, -47, 4, 5);  // right side
        hair.endFill();
        container.addChild(hair);

        return container;
    }

    _drawLegs(walkPhase) {
        const lOff =  Math.sin(walkPhase) * 5;
        const rOff = -Math.sin(walkPhase) * 5;
        const OL_C = 0x0d0d1a;

        // Jeans — clear denim blue
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

        // Sneakers — warm white with red stripe
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

        // Hoodie sleeves — match body colour
        this._armLeft.clear();
        this._armLeft.lineStyle(1.5, OL_C, 0.85);
        this._armLeft.beginFill(0x4a6fa5);
        this._armLeft.drawRoundedRect(-19, -26 + lOff, 8, 16, 3);
        this._armLeft.endFill();
        // Hand
        this._armLeft.lineStyle(1, OL_C, 0.65);
        this._armLeft.beginFill(0xf8c9a0);
        this._armLeft.drawEllipse(-15, -10 + lOff, 4.5, 3.5);
        this._armLeft.endFill();

        this._armRight.clear();
        this._armRight.lineStyle(1.5, OL_C, 0.85);
        this._armRight.beginFill(0x4a6fa5);
        this._armRight.drawRoundedRect(11, -26 + rOff, 8, 16, 3);
        this._armRight.endFill();
        // Hand
        this._armRight.lineStyle(1, OL_C, 0.65);
        this._armRight.beginFill(0xf8c9a0);
        this._armRight.drawEllipse(15, -10 + rOff, 4.5, 3.5);
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
