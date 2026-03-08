import * as PIXI from 'pixi.js';
import { cartToIso, TILE_WIDTH, TILE_HEIGHT } from '../utils/isometric.js';

export const GRID_SIZE = 12;

// Color palette
const COL = {
    bg:    0x1a1a2e,
    floor: 0x16213e,
    floorLine: 0x1e2a50,
    wallLeft:  0x0f3460,
    wallRight: 0x0a2a50,
    wallEdge:  0x1a4a80,
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

                // Diamond tile fill — alternate slight shade for checkerboard depth
                const shade = (gx + gy) % 2 === 0 ? COL.floor : COL.floorLine;
                tile.beginFill(shade, 1);
                tile.moveTo(x, y);
                tile.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
                tile.lineTo(x, y + TILE_HEIGHT);
                tile.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
                tile.closePath();
                tile.endFill();

                // Tile border
                tile.lineStyle(1, 0x1e2a5a, 0.5);
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
        const baseH  = 5;   // baseboard strip height
        const railY  = wallH * 0.30; // chair-rail height from floor

        // left wall
        for (let gy = 0; gy < GRID_SIZE; gy++) {
            const { x, y } = this.gridToScreen(0, gy);
            const panel = new PIXI.Graphics();

            // Main face
            panel.beginFill(COL.wallLeft);
            panel.moveTo(x, y);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - wallH);
            panel.lineTo(x, y - wallH);
            panel.closePath();
            panel.endFill();

            // Baseboard strip — slightly lighter at the base
            panel.beginFill(0x1a4878, 0.55);
            panel.moveTo(x,                  y);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - baseH);
            panel.lineTo(x,                  y - baseH);
            panel.closePath();
            panel.endFill();

            // Chair-rail groove at 30% of wall height
            panel.lineStyle(0.8, 0x1a5a90, 0.35);
            panel.moveTo(x,                  y - railY);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - railY);

            // Vertical edge highlight
            panel.lineStyle(1, COL.wallEdge, 0.6);
            panel.moveTo(x, y - wallH);
            panel.lineTo(x, y);

            this.wallContainer.addChild(panel);
        }

        // right wall
        for (let gx = 0; gx < GRID_SIZE; gx++) {
            const { x, y } = this.gridToScreen(gx, 0);
            const panel = new PIXI.Graphics();

            // Main face
            panel.beginFill(COL.wallRight);
            panel.moveTo(x, y);
            panel.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            panel.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - wallH);
            panel.lineTo(x, y - wallH);
            panel.closePath();
            panel.endFill();

            // Baseboard strip
            panel.beginFill(0x0f3a60, 0.5);
            panel.moveTo(x,                  y);
            panel.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            panel.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - baseH);
            panel.lineTo(x,                  y - baseH);
            panel.closePath();
            panel.endFill();

            // Vertical edge highlight
            panel.lineStyle(1, COL.wallEdge, 0.4);
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
        // night sky fill
        win.beginFill(0x1a1a3a);
        win.moveTo(winX, winTop);
        win.lineTo(winX + winW / 2, winTop + TILE_HEIGHT * 0.35);
        win.lineTo(winX + winW / 2, winTop + TILE_HEIGHT * 0.35 + winH2);
        win.lineTo(winX, winTop + winH2);
        win.closePath();
        win.endFill();
        // window frame
        win.lineStyle(1.5, 0x1a4a80, 0.9);
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
        // stars
        win.beginFill(0xffffff, 0.6);
        win.drawCircle(winX + 8, winTop + 12, 1);
        win.drawCircle(winX + winW / 2 - 6, winTop + 8 + TILE_HEIGHT * 0.15, 0.8);
        win.drawCircle(winX + 14, winTop + winH2 * 0.35, 1.2);
        win.endFill();
        this.wallContainer.addChild(win);

        // corner
        const { x: cx, y: cy } = this.gridToScreen(0, 0);
        const corner = new PIXI.Graphics();
        corner.lineStyle(2, COL.wallEdge, 0.9);
        corner.moveTo(cx, cy - wallH);
        corner.lineTo(cx, cy);
        this.wallContainer.addChild(corner);
    }

    _drawClock() {
        const wallH = 120;
        // Right wall face at gx = 6 — roughly the centre of the back-right wall
        // Face panel: bottom-left(wx, wy) → bottom-right(wx+TW/2, wy+TH/2)
        //             top-right(wx+TW/2,  wy+TH/2-wallH) → top-left(wx, wy-wallH)
        const { x: wx, y: wy } = this.gridToScreen(6, 0);
        const cx = wx + TILE_WIDTH  / 4;              // horizontal centre of face
        const cy = wy + TILE_HEIGHT / 4 - wallH * 0.62; // 62% up the wall

        // LED panel
        const screen = new PIXI.Graphics();
        screen.beginFill(0x050d18);
        screen.drawRoundedRect(-38, -14, 76, 28, 5);
        screen.endFill();

        // Outer bezel border
        screen.lineStyle(1, 0x0d3050, 0.9);
        screen.drawRoundedRect(-38, -14, 76, 28, 5);

        // Subtle top-edge glow (like a backlit panel)
        screen.lineStyle(0.6, 0x0088cc, 0.28);
        screen.moveTo(-36, -13);
        screen.lineTo( 36, -13);

        // Four corner mounting screws
        screen.lineStyle(0);
        screen.beginFill(0x081525);
        for (const [sx, sy] of [[-34, -11], [34, -11], [-34, 11], [34, 11]]) {
            screen.drawCircle(sx, sy, 1.5);
        }
        screen.endFill();

        // time text
        this._clockText = new PIXI.Text('00:00', {
            fontFamily:         'monospace',
            fontSize:           16,
            fill:               0x00e0ff,
            fontWeight:         'bold',
            letterSpacing:      3,
            dropShadow:         true,
            dropShadowColor:    '#00aaff',
            dropShadowBlur:     10,
            dropShadowDistance: 0,
            dropShadowAlpha:    0.85,
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
