import * as PIXI from 'pixi.js';
import { cartToIso, TILE_WIDTH, TILE_HEIGHT } from '../utils/isometric.js';

const SPEED = 0.08;
const WALK_CYCLE = 40;
const BOUNDS_TILES = 20;

export class TownPlayer {
    constructor(container) {
        this._parentContainer = container;

        this.container = new PIXI.Container();
        this.container.sortableChildren = true;

        // cartesian position (free movement, no grid)
        this._cx = 5;
        this._cy = 5;

        // walk state
        this._walking = false;
        this._walkTick = 0;
        this._bobOffset = 0;

        // dust particles (matches room Player exactly)
        this._dustParticles  = [];
        this._dustAccum      = 0;
        this._dustFootToggle = false;

        // input
        this._keys = { w: false, a: false, s: false, d: false };
        this._enabled = true;

        // shadow (matches room Player exactly)
        this._shadow = new PIXI.Graphics();
        this._shadow.beginFill(0x000000, 0.28);
        this._shadow.drawEllipse(0, 0, 16, 6);
        this._shadow.endFill();
        this._shadow.y = 20;
        this.container.addChild(this._shadow);

        // sprite (matches room Player exactly)
        this._sprite = this._buildSprite();
        this.container.addChild(this._sprite);

        this._updatePosition();

        container.addChild(this.container);

        // keyboard handlers (bound so we can remove them)
        this._onKeyDown = this._handleKeyDown.bind(this);
        this._onKeyUp = this._handleKeyUp.bind(this);
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
    }

    // ── Sprite (copied from room Player._buildSprite) ──

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

    // ── Animated legs (copied from room Player._drawLegs) ──

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

    // ── Animated arms (copied from room Player._drawArms) ──

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

    // ── Input ──

    _handleKeyDown(e) {
        if (!this._enabled) return;
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
        const k = e.key.toLowerCase();
        if (k in this._keys) this._keys[k] = true;
    }

    _handleKeyUp(e) {
        const k = e.key.toLowerCase();
        if (k in this._keys) this._keys[k] = false;
    }

    // ── Update ──

    update(delta) {
        if (!this._enabled) return;

        // velocity from keys (isometric directions)
        let dx = 0;
        let dy = 0;
        if (this._keys.w) { dx -= 1; dy -= 1; }
        if (this._keys.s) { dx += 1; dy += 1; }
        if (this._keys.a) { dx -= 1; dy += 1; }
        if (this._keys.d) { dx += 1; dy -= 1; }

        // normalize diagonal
        if (dx !== 0 || dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            dx /= len; dy /= len;
        }

        this._walking = dx !== 0 || dy !== 0;

        if (this._walking) {
            const speed = SPEED * delta;
            this._cx += dx * speed;
            this._cy += dy * speed;

            // clamp to bounds
            this._cx = Math.max(0, Math.min(BOUNDS_TILES, this._cx));
            this._cy = Math.max(0, Math.min(BOUNDS_TILES, this._cy));

            // walk animation (matches room Player exactly)
            this._walkTick += delta;
            this._bobOffset = 0;
            const phase = (this._walkTick / WALK_CYCLE) * Math.PI * 2;
            this._drawLegs(phase);
            this._drawArms(phase);

            // dust particles (matches room Player: spawn every 14 frames)
            this._dustAccum += delta;
            if (this._dustAccum >= 14) {
                this._spawnDust();
                this._dustAccum = 0;
            }
        } else {
            // idle animation (matches room Player exactly)
            this._walkTick += delta * 0.5;
            this._bobOffset = Math.sin(this._walkTick / 60 * Math.PI) * 1.5;
            this._drawLegs(0);
            this._drawArms(0);
            this._dustAccum = 0;
        }

        // update dust particles (matches room Player exactly)
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

        // shadow breathes with bob (matches room Player exactly)
        const bobT = (this._bobOffset + 1.5) / 3;
        this._shadow.scale.x = 0.8 + bobT * 0.35;
        this._shadow.alpha   = 0.14 + bobT * 0.10;

        this._updatePosition();
    }

    _updatePosition() {
        const iso = cartToIso(this._cx, this._cy);
        this.container.x = iso.x;
        this.container.y = iso.y + this._bobOffset;
    }

    // ── Dust (copied from room Player._spawnDust) ──

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

    // ── Public API ──

    getPosition() {
        return { x: this._cx, y: this._cy };
    }

    setPosition(x, y) {
        this._cx = x;
        this._cy = y;
        this._updatePosition();
    }

    enable() {
        this._enabled = true;
    }

    disable() {
        this._enabled = false;
        this._keys = { w: false, a: false, s: false, d: false };
        this._walking = false;
    }

    destroy() {
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keyup', this._onKeyUp);

        // clean up dust
        for (const p of this._dustParticles) {
            p.gfx.parent?.removeChild(p.gfx);
            p.gfx.destroy();
        }
        this._dustParticles.length = 0;

        this._parentContainer.removeChild(this.container);
        this.container.destroy({ children: true });
    }
}
