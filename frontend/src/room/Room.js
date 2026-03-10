import * as PIXI from 'pixi.js';
import { cartToIso, TILE_WIDTH, TILE_HEIGHT } from '../utils/isometric.js';

export const GRID_SIZE = 12;

// Color palette — warm Animal Crossing nighttime
const COL = {
    bg:         0x1a1a2e,
    floor:      0x8B7355, // warm medium wood
    floorAlt:   0x7A6548, // slightly darker wood
    floorLine:  0x6B5B45, // subtle wood grain line
    wallLeft:   0xD4C5A9, // warm cream
    wallRight:  0xC7B898, // slightly darker cream
    wallEdge:   0xE8DCC8, // light warm highlight
    baseboard:  0x6B5B3E, // dark wood trim
    chairRail:  0x9B8B6E, // medium wood
};

export class Room {
    constructor(stage) {
        this.container = new PIXI.Container();
        stage.addChild(this.container);

        // Sub-containers for layering
        this.floorContainer = new PIXI.Container();
        this.wallContainer  = new PIXI.Container();
        this.container.addChild(this.floorContainer);
        this.container.addChild(this.wallContainer);

        this._drawFloor();
        this._drawWalls();
        this._drawClock();
    }

    // Convert grid coords to screen coords (centered in viewport)
    gridToScreen(gx, gy) {
        const iso = cartToIso(gx, gy);
        return {
            x: iso.x + window.innerWidth / 2,
            y: iso.y + window.innerHeight / 2 - (GRID_SIZE * TILE_HEIGHT / 2)
        };
    }

    _drawFloor() {
        for (let gx = 0; gx < GRID_SIZE; gx++) {
            for (let gy = 0; gy < GRID_SIZE; gy++) {
                const tile = new PIXI.Graphics();
                const { x, y } = this.gridToScreen(gx, gy);

                // Diamond tile fill — warm wood checkerboard
                const shade = (gx + gy) % 2 === 0 ? COL.floor : COL.floorAlt;
                tile.beginFill(shade, 1);
                tile.moveTo(x, y);
                tile.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
                tile.lineTo(x, y + TILE_HEIGHT);
                tile.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
                tile.closePath();
                tile.endFill();

                // Subtle wood grain line (horizontal across plank)
                tile.lineStyle(0.5, COL.floorLine, 0.3);
                tile.moveTo(x - TILE_WIDTH / 4, y + TILE_HEIGHT / 2);
                tile.lineTo(x + TILE_WIDTH / 4, y + TILE_HEIGHT / 2);

                // Extra wood grain lines — thin diagonal parallels
                tile.lineStyle(0.5, 0x7A6040, 0.08);
                // line 1 — upper-left to lower-right bias
                tile.moveTo(x - TILE_WIDTH * 0.3, y + TILE_HEIGHT * 0.3);
                tile.lineTo(x + TILE_WIDTH * 0.1,  y + TILE_HEIGHT * 0.7);
                // line 2 — parallel, offset
                tile.moveTo(x - TILE_WIDTH * 0.15, y + TILE_HEIGHT * 0.25);
                tile.lineTo(x + TILE_WIDTH * 0.25, y + TILE_HEIGHT * 0.65);
                // line 3 — shorter accent
                tile.moveTo(x - TILE_WIDTH * 0.05, y + TILE_HEIGHT * 0.35);
                tile.lineTo(x + TILE_WIDTH * 0.15, y + TILE_HEIGHT * 0.55);

                // Soft tile border
                tile.lineStyle(0.5, 0x5C4E38, 0.25);
                tile.moveTo(x, y);
                tile.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
                tile.lineTo(x, y + TILE_HEIGHT);
                tile.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
                tile.closePath();

                this.floorContainer.addChild(tile);
            }
        }
    }

    // wall drawing is confusing af
    _drawWalls() {
        const wallH  = 120; // 120px walls (actually its 130 idk)
        const baseH  = 8;   // baseboard strip height (wood trim)
        const railY  = wallH * 0.30; // chair-rail height from floor

        // left wall
        for (let gy = 0; gy < GRID_SIZE; gy++) {
            const { x, y } = this.gridToScreen(0, gy);
            const panel = new PIXI.Graphics();

            // Main face — warm cream
            panel.beginFill(COL.wallLeft);
            panel.moveTo(x, y);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - wallH);
            panel.lineTo(x, y - wallH);
            panel.closePath();
            panel.endFill();

            // Baseboard strip — dark wood trim
            panel.beginFill(COL.baseboard);
            panel.moveTo(x,                  y);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - baseH);
            panel.lineTo(x,                  y - baseH);
            panel.closePath();
            panel.endFill();

            // Baseboard shadow line above
            panel.lineStyle(1, 0x5A4A30, 0.08);
            panel.moveTo(x,                  y - baseH);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - baseH);
            // Baseboard highlight below top edge
            panel.lineStyle(1, 0xB09A7A, 0.1);
            panel.moveTo(x,                  y - baseH + 1);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - baseH + 1);

            // Chair-rail groove at 30% — medium wood
            panel.lineStyle(1.2, COL.chairRail, 0.5);
            panel.moveTo(x,                  y - railY);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - railY);

            // Plaster texture — faint scattered dots
            panel.lineStyle(0);
            panel.beginFill(0xC4B598, 0.05);
            const lOff = TILE_WIDTH / 2;
            for (let d = 0; d < 9; d++) {
                const dx = -(Math.random() * lOff * 0.9);
                const dy = -(Math.random() * (wallH - baseH - 10)) - baseH;
                const frac = -dx / lOff; // 0..1 across face
                panel.drawCircle(x + dx, y + dy + frac * (TILE_HEIGHT / 2), 0.8);
            }
            panel.endFill();

            // Vertical edge highlight
            panel.lineStyle(1, COL.wallEdge, 0.5);
            panel.moveTo(x, y - wallH);
            panel.lineTo(x, y);

            this.wallContainer.addChild(panel);
        }

        // right wall
        for (let gx = 0; gx < GRID_SIZE; gx++) {
            const { x, y } = this.gridToScreen(gx, 0);
            const panel = new PIXI.Graphics();

            // Main face — slightly darker cream
            panel.beginFill(COL.wallRight);
            panel.moveTo(x, y);
            panel.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            panel.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - wallH);
            panel.lineTo(x, y - wallH);
            panel.closePath();
            panel.endFill();

            // Baseboard strip — dark wood trim
            panel.beginFill(COL.baseboard, 0.85);
            panel.moveTo(x,                  y);
            panel.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            panel.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - baseH);
            panel.lineTo(x,                  y - baseH);
            panel.closePath();
            panel.endFill();

            // Baseboard shadow line above
            panel.lineStyle(1, 0x5A4A30, 0.08);
            panel.moveTo(x,                  y - baseH);
            panel.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - baseH);
            // Baseboard highlight below top edge
            panel.lineStyle(1, 0xB09A7A, 0.1);
            panel.moveTo(x,                  y - baseH + 1);
            panel.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - baseH + 1);

            // Plaster texture — faint scattered dots
            panel.lineStyle(0);
            panel.beginFill(0xC4B598, 0.05);
            const rOff = TILE_WIDTH / 2;
            for (let d = 0; d < 9; d++) {
                const dx = Math.random() * rOff * 0.9;
                const dy = -(Math.random() * (wallH - baseH - 10)) - baseH;
                const frac = dx / rOff;
                panel.drawCircle(x + dx, y + dy + frac * (TILE_HEIGHT / 2), 0.8);
            }
            panel.endFill();

            // Vertical edge highlight
            panel.lineStyle(1, COL.wallEdge, 0.35);
            panel.moveTo(x, y - wallH);
            panel.lineTo(x, y);

            this.wallContainer.addChild(panel);
        }

        // window on right wall (at gx=4)
        const { x: winX, y: winY } = this.gridToScreen(4, 0);
        const win = new PIXI.Graphics();
        const winW = TILE_WIDTH * 0.7;
        const winH2 = 60;
        const winTop = winY - wallH * 0.75;
        // night sky fill — deep blue
        win.beginFill(0x1a2040);
        win.moveTo(winX, winTop);
        win.lineTo(winX + winW / 2, winTop + TILE_HEIGHT * 0.35);
        win.lineTo(winX + winW / 2, winTop + TILE_HEIGHT * 0.35 + winH2);
        win.lineTo(winX, winTop + winH2);
        win.closePath();
        win.endFill();
        // warm city-light glow at bottom edge of window
        win.beginFill(0x443322, 0.35);
        const glowH = 10;
        win.moveTo(winX, winTop + winH2 - glowH);
        win.lineTo(winX + winW / 2, winTop + TILE_HEIGHT * 0.35 + winH2 - glowH);
        win.lineTo(winX + winW / 2, winTop + TILE_HEIGHT * 0.35 + winH2);
        win.lineTo(winX, winTop + winH2);
        win.closePath();
        win.endFill();
        // window frame — warm wood
        win.lineStyle(2, COL.baseboard, 0.9);
        win.moveTo(winX, winTop);
        win.lineTo(winX + winW / 2, winTop + TILE_HEIGHT * 0.35);
        win.lineTo(winX + winW / 2, winTop + TILE_HEIGHT * 0.35 + winH2);
        win.lineTo(winX, winTop + winH2);
        win.closePath();
        // cross bar
        const midY = winTop + winH2 / 2 + TILE_HEIGHT * 0.175;
        win.moveTo(winX, winTop + winH2 / 2);
        win.lineTo(winX + winW / 2, midY);
        win.lineStyle(0);
        // stars — more of them, soft white
        win.beginFill(0xffffff, 0.7);
        win.drawCircle(winX + 8, winTop + 12, 1);
        win.drawCircle(winX + winW / 2 - 6, winTop + 8 + TILE_HEIGHT * 0.15, 0.8);
        win.drawCircle(winX + 14, winTop + winH2 * 0.35, 1.2);
        win.endFill();
        win.beginFill(0xffffff, 0.5);
        win.drawCircle(winX + 4, winTop + winH2 * 0.22, 0.7);
        win.drawCircle(winX + winW / 2 - 3, winTop + winH2 * 0.45, 0.6);
        win.endFill();
        // Curtain rod — thin line across top of window
        win.lineStyle(1.5, 0x8B7348, 0.9);
        const rodExtend = 4;
        win.moveTo(winX - rodExtend * 0.1, winTop - 3);
        win.lineTo(winX + winW / 2 + rodExtend, winTop + TILE_HEIGHT * 0.35 - 3 + rodExtend * 0.5);

        // Left curtain — thin rectangle on left side
        win.beginFill(0xB0A090, 0.7);
        win.moveTo(winX, winTop);
        win.lineTo(winX + 4 * 0.5, winTop + 4 * 0.25); // skewed 4px wide
        win.lineTo(winX + 4 * 0.5, winTop + winH2 + 4 * 0.25);
        win.lineTo(winX, winTop + winH2);
        win.closePath();
        win.endFill();

        // Right curtain — thin rectangle on right side
        win.beginFill(0xB0A090, 0.65);
        const rcX = winX + winW / 2;
        const rcOff = TILE_HEIGHT * 0.35;
        win.moveTo(rcX - 4 * 0.5, winTop + rcOff - 4 * 0.25);
        win.lineTo(rcX, winTop + rcOff);
        win.lineTo(rcX, winTop + rcOff + winH2);
        win.lineTo(rcX - 4 * 0.5, winTop + rcOff + winH2 - 4 * 0.25);
        win.closePath();
        win.endFill();

        this.wallContainer.addChild(win);

        // corner
        const { x: cx, y: cy } = this.gridToScreen(0, 0);
        const corner = new PIXI.Graphics();
        corner.lineStyle(2, COL.wallEdge, 0.7);
        corner.moveTo(cx, cy - wallH);
        corner.lineTo(cx, cy);
        this.wallContainer.addChild(corner);

        // Ceiling light fixture — small circle where walls meet ceiling
        const lightFixture = new PIXI.Graphics();
        const { x: lx, y: ly } = this.gridToScreen(3, 0);
        const lightCx = lx + TILE_WIDTH / 4;
        const lightCy = ly - wallH * 0.95;
        lightFixture.beginFill(0xF5F0E8, 0.15);
        lightFixture.drawCircle(lightCx, lightCy, 10);
        lightFixture.endFill();
        // inner bright spot
        lightFixture.beginFill(0xFFF8EE, 0.12);
        lightFixture.drawCircle(lightCx, lightCy, 5);
        lightFixture.endFill();
        this.wallContainer.addChild(lightFixture);

        // Light cone on floor — very subtle trapezoid glow
        const lightCone = new PIXI.Graphics();
        const { x: flx, y: fly } = this.gridToScreen(3, 3);
        lightCone.beginFill(0xFFE4B5, 0.02);
        lightCone.moveTo(flx - TILE_WIDTH * 0.8, fly + TILE_HEIGHT * 0.5);
        lightCone.lineTo(flx + TILE_WIDTH * 0.8, fly + TILE_HEIGHT * 0.5);
        lightCone.lineTo(flx + TILE_WIDTH * 0.4, fly - TILE_HEIGHT * 0.3);
        lightCone.lineTo(flx - TILE_WIDTH * 0.4, fly - TILE_HEIGHT * 0.3);
        lightCone.closePath();
        lightCone.endFill();
        this.floorContainer.addChild(lightCone);

        // Door mat — small rounded rect near the exit (bottom-right corner of floor)
        const mat = new PIXI.Graphics();
        const { x: mx, y: my } = this.gridToScreen(GRID_SIZE - 1, GRID_SIZE - 1);
        mat.beginFill(0x8B6B3A, 0.6);
        // isometric mat — small diamond shape
        const mw = 15, mh = 8;
        mat.moveTo(mx, my + TILE_HEIGHT / 2 - mh);
        mat.lineTo(mx + mw / 2, my + TILE_HEIGHT / 2 - mh / 2);
        mat.lineTo(mx, my + TILE_HEIGHT / 2);
        mat.lineTo(mx - mw / 2, my + TILE_HEIGHT / 2 - mh / 2);
        mat.closePath();
        mat.endFill();
        this.floorContainer.addChild(mat);
    }

    _drawClock() {
        const wallH = 120;
        // Right wall face at gx = 6 — roughly the centre of the back-right wall
        const { x: wx, y: wy } = this.gridToScreen(6, 0);
        const cx = wx + TILE_WIDTH  / 4;              // horizontal centre of face
        const cy = wy + TILE_HEIGHT / 4 - wallH * 0.62; // 62% up the wall

        // LED panel — warm dark wood frame
        const screen = new PIXI.Graphics();
        screen.beginFill(0x1a1510);
        screen.drawRoundedRect(-38, -14, 76, 28, 5);
        screen.endFill();

        // Outer bezel border — warm wood
        screen.lineStyle(1, 0x4A3C28, 0.9);
        screen.drawRoundedRect(-38, -14, 76, 28, 5);

        // Subtle top-edge warm glow
        screen.lineStyle(0.6, 0xFFE4B5, 0.18);
        screen.moveTo(-36, -13);
        screen.lineTo( 36, -13);

        // Four corner mounting screws
        screen.lineStyle(0);
        screen.beginFill(0x2A2218);
        for (const [sx, sy] of [[-34, -11], [34, -11], [-34, 11], [34, 11]]) {
            screen.drawCircle(sx, sy, 1.5);
        }
        screen.endFill();

        // time text — warm moccasin glow
        this._clockText = new PIXI.Text('00:00', {
            fontFamily:         'monospace',
            fontSize:           16,
            fill:               0xFFE4B5,
            fontWeight:         'bold',
            letterSpacing:      3,
            dropShadow:         true,
            dropShadowColor:    '#FFD090',
            dropShadowBlur:     10,
            dropShadowDistance: 0,
            dropShadowAlpha:    0.7,
        });
        this._clockText.anchor.set(0.5, 0.5);
        this._clockText.y = 1;

        // skew to match wall angle
        const clockContainer = new PIXI.Container();
        clockContainer.addChild(screen);
        clockContainer.addChild(this._clockText);
        clockContainer.x = cx;
        clockContainer.y = cy;
        // skew.y makes the x-axis tilt downward-right, matching the wall face
        clockContainer.skew.y = Math.atan2(TILE_HEIGHT / 2, TILE_WIDTH / 2);

        this.wallContainer.addChild(clockContainer);

        this._updateClock();
        setInterval(() => this._updateClock(), 1000); // never cleared lol
    }

    _updateClock() {
        if (!this._clockText) return;
        const now = new Date();
        const hh  = String(now.getHours()).padStart(2, '0');
        const mm  = String(now.getMinutes()).padStart(2, '0');
        this._clockText.text = `${hh}:${mm}`;
    }

    // Returns the screen position of the center of a grid tile
    getTileCenter(gx, gy) {
        const { x, y } = this.gridToScreen(gx, gy);
        return { x, y: y + TILE_HEIGHT / 2 };
    }
}
