import * as PIXI from 'pixi.js';

const STATE_COLORS = [0x00c864, 0x8000ff, 0xff5050, 0xffa000, 0x0096ff];

function lerpColor(a, b, t) {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

const STATE_COLOR_MAP = {
  DEEP_FOCUS: 0x8000ff,
  STRESSED:   0xff5050,
  FATIGUED:   0xffa000,
  RELAXED:    0x00c864,
  WIRED:      0x0096ff,
};

const FOLLOW_OFFSET_X = 60;
const FOLLOW_OFFSET_Y = -30;
const LERP_SPEED = 0.03;
const BOB_AMPLITUDE = 5;
const BOB_PERIOD = 2.5;            // seconds
const COLOR_CYCLE_DURATION = 12;   // seconds

export class TownGhost {
  constructor(container) {
    this._parent = container;

    this._container = new PIXI.Container();
    container.addChild(this._container);

    // follow target
    this._targetX = 0;
    this._targetY = 0;

    // current position (lerped)
    this._x = 0;
    this._y = 0;
    this._initialized = false;

    // animation state
    this._elapsed = 0;           // seconds elapsed (for bob + color cycle)
    this._blinkTimer = 3 + Math.random() * 2;
    this._blinking = false;
    this._blinkDuration = 0;

    // color state
    this._fixedColor = null;     // if set via setState, overrides cycling
    this._colorTime = 0;         // for cycling

    // build visuals
    this._glowGfx = new PIXI.Graphics();
    this._bodyGfx = new PIXI.Graphics();
    this._eyesGfx = new PIXI.Graphics();

    this._glowGfx.scale.set(1.08);
    this._container.addChild(this._glowGfx);
    this._container.addChild(this._bodyGfx);
    this._container.addChild(this._eyesGfx);

    // scale down to ~60px tall (original shape spans ~64px at scale 1)
    this._container.scale.set(0.93);

    // initial draw
    const initColor = STATE_COLORS[0];
    this._drawShape(this._glowGfx, initColor, 0.15);
    this._drawShape(this._bodyGfx, initColor, 0.9);
    this._drawEyes(false);
  }

  // ---- public api ----

  setTarget(x, y) {
    if (!this._initialized) {
      this._x = x + FOLLOW_OFFSET_X;
      this._y = y + FOLLOW_OFFSET_Y;
      this._initialized = true;
    }
    this._targetX = x + FOLLOW_OFFSET_X;
    this._targetY = y + FOLLOW_OFFSET_Y;
  }

  setState(state) {
    const color = STATE_COLOR_MAP[state];
    if (color !== undefined) {
      this._fixedColor = color;
      this._drawShape(this._glowGfx, color, 0.15);
      this._drawShape(this._bodyGfx, color, 0.9);
    }
  }

  update(delta) {
    // delta comes from PIXI ticker (frame-based units, ~1 at 60fps)
    const dt = delta / 60;  // convert to seconds
    this._elapsed += dt;

    // --- follow ---
    this._x += (this._targetX - this._x) * LERP_SPEED;
    this._y += (this._targetY - this._y) * LERP_SPEED;

    // --- bob ---
    const bob = Math.sin((this._elapsed / BOB_PERIOD) * Math.PI * 2) * BOB_AMPLITUDE;

    this._container.x = this._x;
    this._container.y = this._y + bob;

    // --- color cycling (only if no fixed state color) ---
    if (this._fixedColor === null) {
      this._colorTime += dt;
      const cyclePos = (this._colorTime / COLOR_CYCLE_DURATION) % 1;
      const total = STATE_COLORS.length;
      const colorFloat = cyclePos * total;
      const ci = Math.floor(colorFloat) % total;
      const ni = (ci + 1) % total;
      const cf = colorFloat - Math.floor(colorFloat);
      const color = lerpColor(STATE_COLORS[ci], STATE_COLORS[ni], cf);
      this._drawShape(this._glowGfx, color, 0.15);
      this._drawShape(this._bodyGfx, color, 0.9);
    }

    // --- blink ---
    if (this._blinking) {
      this._blinkDuration -= dt;
      if (this._blinkDuration <= 0) {
        this._blinking = false;
        this._blinkTimer = 3 + Math.random() * 2;
        this._drawEyes(false);
      }
    } else {
      this._blinkTimer -= dt;
      if (this._blinkTimer <= 0) {
        this._blinking = true;
        this._blinkDuration = 0.15;
        this._drawEyes(true);
      }
    }
  }

  destroy() {
    this._container.destroy({ children: true });
  }

  // ---- internal ----

  _drawShape(g, color, alpha) {
    g.clear();

    // filled body
    g.beginFill(0xffffff, alpha * 0.25);
    g.moveTo(0, -26);
    g.bezierCurveTo( 13, -26,  22, -14,  22,   2);
    g.bezierCurveTo( 22,  32,  10,  38,   6,  16);
    g.bezierCurveTo(  2,  34,  -2,  34,  -6,  16);
    g.bezierCurveTo(-10,  38, -22,  32, -22,   2);
    g.bezierCurveTo(-22, -14, -13, -26,   0, -26);
    g.closePath();
    g.endFill();

    // colored outline
    g.lineStyle(2.2, color, alpha * 0.8);
    g.moveTo(0, -26);
    g.bezierCurveTo( 13, -26,  22, -14,  22,   2);
    g.bezierCurveTo( 22,  32,  10,  38,   6,  16);
    g.bezierCurveTo(  2,  34,  -2,  34,  -6,  16);
    g.bezierCurveTo(-10,  38, -22,  32, -22,   2);
    g.bezierCurveTo(-22, -14, -13, -26,   0, -26);
    g.closePath();

    // inner highlight
    g.lineStyle(0);
    g.beginFill(0xffffff, 0.08);
    g.drawEllipse(0, -8, 10, 13);
    g.endFill();
  }

  _drawEyes(closed) {
    const g = this._eyesGfx;
    g.clear();

    if (closed) {
      // blink — thin lines
      g.lineStyle(1.8, 0xffffff, 0.8);
      g.moveTo(-14, -6);
      g.lineTo(-4, -6);
      g.moveTo(4, -6);
      g.lineTo(14, -6);
      return;
    }

    // open eyes
    g.beginFill(0xffffff, 0.92);
    g.drawCircle(-9, -6, 6);
    g.drawCircle( 9, -6, 6);
    g.endFill();

    // pupils
    g.beginFill(0x1a1a40, 0.95);
    g.drawCircle(-9, -6, 3.5);
    g.drawCircle( 9, -6, 3.5);
    g.endFill();

    // highlights
    g.beginFill(0xffffff, 0.75);
    g.drawCircle(-7.2, -8, 1.4);
    g.drawCircle(10.8, -8, 1.4);
    g.endFill();
  }
}
