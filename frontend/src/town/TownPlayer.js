import * as PIXI from 'pixi.js';
import { cartToIso, TILE_WIDTH, TILE_HEIGHT } from '../utils/isometric.js';

const SPEED = 2.5;
const WALK_CYCLE = 40;
const BOUNDS_TILES = 20;
const BOUNDS_PX_X = BOUNDS_TILES * TILE_WIDTH;
const BOUNDS_PX_Y = BOUNDS_TILES * TILE_HEIGHT;

export class TownPlayer {
    constructor(container) {
        this._parentContainer = container;

        this.container = new PIXI.Container();
        this.container.sortableChildren = true;

        // cartesian position (free movement, no grid)
        this._cx = 5;
        this._cy = 5;

        // walk state
        this._vx = 0;
        this._vy = 0;
        this._walking = false;
        this._walkPhase = 0;
        this._facing = 1; // 1 = right, -1 = left

        // dust particles
        this._dust = [];
        this._dustSide = 0;

        // input
        this._keys = { w: false, a: false, s: false, d: false };
        this._enabled = true;

        // build visuals
        this._shadow = new PIXI.Graphics();
        this._body = new PIXI.Graphics();
        this.container.addChild(this._shadow);
        this.container.addChild(this._body);

        this._drawCharacter();
        this._updatePosition();

        container.addChild(this.container);

        // keyboard handlers (bound so we can remove them)
        this._onKeyDown = this._handleKeyDown.bind(this);
        this._onKeyUp = this._handleKeyUp.bind(this);
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
    }

    // ── Drawing ──

    _drawCharacter() {
        const g = this._body;
        g.clear();

        const outline = 0x0d0d1a;

        // ── Legs ──
        // left leg
        g.lineStyle(2, outline, 1);
        g.beginFill(0x2a4a7f);
        g.drawRoundedRect(-10, -2, 8, 16, 3);
        g.endFill();
        // right leg
        g.beginFill(0x2a4a7f);
        g.drawRoundedRect(2, -2, 8, 16, 3);
        g.endFill();

        // ── Shoes ──
        // left shoe
        g.lineStyle(1.5, outline, 1);
        g.beginFill(0xf0f0f8);
        g.drawRoundedRect(-11, 11, 10, 6, 2);
        g.endFill();
        g.lineStyle(0);
        g.beginFill(0xe94560);
        g.drawRect(-10, 13, 8, 1.5);
        g.endFill();
        // right shoe
        g.lineStyle(1.5, outline, 1);
        g.beginFill(0xf0f0f8);
        g.drawRoundedRect(1, 11, 10, 6, 2);
        g.endFill();
        g.lineStyle(0);
        g.beginFill(0xe94560);
        g.drawRect(2, 13, 8, 1.5);
        g.endFill();

        // ── Body ──
        g.lineStyle(2, outline, 1);
        g.beginFill(0x4a6fa5);
        g.drawRoundedRect(-12, -28, 24, 28, 5);
        g.endFill();

        // collar
        g.lineStyle(0);
        g.beginFill(0x3a5588);
        g.drawRect(-6, -28, 12, 4);
        g.endFill();

        // pocket
        g.beginFill(0x3a5588);
        g.drawRoundedRect(-8, -14, 7, 6, 1);
        g.endFill();

        // ── Arms ──
        // left arm
        g.lineStyle(1.5, outline, 1);
        g.beginFill(0x4a6fa5);
        g.drawRoundedRect(-18, -26, 8, 22, 4);
        g.endFill();
        // left hand
        g.lineStyle(1, outline, 1);
        g.beginFill(0xf8c9a0);
        g.drawCircle(-14, -1, 4);
        g.endFill();
        // right arm
        g.lineStyle(1.5, outline, 1);
        g.beginFill(0x4a6fa5);
        g.drawRoundedRect(10, -26, 8, 22, 4);
        g.endFill();
        // right hand
        g.lineStyle(1, outline, 1);
        g.beginFill(0xf8c9a0);
        g.drawCircle(14, -1, 4);
        g.endFill();

        // ── Head ──
        g.lineStyle(2, outline, 1);
        g.beginFill(0xf8c9a0);
        g.drawEllipse(0, -38, 13, 14);
        g.endFill();

        // eyes
        g.lineStyle(0);
        g.beginFill(0xffffff);
        g.drawEllipse(-5, -40, 3.5, 3);
        g.drawEllipse(5, -40, 3.5, 3);
        g.endFill();
        // pupils
        g.beginFill(0x1a1a2e);
        g.drawCircle(-4, -40, 1.8);
        g.drawCircle(6, -40, 1.8);
        g.endFill();
        // eye highlights
        g.beginFill(0xffffff);
        g.drawCircle(-3.2, -41, 0.8);
        g.drawCircle(6.8, -41, 0.8);
        g.endFill();

        // mouth
        g.lineStyle(1.5, 0xc9877a, 1);
        g.moveTo(-3, -33);
        g.bezierCurveTo(-1, -31, 1, -31, 3, -33);
        g.lineStyle(0);

        // nose
        g.beginFill(0xe8b994);
        g.drawEllipse(0, -36, 1.5, 1);
        g.endFill();

        // ── Hair ──
        g.lineStyle(1.5, outline, 1);
        g.beginFill(0x2c1800);
        g.drawEllipse(0, -49, 14, 7);
        g.endFill();
        g.lineStyle(0);
        g.beginFill(0x2c1800);
        g.drawRect(-14, -50, 28, 6);
        g.endFill();
        // side hair
        g.beginFill(0x2c1800);
        g.drawRoundedRect(-15, -48, 5, 10, 2);
        g.drawRoundedRect(10, -48, 5, 10, 2);
        g.endFill();

        // ── Shadow ──
        this._shadow.clear();
        this._shadow.beginFill(0x000000, 0.3);
        this._shadow.drawEllipse(0, 20, 16, 6);
        this._shadow.endFill();
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
        if (dx !== 0 && dy !== 0) {
            const inv = 1 / Math.sqrt(2);
            dx *= inv;
            dy *= inv;
        }

        this._walking = dx !== 0 || dy !== 0;

        if (this._walking) {
            const speed = SPEED * delta;
            this._cx += dx * speed;
            this._cy += dy * speed;

            // clamp to bounds
            this._cx = Math.max(0, Math.min(BOUNDS_TILES, this._cx));
            this._cy = Math.max(0, Math.min(BOUNDS_TILES, this._cy));

            // facing direction
            if (dx > 0) this._facing = 1;
            else if (dx < 0) this._facing = -1;

            // walk phase
            this._walkPhase += delta;

            // dust particles
            if (Math.floor(this._walkPhase) % 6 === 0) {
                this._spawnDust();
            }
        } else {
            this._walkPhase = 0;
        }

        this._updatePosition();
        this._animateWalk(delta);
        this._updateDust(delta);
    }

    _updatePosition() {
        const iso = cartToIso(this._cx, this._cy);
        this.container.x = iso.x;
        this.container.y = iso.y;
    }

    _animateWalk(delta) {
        if (this._walking) {
            const phase = (this._walkPhase / WALK_CYCLE) * Math.PI * 2;
            const bob = Math.sin(phase * 8) * 1.5;

            this._body.y = bob;

            // leg animation
            const legOffset = Math.sin(phase * 8) * 3;
            // simple body bob is enough — full leg redraw is expensive
            // shadow breathes with bob
            this._shadow.y = 0;
            this._shadow.scale.x = 1 + Math.abs(bob) * 0.01;
        } else {
            this._body.y = 0;
            this._shadow.scale.x = 1;
        }
    }

    // ── Dust ──

    _spawnDust() {
        const side = this._dustSide;
        this._dustSide = 1 - this._dustSide;

        for (let i = 0; i < 2; i++) {
            const p = new PIXI.Graphics();
            p.beginFill(0xffffff, 0.35);
            p.drawCircle(0, 0, 1.2 + Math.random() * 0.8);
            p.endFill();

            const xOff = (side === 0 ? -6 : 6) + (Math.random() - 0.5) * 4;
            p.x = xOff;
            p.y = 16 + Math.random() * 4;
            p.alpha = 0.4;
            p._life = 0;
            p._maxLife = 22 + Math.random() * 12;
            p._vx = (Math.random() - 0.5) * 0.3;
            p._vy = -(0.2 + Math.random() * 0.3);

            this.container.addChild(p);
            this._dust.push(p);
        }
    }

    _updateDust(delta) {
        for (let i = this._dust.length - 1; i >= 0; i--) {
            const p = this._dust[i];
            p._life += delta;
            p.x += p._vx * delta;
            p.y += p._vy * delta;
            p.alpha = 0.4 * (1 - p._life / p._maxLife);

            if (p._life >= p._maxLife) {
                this.container.removeChild(p);
                p.destroy();
                this._dust.splice(i, 1);
            }
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
        for (const p of this._dust) {
            this.container.removeChild(p);
            p.destroy();
        }
        this._dust.length = 0;

        this._parentContainer.removeChild(this.container);
        this.container.destroy({ children: true });
    }
}
