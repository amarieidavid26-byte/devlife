import * as PIXI from 'pixi.js';
import { cartToIso, TILE_WIDTH, TILE_HEIGHT } from '../utils/isometric.js';
import { TownPlayer } from './TownPlayer.js';

const GRID_SIZE = 12;
const GAME_ZOOM = 1.5;
const WALL_H = 100;

// Offset player coordinates by +7 so TownPlayer's hardcoded BLOCKED_ZONES
// (HOME 3.25-6.75 in both axes) don't create invisible walls inside the cafe.
// Cafe (0,0) -> TownPlayer (7,7), Cafe (12,12) -> TownPlayer (19,19) -- all clear.
const COORD_OFFSET = 7;

const COL = {
    floorA:     0xB8956A,
    floorB:     0xA8855A,
    floorC:     0x9A7A4A,
    floorGap:   0x6B5B3E,
    floorLine:  0x9A7A50,
    wallLeft:   0xC87A4A,
    wallRight:  0xB06A3A,
    wallEdge:   0xD88A5A,
    baseboard:  0x6B4A2A,
    counter:    0x5A3A1A,
    counterTop: 0x6B4A2A,
    tableTop:   0xA0845C,
    tableLeg:   0x7A5C3A,
    chairSeat:  0x8B7348,
    chairBack:  0x7A6338,
    menuBoard:  0x2A1A10,
    chalkboard: 0x2A3A2A,
    cup:        0xF5F0E8,
    coffee:     0x5A3A1A,
    warm:       0xFFE4B5,
    green:      0x6AD89A,
};

export class CafeScene {
    constructor(pixiApp) {
        this._app = pixiApp;
        this._container = null;
        this._player = null;
        this._playerLayer = null;
        this._steamSources = [];
        this._dustMotes = [];
        this._stringLights = [];
        this._recoveryGraph = null;
        this._recoveryDot = null;
        this._recoveryProgress = 0;
        this._elapsed = 0;
        this._timers = [];
        this._plantTex = null;
        this._onKeyDown = null;

        this.onGhostSay = null;
        this.onExit = null;

        this._tables = [];
        this._usedTables = new Set();
        this._brewing = false;
        this._brewElapsed = 0;
        this._brewTarget = null;
        this._brewCupGfx = null;
        this._brewBarContainer = null;
        this._brewBarFill = null;
        this._brewSteamSource = null;
        this._ePrompt = null;
        this._recoveryPanel = null;
        this._recoveryIntervals = [];
    }

    // ---------------------------------------------
    //  Scene interface
    // ---------------------------------------------

    async enter() {
        this._plantTex = await PIXI.Assets.load('/assets/Isometric/pottedPlant_SE.png').catch(() => null);

        this._container = new PIXI.Container();
        this._container.scale.set(GAME_ZOOM);
        this._app.stage.addChild(this._container);

        this._floorContainer = new PIXI.Container();
        this._wallContainer = new PIXI.Container();
        this._furnitureContainer = new PIXI.Container();
        this._ambientContainer = new PIXI.Container();

        this._container.addChild(this._floorContainer);
        this._container.addChild(this._wallContainer);
        this._container.addChild(this._furnitureContainer);

        // Player layer -- offset so TownPlayer's cartToIso aligns with _gridToScreen.
        // The extra COORD_OFFSET*TILE_HEIGHT compensates for the coordinate shift.
        this._playerLayer = new PIXI.Container();
        this._playerLayer.x = (window.innerWidth / GAME_ZOOM) / 2;
        this._playerLayer.y = (window.innerHeight / GAME_ZOOM) / 2 - (GRID_SIZE * TILE_HEIGHT / 2) - (COORD_OFFSET * TILE_HEIGHT);
        this._container.addChild(this._playerLayer);

        this._container.addChild(this._ambientContainer);

        // Draw room
        this._drawFloor();
        this._drawWalls();
        this._drawCounter();
        this._drawMenuBoard();
        this._drawChalkboard();
        this._drawTable(2, 8, 2);
        this._drawTable(7, 5, 2);
        this._drawTable(5, 10, 2);
        this._drawTable(9, 7, 1);
        this._drawPlant(11, 1);
        this._drawStringLights();
        this._drawRecoveryDisplay();
        this._drawDoorHint();
        this._drawWarmOverlay();
        this._initDustMotes();

        // Player -- spawn near door (6, 8) in cafe coords
        this._player = new TownPlayer(this._playerLayer);
        this._player.setPosition(6 + COORD_OFFSET, 8 + COORD_OFFSET);
        this._player.enable();

        // Snap camera to player (no lerp on first frame)
        const initScreen = this._gridToScreen(6, 8);
        this._container.x = window.innerWidth / 2 - initScreen.x * GAME_ZOOM;
        this._container.y = window.innerHeight / 2 - initScreen.y * GAME_ZOOM;

        // Ghost messages
        this._timers.push(setTimeout(() => {
            this.onGhostSay?.("See? Your HRV is already improving. Breaks work.", 4000);
        }, 5000));

        this._timers.push(setTimeout(() => {
            this.onGhostSay?.("Recovery up 3%. Sometimes the best code is written after stepping away.", 5000);
        }, 15000));

        // [E] interaction prompt
        this._ePrompt = new PIXI.Text('[E]', {
            fontFamily: 'monospace',
            fontSize: 13,
            fill: 0xe94560,
            fontWeight: 'bold',
            dropShadow: true,
            dropShadowColor: '#000000',
            dropShadowBlur: 4,
            dropShadowAlpha: 0.6,
            dropShadowDistance: 0,
        });
        this._ePrompt.anchor.set(0.5, 1);
        this._ePrompt.visible = false;
        this._ePrompt.zIndex = 10000;
        this._furnitureContainer.addChild(this._ePrompt);

        // Keyboard: ESC (exit/cancel), E (interact)
        this._onKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (this._recoveryPanel) { this._closeRecoveryPanel(); return; }
                if (this._brewing) { this._cancelBrewing(); return; }
                this.onExit?.();
                return;
            }
            if (e.key.toLowerCase() === 'e' && !this._brewing && !this._recoveryPanel) {
                this._handleInteraction();
            }
        };
        document.addEventListener('keydown', this._onKeyDown);
    }

    exit() {
        for (const t of this._timers) clearTimeout(t);
        this._timers = [];

        if (this._onKeyDown) {
            document.removeEventListener('keydown', this._onKeyDown);
            this._onKeyDown = null;
        }

        this._cancelBrewing();
        if (this._recoveryPanel) {
            this._recoveryPanel.remove();
            this._recoveryPanel = null;
        }
        for (const id of this._recoveryIntervals) clearInterval(id);
        this._recoveryIntervals = [];

        if (this._player) {
            this._player.disable();
            this._player.destroy();
            this._player = null;
        }

        for (const src of this._steamSources) {
            for (const p of src.active) {
                p.gfx.parent?.removeChild(p.gfx);
                p.gfx.destroy();
            }
        }

        if (this._container) {
            this._app.stage.removeChild(this._container);
            this._container.destroy({ children: true });
            this._container = null;
        }

        this._steamSources = [];
        this._dustMotes = [];
        this._stringLights = [];
        this._recoveryGraph = null;
        this._recoveryDot = null;
        this._recoveryProgress = 0;
        this._elapsed = 0;
        this._playerLayer = null;
        this._tables = [];
        this._usedTables = new Set();
        this._brewing = false;
        this._brewElapsed = 0;
        this._brewTarget = null;
        this._brewCupGfx = null;
        this._brewBarContainer = null;
        this._brewBarFill = null;
        this._brewSteamSource = null;
        this._ePrompt = null;
    }

    update(delta) {
        this._elapsed += delta;

        if (this._player) {
            this._player.update(delta);

            // Clamp to cafe interior (convert from offset coords)
            const pos = this._player.getPosition();
            const cafeX = pos.x - COORD_OFFSET;
            const cafeY = pos.y - COORD_OFFSET;
            const clampedX = Math.max(0.5, Math.min(11.5, cafeX));
            const clampedY = Math.max(2.5, Math.min(11.5, cafeY)); // y>=2.5 keeps player in front of counter
            if (clampedX !== cafeX || clampedY !== cafeY) {
                this._player.setPosition(clampedX + COORD_OFFSET, clampedY + COORD_OFFSET);
            }

            // Camera follow (lerp)
            const sp = this._gridToScreen(clampedX, clampedY);
            const camTargetX = window.innerWidth / 2 - sp.x * GAME_ZOOM;
            const camTargetY = window.innerHeight / 2 - sp.y * GAME_ZOOM;
            const camLerp = 0.07 * delta;
            this._container.x += (camTargetX - this._container.x) * camLerp;
            this._container.y += (camTargetY - this._container.y) * camLerp;
        }

        this._updateInteractionPrompt();
        this._updateBrewing(delta);
        this._updateSteam(delta);
        this._updateDust(delta);
        this._updateStringLights();
        this._updateRecoveryGraph(delta);
    }

    // ---------------------------------------------
    //  Coordinates
    // ---------------------------------------------

    _gridToScreen(gx, gy) {
        const iso = cartToIso(gx, gy);
        return {
            x: iso.x + (window.innerWidth / GAME_ZOOM) / 2,
            y: iso.y + (window.innerHeight / GAME_ZOOM) / 2 - (GRID_SIZE * TILE_HEIGHT / 2),
        };
    }

    // ---------------------------------------------
    //  Floor (12x12 warm wood checkerboard)
    // ---------------------------------------------

    _drawFloor() {
        const hw = TILE_WIDTH / 2;
        const hh = TILE_HEIGHT / 2;

        for (let gx = 0; gx < GRID_SIZE; gx++) {
            for (let gy = 0; gy < GRID_SIZE; gy++) {
                const tile = new PIXI.Graphics();
                const { x, y } = this._gridToScreen(gx, gy);

                // Simple warm checkerboard
                const color = (gx + gy) % 2 === 0 ? COL.floorA : COL.floorB;
                tile.beginFill(color);
                tile.moveTo(x, y);
                tile.lineTo(x + hw, y + hh);
                tile.lineTo(x, y + TILE_HEIGHT);
                tile.lineTo(x - hw, y + hh);
                tile.closePath();
                tile.endFill();

                // Thin gap lines between tiles
                tile.lineStyle(0.5, COL.floorGap, 0.15);
                tile.moveTo(x, y);
                tile.lineTo(x + hw, y + hh);
                tile.lineTo(x, y + TILE_HEIGHT);
                tile.lineTo(x - hw, y + hh);
                tile.closePath();
                tile.lineStyle(0);

                this._floorContainer.addChild(tile);
            }
        }

        // Doormat at (6, 11) -- darker tile to indicate exit
        const { x: dx, y: dy } = this._gridToScreen(6, 11);
        const mat = new PIXI.Graphics();
        mat.beginFill(0x7A5C3A, 0.6);
        mat.moveTo(dx, dy);
        mat.lineTo(dx + TILE_WIDTH / 2, dy + TILE_HEIGHT / 2);
        mat.lineTo(dx, dy + TILE_HEIGHT);
        mat.lineTo(dx - TILE_WIDTH / 2, dy + TILE_HEIGHT / 2);
        mat.closePath();
        mat.endFill();
        this._floorContainer.addChild(mat);
    }

    // ---------------------------------------------
    //  Walls (per-tile panels)
    // ---------------------------------------------

    _drawWalls() {
        const baseH = 6;

        // left wall (x = 0)
        for (let gy = 0; gy < GRID_SIZE; gy++) {
            const { x, y } = this._gridToScreen(0, gy);
            const panel = new PIXI.Graphics();

            panel.beginFill(COL.wallLeft);
            panel.moveTo(x, y);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - WALL_H);
            panel.lineTo(x, y - WALL_H);
            panel.closePath();
            panel.endFill();

            // baseboard
            panel.beginFill(COL.baseboard);
            panel.moveTo(x, y);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - baseH);
            panel.lineTo(x, y - baseH);
            panel.closePath();
            panel.endFill();

            // edge line
            panel.lineStyle(1, COL.wallEdge, 0.4);
            panel.moveTo(x, y - WALL_H);
            panel.lineTo(x, y);

            this._wallContainer.addChild(panel);
        }

        // right wall (y = 0)
        for (let gx = 0; gx < GRID_SIZE; gx++) {
            const { x, y } = this._gridToScreen(gx, 0);
            const panel = new PIXI.Graphics();

            panel.beginFill(COL.wallRight);
            panel.moveTo(x, y);
            panel.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            panel.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - WALL_H);
            panel.lineTo(x, y - WALL_H);
            panel.closePath();
            panel.endFill();

            // baseboard
            panel.beginFill(COL.baseboard, 0.85);
            panel.moveTo(x, y);
            panel.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            panel.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - baseH);
            panel.lineTo(x, y - baseH);
            panel.closePath();
            panel.endFill();

            // edge line
            panel.lineStyle(1, COL.wallEdge, 0.3);
            panel.moveTo(x, y - WALL_H);
            panel.lineTo(x, y);

            this._wallContainer.addChild(panel);
        }

        // corner edge
        const { x: cx, y: cy } = this._gridToScreen(0, 0);
        const corner = new PIXI.Graphics();
        corner.lineStyle(2, COL.wallEdge, 0.6);
        corner.moveTo(cx, cy - WALL_H);
        corner.lineTo(cx, cy);
        this._wallContainer.addChild(corner);

        // -- Decorative shelf on back wall (y=0, gx=6..8) --
        const shelfPos = this._gridToScreen(7, 0);
        const shelfX = shelfPos.x + TILE_WIDTH / 4;
        const shelfY = shelfPos.y + TILE_HEIGHT / 4 - WALL_H * 0.45;
        const shelfContainer = new PIXI.Container();
        const shelf = new PIXI.Graphics();
        // Shelf bracket
        shelf.beginFill(COL.baseboard);
        shelf.drawRect(-33, 0, 66, 4);
        shelf.endFill();
        // 3 coffee bags
        const bagColors = [0x6B4A2A, 0x3A2A1A, 0xD4C8B0];
        for (let i = 0; i < 3; i++) {
            shelf.beginFill(bagColors[i]);
            shelf.drawRoundedRect(-27 + i * 21, -18, 15, 18, 1);
            shelf.endFill();
            // bag label
            shelf.beginFill(0xF5F0E8, 0.3);
            shelf.drawRect(-24 + i * 21, -12, 9, 6);
            shelf.endFill();
        }
        shelfContainer.addChild(shelf);
        shelfContainer.x = shelfX;
        shelfContainer.y = shelfY;
        shelfContainer.skew.y = Math.atan2(TILE_HEIGHT / 2, TILE_WIDTH / 2);
        this._wallContainer.addChild(shelfContainer);

        // -- Framed picture on left wall (x=0, gy=3) --
        const picWall = this._gridToScreen(0, 3);
        const picX = picWall.x - TILE_WIDTH / 4;
        const picY = picWall.y + TILE_HEIGHT / 4 - WALL_H * 0.6;
        const picContainer = new PIXI.Container();
        const pic = new PIXI.Graphics();
        // Frame
        pic.beginFill(0xA0845C);
        pic.drawRect(-18, -13, 36, 27);
        pic.endFill();
        // Inner canvas
        pic.beginFill(0x7AB8D4);
        pic.drawRect(-15, -10, 30, 21);
        pic.endFill();
        // Abstract landscape: sky (already filled), hills, ground
        pic.beginFill(0x6A9A5A);
        pic.drawRect(-15, 1, 30, 9);
        pic.endFill();
        pic.beginFill(0x8AB86A);
        pic.drawRect(-15, -2, 30, 6);
        pic.endFill();
        // Sun
        pic.beginFill(0xFFE4B5, 0.7);
        pic.drawCircle(7, -4, 3.75);
        pic.endFill();
        picContainer.addChild(pic);
        picContainer.x = picX;
        picContainer.y = picY;
        picContainer.skew.y = -Math.atan2(TILE_HEIGHT / 2, TILE_WIDTH / 2);
        this._wallContainer.addChild(picContainer);

        // -- Wall clock on left wall (x=0, gy=8) --
        const clockWall = this._gridToScreen(0, 8);
        const clockX = clockWall.x - TILE_WIDTH / 4;
        const clockY = clockWall.y + TILE_HEIGHT / 4 - WALL_H * 0.65;
        const clockContainer = new PIXI.Container();
        const clock = new PIXI.Graphics();
        // Face
        clock.beginFill(0xF5F0E8);
        clock.drawCircle(0, 0, 12);
        clock.endFill();
        // Rim
        clock.lineStyle(1, COL.baseboard, 0.8);
        clock.drawCircle(0, 0, 12);
        clock.lineStyle(0);
        // Hour marks
        for (let h = 0; h < 12; h++) {
            const angle = (h / 12) * Math.PI * 2 - Math.PI / 2;
            clock.beginFill(0x4A3A2A);
            clock.drawCircle(Math.cos(angle) * 9, Math.sin(angle) * 9, 0.9);
            clock.endFill();
        }
        // Hour hand
        clock.lineStyle(1.8, 0x2A1A10, 0.9);
        clock.moveTo(0, 0);
        clock.lineTo(-3, -6);
        // Minute hand
        clock.lineStyle(1.2, 0x2A1A10, 0.7);
        clock.moveTo(0, 0);
        clock.lineTo(6, -4.5);
        clock.lineStyle(0);
        // Center dot
        clock.beginFill(0x2A1A10);
        clock.drawCircle(0, 0, 1.5);
        clock.endFill();
        clockContainer.addChild(clock);
        clockContainer.x = clockX;
        clockContainer.y = clockY;
        clockContainer.skew.y = -Math.atan2(TILE_HEIGHT / 2, TILE_WIDTH / 2);
        this._wallContainer.addChild(clockContainer);
    }

    // ---------------------------------------------
    //  Coffee counter (back wall, y=1, x=2 to x=6)
    // ---------------------------------------------

    _drawCounter() {
        const counterH = 36;
        const g = new PIXI.Graphics();

        for (let gx = 2; gx <= 6; gx++) {
            const { x, y } = this._gridToScreen(gx, 1);

            // front face
            g.beginFill(COL.counter);
            g.moveTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            g.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            g.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - counterH);
            g.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - counterH);
            g.closePath();
            g.endFill();

            // top surface (isometric diamond)
            g.beginFill(COL.counterTop);
            g.moveTo(x, y - counterH);
            g.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - counterH);
            g.lineTo(x, y + TILE_HEIGHT - counterH);
            g.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - counterH);
            g.closePath();
            g.endFill();

            // edge highlight
            g.lineStyle(0.5, 0x8B7A5A, 0.3);
            g.moveTo(x, y - counterH);
            g.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - counterH);
            g.lineStyle(0);
        }

        // Polished countertop highlight (front edge catchlight)
        const hlStart = this._gridToScreen(2, 1);
        const hlEnd = this._gridToScreen(6, 1);
        g.lineStyle(1, 0xD4B88A, 0.5);
        g.moveTo(hlStart.x - TILE_WIDTH / 2, hlStart.y + TILE_HEIGHT / 2 - counterH);
        g.lineTo(hlEnd.x + TILE_WIDTH / 2, hlEnd.y + TILE_HEIGHT / 2 - counterH);
        g.lineStyle(0);

        this._furnitureContainer.addChild(g);

        // Counter details -- items sit ON the counter surface
        const details = new PIXI.Graphics();

        // Napkin holder at gx=2.8
        const np = this._gridToScreen(2.8, 1);
        const npSurf = np.y + TILE_HEIGHT / 2 - counterH;
        details.beginFill(0xD4C8B0);
        details.drawRect(np.x - 4, npSurf - 6, 8, 2);
        details.drawRect(np.x - 4, npSurf - 4, 8, 2);
        details.drawRect(np.x - 4, npSurf - 2, 8, 2);
        details.endFill();
        details.beginFill(0x8B7A5A);
        details.drawRect(np.x - 5, npSurf - 7, 10, 1);
        details.drawRect(np.x - 5, npSurf, 10, 1);
        details.endFill();

        // Tip jar at gx=4.0
        const tp = this._gridToScreen(4.0, 1);
        const tpSurf = tp.y + TILE_HEIGHT / 2 - counterH;
        details.beginFill(0xC8D8E8, 0.5);
        details.drawRect(tp.x - 3, tpSurf - 10, 6, 10);
        details.endFill();
        details.lineStyle(0.5, 0xA0B0C0, 0.4);
        details.drawRect(tp.x - 3, tpSurf - 10, 6, 10);
        details.lineStyle(0);
        // coins inside
        details.beginFill(0xD4AA50, 0.6);
        details.drawCircle(tp.x - 1, tpSurf - 3, 1.5);
        details.drawCircle(tp.x + 1, tpSurf - 5, 1.5);
        details.endFill();

        // Menu stand at gx=5.2
        const mp = this._gridToScreen(5.2, 1);
        const mpSurf = mp.y + TILE_HEIGHT / 2 - counterH;
        details.beginFill(0x5A3A1A);
        details.moveTo(mp.x, mpSurf - 12);
        details.lineTo(mp.x + 5, mpSurf);
        details.lineTo(mp.x - 5, mpSurf);
        details.closePath();
        details.endFill();
        details.beginFill(0xF5F0E8, 0.5);
        details.drawRect(mp.x - 3, mpSurf - 9, 6, 6);
        details.endFill();

        this._furnitureContainer.addChild(details);

        // Espresso machine (at gx=2.2, behind counter on wall)
        const ep = this._gridToScreen(2.2, 0.5);
        const epSurf = ep.y + TILE_HEIGHT / 2;
        const machine = new PIXI.Graphics();
        // Main body
        machine.beginFill(0x4A4A4A);
        machine.drawRoundedRect(ep.x - 15, epSurf - 40, 30, 30, 3);
        machine.endFill();
        // Chrome top
        machine.beginFill(0x6A6A6A);
        machine.drawRect(ep.x - 16, epSurf - 42, 32, 4);
        machine.endFill();
        // Two buttons
        machine.beginFill(0xE05040);
        machine.drawCircle(ep.x - 5, epSurf - 30, 2);
        machine.endFill();
        machine.beginFill(0x50E060);
        machine.drawCircle(ep.x + 5, epSurf - 30, 2);
        machine.endFill();
        // Drip tray
        machine.beginFill(0x3A3A3A);
        machine.drawRect(ep.x - 12, epSurf - 10, 24, 3);
        machine.endFill();
        // Steam wand
        machine.lineStyle(1.5, 0x8A8A8A, 0.8);
        machine.moveTo(ep.x + 13, epSurf - 26);
        machine.lineTo(ep.x + 17, epSurf - 16);
        machine.lineStyle(0);
        // Gauge circle
        machine.lineStyle(1, 0xB0B0B0, 0.6);
        machine.drawCircle(ep.x, epSurf - 22, 4);
        machine.lineStyle(0);

        this._furnitureContainer.addChild(machine);

        // 3 small coffee cups evenly spaced on counter surface
        const cupPositions = [3.2, 4.4, 5.6];
        for (const cgx of cupPositions) {
            const { x, y } = this._gridToScreen(cgx, 1);
            const cup = new PIXI.Graphics();
            const surf = y + TILE_HEIGHT / 2 - counterH;

            // cup body (small 5px tall)
            cup.beginFill(COL.cup);
            cup.drawRect(x - 4, surf - 7, 8, 7);
            cup.endFill();
            // coffee surface
            cup.beginFill(COL.coffee);
            cup.drawRect(x - 2, surf - 4, 4, 2);
            cup.endFill();
            // handle
            cup.lineStyle(1, COL.cup, 0.8);
            cup.arc(x + 3, surf - 3, 2, -Math.PI / 2, Math.PI / 2, false);
            cup.lineStyle(0);

            this._furnitureContainer.addChild(cup);
            this._steamSources.push({ x, baseY: surf - 6, spawnAccum: Math.random() * 20, active: [] });
        }
    }

    // ---------------------------------------------
    //  Menu board (right wall at gx=4, y=0)
    // ---------------------------------------------

    _drawMenuBoard() {
        const { x: wx, y: wy } = this._gridToScreen(4, 0);
        const bx = wx + TILE_WIDTH / 4;
        const by = wy + TILE_HEIGHT / 4 - WALL_H * 0.65;

        const board = new PIXI.Graphics();
        board.beginFill(COL.menuBoard);
        board.drawRoundedRect(-36, -24, 72, 48, 4);
        board.endFill();

        // menu item lines
        const lineColors = [COL.warm, COL.green, COL.warm, 0xFF7A6A, COL.warm];
        for (let i = 0; i < 5; i++) {
            board.lineStyle(1.5, lineColors[i], 0.5);
            const ly = -15 + i * 9;
            const lw = 18 + (i % 3) * 9;
            board.moveTo(-27, ly);
            board.lineTo(-27 + lw, ly);
            board.lineStyle(0);
            board.beginFill(lineColors[i], 0.4);
            board.drawCircle(27, ly, 1.5);
            board.endFill();
        }

        const menuContainer = new PIXI.Container();
        menuContainer.addChild(board);
        menuContainer.x = bx;
        menuContainer.y = by;
        menuContainer.skew.y = Math.atan2(TILE_HEIGHT / 2, TILE_WIDTH / 2);
        this._wallContainer.addChild(menuContainer);
    }

    // ---------------------------------------------
    //  Chalkboard (left wall at x=0, gy=5)
    // ---------------------------------------------

    _drawChalkboard() {
        const { x: wx, y: wy } = this._gridToScreen(0, 5);
        const bx = wx - TILE_WIDTH / 4;
        const by = wy + TILE_HEIGHT / 4 - WALL_H * 0.55;

        const board = new PIXI.Graphics();
        // wooden frame
        board.beginFill(COL.baseboard);
        board.drawRoundedRect(-42, -30, 84, 60, 4);
        board.endFill();
        // green surface
        board.beginFill(COL.chalkboard);
        board.drawRoundedRect(-37, -25, 75, 51, 3);
        board.endFill();

        // chalk text lines
        const chalkColors = [0xF5F0E8, 0xFFD66B, 0xF5F0E8, 0xFF9A8C, 0xF5F0E8];
        for (let i = 0; i < 5; i++) {
            board.lineStyle(1.2, chalkColors[i], 0.45);
            const ly = -18 + i * 10;
            const lw = 15 + (i * 7 % 15);
            board.moveTo(-30, ly);
            board.lineTo(-30 + lw, ly);
        }

        const chalkContainer = new PIXI.Container();
        chalkContainer.addChild(board);
        chalkContainer.x = bx;
        chalkContainer.y = by;
        chalkContainer.skew.y = -Math.atan2(TILE_HEIGHT / 2, TILE_WIDTH / 2);
        this._wallContainer.addChild(chalkContainer);
    }

    // ---------------------------------------------
    //  Tables + chairs
    // ---------------------------------------------

    _drawTable(gx, gy, chairCount) {
        const { x, y } = this._gridToScreen(gx, gy);
        const tileCenter = y + TILE_HEIGHT / 2;
        const g = new PIXI.Graphics();

        // shadow
        g.beginFill(0x3C2A1A, 0.06);
        g.drawEllipse(x, tileCenter, 35, 18);
        g.endFill();

        // table base
        g.beginFill(COL.tableLeg);
        g.drawEllipse(x, tileCenter, 10, 6);
        g.endFill();

        // single pedestal leg
        g.beginFill(COL.tableLeg);
        g.drawRect(x - 3, tileCenter - 25, 6, 25);
        g.endFill();

        // round top (isometric ellipse)
        g.beginFill(COL.tableTop);
        g.drawEllipse(x, tileCenter - 30, 30, 18);
        g.endFill();

        // edge outline
        g.lineStyle(1, 0xBFA072, 0.4);
        g.drawEllipse(x, tileCenter - 30, 30, 18);
        g.lineStyle(0);

        // highlight
        g.beginFill(0xBFA072, 0.3);
        g.drawEllipse(x - 4, tileCenter - 34, 16, 8);
        g.endFill();

        // chairs FIRST (so they render BEHIND the table top)
        if (chairCount >= 1) this._drawChair(gx - 1.0, gy - 0.3);
        if (chairCount >= 2) this._drawChair(gx + 1.0, gy + 0.3);

        this._furnitureContainer.addChild(g);

        // Track table for interactions
        this._tables.push({ gx, gy, screenX: x, screenY: tileCenter, chairGx: gx - 1.0, chairGy: gy - 0.3 });
    }

    _drawChair(gx, gy) {
        const { x, y } = this._gridToScreen(gx, gy);
        const base = y + TILE_HEIGHT / 2;
        const g = new PIXI.Graphics();

        // back legs
        g.beginFill(0x8B6B3A);
        g.drawRect(x - 8, base - 12, 2, 12);
        g.drawRect(x + 6, base - 14, 2, 12);
        g.endFill();

        // front legs (shorter)
        g.beginFill(0x8B6B3A);
        g.drawRect(x - 8, base - 4, 2, 8);
        g.drawRect(x + 6, base - 6, 2, 8);
        g.endFill();

        // backrest
        g.beginFill(0x8B6B3A);
        g.drawRoundedRect(x - 9, base - 20, 18, 8, 2);
        g.endFill();

        // seat (warm leather brown)
        g.beginFill(0xA07050);
        g.drawEllipse(x, base - 6, 14, 8);
        g.endFill();

        this._furnitureContainer.addChild(g);
    }

    // ---------------------------------------------
    //  Plant (corner, Kenney sprite with fallback)
    // ---------------------------------------------

    _drawPlant(gx, gy) {
        const { x, y } = this._gridToScreen(gx, gy);
        const tileCenter = y + TILE_HEIGHT / 2;

        if (this._plantTex) {
            const sprite = new PIXI.Sprite(this._plantTex);
            sprite.anchor.set(0.5, 0.92);
            sprite.scale.set(0.50);
            sprite.x = x;
            sprite.y = tileCenter;
            this._furnitureContainer.addChild(sprite);
        } else {
            const g = new PIXI.Graphics();
            // pot
            g.beginFill(0xC87A4A);
            g.moveTo(x - 6, tileCenter - 4);
            g.lineTo(x + 6, tileCenter - 4);
            g.lineTo(x + 8, tileCenter + 10);
            g.lineTo(x - 8, tileCenter + 10);
            g.closePath();
            g.endFill();
            // soil
            g.beginFill(0x6B4A2A);
            g.drawEllipse(x, tileCenter - 4, 6, 3);
            g.endFill();
            // leaves
            g.beginFill(0x5BA05C);
            g.drawEllipse(x - 6, tileCenter - 12, 6, 5);
            g.drawEllipse(x + 5, tileCenter - 14, 6, 5);
            g.drawEllipse(x, tileCenter - 20, 5, 4);
            g.endFill();
            this._furnitureContainer.addChild(g);
        }
    }

    // ---------------------------------------------
    //  String lights across ceiling
    // ---------------------------------------------

    _drawStringLights() {
        const wire = new PIXI.Graphics();
        this._stringLights = [];

        // string from right wall to left wall near ceiling
        const start = this._gridToScreen(2, 0);
        const end = this._gridToScreen(0, 10);
        const sx = start.x + TILE_WIDTH / 4;
        const sy = start.y + TILE_HEIGHT / 4 - WALL_H * 0.85;
        const ex = end.x - TILE_WIDTH / 4;
        const ey = end.y + TILE_HEIGHT / 4 - WALL_H * 0.85;

        // wire with sag
        const mx = (sx + ex) / 2;
        const my = (sy + ey) / 2 + 12;
        wire.lineStyle(0.8, 0x4A3A2A, 0.4);
        wire.moveTo(sx, sy);
        wire.quadraticCurveTo(mx, my, ex, ey);
        wire.lineStyle(0);
        this._wallContainer.addChild(wire);

        // 10 bulbs along the bezier
        const bulbCount = 10;
        for (let i = 0; i < bulbCount; i++) {
            const t = (i + 0.5) / bulbCount;
            const bx = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * mx + t * t * ex;
            const by = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * my + t * t * ey;

            const bulb = new PIXI.Graphics();
            // Outer warm glow halo
            bulb.beginFill(COL.warm, 0.06);
            bulb.drawCircle(0, 0, 16);
            bulb.endFill();
            // Inner glow
            bulb.beginFill(COL.warm, 0.08);
            bulb.drawCircle(0, 0, 10);
            bulb.endFill();
            // Bulb
            bulb.beginFill(COL.warm, 0.55);
            bulb.drawCircle(0, 0, 2);
            bulb.endFill();
            bulb.x = bx;
            bulb.y = by;

            this._ambientContainer.addChild(bulb);
            this._stringLights.push({ gfx: bulb, phase: i * 0.9 });
        }
    }

    // ---------------------------------------------
    //  Recovery display (right wall at gx=8, y=0)
    // ---------------------------------------------

    _drawRecoveryDisplay() {
        const { x: wx, y: wy } = this._gridToScreen(8, 0);
        const bx = wx + TILE_WIDTH / 4;
        const by = wy + TILE_HEIGHT / 4 - WALL_H * 0.6;

        const displayContainer = new PIXI.Container();

        // screen background
        const bg = new PIXI.Graphics();
        bg.beginFill(0x0A0A14, 0.9);
        bg.drawRoundedRect(-45, -33, 90, 66, 6);
        bg.endFill();
        bg.lineStyle(1, COL.baseboard, 0.7);
        bg.drawRoundedRect(-45, -33, 90, 66, 6);
        bg.lineStyle(0);
        displayContainer.addChild(bg);

        // label
        const label = new PIXI.Text('RECOVERY BOOST', {
            fontFamily: "'Fredoka', monospace, sans-serif",
            fontSize: 6,
            fill: COL.green,
            fontWeight: '600',
            letterSpacing: 1,
        });
        label.anchor.set(0.5, 0);
        label.y = -27;
        displayContainer.addChild(label);

        // graph -- updated each frame
        this._recoveryGraph = new PIXI.Graphics();
        displayContainer.addChild(this._recoveryGraph);

        // pulsing "ACTIVE" dot
        this._recoveryDot = new PIXI.Graphics();
        this._recoveryDot.beginFill(COL.green, 0.7);
        this._recoveryDot.drawCircle(33, -27, 3);
        this._recoveryDot.endFill();
        displayContainer.addChild(this._recoveryDot);

        displayContainer.x = bx;
        displayContainer.y = by;
        displayContainer.skew.y = Math.atan2(TILE_HEIGHT / 2, TILE_WIDTH / 2);
        this._wallContainer.addChild(displayContainer);
    }

    _updateRecoveryGraph(delta) {
        if (!this._recoveryGraph) return;

        this._recoveryProgress = Math.min(1, this._recoveryProgress + delta * 0.0003);

        const g = this._recoveryGraph;
        g.clear();

        const gx = -24, gy = -6, gw = 48, gh = 22;
        const points = 20;

        // grid lines
        g.lineStyle(0.5, 0xffffff, 0.05);
        for (let i = 0; i <= 4; i++) {
            const ly = gy + (gh / 4) * i;
            g.moveTo(gx, ly);
            g.lineTo(gx + gw, ly);
        }

        // recovery line -- curves upward
        const drawnPoints = Math.floor(points * this._recoveryProgress);
        if (drawnPoints > 0) {
            g.lineStyle(1.5, COL.green, 0.8);
            for (let i = 0; i <= drawnPoints; i++) {
                const t = i / points;
                const px = gx + t * gw;
                const progress = Math.pow(t, 0.6);
                const py = gy + gh - progress * gh * 0.8 + Math.sin(t * 8) * 1.5;
                if (i === 0) g.moveTo(px, py);
                else g.lineTo(px, py);
            }
        }

        // pulsing dot
        if (this._recoveryDot) {
            this._recoveryDot.alpha = 0.4 + Math.sin(this._elapsed * 0.05) * 0.3;
        }
    }

    // ---------------------------------------------
    //  Door hint (bottom center, grid 6,11)
    // ---------------------------------------------

    _drawDoorHint() {
        const { x, y } = this._gridToScreen(6, 11);

        // Welcome mat in front of door
        const matG = new PIXI.Graphics();
        matG.beginFill(0x8B6B3A);
        matG.drawRoundedRect(x - 10, y + TILE_HEIGHT / 2 - 4, 20, 8, 2);
        matG.endFill();
        // "WELCOME" text on mat
        const welcomeText = new PIXI.Text('WELCOME', {
            fontFamily: 'monospace',
            fontSize: 5,
            fill: 0xF5F0E8,
            fontWeight: '600',
            letterSpacing: 0.5,
        });
        welcomeText.anchor.set(0.5, 0.5);
        welcomeText.x = x;
        welcomeText.y = y + TILE_HEIGHT / 2;
        welcomeText.alpha = 0.3;
        this._furnitureContainer.addChild(matG);
        this._furnitureContainer.addChild(welcomeText);

        const hint = new PIXI.Text('Press ESC to leave', {
            fontFamily: 'monospace',
            fontSize: 9,
            fill: 0xc0b8a8,
            fontWeight: '600',
            letterSpacing: 0.5,
        });
        hint.anchor.set(0.5, 0);
        hint.x = x;
        hint.y = y + TILE_HEIGHT + 4;
        this._furnitureContainer.addChild(hint);
    }

    // ---------------------------------------------
    //  Warm ambient overlay
    // ---------------------------------------------

    _drawWarmOverlay() {
        const vw = window.innerWidth / GAME_ZOOM;
        const vh = window.innerHeight / GAME_ZOOM;
        const overlay = new PIXI.Graphics();
        overlay.beginFill(COL.warm, 0.03);
        overlay.drawRect(-vw, -vh, vw * 3, vh * 3);
        overlay.endFill();
        this._ambientContainer.addChild(overlay);

        // Warm ambient glow on floor near counter (simulating counter lamp)
        const counterCenter = this._gridToScreen(4, 2.5);
        const glow = new PIXI.Graphics();
        glow.beginFill(COL.warm, 0.04);
        glow.drawEllipse(counterCenter.x, counterCenter.y + TILE_HEIGHT / 2, 60, 25);
        glow.endFill();
        this._ambientContainer.addChild(glow);
    }

    // ---------------------------------------------
    //  Dust motes
    // ---------------------------------------------

    _initDustMotes() {
        const vw = window.innerWidth / GAME_ZOOM;
        const vh = window.innerHeight / GAME_ZOOM;

        for (let i = 0; i < 12; i++) {
            const g = new PIXI.Graphics();
            const alpha = 0.03 + Math.random() * 0.04;
            g.beginFill(COL.warm, alpha);
            g.drawCircle(0, 0, 1.5);
            g.endFill();
            g.x = Math.random() * vw;
            g.y = Math.random() * vh;

            this._ambientContainer.addChild(g);
            this._dustMotes.push({
                gfx: g,
                vx: 0.04 + Math.random() * 0.08,
                baseY: g.y,
                sineAmp: 4,
                sinePeriod: 4 + Math.random() * 3,
                phase: Math.random() * Math.PI * 2,
            });
        }
    }

    _updateDust(delta) {
        const vw = window.innerWidth / GAME_ZOOM;
        const vh = window.innerHeight / GAME_ZOOM;

        for (const d of this._dustMotes) {
            d.phase += (delta / 60) * (Math.PI * 2 / d.sinePeriod);
            d.gfx.x += d.vx * delta;
            d.gfx.y = d.baseY + Math.sin(d.phase) * d.sineAmp;
            if (d.gfx.x > vw + 10) {
                d.gfx.x = -10;
                d.baseY = Math.random() * vh;
            }
        }
    }

    // ---------------------------------------------
    //  Steam particles (coffee cups)
    // ---------------------------------------------

    _updateSteam(delta) {
        for (const source of this._steamSources) {
            source.spawnAccum += delta;
            if (source.spawnAccum > 20 + Math.random() * 12) {
                source.spawnAccum = 0;
                const g = new PIXI.Graphics();
                const r = 1 + Math.random() * 1.5;
                g.beginFill(0xb0b8cc, 0.25);
                g.drawCircle(0, 0, r);
                g.endFill();
                const p = {
                    gfx: g,
                    x: source.x + (Math.random() - 0.5) * 4,
                    y: source.baseY,
                    vy: -(0.15 + Math.random() * 0.2),
                    vx: (Math.random() - 0.5) * 0.08,
                    alpha: 0.3,
                };
                g.x = p.x;
                g.y = p.y;
                this._furnitureContainer.addChild(g);
                source.active.push(p);
            }

            for (let i = source.active.length - 1; i >= 0; i--) {
                const p = source.active[i];
                p.x += p.vx * delta;
                p.y += p.vy * delta;
                p.alpha -= 0.004 * delta;
                p.gfx.x = p.x;
                p.gfx.y = p.y;
                p.gfx.alpha = Math.max(0, p.alpha);
                if (p.alpha <= 0) {
                    p.gfx.parent?.removeChild(p.gfx);
                    p.gfx.destroy();
                    source.active.splice(i, 1);
                }
            }
        }
    }

    // ---------------------------------------------
    //  String light pulse
    // ---------------------------------------------

    _updateStringLights() {
        const t = this._elapsed * 0.015;
        for (const light of this._stringLights) {
            light.gfx.alpha = 0.85 + Math.sin(t + light.phase) * 0.15;
        }
    }

    // ---------------------------------------------
    //  Interaction system
    // ---------------------------------------------

    _getPlayerCafePos() {
        if (!this._player) return null;
        const pos = this._player.getPosition();
        return { x: pos.x - COORD_OFFSET, y: pos.y - COORD_OFFSET };
    }

    _screenDist(gx1, gy1, gx2, gy2) {
        const a = cartToIso(gx1, gy1);
        const b = cartToIso(gx2, gy2);
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    _getNearestTable(cafeX, cafeY, maxDist) {
        let best = -1;
        let bestDist = Infinity;
        for (let i = 0; i < this._tables.length; i++) {
            const t = this._tables[i];
            const d = this._screenDist(cafeX, cafeY, t.gx, t.gy);
            if (d < bestDist && d < maxDist) {
                best = i;
                bestDist = d;
            }
        }
        return best;
    }

    _isNearCounter(cafeX, cafeY) {
        return cafeX >= 1.5 && cafeX <= 6.5 && cafeY <= 3.5;
    }

    _updateInteractionPrompt() {
        if (!this._ePrompt || this._brewing || this._recoveryPanel) {
            if (this._ePrompt) this._ePrompt.visible = false;
            return;
        }

        const pos = this._getPlayerCafePos();
        if (!pos) { this._ePrompt.visible = false; return; }

        // Check tables (80px threshold for prompt)
        const nearTable = this._getNearestTable(pos.x, pos.y, 80);
        if (nearTable >= 0 && !this._usedTables.has(nearTable)) {
            const t = this._tables[nearTable];
            this._ePrompt.visible = true;
            this._ePrompt.x = t.screenX;
            this._ePrompt.y = t.screenY - 55 + Math.sin(Date.now() / 280) * 4;
            return;
        }

        // Check counter
        if (this._isNearCounter(pos.x, pos.y)) {
            const nearX = Math.max(2, Math.min(6, Math.round(pos.x)));
            const cs = this._gridToScreen(nearX, 1);
            this._ePrompt.visible = true;
            this._ePrompt.x = cs.x;
            this._ePrompt.y = cs.y + TILE_HEIGHT / 2 - 55 + Math.sin(Date.now() / 280) * 4;
            return;
        }

        this._ePrompt.visible = false;
    }

    _handleInteraction() {
        const pos = this._getPlayerCafePos();
        if (!pos) return;

        // Tables (60px threshold for interaction)
        const nearTable = this._getNearestTable(pos.x, pos.y, 60);
        if (nearTable >= 0 && !this._usedTables.has(nearTable)) {
            this._startBrewing(nearTable);
            return;
        }

        // Counter
        if (this._isNearCounter(pos.x, pos.y)) {
            this._interactWithCounter();
        }
    }

    _interactWithCounter() {
        this.onGhostSay?.("The barista recommends herbal tea for your stress levels. Smart ghost, smart barista.", 5000);
    }

    // -- Brewing --

    _startBrewing(tableIdx) {
        const table = this._tables[tableIdx];
        this._brewing = true;
        this._brewElapsed = 0;
        this._brewTarget = tableIdx;
        this._usedTables.add(tableIdx);

        // Disable player and snap to chair
        this._player.disable();
        this._player.setPosition(table.chairGx + COORD_OFFSET, table.chairGy + COORD_OFFSET);

        // Coffee cup on table top
        const cx = table.screenX + 5;
        const cy = table.screenY - 22;
        this._brewCupGfx = new PIXI.Graphics();
        this._brewCupGfx.beginFill(COL.cup);
        this._brewCupGfx.drawRect(cx - 3, cy - 8, 6, 8);
        this._brewCupGfx.endFill();
        this._brewCupGfx.beginFill(COL.coffee);
        this._brewCupGfx.drawRect(cx - 2, cy - 6, 4, 4);
        this._brewCupGfx.endFill();
        this._brewCupGfx.lineStyle(1, COL.cup, 0.8);
        this._brewCupGfx.arc(cx + 3, cy - 4, 2.5, -Math.PI / 2, Math.PI / 2, false);
        this._brewCupGfx.lineStyle(0);
        this._furnitureContainer.addChild(this._brewCupGfx);

        // Steam source for this cup
        this._brewSteamSource = { x: cx, baseY: cy - 9, spawnAccum: 0, active: [] };
        this._steamSources.push(this._brewSteamSource);

        // Progress bar
        this._brewBarContainer = new PIXI.Container();
        this._brewBarContainer.x = table.screenX;
        this._brewBarContainer.y = table.screenY - 30;

        const barBg = new PIXI.Graphics();
        barBg.lineStyle(1, 0x8B6A3A, 0.8);
        barBg.beginFill(0x2A1A10, 0.7);
        barBg.drawRoundedRect(-22, 0, 44, 6, 2);
        barBg.endFill();
        this._brewBarContainer.addChild(barBg);

        this._brewBarFill = new PIXI.Graphics();
        this._brewBarContainer.addChild(this._brewBarFill);

        const brewLabel = new PIXI.Text('Brewing...', {
            fontFamily: "'Nunito', monospace, sans-serif",
            fontSize: 8,
            fill: COL.warm,
            fontWeight: '600',
        });
        brewLabel.anchor.set(0.5, 1);
        brewLabel.y = -2;
        this._brewBarContainer.addChild(brewLabel);

        this._furnitureContainer.addChild(this._brewBarContainer);
    }

    _updateBrewing(delta) {
        if (!this._brewing) return;

        this._brewElapsed += delta;
        const progress = Math.min(1, this._brewElapsed / 180); // 3 seconds at 60fps

        if (this._brewBarFill) {
            this._brewBarFill.clear();
            this._brewBarFill.beginFill(0x6AD89A, 0.9);
            this._brewBarFill.drawRoundedRect(-20, 1, Math.max(0, progress * 40), 4, 1);
            this._brewBarFill.endFill();
        }

        if (progress >= 1) this._finishBrewing();
    }

    _finishBrewing() {
        this._brewing = false;

        // Remove progress bar (keep the cup as a visual marker)
        if (this._brewBarContainer) {
            this._brewBarContainer.parent?.removeChild(this._brewBarContainer);
            this._brewBarContainer.destroy({ children: true });
            this._brewBarContainer = null;
            this._brewBarFill = null;
        }

        this.onGhostSay?.("Fresh coffee. Your cortisol levels are already dropping.", 4000);
        this._timers.push(setTimeout(() => this._showRecoveryPanel(), 800));
    }

    _cancelBrewing() {
        if (!this._brewing) return;
        this._brewing = false;
        this._brewElapsed = 0;

        if (this._brewBarContainer) {
            this._brewBarContainer.parent?.removeChild(this._brewBarContainer);
            this._brewBarContainer.destroy({ children: true });
            this._brewBarContainer = null;
            this._brewBarFill = null;
        }

        if (this._brewCupGfx) {
            this._brewCupGfx.parent?.removeChild(this._brewCupGfx);
            this._brewCupGfx.destroy();
            this._brewCupGfx = null;
        }

        if (this._brewSteamSource) {
            const idx = this._steamSources.indexOf(this._brewSteamSource);
            if (idx >= 0) this._steamSources.splice(idx, 1);
            for (const p of this._brewSteamSource.active) {
                p.gfx.parent?.removeChild(p.gfx);
                p.gfx.destroy();
            }
            this._brewSteamSource = null;
        }

        // Allow table reuse since it was cancelled
        if (this._brewTarget !== null) {
            this._usedTables.delete(this._brewTarget);
            this._brewTarget = null;
        }

        if (this._player) this._player.enable();
    }

    // -- Recovery Panel (DOM overlay) --

    _showRecoveryPanel() {
        if (this._recoveryPanel) return;

        const panel = document.createElement('div');
        panel.style.cssText = [
            'position:fixed;top:0;left:0;width:100vw;height:100vh',
            'display:flex;align-items:center;justify-content:center',
            'z-index:5000;background:rgba(0,0,0,0.3)',
        ].join(';');

        const card = document.createElement('div');
        card.style.cssText = [
            'background:rgba(42,36,28,0.92);border-radius:12px;padding:24px',
            'max-width:350px;width:90%;color:#F5F0E8',
            "font-family:'Nunito',sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.5)",
            'border:1px solid rgba(184,168,140,0.2)',
        ].join(';');

        // Title
        const title = document.createElement('div');
        title.textContent = '\u2615 Coffee Break Recovery';
        title.style.cssText = "font-family:'Fredoka',sans-serif;font-size:18px;margin-bottom:18px;color:#F5F0E8;font-weight:600";
        card.appendChild(title);

        // Stats
        const stats = [
            { label: 'Heart Rate', from: 95, to: 72, unit: ' bpm', decimals: 0 },
            { label: 'HRV', from: 35, to: 52, unit: 'ms', decimals: 0 },
            { label: 'Stress', from: 2.1, to: 0.8, unit: '', decimals: 1 },
            { label: 'Recovery', from: 45, to: 68, unit: '%', decimals: 0 },
        ];

        const statEls = [];
        for (const s of stats) {
            const row = document.createElement('div');
            row.style.cssText = 'margin-bottom:10px;font-size:14px;line-height:1.5';

            const labelSpan = document.createElement('span');
            labelSpan.textContent = s.label + ': ';
            labelSpan.style.color = '#B8A88C';

            const fromSpan = document.createElement('span');
            fromSpan.textContent = s.decimals ? s.from.toFixed(s.decimals) : String(s.from);
            fromSpan.style.color = '#FF7A6A';

            const arrow = document.createElement('span');
            arrow.textContent = ' \u2192 ';
            arrow.style.color = '#B8A88C';

            const toSpan = document.createElement('span');
            toSpan.textContent = s.decimals ? s.from.toFixed(s.decimals) : String(s.from);
            toSpan.style.color = '#6AD89A';

            const unitSpan = document.createElement('span');
            unitSpan.textContent = s.unit;
            unitSpan.style.color = '#6AD89A';

            row.appendChild(labelSpan);
            row.appendChild(fromSpan);
            row.appendChild(arrow);
            row.appendChild(toSpan);
            row.appendChild(unitSpan);
            card.appendChild(row);

            statEls.push({ el: toSpan, from: s.from, to: s.to, decimals: s.decimals });
        }

        // Animate stat numbers over 2 seconds
        let step = 0;
        const totalSteps = 40;
        const intervalId = setInterval(() => {
            step++;
            const t = Math.min(1, step / totalSteps);
            const eased = 1 - Math.pow(1 - t, 2);
            for (const se of statEls) {
                const val = se.from + (se.to - se.from) * eased;
                se.el.textContent = se.decimals ? val.toFixed(se.decimals) : String(Math.round(val));
            }
            if (step >= totalSteps) clearInterval(intervalId);
        }, 50);
        this._recoveryIntervals.push(intervalId);

        // Ghost quote
        const quote = document.createElement('div');
        quote.textContent = '\u201CSometimes the best code is written after stepping away.\u201D';
        quote.style.cssText = 'font-style:italic;font-size:13px;color:#B8A88C;margin-top:16px;line-height:1.5';
        card.appendChild(quote);

        // Continue button
        const btn = document.createElement('button');
        btn.textContent = 'Continue';
        btn.style.cssText = [
            "font-family:'Fredoka',sans-serif;font-size:14px;font-weight:600",
            'background:rgba(106,168,154,0.25);color:#6AD89A;border:1px solid rgba(106,216,154,0.4)',
            'border-radius:8px;padding:8px 28px;margin-top:18px;cursor:pointer',
            'transition:background 0.2s',
        ].join(';');
        btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(106,168,154,0.4)'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(106,168,154,0.25)'; });
        btn.addEventListener('click', () => this._closeRecoveryPanel());
        card.appendChild(btn);

        panel.appendChild(card);
        document.body.appendChild(panel);
        this._recoveryPanel = panel;
    }

    _closeRecoveryPanel() {
        if (!this._recoveryPanel) return;

        this._recoveryPanel.remove();
        this._recoveryPanel = null;

        for (const id of this._recoveryIntervals) clearInterval(id);
        this._recoveryIntervals = [];

        if (this._player) this._player.enable();
        this.onGhostSay?.("Recovery +8%. Back to work?", 3000);
    }
}
