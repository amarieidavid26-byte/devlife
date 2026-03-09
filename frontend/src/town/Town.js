import * as PIXI from 'pixi.js';
import { cartToIso, TILE_WIDTH, TILE_HEIGHT } from '../utils/isometric.js';
import { TownPlayer } from './TownPlayer.js';
import { TownGhost } from './TownGhost.js';
import { TownDialogue } from './TownDialogue.js';

const GRID_SIZE = 20;
const GAME_ZOOM = 1.5;
const WALL_H = 90; // building wall height in px

// Color palette — warm Animal Crossing nighttime
const COL = {
    grassA:    0x74B05A, // warm natural green
    grassB:    0x6A9E50, // slightly darker warm green
    path:      0x9B8B6E, // warm sandstone
    // HOME
    homeFront: 0xD4C5A9, // warm cream (matches room walls)
    homeSide:  0xBFAF93,
    homeRoof:  0xE8DCC8,
    homeDoor:  0x6B5B3E, // dark wood
    // CAFE
    cafeFront: 0xC87A4A, // warm terracotta
    cafeSide:  0xB06A3A,
    cafeRoof:  0xD88A5A,
    // COWORK
    coFront:   0x7A9AAC, // soft blue-grey
    coSide:    0x6A8A9C,
    coRoof:    0x8AAAB8,
    // Park
    trunk:     0x8B6B3A, // warm brown
    canopy:    0x5BA05C, // natural green
    canopyHi:  0x6DB86E, // highlight green
    bench:     0xA0845C, // warm oak wood
    // Lamp
    lampPole:  0x6B5B3E, // dark wood (wooden lamp posts)
    lampGlow:  0xFFE4B5, // warm moccasin
    // Labels
    labelFill: 0xF5F0E8, // warm white
};

// Which tiles are path (cross shape through center)
function isPath(gx, gy) {
    // Horizontal arm: rows 9-10 across entire width
    if (gy >= 9 && gy <= 10) return true;
    // Vertical arm: cols 9-10 across entire height
    if (gx >= 9 && gx <= 10) return true;
    return false;
}

export class Town {
    constructor(pixiApp) {
        this._app = pixiApp;
        this._container = null;
        this._particles = [];
        this._trees = [];
        this._lampGlows = [];
        this._elapsed = 0;

        this._player = null;
        this._ghost = null;
        this._entityContainer = null;
        this._onTownKeyDown = null;
        this._dialogue = null;

        this._benchTex = null;
        this._plantTex = null;
    }

    // ─────────────────────────────────────────────
    //  Scene interface
    // ─────────────────────────────────────────────

    async enter() {
        // Load optional Kenney sprites (fail gracefully)
        const wallTex = await PIXI.Assets.load('/assets/Isometric/wall_SE.png').catch(() => null);
        const doorTex = await PIXI.Assets.load('/assets/Isometric/doorway_SE.png').catch(() => null);
        const windowTex = await PIXI.Assets.load('/assets/Isometric/wallWindow_SE.png').catch(() => null);
        this._benchTex = await PIXI.Assets.load('/assets/Isometric/benchCushion_SE.png').catch(() => null);
        this._plantTex = await PIXI.Assets.load('/assets/Isometric/plantSmall1_SE.png').catch(() => null);

        this._container = new PIXI.Container();
        this._container.scale.set(GAME_ZOOM);
        this._app.stage.addChild(this._container);

        this._floorContainer = new PIXI.Container();
        this._buildingContainer = new PIXI.Container();
        this._detailContainer = new PIXI.Container();
        this._labelContainer = new PIXI.Container();

        this._container.addChild(this._floorContainer);
        this._container.addChild(this._buildingContainer);
        this._container.addChild(this._detailContainer);
        this._container.addChild(this._labelContainer);

        this._drawGround();
        this._drawBuilding('HOME', 3, 3, 4, 4, COL.homeFront, COL.homeSide, COL.homeRoof, 'right');
        this._drawBuilding('CAFE', 14, 3, 4, 4, COL.cafeFront, COL.cafeSide, COL.cafeRoof, 'left');
        this._drawBuilding('COWORK', 3, 14, 4, 4, COL.coFront, COL.coSide, COL.coRoof, 'right');
        this._drawCafeIcon(14, 3, 4, 4);
        this._drawCoworkIcon(3, 14, 4, 4);
        this._drawPark(14, 14, 4, 4);
        this._drawStreetLamps();
        this._drawFlowerPatches();
        this._drawMailbox();
        this._initParticles();
        this._setupHomeClick(3, 3, 4, 4);
        this._centerCamera();

        // Entity container — viewport offset aligns cartToIso coords with the grid
        this._entityContainer = new PIXI.Container();
        this._entityContainer.sortableChildren = true;
        this._entityContainer.x = (window.innerWidth / GAME_ZOOM) / 2;
        this._entityContainer.y = (window.innerHeight / GAME_ZOOM) / 2 - (GRID_SIZE * TILE_HEIGHT / 2);
        this._container.addChild(this._entityContainer);

        // Player — spawn near HOME door (HOME is at grid 3,3 size 4x4, door on right face at ~grid 7,5)
        this._player = new TownPlayer(this._entityContainer);
        this._player.setPosition(8, 5);
        this._player.enable();

        // Ghost — follows player
        this._ghost = new TownGhost(this._entityContainer);
        this._ghost.setTarget(this._player.container.x, this._player.container.y);

        // Dialogue — ambient ghost chatter in town
        this._dialogue = new TownDialogue(this._entityContainer);
        this._dialogue.startAmbient(
            () => this._player.getPosition(),
            () => ({ x: this._ghost._container.x, y: this._ghost._container.y })
        );
        setTimeout(() => {
            if (this._dialogue) this._dialogue.say("Fresh air! Let's explore the neighborhood.", 4000);
        }, 2000);

        // 'E' key to enter HOME when nearby
        this._onTownKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key.toLowerCase() === 'e' && this._isNearHome()) {
                if (this.onEnterHome) this.onEnterHome();
            }
        };
        document.addEventListener('keydown', this._onTownKeyDown);
    }

    exit() {
        if (this._dialogue) {
            this._dialogue.stopAmbient();
            this._dialogue.destroy();
            this._dialogue = null;
        }

        if (this._onTownKeyDown) {
            document.removeEventListener('keydown', this._onTownKeyDown);
            this._onTownKeyDown = null;
        }

        if (this._player) {
            this._player.disable();
            this._player.destroy();
            this._player = null;
        }
        if (this._ghost) {
            this._ghost.destroy();
            this._ghost = null;
        }
        this._entityContainer = null;

        if (this._container) {
            this._app.stage.removeChild(this._container);
            this._container.destroy({ children: true });
            this._container = null;
        }
        this._particles = [];
        this._trees = [];
        this._lampGlows = [];
        this._elapsed = 0;
    }

    update(delta) {
        this._elapsed += delta;
        this._updateParticles(delta);
        this._updateLampGlow();

        if (this._player) {
            this._player.update(delta);

            // Ghost follows player
            this._ghost.setTarget(this._player.container.x, this._player.container.y);
            this._ghost.update(delta);

            // Z-sort player and ghost by y position
            this._player.container.zIndex = this._player.container.y;
            this._ghost._container.zIndex = this._ghost._container.y;

            // Camera follow — lerp container so player stays centered
            const playerWorldX = this._entityContainer.x + this._player.container.x;
            const playerWorldY = this._entityContainer.y + this._player.container.y;
            const targetX = this._app.screen.width / 2 - playerWorldX * GAME_ZOOM;
            const targetY = this._app.screen.height / 2 - playerWorldY * GAME_ZOOM;
            const camLerp = 0.07 * delta;
            this._container.x += (targetX - this._container.x) * camLerp;
            this._container.y += (targetY - this._container.y) * camLerp;
        }

        if (this._dialogue) this._dialogue.update(delta);
    }

    // ─────────────────────────────────────────────
    //  Coordinate helpers
    // ─────────────────────────────────────────────

    _gridToScreen(gx, gy) {
        const iso = cartToIso(gx, gy);
        // Center the 20x20 grid in viewport (at zoom 1, container handles zoom)
        return {
            x: iso.x + (window.innerWidth / GAME_ZOOM) / 2,
            y: iso.y + (window.innerHeight / GAME_ZOOM) / 2 - (GRID_SIZE * TILE_HEIGHT / 2),
        };
    }

    _centerCamera() {
        // Container is already scaled; offset so center tile is at screen center
        // The gridToScreen already accounts for centering, so container stays at 0,0
        this._container.x = 0;
        this._container.y = 0;
    }

    // ─────────────────────────────────────────────
    //  Ground
    // ─────────────────────────────────────────────

    _drawGround() {
        for (let gx = 0; gx < GRID_SIZE; gx++) {
            for (let gy = 0; gy < GRID_SIZE; gy++) {
                const tile = new PIXI.Graphics();
                const { x, y } = this._gridToScreen(gx, gy);

                let color;
                if (isPath(gx, gy)) {
                    color = COL.path;
                } else {
                    color = (gx + gy) % 2 === 0 ? COL.grassA : COL.grassB;
                }

                tile.beginFill(color, 1);
                tile.moveTo(x, y);
                tile.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
                tile.lineTo(x, y + TILE_HEIGHT);
                tile.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
                tile.closePath();
                tile.endFill();

                // Subtle tile border
                tile.lineStyle(0.5, isPath(gx, gy) ? 0x8A7A5E : 0x5A8A48, 0.25);
                tile.moveTo(x, y);
                tile.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
                tile.lineTo(x, y + TILE_HEIGHT);
                tile.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
                tile.closePath();

                // Stepping stones — lighter accent on every 4th path tile
                if (isPath(gx, gy) && (gx + gy) % 4 === 0) {
                    tile.lineStyle(0);
                    tile.beginFill(0xAA9B7E, 0.35);
                    const hw = TILE_WIDTH * 0.22;
                    const hh = TILE_HEIGHT * 0.22;
                    tile.moveTo(x, y + TILE_HEIGHT / 2 - hh);
                    tile.lineTo(x + hw, y + TILE_HEIGHT / 2);
                    tile.lineTo(x, y + TILE_HEIGHT / 2 + hh);
                    tile.lineTo(x - hw, y + TILE_HEIGHT / 2);
                    tile.closePath();
                    tile.endFill();
                }

                this._floorContainer.addChild(tile);
            }
        }
    }

    // ─────────────────────────────────────────────
    //  Buildings (isometric boxes with detail)
    // ─────────────────────────────────────────────

    // Draw a window parallelogram on an isometric wall face
    _drawFaceWindow(g, nearPt, farPt, t, heightFrac) {
        const cx = nearPt.x + (farPt.x - nearPt.x) * t;
        const cyBase = nearPt.y + (farPt.y - nearPt.y) * t;
        const cy = cyBase - WALL_H * heightFrac;
        const dx = farPt.x - nearPt.x;
        const slope = dx !== 0 ? (farPt.y - nearPt.y) / dx : 0;
        const hw = 5, hh = 7;

        // Dark window pane
        g.beginFill(0x1a2030, 0.7);
        g.moveTo(cx - hw, cy + hh - slope * hw);
        g.lineTo(cx + hw, cy + hh + slope * hw);
        g.lineTo(cx + hw, cy - hh + slope * hw);
        g.lineTo(cx - hw, cy - hh - slope * hw);
        g.closePath();
        g.endFill();

        // Warm interior glow (inset)
        g.beginFill(0xFFE4B5, 0.15);
        const iw = hw - 1, ih = hh - 1;
        g.moveTo(cx - iw, cy + ih - slope * iw);
        g.lineTo(cx + iw, cy + ih + slope * iw);
        g.lineTo(cx + iw, cy - ih + slope * iw);
        g.lineTo(cx - iw, cy - ih - slope * iw);
        g.closePath();
        g.endFill();
    }

    _drawBuilding(label, startX, startY, w, h, frontCol, sideCol, roofCol, doorSide) {
        const g = new PIXI.Graphics();

        // Corner positions of the building footprint
        const topLeft     = this._gridToScreen(startX, startY);
        const topRight    = this._gridToScreen(startX + w, startY);
        const bottomLeft  = this._gridToScreen(startX, startY + h);
        const bottomRight = this._gridToScreen(startX + w, startY + h);

        // ---- Roof (top face with rounded corners via bezier) ----
        const roofPts = [
            { x: topLeft.x, y: topLeft.y - WALL_H },
            { x: topRight.x, y: topRight.y - WALL_H },
            { x: bottomRight.x, y: bottomRight.y - WALL_H },
            { x: bottomLeft.x, y: bottomLeft.y - WALL_H },
        ];

        g.beginFill(roofCol);
        const mid0 = {
            x: (roofPts[0].x + roofPts[1].x) / 2,
            y: (roofPts[0].y + roofPts[1].y) / 2,
        };
        g.moveTo(mid0.x, mid0.y);
        for (let i = 0; i < 4; i++) {
            const corner = roofPts[(i + 1) % 4];
            const next = roofPts[(i + 2) % 4];
            const mid = { x: (corner.x + next.x) / 2, y: (corner.y + next.y) / 2 };
            g.quadraticCurveTo(corner.x, corner.y, mid.x, mid.y);
        }
        g.endFill();

        // Roof dome highlight — subtle lighter center
        const roofCX = (topLeft.x + bottomRight.x) / 2;
        const roofCY = (topLeft.y + bottomRight.y) / 2 - WALL_H;
        g.beginFill(0xffffff, 0.05);
        g.drawEllipse(roofCX, roofCY, Math.abs(topRight.x - bottomLeft.x) * 0.25, 6);
        g.endFill();

        // ---- Left face (side visible from bottom-left) ----
        g.beginFill(sideCol);
        g.moveTo(bottomLeft.x, bottomLeft.y - WALL_H);
        g.lineTo(bottomLeft.x, bottomLeft.y);
        g.lineTo(bottomRight.x, bottomRight.y);
        g.lineTo(bottomRight.x, bottomRight.y - WALL_H);
        g.closePath();
        g.endFill();

        // ---- Right face (side visible from bottom-right) ----
        g.beginFill(frontCol);
        g.moveTo(bottomRight.x, bottomRight.y - WALL_H);
        g.lineTo(bottomRight.x, bottomRight.y);
        g.lineTo(topRight.x, topRight.y);
        g.lineTo(topRight.x, topRight.y - WALL_H);
        g.closePath();
        g.endFill();

        // ---- Edge highlights ----
        g.lineStyle(1, 0xffffff, 0.15);
        g.moveTo(bottomRight.x, bottomRight.y - WALL_H);
        g.lineTo(bottomRight.x, bottomRight.y);
        // Roof outline with rounded corners
        g.moveTo(mid0.x, mid0.y);
        for (let i = 0; i < 4; i++) {
            const corner = roofPts[(i + 1) % 4];
            const next = roofPts[(i + 2) % 4];
            const mid = { x: (corner.x + next.x) / 2, y: (corner.y + next.y) / 2 };
            g.quadraticCurveTo(corner.x, corner.y, mid.x, mid.y);
        }
        g.lineStyle(0);

        // ---- Windows on both visible faces ----
        // Right face: bottomRight → topRight
        const rightDoor = doorSide === 'right';
        this._drawFaceWindow(g, bottomRight, topRight, 0.25, 0.55);
        this._drawFaceWindow(g, bottomRight, topRight, 0.75, 0.55);
        // Left face: bottomLeft → bottomRight
        const leftDoor = doorSide === 'left';
        this._drawFaceWindow(g, bottomLeft, bottomRight, 0.25, 0.55);
        this._drawFaceWindow(g, bottomLeft, bottomRight, 0.75, 0.55);

        // ---- Door ----
        const doorW = TILE_WIDTH * 0.3;
        const doorH = WALL_H * 0.45;

        if (doorSide === 'right') {
            // Door on the right-facing wall (bottom-right face), centered
            const midBR = {
                x: (bottomRight.x + topRight.x) / 2,
                y: (bottomRight.y + topRight.y) / 2,
            };
            g.lineStyle(0);
            g.beginFill(COL.homeDoor);
            // Isometric door rectangle on the right face
            const dHalfW = doorW / 2;
            const dSlant = (TILE_HEIGHT / TILE_WIDTH) * dHalfW;
            g.moveTo(midBR.x - dHalfW, midBR.y + dSlant);
            g.lineTo(midBR.x + dHalfW, midBR.y - dSlant);
            g.lineTo(midBR.x + dHalfW, midBR.y - dSlant - doorH);
            g.lineTo(midBR.x - dHalfW, midBR.y + dSlant - doorH);
            g.closePath();
            g.endFill();
            // Door handle
            g.beginFill(COL.lampGlow, 0.6);
            g.drawCircle(midBR.x + dHalfW * 0.4, midBR.y - dSlant * 0.4 - doorH * 0.4, 1.5);
            g.endFill();
        } else {
            // Door on the left-facing wall (bottom-left face), centered
            const midBL = {
                x: (bottomLeft.x + bottomRight.x) / 2,
                y: (bottomLeft.y + bottomRight.y) / 2,
            };
            g.lineStyle(0);
            g.beginFill(COL.homeDoor);
            const dHalfW = doorW / 2;
            const dSlant = (TILE_HEIGHT / TILE_WIDTH) * dHalfW;
            g.moveTo(midBL.x - dHalfW, midBL.y - dSlant);
            g.lineTo(midBL.x + dHalfW, midBL.y + dSlant);
            g.lineTo(midBL.x + dHalfW, midBL.y + dSlant - doorH);
            g.lineTo(midBL.x - dHalfW, midBL.y - dSlant - doorH);
            g.closePath();
            g.endFill();
            // Door handle
            g.beginFill(COL.lampGlow, 0.6);
            g.drawCircle(midBL.x + dHalfW * 0.4, midBL.y + dSlant * 0.4 - doorH * 0.4, 1.5);
            g.endFill();
        }

        // ---- Building-specific details ----
        if (label === 'HOME') {
            this._drawChimney(g, topLeft, topRight, bottomRight, bottomLeft);
        } else if (label === 'CAFE') {
            this._drawAwning(g, bottomLeft, bottomRight);
        } else if (label === 'COWORK') {
            this._drawAntenna(g, topLeft, topRight);
        }

        this._buildingContainer.addChild(g);

        // ---- Label ----
        const labelPos = this._gridToScreen(startX + w / 2, startY + h / 2);
        const text = new PIXI.Text(label, {
            fontFamily: 'monospace',
            fontSize: 12,
            fill: COL.labelFill,
        });
        text.alpha = 0.7;
        text.anchor.set(0.5, 0.5);
        text.x = labelPos.x;
        text.y = labelPos.y - WALL_H - 14;
        this._labelContainer.addChild(text);
    }

    // ─────────────────────────────────────────────
    //  Building-specific details
    // ─────────────────────────────────────────────

    _drawChimney(g, topLeft, topRight, bottomRight, bottomLeft) {
        // Small chimney on the roof near the back-right corner
        const t = 0.75; // position along topLeft→topRight edge
        const cx = topLeft.x + (topRight.x - topLeft.x) * t;
        const cy = topLeft.y + (topRight.y - topLeft.y) * t - WALL_H;
        const chimW = 6, chimH = 14;

        // Chimney front face (warm brown)
        g.beginFill(0x8B6B3A);
        g.drawRect(cx - chimW / 2, cy - chimH, chimW, chimH);
        g.endFill();

        // Chimney side face (darker)
        g.beginFill(0x7A5A2A);
        g.moveTo(cx + chimW / 2, cy - chimH);
        g.lineTo(cx + chimW / 2 + 3, cy - chimH + 1.5);
        g.lineTo(cx + chimW / 2 + 3, cy + 1.5);
        g.lineTo(cx + chimW / 2, cy);
        g.closePath();
        g.endFill();

        // Chimney top cap
        g.beginFill(0x5A4A2A);
        g.drawRect(cx - chimW / 2 - 1, cy - chimH - 2, chimW + 4, 2);
        g.endFill();
    }

    _drawAwning(g, bottomLeft, bottomRight) {
        // Terracotta awning over the left-face door
        const midX = (bottomLeft.x + bottomRight.x) / 2;
        const midY = (bottomLeft.y + bottomRight.y) / 2;
        const awningTop = midY - WALL_H * 0.45;
        const awningW = TILE_WIDTH * 0.4;
        const slope = (bottomRight.y - bottomLeft.y) / (bottomRight.x - bottomLeft.x);

        // Awning top (flat part attached to wall)
        g.beginFill(0xC85A4A, 0.9);
        g.moveTo(midX - awningW / 2, awningTop - slope * (awningW / 2));
        g.lineTo(midX + awningW / 2, awningTop + slope * (awningW / 2));
        g.lineTo(midX + awningW / 2, awningTop + slope * (awningW / 2) + 12);
        g.lineTo(midX - awningW / 2, awningTop - slope * (awningW / 2) + 12);
        g.closePath();
        g.endFill();

        // Awning underside (darker)
        g.beginFill(0xA04A3A, 0.7);
        g.moveTo(midX - awningW / 2, awningTop - slope * (awningW / 2) + 12);
        g.lineTo(midX + awningW / 2, awningTop + slope * (awningW / 2) + 12);
        g.lineTo(midX + awningW / 2 - 4, awningTop + slope * (awningW / 2) + 16);
        g.lineTo(midX - awningW / 2 + 4, awningTop - slope * (awningW / 2) + 16);
        g.closePath();
        g.endFill();

        // Awning stripes
        g.lineStyle(1, 0xF5F0E8, 0.2);
        for (let i = 0; i < 3; i++) {
            const sx = midX - awningW / 4 + (awningW / 4) * i;
            const sy = awningTop + slope * (sx - midX);
            g.moveTo(sx, sy);
            g.lineTo(sx, sy + 11);
        }
        g.lineStyle(0);
    }

    _drawAntenna(g, topLeft, topRight) {
        // Small antenna on the roof near the back-left corner
        const t = 0.3;
        const cx = topLeft.x + (topRight.x - topLeft.x) * t;
        const cy = topLeft.y + (topRight.y - topLeft.y) * t - WALL_H;

        // Antenna pole
        g.beginFill(0x6A8A9C);
        g.drawRect(cx - 1, cy - 18, 2, 18);
        g.endFill();

        // Satellite dish — small arc
        g.lineStyle(1.5, 0x8AAAB8, 0.8);
        g.arc(cx, cy - 14, 5, -Math.PI * 0.8, -Math.PI * 0.2, false);
        g.lineStyle(0);

        // Dish fill
        g.beginFill(0x8AAAB8, 0.4);
        g.moveTo(cx - 4, cy - 16);
        g.quadraticCurveTo(cx, cy - 12, cx + 4, cy - 16);
        g.lineTo(cx, cy - 18);
        g.closePath();
        g.endFill();

        // Blinking light on top
        g.beginFill(0xFF5050, 0.5);
        g.drawCircle(cx, cy - 18, 1.5);
        g.endFill();
    }

    // ─────────────────────────────────────────────
    //  Building decorations
    // ─────────────────────────────────────────────

    _drawCafeIcon(startX, startY, w, h) {
        // Small coffee cup on the right face of the CAFE building
        const topRight    = this._gridToScreen(startX + w, startY);
        const bottomRight = this._gridToScreen(startX + w, startY + h);
        const midX = (topRight.x + bottomRight.x) / 2;
        const midY = (topRight.y + bottomRight.y) / 2 - WALL_H * 0.6;

        const icon = new PIXI.Graphics();
        // Cup body — warm cream
        icon.beginFill(0xF5F0E8, 0.7);
        icon.drawRect(midX - 5, midY, 10, 10);
        icon.endFill();
        // Handle
        icon.lineStyle(1.5, 0xF5F0E8, 0.7);
        icon.arc(midX + 5, midY + 5, 4, -Math.PI / 2, Math.PI / 2, false);
        // Coffee fill
        icon.lineStyle(0);
        icon.beginFill(0x6B4226, 0.5);
        icon.drawRect(midX - 4, midY + 2, 8, 6);
        icon.endFill();
        // Steam wisps — warm moccasin
        icon.lineStyle(1, COL.lampGlow, 0.35);
        icon.moveTo(midX - 2, midY);
        icon.quadraticCurveTo(midX - 3, midY - 6, midX - 1, midY - 8);
        icon.moveTo(midX + 2, midY);
        icon.quadraticCurveTo(midX + 1, midY - 5, midX + 3, midY - 9);

        this._buildingContainer.addChild(icon);
    }

    _drawCoworkIcon(startX, startY, w, h) {
        // Small monitor icon on the left face of the COWORK building
        const bottomLeft  = this._gridToScreen(startX, startY + h);
        const bottomRight = this._gridToScreen(startX + w, startY + h);
        const midX = (bottomLeft.x + bottomRight.x) / 2;
        const midY = (bottomLeft.y + bottomRight.y) / 2 - WALL_H * 0.6;

        const icon = new PIXI.Graphics();
        // Monitor frame — warm white
        icon.lineStyle(1.5, 0xF5F0E8, 0.6);
        icon.drawRect(midX - 8, midY - 5, 16, 11);
        // Screen fill — dark with warm tint
        icon.lineStyle(0);
        icon.beginFill(0x1a2030, 0.7);
        icon.drawRect(midX - 6, midY - 3, 12, 7);
        icon.endFill();
        // Stand
        icon.lineStyle(1.5, 0xF5F0E8, 0.6);
        icon.moveTo(midX, midY + 6);
        icon.lineTo(midX, midY + 9);
        icon.moveTo(midX - 4, midY + 9);
        icon.lineTo(midX + 4, midY + 9);
        // Screen glow dot — warm moccasin
        icon.lineStyle(0);
        icon.beginFill(COL.lampGlow, 0.5);
        icon.drawCircle(midX, midY, 1);
        icon.endFill();

        this._buildingContainer.addChild(icon);
    }

    // ─────────────────────────────────────────────
    //  Ambient details — flowers, mailbox
    // ─────────────────────────────────────────────

    _drawFlowerPatch(gx, gy) {
        const { x, y } = this._gridToScreen(gx, gy);
        const colors = [0xFF9A8C, 0xFFD66B, 0x9BDFFF, 0xFF9A8C];
        const offsets = [[-4, -2], [3, 1], [-1, 3], [5, -1]];
        const g = new PIXI.Graphics();
        for (let i = 0; i < 4; i++) {
            g.beginFill(colors[i], 0.6);
            g.drawCircle(x + offsets[i][0], y + offsets[i][1], 1.5);
            g.endFill();
        }
        // Small leaf beneath each flower
        g.beginFill(0x5BA05C, 0.3);
        for (let i = 0; i < 3; i++) {
            g.drawEllipse(x + offsets[i][0] + 1, y + offsets[i][1] + 1.5, 2, 1);
        }
        g.endFill();
        this._detailContainer.addChild(g);

        // Optional plant sprite next to flowers
        if (this._plantTex) {
            const ps = new PIXI.Sprite(this._plantTex);
            ps.anchor.set(0.5, 0.85);
            ps.scale.set(0.25);
            ps.x = x + 8;
            ps.y = y;
            ps.alpha = 0.7;
            this._detailContainer.addChild(ps);
        }
    }

    _drawFlowerPatches() {
        // Near HOME
        this._drawFlowerPatch(2.5, 3);
        this._drawFlowerPatch(7.5, 7);
        // Near CAFE
        this._drawFlowerPatch(18.5, 3.5);
        this._drawFlowerPatch(14, 7.5);
        // Near COWORK
        this._drawFlowerPatch(2.5, 14.5);
        // Near PARK
        this._drawFlowerPatch(18.5, 18);
    }

    _drawMailbox() {
        // Mailbox near HOME building's right face (door area)
        const { x, y } = this._gridToScreen(7.5, 7.5);
        const g = new PIXI.Graphics();
        // Post
        g.beginFill(0x6B5B3E);
        g.drawRect(x - 1.5, y - 16, 3, 16);
        g.endFill();
        // Box body
        g.beginFill(0xC85A4A);
        g.drawRoundedRect(x - 5, y - 22, 10, 7, 1);
        g.endFill();
        // Flag (raised)
        g.beginFill(0xC85A4A);
        g.drawRect(x + 5, y - 22, 2, 6);
        g.endFill();
        // Flag tip
        g.beginFill(0xF5F0E8, 0.6);
        g.drawRect(x + 5, y - 22, 2, 2);
        g.endFill();
        this._detailContainer.addChild(g);
    }

    // ─────────────────────────────────────────────
    //  Park (trees + bench)
    // ─────────────────────────────────────────────

    _drawPark(startX, startY, w, h) {
        // Positions within the park grid for trees (offset so they look scattered)
        const treePositions = [
            [startX + 0.8, startY + 0.8],
            [startX + 3.2, startY + 0.5],
            [startX + 1.0, startY + 3.0],
            [startX + 3.0, startY + 2.8],
            [startX + 2.0, startY + 1.5],
        ];

        for (const [tx, ty] of treePositions) {
            const { x, y } = this._gridToScreen(tx, ty);
            const tree = new PIXI.Graphics();

            // Trunk — warm brown
            tree.beginFill(COL.trunk);
            tree.drawRect(x - 3, y - 14, 6, 14);
            tree.endFill();

            // Puffy Animal Crossing canopy — 3 overlapping circles
            tree.beginFill(COL.canopy, 0.9);
            tree.drawCircle(x - 6, y - 22, 10);   // left puff
            tree.drawCircle(x + 6, y - 22, 10);   // right puff
            tree.drawCircle(x, y - 28, 11);        // top puff
            tree.endFill();

            // Highlight puffs — lighter green on top
            tree.beginFill(COL.canopyHi, 0.4);
            tree.drawCircle(x - 4, y - 26, 6);
            tree.drawCircle(x + 3, y - 30, 5);
            tree.endFill();

            this._detailContainer.addChild(tree);
            this._trees.push(tree);
        }

        // Bench — sprite or improved procedural
        const benchPos = this._gridToScreen(startX + 2, startY + 3.5);

        if (this._benchTex) {
            const benchSprite = new PIXI.Sprite(this._benchTex);
            benchSprite.anchor.set(0.5, 0.85);
            benchSprite.scale.set(0.5);
            benchSprite.x = benchPos.x;
            benchSprite.y = benchPos.y;
            this._detailContainer.addChild(benchSprite);
        } else {
            const bench = new PIXI.Graphics();
            const bw = 24, bh = 4;
            const bSlant = (TILE_HEIGHT / TILE_WIDTH) * (bw / 2);

            // Seat
            bench.beginFill(COL.bench);
            bench.moveTo(benchPos.x - bw / 2, benchPos.y + bSlant);
            bench.lineTo(benchPos.x + bw / 2, benchPos.y - bSlant);
            bench.lineTo(benchPos.x + bw / 2, benchPos.y - bSlant - bh);
            bench.lineTo(benchPos.x - bw / 2, benchPos.y + bSlant - bh);
            bench.closePath();
            bench.endFill();

            // Wood plank lines on seat
            bench.lineStyle(0.5, 0x8B7348, 0.4);
            for (let p = 0.25; p <= 0.75; p += 0.25) {
                const px1 = benchPos.x - bw / 2 + bw * p;
                const py1 = benchPos.y + bSlant - bSlant * 2 * p;
                bench.moveTo(px1, py1 - bh);
                bench.lineTo(px1, py1);
            }
            bench.lineStyle(0);

            // Backrest
            bench.beginFill(COL.bench, 0.8);
            bench.moveTo(benchPos.x - bw / 2, benchPos.y + bSlant - bh);
            bench.lineTo(benchPos.x + bw / 2, benchPos.y - bSlant - bh);
            bench.lineTo(benchPos.x + bw / 2, benchPos.y - bSlant - bh - 6);
            bench.lineTo(benchPos.x - bw / 2, benchPos.y + bSlant - bh - 6);
            bench.closePath();
            bench.endFill();

            // Backrest plank lines
            bench.lineStyle(0.5, 0x8B7348, 0.3);
            bench.moveTo(benchPos.x - bw / 2, benchPos.y + bSlant - bh - 3);
            bench.lineTo(benchPos.x + bw / 2, benchPos.y - bSlant - bh - 3);
            bench.lineStyle(0);

            // Armrests
            bench.beginFill(COL.trunk, 0.9);
            // Left armrest
            bench.drawRect(benchPos.x - bw / 2 - 1, benchPos.y + bSlant - bh - 8, 3, 8);
            // Right armrest
            bench.drawRect(benchPos.x + bw / 2 - 2, benchPos.y - bSlant - bh - 8, 3, 8);
            bench.endFill();

            // Legs — warm brown
            bench.beginFill(COL.trunk, 0.8);
            bench.drawRect(benchPos.x - bw / 2 + 2, benchPos.y + bSlant, 2, 5);
            bench.drawRect(benchPos.x + bw / 2 - 4, benchPos.y - bSlant, 2, 5);
            bench.endFill();

            this._detailContainer.addChild(bench);
        }

        // Park label
        const labelPos = this._gridToScreen(startX + w / 2, startY + h / 2);
        const text = new PIXI.Text('PARK', {
            fontFamily: 'monospace',
            fontSize: 12,
            fill: COL.labelFill,
        });
        text.alpha = 0.7;
        text.anchor.set(0.5, 0.5);
        text.x = labelPos.x;
        text.y = labelPos.y - 40;
        this._labelContainer.addChild(text);
    }

    // ─────────────────────────────────────────────
    //  Street lamps
    // ─────────────────────────────────────────────

    _drawStreetLamps() {
        // Place lamps along the path cross-arms
        const lampPositions = [
            [8, 9],   // left of center on horizontal path
            [11, 9],  // right of center on horizontal path
            [9, 7],   // above center on vertical path
            [9, 12],  // below center on vertical path
        ];

        this._lampGlows = [];

        for (const [gx, gy] of lampPositions) {
            const { x, y } = this._gridToScreen(gx, gy);
            const lamp = new PIXI.Graphics();

            // Wooden pole
            lamp.beginFill(COL.lampPole, 0.85);
            lamp.drawRect(x - 1.5, y - 30, 3, 30);
            lamp.endFill();

            // Lamp head — warm glow
            lamp.beginFill(COL.lampGlow, 0.5);
            lamp.drawCircle(x, y - 32, 3.5);
            lamp.endFill();

            // Glow halo
            const glow = new PIXI.Graphics();
            glow.beginFill(COL.lampGlow, 0.06);
            glow.drawCircle(x, y - 30, 16);
            glow.endFill();

            this._detailContainer.addChild(lamp);
            this._detailContainer.addChild(glow);
            this._lampGlows.push({ gfx: glow, baseAlpha: 0.06, x, y: y - 30 });
        }
    }

    // ─────────────────────────────────────────────
    //  Ambient particles (warm moccasin dust motes)
    // ─────────────────────────────────────────────

    _initParticles() {
        const vw = window.innerWidth / GAME_ZOOM;
        const vh = window.innerHeight / GAME_ZOOM;

        for (let i = 0; i < 6; i++) {
            const g = new PIXI.Graphics();
            const alpha = 0.03 + Math.random() * 0.04;
            g.beginFill(COL.lampGlow, alpha); // warm moccasin
            g.drawCircle(0, 0, 1.5);
            g.endFill();
            g.x = Math.random() * vw;
            g.y = Math.random() * vh;

            this._detailContainer.addChild(g);

            this._particles.push({
                gfx: g,
                vx: 0.05 + Math.random() * 0.1,
                baseY: g.y,
                sineAmp: 5,
                sinePeriod: 4 + Math.random() * 2,
                phase: Math.random() * Math.PI * 2,
            });
        }
    }

    _updateParticles(delta) {
        const vw = window.innerWidth / GAME_ZOOM;
        const vh = window.innerHeight / GAME_ZOOM;

        for (const p of this._particles) {
            p.phase += (delta / 60) * (Math.PI * 2 / p.sinePeriod);
            p.gfx.x += p.vx * delta;
            p.gfx.y = p.baseY + Math.sin(p.phase) * p.sineAmp;

            if (p.gfx.x > vw + 10) {
                p.gfx.x = -10;
                p.baseY = Math.random() * vh;
            }
        }
    }

    _updateLampGlow() {
        // Subtle flicker on lamp glows
        const t = this._elapsed * 0.02;
        for (let i = 0; i < this._lampGlows.length; i++) {
            const lamp = this._lampGlows[i];
            const flicker = 0.8 + Math.sin(t + i * 1.7) * 0.2;
            lamp.gfx.alpha = flicker;
        }
    }

    // ─────────────────────────────────────────────
    //  Proximity check — HOME door
    // ─────────────────────────────────────────────

    _isNearHome() {
        if (!this._player) return false;
        // HOME door center in grid coords: right face of (3,3)+(4,4) → midpoint (7, 5)
        const doorIso = cartToIso(7, 5);
        const dx = this._player.container.x - doorIso.x;
        const dy = this._player.container.y - doorIso.y;
        return (dx * dx + dy * dy) < 80 * 80;
    }

    // ─────────────────────────────────────────────
    //  Interactivity — HOME click area
    // ─────────────────────────────────────────────

    _setupHomeClick(startX, startY, w, h) {
        // Invisible hit area over the HOME building
        const topLeft     = this._gridToScreen(startX, startY);
        const topRight    = this._gridToScreen(startX + w, startY);
        const bottomLeft  = this._gridToScreen(startX, startY + h);
        const bottomRight = this._gridToScreen(startX + w, startY + h);

        const hitArea = new PIXI.Graphics();
        hitArea.beginFill(0xff0000, 0.001); // nearly invisible
        hitArea.moveTo(topLeft.x, topLeft.y - WALL_H);
        hitArea.lineTo(topRight.x, topRight.y - WALL_H);
        hitArea.lineTo(topRight.x, topRight.y);
        hitArea.lineTo(bottomRight.x, bottomRight.y);
        hitArea.lineTo(bottomLeft.x, bottomLeft.y);
        hitArea.lineTo(bottomLeft.x, bottomLeft.y - WALL_H);
        hitArea.closePath();
        hitArea.endFill();

        hitArea.eventMode = 'static';
        hitArea.cursor = 'pointer';

        hitArea.on('pointerdown', () => {
            if (this._isNearHome() && this.onEnterHome) this.onEnterHome();
        });

        this._buildingContainer.addChild(hitArea);
    }
}
