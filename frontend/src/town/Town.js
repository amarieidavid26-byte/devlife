import * as PIXI from 'pixi.js';
import { cartToIso, TILE_WIDTH, TILE_HEIGHT } from '../utils/isometric.js';
import { TownPlayer } from './TownPlayer.js';
import { TownGhost } from './TownGhost.js';
import { TownDialogue } from './TownDialogue.js';

const GRID_SIZE = 20;
const GAME_ZOOM = 1.5;
const WALL_H = 90; // building wall height in px

// Color palette
const COL = {
    grassA:    0x1a3a1a,
    grassB:    0x1e3e1e,
    path:      0x2a2a30,
    // HOME
    homeFront: 0x0f3460,
    homeSide:  0x0a2a50,
    homeRoof:  0x1a4a80,
    // CAFE
    cafeFront: 0x3a2a1a,
    cafeSide:  0x2e2010,
    cafeRoof:  0x4a3a2a,
    // COWORK
    coFront:   0x1a1a3a,
    coSide:    0x12122e,
    coRoof:    0x2a2a4a,
    // Park
    trunk:     0x4a3020,
    canopy:    0x2a5a2a,
    bench:     0x3a2a18,
    // Lamp
    lampPole:  0x3a3a40,
    lampGlow:  0xffa040,
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
    }

    // ─────────────────────────────────────────────
    //  Scene interface
    // ─────────────────────────────────────────────

    enter() {
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
                tile.lineStyle(1, 0x1a2a1a, 0.3);
                tile.moveTo(x, y);
                tile.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
                tile.lineTo(x, y + TILE_HEIGHT);
                tile.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
                tile.closePath();

                this._floorContainer.addChild(tile);
            }
        }
    }

    // ─────────────────────────────────────────────
    //  Buildings (isometric boxes)
    // ─────────────────────────────────────────────

    _drawBuilding(label, startX, startY, w, h, frontCol, sideCol, roofCol, doorSide) {
        const g = new PIXI.Graphics();

        // Corner positions of the building footprint
        const topLeft     = this._gridToScreen(startX, startY);
        const topRight    = this._gridToScreen(startX + w, startY);
        const bottomLeft  = this._gridToScreen(startX, startY + h);
        const bottomRight = this._gridToScreen(startX + w, startY + h);

        // ---- Roof (top face) ----
        g.beginFill(roofCol);
        g.moveTo(topLeft.x, topLeft.y - WALL_H);
        g.lineTo(topRight.x, topRight.y - WALL_H);
        g.lineTo(bottomRight.x, bottomRight.y - WALL_H);
        g.lineTo(bottomLeft.x, bottomLeft.y - WALL_H);
        g.closePath();
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
        g.lineStyle(1, 0xffffff, 0.08);
        g.moveTo(bottomRight.x, bottomRight.y - WALL_H);
        g.lineTo(bottomRight.x, bottomRight.y);
        g.moveTo(topLeft.x, topLeft.y - WALL_H);
        g.lineTo(topRight.x, topRight.y - WALL_H);
        g.lineTo(bottomRight.x, bottomRight.y - WALL_H);
        g.lineTo(bottomLeft.x, bottomLeft.y - WALL_H);
        g.closePath();

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
            g.beginFill(0x080808, 0.8);
            // Isometric door rectangle on the right face
            const dHalfW = doorW / 2;
            const dSlant = (TILE_HEIGHT / TILE_WIDTH) * dHalfW;
            g.moveTo(midBR.x - dHalfW, midBR.y + dSlant);
            g.lineTo(midBR.x + dHalfW, midBR.y - dSlant);
            g.lineTo(midBR.x + dHalfW, midBR.y - dSlant - doorH);
            g.lineTo(midBR.x - dHalfW, midBR.y + dSlant - doorH);
            g.closePath();
            g.endFill();
        } else {
            // Door on the left-facing wall (bottom-left face), centered
            const midBL = {
                x: (bottomLeft.x + bottomRight.x) / 2,
                y: (bottomLeft.y + bottomRight.y) / 2,
            };
            g.lineStyle(0);
            g.beginFill(0x080808, 0.8);
            const dHalfW = doorW / 2;
            const dSlant = (TILE_HEIGHT / TILE_WIDTH) * dHalfW;
            g.moveTo(midBL.x - dHalfW, midBL.y - dSlant);
            g.lineTo(midBL.x + dHalfW, midBL.y + dSlant);
            g.lineTo(midBL.x + dHalfW, midBL.y + dSlant - doorH);
            g.lineTo(midBL.x - dHalfW, midBL.y - dSlant - doorH);
            g.closePath();
            g.endFill();
        }

        this._buildingContainer.addChild(g);

        // ---- Label ----
        const labelPos = this._gridToScreen(startX + w / 2, startY + h / 2);
        const text = new PIXI.Text(label, {
            fontFamily: 'monospace',
            fontSize: 12,
            fill: 0xffffff,
        });
        text.alpha = 0.6;
        text.anchor.set(0.5, 0.5);
        text.x = labelPos.x;
        text.y = labelPos.y - WALL_H - 14;
        this._labelContainer.addChild(text);
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
        // Cup body
        icon.beginFill(0xd4a574, 0.6);
        icon.drawRect(midX - 5, midY, 10, 10);
        icon.endFill();
        // Handle
        icon.lineStyle(1.5, 0xd4a574, 0.6);
        icon.arc(midX + 5, midY + 5, 4, -Math.PI / 2, Math.PI / 2, false);
        // Steam wisps
        icon.lineStyle(1, 0xffffff, 0.25);
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
        // Monitor frame
        icon.lineStyle(1.5, 0x6090c0, 0.6);
        icon.drawRect(midX - 8, midY - 5, 16, 11);
        // Screen fill
        icon.lineStyle(0);
        icon.beginFill(0x102040, 0.7);
        icon.drawRect(midX - 6, midY - 3, 12, 7);
        icon.endFill();
        // Stand
        icon.lineStyle(1.5, 0x6090c0, 0.6);
        icon.moveTo(midX, midY + 6);
        icon.lineTo(midX, midY + 9);
        icon.moveTo(midX - 4, midY + 9);
        icon.lineTo(midX + 4, midY + 9);
        // Screen glow dot
        icon.lineStyle(0);
        icon.beginFill(0x00e0ff, 0.4);
        icon.drawCircle(midX, midY, 1);
        icon.endFill();

        this._buildingContainer.addChild(icon);
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

            // Trunk
            tree.beginFill(COL.trunk);
            tree.drawRect(x - 2, y - 12, 4, 12);
            tree.endFill();

            // Canopy
            tree.beginFill(COL.canopy, 0.9);
            tree.drawCircle(x, y - 20, 12);
            tree.endFill();

            // Slight highlight on canopy
            tree.beginFill(0x3a7a3a, 0.3);
            tree.drawCircle(x - 3, y - 23, 5);
            tree.endFill();

            this._detailContainer.addChild(tree);
            this._trees.push(tree);
        }

        // Bench
        const benchPos = this._gridToScreen(startX + 2, startY + 3.5);
        const bench = new PIXI.Graphics();
        // Seat
        bench.beginFill(COL.bench);
        const bw = 24, bh = 4;
        // Isometric bench seat (slanted rectangle)
        const bSlant = (TILE_HEIGHT / TILE_WIDTH) * (bw / 2);
        bench.moveTo(benchPos.x - bw / 2, benchPos.y + bSlant);
        bench.lineTo(benchPos.x + bw / 2, benchPos.y - bSlant);
        bench.lineTo(benchPos.x + bw / 2, benchPos.y - bSlant - bh);
        bench.lineTo(benchPos.x - bw / 2, benchPos.y + bSlant - bh);
        bench.closePath();
        bench.endFill();
        // Legs
        bench.beginFill(COL.trunk, 0.7);
        bench.drawRect(benchPos.x - bw / 2 + 2, benchPos.y + bSlant, 2, 5);
        bench.drawRect(benchPos.x + bw / 2 - 4, benchPos.y - bSlant, 2, 5);
        bench.endFill();

        this._detailContainer.addChild(bench);

        // Park label
        const labelPos = this._gridToScreen(startX + w / 2, startY + h / 2);
        const text = new PIXI.Text('PARK', {
            fontFamily: 'monospace',
            fontSize: 12,
            fill: 0xffffff,
        });
        text.alpha = 0.6;
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

            // Pole
            lamp.beginFill(COL.lampPole, 0.7);
            lamp.drawRect(x - 1, y - 30, 2, 30);
            lamp.endFill();

            // Lamp head
            lamp.beginFill(COL.lampGlow, 0.3);
            lamp.drawCircle(x, y - 32, 3);
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
    //  Ambient particles (green-tinted dust motes)
    // ─────────────────────────────────────────────

    _initParticles() {
        const vw = window.innerWidth / GAME_ZOOM;
        const vh = window.innerHeight / GAME_ZOOM;

        for (let i = 0; i < 6; i++) {
            const g = new PIXI.Graphics();
            const alpha = 0.03 + Math.random() * 0.04;
            g.beginFill(0x40ff60, alpha); // green tint
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
