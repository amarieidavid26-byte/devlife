import * as PIXI from 'pixi.js';
import { cartToIso, TILE_WIDTH, TILE_HEIGHT } from '../utils/isometric.js';
import { TownPlayer } from './TownPlayer.js';

const GRID = 12;
const ZOOM = 1.5;
const WALL_H = 100;

const STATE_COLORS = {
    DEEP_FOCUS: 0x9B6AFF,
    STRESSED:   0xFF7A6A,
    FATIGUED:   0xFFB84A,
    RELAXED:    0x6AD89A,
    WIRED:      0x6AB8FF,
};

const STATE_HEX = {
    DEEP_FOCUS: '#9B6AFF',
    STRESSED:   '#FF7A6A',
    FATIGUED:   '#FFB84A',
    RELAXED:    '#6AD89A',
    WIRED:      '#6AB8FF',
};

const COL = {
    floorA:    0x9A9AA0,
    floorB:    0x8E8E94,
    wallLeft:  0x7A9AAC,
    wallRight: 0x6A8A9C,
    wallEdge:  0x8ABACC,
    baseboard: 0x5A7A8C,
    desk:      0x8B7348,
    deskTop:   0x9B8358,
    deskSide:  0x7A6338,
    monitor:   0x1A1A24,
    monFrame:  0xE8E0D4,
    divider:   0xC8C0B4,
    chair:     0x4A4A52,
    chairSeat: 0x5A5A64,
    warm:      0xFFE4B5,
    label:     0xF5F0E8,
    accent:    0x8AAAB8,
};

const NPCS = [
    { name: 'Alex', gx: 3, gy: 3,  shirt: 0xCF6A6A, hair: 0xD4A840, state: 'STRESSED',   bpm: 112 },
    { name: 'Sam',  gx: 9, gy: 3,  shirt: 0x6ACF8A, hair: 0x2A1A10, state: 'DEEP_FOCUS',  bpm: 68  },
    { name: 'Mia',  gx: 3, gy: 8,  shirt: 0xCFBF6A, hair: 0x8B5A2A, state: 'FATIGUED',    bpm: 58  },
];

const GHOST_LINES = [
    { t: 3,  msg: 'Welcome to the coworking space. Everyone here has a ghost too.' },
    { t: 10, msg: "See Alex over there? Heart rate at 112. His ghost is trying to calm him down." },
    { t: 20, msg: "Sam's been in flow state for 2 hours. That's the zone we aim for." },
    { t: 30, msg: "Mia should really go home. Her recovery is at 25%." },
    { t: 45, msg: 'This is what DevLife looks like at scale. Every developer, understood.' },
];

const INTERACT_ZONES = [
    { id: 'alex',       gx: 3, gy: 4,  type: 'npc',        npcIdx: 0 },
    { id: 'sam',        gx: 9, gy: 4,  type: 'npc',        npcIdx: 1 },
    { id: 'mia',        gx: 3, gy: 9,  type: 'npc',        npcIdx: 2 },
    { id: 'empty',      gx: 9, gy: 9,  type: 'empty' },
    { id: 'whiteboard', gx: 6, gy: 1,  type: 'whiteboard' },
];

const INTERACT_DIST = 80;

export class CoworkScene {
    constructor(pixiApp) {
        this._app = pixiApp;
        this._container = null;
        this._player = null;
        this._npcs = [];
        this._elapsed = 0;
        this._ghostLineIdx = 0;
        this._screenGlows = [];
        this._notifTimer = 0;
        this._notifSprites = [];
        this._onKeyDown = null;
        this._ePrompts = [];
        this._activePanel = null;
        this._panelBackdrop = null;
        this._nearInteractable = null;
        this.onExit = null;
        this.onGhostSay = null;
    }

    _gridToScreen(gx, gy) {
        const iso = cartToIso(gx, gy);
        return {
            x: iso.x + (window.innerWidth / ZOOM) / 2,
            y: iso.y + (window.innerHeight / ZOOM) / 2 - (GRID * TILE_HEIGHT / 2),
        };
    }

    _tileCenter(gx, gy) {
        const p = this._gridToScreen(gx, gy);
        return { x: p.x, y: p.y + TILE_HEIGHT / 2 };
    }

    async enter() {
        this._container = new PIXI.Container();
        this._container.scale.set(ZOOM);
        this._container.sortableChildren = true;
        this._app.stage.addChild(this._container);

        this._drawFloor();
        this._drawWalls();
        this._drawWhiteboard();
        this._drawFurniture();
        this._drawWaterCooler();
        this._drawDoor();
        this._drawCeilingLights();
        this._spawnNPCs();

        // player — lives in an offset sub-container so raw cartToIso aligns with _gridToScreen tiles
        this._playerOffset = new PIXI.Container();
        this._playerOffset.x = (window.innerWidth / ZOOM) / 2;
        this._playerOffset.y = (window.innerHeight / ZOOM) / 2 - (GRID * TILE_HEIGHT / 2);
        this._playerOffset.sortableChildren = true;
        this._playerOffset.zIndex = 5000;
        this._container.addChild(this._playerOffset);
        this._player = new TownPlayer(this._playerOffset);
        this._player.setPosition(6, 10);

        // ambient tint
        const tint = new PIXI.Graphics();
        tint.beginFill(0x8AAAB8, 0.02);
        tint.drawRect(-400, -300, 1200, 800);
        tint.endFill();
        tint.zIndex = 9000;
        this._container.addChild(tint);

        this._onKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (this._activePanel) { this._closePanel(); return; }
                if (this.onExit) this.onExit();
                return;
            }
            if ((e.key === 'e' || e.key === 'E') && !this._activePanel && this._nearInteractable) {
                this._openPanel(this._nearInteractable);
            }
        };
        document.addEventListener('keydown', this._onKeyDown);

        // [E] interaction prompts
        for (const zone of INTERACT_ZONES) {
            const pos = this._tileCenter(zone.gx, zone.gy);
            const yOff = zone.type === 'whiteboard' ? 72 : 56;
            const prompt = new PIXI.Text('[E]', {
                fontFamily: "'Fredoka', sans-serif",
                fontSize: 11,
                fill: '#FFFFFF',
                fontWeight: '600',
                stroke: '#000000',
                strokeThickness: 3,
            });
            prompt.anchor.set(0.5, 1);
            prompt.x = pos.x;
            prompt.y = pos.y - yOff;
            prompt.visible = false;
            prompt.zIndex = 8000;
            this._container.addChild(prompt);
            this._ePrompts.push({ sprite: prompt, zone, baseY: pos.y - yOff });
        }

        this._elapsed = 0;
        this._ghostLineIdx = 0;
        this._notifTimer = 0;
    }

    exit() {
        if (this._onKeyDown) {
            document.removeEventListener('keydown', this._onKeyDown);
            this._onKeyDown = null;
        }
        if (this._player) {
            this._player.destroy();
            this._player = null;
        }
        this._closePanel();
        this._ePrompts.forEach(ep => { if (ep.sprite.parent) ep.sprite.parent.removeChild(ep.sprite); ep.sprite.destroy(); });
        this._ePrompts = [];
        this._notifSprites.forEach(n => { if (n.parent) n.parent.removeChild(n); n.destroy(); });
        this._notifSprites = [];
        this._npcs = [];
        this._screenGlows = [];
        if (this._container) {
            this._app.stage.removeChild(this._container);
            this._container.destroy({ children: true });
            this._container = null;
        }
        this._elapsed = 0;
    }

    update(delta) {
        if (!this._container) return;
        this._elapsed += delta / 60;

        // player
        if (this._player) this._player.update(delta);

        // proximity check for [E] interactions
        this._checkProximity();

        // [E] prompt bob
        for (const ep of this._ePrompts) {
            if (ep.sprite.visible) {
                ep.sprite.y = ep.baseY + Math.sin(this._elapsed * 3) * 2;
            }
        }

        // ghost commentary
        if (this._ghostLineIdx < GHOST_LINES.length) {
            if (this._elapsed >= GHOST_LINES[this._ghostLineIdx].t) {
                if (this.onGhostSay) this.onGhostSay(GHOST_LINES[this._ghostLineIdx].msg);
                this._ghostLineIdx++;
            }
        }

        // screen glow pulse
        for (const sg of this._screenGlows) {
            sg.gfx.alpha = 0.15 + Math.sin(this._elapsed * 2 + sg.phase) * 0.05;
        }

        // NPC animations
        for (const npc of this._npcs) {
            npc.tick += delta;

            // ghost bob
            const bobY = Math.sin(npc.tick * 0.03) * 3;
            npc.ghostContainer.y = npc.ghostBaseY + bobY;
            npc.badge.y = npc.ghostContainer.y - 28;

            // typing — arm wiggle
            const typeSpeed = npc.def.state === 'STRESSED' ? 0.12 :
                              npc.def.state === 'FATIGUED' ? 0.03 : 0.06;
            const typeAmp   = npc.def.state === 'STRESSED' ? 1.5 :
                              npc.def.state === 'DEEP_FOCUS' ? 0.5 : 1.0;
            npc.armL.y = npc.armBaseY + Math.sin(npc.tick * typeSpeed) * typeAmp;
            npc.armR.y = npc.armBaseY + Math.sin(npc.tick * typeSpeed + 2) * typeAmp;

            // head turns (not during deep focus)
            if (npc.def.state !== 'DEEP_FOCUS') {
                const headCycle = (npc.tick + npc.headOffset) % (npc.headInterval * 60);
                if (headCycle < 40) {
                    npc.head.x = npc.headBaseX + Math.sin(headCycle / 40 * Math.PI) * 2;
                } else {
                    npc.head.x = npc.headBaseX;
                }
            }

            // Mia head nod (falling asleep)
            if (npc.def.state === 'FATIGUED') {
                const nodCycle = (npc.tick + 100) % 480;
                if (nodCycle < 60) {
                    npc.head.y = npc.headBaseY + Math.sin(nodCycle / 60 * Math.PI) * 3;
                } else {
                    npc.head.y = npc.headBaseY;
                }
            }

            // Alex: sweat drops — appear/disappear every 2 seconds
            if (npc.sweatDrops) {
                const sweatCycle = Math.floor(this._elapsed) % 4;
                for (const drop of npc.sweatDrops) {
                    drop.visible = sweatCycle < 2;
                    if (drop.visible) {
                        drop.y = -38 + Math.sin(this._elapsed * 2) * 2;
                    }
                }
            }

            // Sam: sparkle dots orbiting slowly
            if (npc.sparkles) {
                for (const sp of npc.sparkles) {
                    const a = sp.angle + this._elapsed * 0.5;
                    sp.gfx.x = Math.cos(a) * sp.radius;
                    sp.gfx.y = -28 + Math.sin(a) * sp.radius * 0.5;
                    sp.gfx.alpha = 0.3 + Math.sin(a * 2) * 0.2;
                }
            }

            // Mia: Zzz floating and fading
            if (npc.zzzText) {
                const zzzCycle = this._elapsed % 3; // 3-second loop
                npc.zzzText.y = npc.zzzBaseY - zzzCycle * 6;
                npc.zzzText.alpha = 1 - (zzzCycle / 3);
            }
        }

        // random notification toasts
        this._notifTimer += delta;
        if (this._notifTimer > 600 && this._npcs.length > 0) {
            this._notifTimer = 0;
            this._spawnNotif();
        }

        // fade out notifs
        for (let i = this._notifSprites.length - 1; i >= 0; i--) {
            const n = this._notifSprites[i];
            n.life += delta;
            n.alpha = Math.max(0, 1 - n.life / 120);
            n.y -= 0.3 * delta;
            if (n.life > 120) {
                if (n.parent) n.parent.removeChild(n);
                n.destroy();
                this._notifSprites.splice(i, 1);
            }
        }
    }

    // ── floor ─────────────────────────────────────────────────────────

    _drawFloor() {
        for (let gx = 0; gx < GRID; gx++) {
            for (let gy = 0; gy < GRID; gy++) {
                const { x, y } = this._gridToScreen(gx, gy);
                const tile = new PIXI.Graphics();
                tile.beginFill((gx + gy) % 2 === 0 ? COL.floorA : COL.floorB);
                tile.moveTo(x, y);
                tile.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
                tile.lineTo(x, y + TILE_HEIGHT);
                tile.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
                tile.closePath();
                tile.endFill();
                // subtle tile grid lines (office carpet tiles)
                tile.lineStyle(1, 0x7A7A80, 0.1);
                tile.moveTo(x, y);
                tile.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
                tile.lineTo(x, y + TILE_HEIGHT);
                tile.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
                tile.closePath();
                this._container.addChild(tile);
            }
        }
    }

    // ── walls ─────────────────────────────────────────────────────────

    _drawWalls() {
        const baseH = 6;

        // left wall
        for (let gy = 0; gy < GRID; gy++) {
            const { x, y } = this._gridToScreen(0, gy);
            const p = new PIXI.Graphics();
            p.beginFill(COL.wallLeft);
            p.moveTo(x, y);
            p.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            p.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - WALL_H);
            p.lineTo(x, y - WALL_H);
            p.closePath();
            p.endFill();
            p.beginFill(COL.baseboard);
            p.moveTo(x, y);
            p.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            p.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - baseH);
            p.lineTo(x, y - baseH);
            p.closePath();
            p.endFill();
            p.lineStyle(1, COL.wallEdge, 0.3);
            p.moveTo(x, y - WALL_H);
            p.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - WALL_H);
            this._container.addChild(p);
        }

        // back wall
        for (let gx = 0; gx < GRID; gx++) {
            const { x, y } = this._gridToScreen(gx, 0);
            const p = new PIXI.Graphics();
            p.beginFill(COL.wallRight);
            p.moveTo(x, y);
            p.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            p.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - WALL_H);
            p.lineTo(x, y - WALL_H);
            p.closePath();
            p.endFill();
            p.beginFill(COL.baseboard);
            p.moveTo(x, y);
            p.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            p.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - baseH);
            p.lineTo(x, y - baseH);
            p.closePath();
            p.endFill();
            p.lineStyle(1, COL.wallEdge, 0.3);
            p.moveTo(x, y - WALL_H);
            p.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - WALL_H);
            this._container.addChild(p);
        }
    }

    _drawWhiteboard() {
        // centered on back wall at grid (6, 0), spanning ~3 tiles
        const { x, y } = this._gridToScreen(6, 0);
        const g = new PIXI.Graphics();
        const wbW = 80, wbH = 44, wallOff = 68;
        const bx = x - 20, by = y - wallOff;

        g.beginFill(0xF0EDE6);
        g.drawRoundedRect(bx, by, wbW, wbH, 3);
        g.endFill();
        g.lineStyle(2, 0x8A8A90);
        g.drawRoundedRect(bx, by, wbW, wbH, 3);

        // column dividers
        const colW = (wbW - 8) / 3;
        g.lineStyle(0.5, 0x8A8A90, 0.3);
        g.moveTo(bx + 4 + colW, by + 4);
        g.lineTo(bx + 4 + colW, by + wbH - 4);
        g.moveTo(bx + 4 + colW * 2, by + 4);
        g.lineTo(bx + 4 + colW * 2, by + wbH - 4);

        this._container.addChild(g);

        // column headers
        const headers = ['TODO', 'IN PROG', 'DONE'];
        for (let i = 0; i < 3; i++) {
            const ht = new PIXI.Text(headers[i], {
                fontFamily: "'Fredoka', sans-serif",
                fontSize: 6,
                fill: '#6A6A70',
                fontWeight: '600',
            });
            ht.anchor.set(0.5, 0);
            ht.x = bx + 4 + colW * i + colW / 2;
            ht.y = by + 3;
            this._container.addChild(ht);
        }

        // sticky notes
        const notes = new PIXI.Graphics();
        const noteW = 8, noteH = 6;
        // TODO column: 2 notes (pink, yellow)
        const todoX = bx + 6;
        notes.beginFill(0xFF9A8C); notes.drawRect(todoX, by + 13, noteW, noteH); notes.endFill();
        notes.beginFill(0xFFD66B); notes.drawRect(todoX + 2, by + 22, noteW, noteH); notes.endFill();
        // IN PROGRESS column: 1 note (blue)
        const ipX = bx + 4 + colW + 4;
        notes.beginFill(0x9BDFFF); notes.drawRect(ipX, by + 15, noteW, noteH); notes.endFill();
        // DONE column: 2 notes (green) with checkmarks
        const doneX = bx + 4 + colW * 2 + 4;
        notes.beginFill(0x6AD89A); notes.drawRect(doneX, by + 13, noteW, noteH); notes.endFill();
        notes.beginFill(0x6AD89A); notes.drawRect(doneX + 2, by + 22, noteW, noteH); notes.endFill();
        // tiny checkmarks on done notes
        notes.lineStyle(1, 0x2A6A3A, 0.8);
        notes.moveTo(doneX + 2, by + 16); notes.lineTo(doneX + 4, by + 18); notes.lineTo(doneX + 7, by + 14);
        notes.moveTo(doneX + 4, by + 25); notes.lineTo(doneX + 6, by + 27); notes.lineTo(doneX + 9, by + 23);
        this._container.addChild(notes);
    }

    // ── furniture ─────────────────────────────────────────────────────

    _drawFurniture() {
        // 4 desk stations in a wide 2x2 arrangement
        const stations = [
            { gx: 3, gy: 3 },  // Alex
            { gx: 9, gy: 3 },  // Sam
            { gx: 3, gy: 8 },  // Mia
            { gx: 9, gy: 8 },  // empty (player's)
        ];
        this._screenGlows = [];
        const screenColors = [0x3A5A2A, 0x2A4A6A, 0x4A3A5A, 0x2A4A5A]; // different app tints per desk
        for (let i = 0; i < stations.length; i++) this._drawDeskStation(stations[i].gx, stations[i].gy, i, screenColors[i]);

        // cubicle dividers — vertical center and horizontal center
        this._drawDivider(6, 1, 6, 11);
        this._drawDivider(1, 6, 11, 6);
    }

    _drawDeskStation(gx, gy, stationIdx, screenColor) {
        const c = this._tileCenter(gx, gy);
        const g = new PIXI.Graphics();

        // desk top (iso diamond)
        g.beginFill(COL.desk);
        g.moveTo(c.x, c.y - 18);
        g.lineTo(c.x + 24, c.y - 10);
        g.lineTo(c.x, c.y - 2);
        g.lineTo(c.x - 24, c.y - 10);
        g.closePath();
        g.endFill();
        // front face
        g.beginFill(COL.deskTop);
        g.moveTo(c.x, c.y - 2);
        g.lineTo(c.x + 24, c.y - 10);
        g.lineTo(c.x + 24, c.y + 4);
        g.lineTo(c.x, c.y + 12);
        g.closePath();
        g.endFill();
        // side face
        g.beginFill(COL.deskSide);
        g.moveTo(c.x, c.y - 2);
        g.lineTo(c.x - 24, c.y - 10);
        g.lineTo(c.x - 24, c.y + 4);
        g.lineTo(c.x, c.y + 12);
        g.closePath();
        g.endFill();
        // front panel (modesty panel below desktop)
        g.beginFill(0x7A6A4A);
        g.moveTo(c.x - 20, c.y - 8);
        g.lineTo(c.x + 20, c.y - 8);
        g.lineTo(c.x + 20, c.y + 6);
        g.lineTo(c.x - 20, c.y + 6);
        g.closePath();
        g.endFill();

        // monitor
        g.beginFill(COL.monFrame);
        g.drawRoundedRect(c.x - 11, c.y - 34, 22, 16, 2);
        g.endFill();
        g.beginFill(COL.monitor);
        g.drawRect(c.x - 9, c.y - 32, 18, 12);
        g.endFill();
        // screen glow (different color per desk)
        const glow = new PIXI.Graphics();
        glow.beginFill(screenColor, 0.8);
        glow.drawRect(c.x - 9, c.y - 32, 18, 12);
        glow.endFill();
        this._screenGlows.push({ gfx: glow, phase: Math.random() * Math.PI * 2 });
        // stand
        g.beginFill(0x4A4A52);
        g.drawRect(c.x - 2, c.y - 18, 4, 5);
        g.endFill();

        // desk items per station
        if (stationIdx === 0) {
            // Alex: coffee mug (stressed, lots of coffee)
            g.beginFill(0xE8E0D0);
            g.drawRoundedRect(c.x + 12, c.y - 18, 5, 6, 1);
            g.endFill();
            // mug handle
            g.lineStyle(1, 0xE8E0D0, 0.8);
            g.moveTo(c.x + 17, c.y - 16);
            g.bezierCurveTo(c.x + 20, c.y - 16, c.x + 20, c.y - 13, c.x + 17, c.y - 13);
            g.lineStyle(0);
            // coffee fill
            g.beginFill(0x4A2A10, 0.7);
            g.drawRect(c.x + 13, c.y - 17, 3, 2);
            g.endFill();
        } else if (stationIdx === 1) {
            // Sam: water bottle (healthy focused developer)
            g.beginFill(0x6AB8FF, 0.6);
            g.drawRoundedRect(c.x + 13, c.y - 20, 4, 8, 2);
            g.endFill();
            // bottle cap
            g.beginFill(0x4A8ACC);
            g.drawRect(c.x + 14, c.y - 21, 2, 2);
            g.endFill();
        }
        // stationIdx === 2 (Mia): nothing — just her head resting on desk
        // stationIdx === 3 (empty): nothing

        // chair (in front of desk — positive gy direction)
        const chairC = this._tileCenter(gx, gy + 1);
        const chairG = new PIXI.Graphics();
        chairG.beginFill(COL.chair);
        chairG.drawRoundedRect(chairC.x - 7, chairC.y - 6, 14, 5, 2);
        chairG.endFill();
        chairG.beginFill(COL.chairSeat);
        chairG.drawEllipse(chairC.x, chairC.y - 6, 8, 4);
        chairG.endFill();
        chairG.beginFill(COL.chair);
        chairG.drawRoundedRect(chairC.x - 6, chairC.y - 12, 12, 5, 2);
        chairG.endFill();

        this._container.addChild(chairG);
        this._container.addChild(g);
        this._container.addChild(glow);
    }

    _drawDivider(gx1, gy1, gx2, gy2) {
        const p1 = this._tileCenter(gx1, gy1);
        const p2 = this._tileCenter(gx2, gy2);
        const g = new PIXI.Graphics();
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = -dy / len * 2, ny = dx / len * 2; // 2px wide

        // main panel face
        g.beginFill(0xC8C0B4, 0.4);
        g.moveTo(p1.x + nx, p1.y + ny - 28);
        g.lineTo(p2.x + nx, p2.y + ny - 28);
        g.lineTo(p2.x - nx, p2.y - ny - 28);
        g.lineTo(p1.x - nx, p1.y - ny - 28);
        g.closePath();
        g.endFill();
        // top highlight edge
        g.lineStyle(1, 0xD8D0C8, 0.5);
        g.moveTo(p1.x + nx, p1.y + ny - 28);
        g.lineTo(p2.x + nx, p2.y + ny - 28);
        g.lineStyle(0);
        // bottom edge (gives depth)
        g.beginFill(0xC8C0B4, 0.25);
        g.moveTo(p1.x - nx, p1.y - ny - 28);
        g.lineTo(p2.x - nx, p2.y - ny - 28);
        g.lineTo(p2.x - nx, p2.y - ny);
        g.lineTo(p1.x - nx, p1.y - ny);
        g.closePath();
        g.endFill();

        // pinned items on dividers (tiny colored squares — photos/notes)
        const pinColors = [0xFFD66B, 0x9BDFFF, 0xFF9A8C, 0x6AD89A];
        for (let i = 0; i < 2; i++) {
            const t = 0.2 + i * 0.55; // position along the divider
            const px = p1.x + dx * t;
            const py = p1.y + dy * t - 20 - i * 6;
            g.beginFill(pinColors[(gx1 + i) % pinColors.length], 0.6);
            g.drawRect(px - 2, py - 2, 4, 4);
            g.endFill();
        }

        this._container.addChild(g);
    }

    _drawWaterCooler() {
        const c = this._tileCenter(11, 1);
        const g = new PIXI.Graphics();
        g.beginFill(0xD8D4CC);
        g.drawRoundedRect(c.x - 6, c.y - 28, 12, 22, 3);
        g.endFill();
        g.beginFill(0x6AB8FF, 0.3);
        g.drawCircle(c.x, c.y - 32, 7);
        g.endFill();
        g.beginFill(0x6AB8FF, 0.5);
        g.drawCircle(c.x, c.y - 32, 5);
        g.endFill();
        g.beginFill(0xB0ACA4);
        g.drawRect(c.x - 3, c.y - 8, 6, 3);
        g.endFill();
        this._container.addChild(g);
    }

    _drawDoor() {
        const c = this._tileCenter(6, 11);
        const g = new PIXI.Graphics();
        g.beginFill(0x6B5B3E);
        g.drawRect(c.x - 8, c.y - 30, 16, 30);
        g.endFill();
        g.beginFill(COL.warm, 0.6);
        g.drawCircle(c.x + 4, c.y - 12, 1.5);
        g.endFill();
        this._container.addChild(g);

        // ESC hint near door
        const hint = new PIXI.Text('Press ESC to leave', {
            fontFamily: "'Fredoka', sans-serif",
            fontSize: 9,
            fill: '#F5F0E8',
            fontWeight: '400',
        });
        hint.alpha = 0.4;
        hint.anchor.set(0.5, 0);
        hint.x = c.x;
        hint.y = c.y + 4;
        this._container.addChild(hint);
    }

    // ── ceiling lights ────────────────────────────────────────────────

    _drawCeilingLights() {
        // 4 rectangular light panels (one per quadrant)
        const quadrants = [
            { gx: 3, gy: 3 },
            { gx: 9, gy: 3 },
            { gx: 3, gy: 8 },
            { gx: 9, gy: 8 },
        ];
        for (const q of quadrants) {
            const c = this._tileCenter(q.gx, q.gy);
            const light = new PIXI.Graphics();
            light.beginFill(0xF5F0E8, 0.08);
            light.drawRoundedRect(c.x - 16, c.y - 44, 32, 10, 2);
            light.endFill();
            this._container.addChild(light);
        }
    }

    // ── NPCs ──────────────────────────────────────────────────────────

    _spawnNPCs() {
        for (const def of NPCS) {
            // NPC sits at the chair position (1 tile in front of desk)
            const chairPos = this._tileCenter(def.gx, def.gy + 1);
            const deskPos = this._tileCenter(def.gx, def.gy);
            const npcGroup = new PIXI.Container();
            npcGroup.zIndex = chairPos.y + 100;

            const charContainer = new PIXI.Container();
            charContainer.x = chairPos.x;
            charContainer.y = chairPos.y - 12;

            // shadow
            const shadow = new PIXI.Graphics();
            shadow.beginFill(0x000000, 0.06);
            shadow.drawEllipse(0, 16, 14, 5);
            shadow.endFill();
            charContainer.addChild(shadow);

            // legs (sitting)
            const OL = 0x3C2A1A;
            const legs = new PIXI.Graphics();
            legs.lineStyle(1.2, OL, 0.7);
            legs.beginFill(0x4A5A60);
            legs.drawRoundedRect(-7, 2, 6, 8, 2);
            legs.drawRoundedRect(1, 2, 6, 8, 2);
            legs.endFill();
            legs.lineStyle(1, OL, 0.6);
            legs.beginFill(0xF5F0E8);
            legs.drawRoundedRect(-8, 9, 8, 4, 2);
            legs.drawRoundedRect(0, 9, 8, 4, 2);
            legs.endFill();
            charContainer.addChild(legs);

            // body outline
            const bodyOL = new PIXI.Graphics();
            bodyOL.beginFill(OL);
            bodyOL.drawRoundedRect(-11, -22, 22, 24, 4);
            bodyOL.endFill();
            charContainer.addChild(bodyOL);

            // body
            const body = new PIXI.Graphics();
            body.beginFill(def.shirt);
            body.drawRoundedRect(-10, -21, 20, 22, 4);
            body.endFill();
            body.beginFill(def.shirt & 0xE0E0E0 | 0x101010);
            body.drawEllipse(0, -21, 6, 3.5);
            body.endFill();
            body.lineStyle(0.8, 0x000000, 0.12);
            body.moveTo(0, -21); body.lineTo(0, 0);
            charContainer.addChild(body);

            // arms
            const armL = new PIXI.Graphics();
            armL.lineStyle(1.2, OL, 0.7);
            armL.beginFill(def.shirt);
            armL.drawRoundedRect(-16, -18, 6, 14, 3);
            armL.endFill();
            armL.lineStyle(0.8, OL, 0.5);
            armL.beginFill(0xFFDDB8);
            armL.drawEllipse(-13, -4, 3.5, 3);
            armL.endFill();
            charContainer.addChild(armL);

            const armR = new PIXI.Graphics();
            armR.lineStyle(1.2, OL, 0.7);
            armR.beginFill(def.shirt);
            armR.drawRoundedRect(10, -18, 6, 14, 3);
            armR.endFill();
            armR.lineStyle(0.8, OL, 0.5);
            armR.beginFill(0xFFDDB8);
            armR.drawEllipse(13, -4, 3.5, 3);
            armR.endFill();
            charContainer.addChild(armR);

            // neck shadow
            const neckSh = new PIXI.Graphics();
            neckSh.beginFill(OL, 0.06);
            neckSh.drawEllipse(0, -22, 8, 2.5);
            neckSh.endFill();
            charContainer.addChild(neckSh);

            // head outline
            const headOL = new PIXI.Graphics();
            headOL.beginFill(OL);
            headOL.drawEllipse(0, -32, 12, 12);
            headOL.endFill();
            charContainer.addChild(headOL);

            // head
            const head = new PIXI.Graphics();
            head.beginFill(0xFFDDB8);
            head.drawEllipse(0, -32, 11, 11);
            head.endFill();
            head.beginFill(0xffffff, 0.92);
            head.drawCircle(-3.5, -33, 2.8);
            head.drawCircle(3.5, -33, 2.8);
            head.endFill();
            head.beginFill(0x3C2A1A);
            head.drawCircle(-3, -33, 1.6);
            head.drawCircle(4, -33, 1.6);
            head.endFill();
            head.beginFill(0xffffff, 0.6);
            head.drawCircle(-2.3, -34, 0.7);
            head.drawCircle(4.7, -34, 0.7);
            head.endFill();
            head.lineStyle(1, 0x3C2A1A, 0.5);
            head.moveTo(-5.5, -37); head.lineTo(-1.5, -36.5);
            head.moveTo(1.5, -36.5); head.lineTo(5.5, -37);
            head.lineStyle(1, 0xD4A070, 0.6);
            head.moveTo(-2.5, -27);
            head.bezierCurveTo(-1, -25.5, 1, -25.5, 2.5, -27);
            head.lineStyle(0);
            head.beginFill(0xE8B88A, 0.35);
            head.drawCircle(0, -30, 1);
            head.endFill();
            charContainer.addChild(head);

            // hair
            const hair = new PIXI.Graphics();
            hair.beginFill(OL);
            hair.drawEllipse(0, -43, 12, 5);
            hair.endFill();
            hair.beginFill(def.hair);
            hair.drawEllipse(0, -43, 11, 4);
            hair.endFill();
            hair.beginFill(def.hair);
            hair.drawRect(-11, -43, 22, 6);
            hair.drawEllipse(-10, -39, 3.5, 4);
            hair.drawEllipse(10, -39, 3.5, 4);
            hair.endFill();
            charContainer.addChild(hair);

            npcGroup.addChild(charContainer);

            // mini ghost — to the RIGHT of the NPC, offset +30px
            const ghostContainer = new PIXI.Container();
            ghostContainer.x = chairPos.x + 30;
            const ghostBaseY = chairPos.y - 46;
            ghostContainer.y = ghostBaseY;

            const ghostGfx = new PIXI.Graphics();
            this._drawMiniGhost(ghostGfx, STATE_COLORS[def.state], def.state);
            ghostContainer.addChild(ghostGfx);
            npcGroup.addChild(ghostContainer);

            // biometric badge above ghost
            const badge = this._createBadge(def);
            badge.x = chairPos.x + 30;
            badge.y = ghostBaseY - 28;
            npcGroup.addChild(badge);

            this._container.addChild(npcGroup);

            // personality extras
            let sweatDrops = null;
            let sparkles = null;
            let zzzText = null;

            if (def.state === 'STRESSED') {
                // Alex: sweat drops near head
                sweatDrops = [];
                for (let si = 0; si < 2; si++) {
                    const drop = new PIXI.Graphics();
                    drop.beginFill(0x6AB8FF, 0.7);
                    drop.drawCircle(0, 0, 1.5);
                    drop.endFill();
                    drop.x = (si === 0 ? -14 : 14);
                    drop.y = -38;
                    charContainer.addChild(drop);
                    sweatDrops.push(drop);
                }
            }

            if (def.state === 'DEEP_FOCUS') {
                // Sam: sparkle dots orbiting slowly
                sparkles = [];
                for (let si = 0; si < 6; si++) {
                    const dot = new PIXI.Graphics();
                    dot.beginFill(0xFFFFFF, 0.5);
                    dot.drawCircle(0, 0, 0.8);
                    dot.endFill();
                    charContainer.addChild(dot);
                    sparkles.push({ gfx: dot, angle: (si / 6) * Math.PI * 2, radius: 18 + (si % 2) * 4 });
                }
            }

            if (def.state === 'FATIGUED') {
                // Mia: Zzz floating text
                zzzText = new PIXI.Text('Zzz', {
                    fontFamily: "'Fredoka', sans-serif",
                    fontSize: 9,
                    fill: '#FFFFFF',
                    fontWeight: '600',
                });
                zzzText.anchor.set(0.5, 1);
                zzzText.x = 8;
                zzzText.y = -48;
                charContainer.addChild(zzzText);
            }

            this._npcs.push({
                def,
                armL, armR,
                armBaseY: armL.y,
                head,
                headBaseX: head.x,
                headBaseY: head.y,
                headOffset: Math.random() * 600,
                headInterval: 10 + Math.random() * 5,
                ghostContainer,
                ghostBaseY,
                badge,
                tick: Math.random() * 300,
                sweatDrops,
                sparkles,
                zzzText,
                zzzBaseY: -48,
            });
        }
    }

    // ── mini ghost ────────────────────────────────────────────────────

    _drawMiniGhost(g, color, state) {
        const s = 0.55;
        g.clear();

        g.beginFill(0xffffff, 0.18);
        g.moveTo(0, -26 * s);
        g.bezierCurveTo( 13*s, -26*s,  22*s, -14*s,  22*s,   2*s);
        g.bezierCurveTo( 22*s,  32*s,  10*s,  38*s,   6*s,  16*s);
        g.bezierCurveTo(  2*s,  34*s,  -2*s,  34*s,  -6*s,  16*s);
        g.bezierCurveTo(-10*s,  38*s, -22*s,  32*s, -22*s,   2*s);
        g.bezierCurveTo(-22*s, -14*s, -13*s, -26*s,     0, -26*s);
        g.closePath();
        g.endFill();

        g.lineStyle(1.5, color, 0.7);
        g.moveTo(0, -26 * s);
        g.bezierCurveTo( 13*s, -26*s,  22*s, -14*s,  22*s,   2*s);
        g.bezierCurveTo( 22*s,  32*s,  10*s,  38*s,   6*s,  16*s);
        g.bezierCurveTo(  2*s,  34*s,  -2*s,  34*s,  -6*s,  16*s);
        g.bezierCurveTo(-10*s,  38*s, -22*s,  32*s, -22*s,   2*s);
        g.bezierCurveTo(-22*s, -14*s, -13*s, -26*s,     0, -26*s);
        g.closePath();
        g.lineStyle(0);

        g.beginFill(0xffffff, 0.06);
        g.drawEllipse(0, -8 * s, 10 * s, 13 * s);
        g.endFill();

        this._drawMiniGhostEyes(g, s, state);
    }

    _drawMiniGhostEyes(g, s, state) {
        const ex = 9 * s, ey = 6 * s;

        switch (state) {
            case 'STRESSED':
                g.beginFill(0xffffff, 0.9);
                g.drawEllipse(-ex, -ey, 5*s, 3.5*s);
                g.drawEllipse( ex, -ey, 5*s, 3.5*s);
                g.endFill();
                g.beginFill(0x3C2A1A, 0.9);
                g.drawCircle(-ex, -ey + s, 2.5*s);
                g.drawCircle( ex, -ey + s, 2.5*s);
                g.endFill();
                g.lineStyle(1.2, 0xffffff, 0.6);
                g.moveTo(-ex - 4*s, -ey - 5*s); g.lineTo(-ex + 3*s, -ey - 3*s);
                g.moveTo( ex + 4*s, -ey - 5*s); g.lineTo( ex - 3*s, -ey - 3*s);
                g.lineStyle(0);
                break;

            case 'FATIGUED':
                g.beginFill(0xffffff, 0.7);
                g.drawEllipse(-ex, -ey, 5*s, 4*s);
                g.drawEllipse( ex, -ey, 5*s, 4*s);
                g.endFill();
                g.beginFill(0x3C2A1A, 0.85);
                g.drawCircle(-ex, -ey + s, 2*s);
                g.drawCircle( ex, -ey + s, 2*s);
                g.endFill();
                g.beginFill(0xffffff, 0.15);
                g.drawEllipse(-ex, -ey - 2*s, 5.5*s, 3*s);
                g.drawEllipse( ex, -ey - 2*s, 5.5*s, 3*s);
                g.endFill();
                break;

            default:
                g.beginFill(0xffffff, 0.9);
                g.drawCircle(-ex, -ey, 4*s);
                g.drawCircle( ex, -ey, 4*s);
                g.endFill();
                g.beginFill(0x3C2A1A, 0.9);
                g.drawCircle(-ex, -ey, 2.5*s);
                g.drawCircle( ex, -ey, 2.5*s);
                g.endFill();
                g.beginFill(0xffffff, 0.6);
                g.drawCircle(-ex + 1.5*s, -ey - 1.5*s, s);
                g.drawCircle( ex + 1.5*s, -ey - 1.5*s, s);
                g.endFill();
                break;
        }
    }

    // ── biometric badge ───────────────────────────────────────────────

    _createBadge(def) {
        const color = STATE_HEX[def.state] || '#888';
        const stateLabel = def.state.replace('_', ' ');
        const container = new PIXI.Container();

        const bg = new PIXI.Graphics();
        bg.beginFill(0x2A2420, 0.85);
        bg.drawRoundedRect(-54, -9, 108, 18, 6);
        bg.endFill();
        bg.lineStyle(1, STATE_COLORS[def.state], 0.2);
        bg.drawRoundedRect(-54, -9, 108, 18, 6);
        container.addChild(bg);

        const text = new PIXI.Text(
            `${def.name} | \u2764\uFE0F ${def.bpm} bpm | ${stateLabel}`,
            {
                fontFamily: 'Nunito, sans-serif',
                fontSize: 9,
                fill: color,
                align: 'center',
            }
        );
        text.anchor.set(0.5, 0.5);
        container.addChild(text);

        return container;
    }

    // ── notification toasts ───────────────────────────────────────────

    _spawnNotif() {
        const npc = this._npcs[Math.floor(Math.random() * this._npcs.length)];
        const msgs = ['\uD83D\uDCE9 New PR review', '\uD83D\uDD14 Slack ping', '\u2615 Coffee break?', '\uD83D\uDCCB Standup in 5m'];
        const msg = msgs[Math.floor(Math.random() * msgs.length)];

        const chairPos = this._tileCenter(npc.def.gx, npc.def.gy + 1);
        const toast = new PIXI.Container();
        toast.x = chairPos.x + 12;
        toast.y = chairPos.y - 68;
        toast.zIndex = 9999;

        const bg = new PIXI.Graphics();
        bg.beginFill(0x2A2420, 0.9);
        bg.drawRoundedRect(-38, -8, 76, 16, 5);
        bg.endFill();
        toast.addChild(bg);

        const t = new PIXI.Text(msg, {
            fontFamily: 'Nunito, sans-serif',
            fontSize: 8,
            fill: '#F5F0E8',
        });
        t.anchor.set(0.5, 0.5);
        toast.addChild(t);

        toast.life = 0;
        this._container.addChild(toast);
        this._notifSprites.push(toast);
    }

    // ── interactions ───────────────────────────────────────────────────

    _checkProximity() {
        if (!this._player || this._activePanel) return;
        const pos = this._player.getPosition();
        const pScreen = this._tileCenter(pos.x, pos.y);

        let nearest = null;
        let nearestDist = Infinity;

        for (const zone of INTERACT_ZONES) {
            const zScreen = this._tileCenter(zone.gx, zone.gy);
            const dx = (pScreen.x - zScreen.x) * ZOOM;
            const dy = (pScreen.y - zScreen.y) * ZOOM;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < INTERACT_DIST && dist < nearestDist) {
                nearest = zone;
                nearestDist = dist;
            }
        }

        this._nearInteractable = nearest;
        for (const ep of this._ePrompts) {
            ep.sprite.visible = (ep.zone === nearest);
        }
    }

    _openPanel(zone) {
        if (this._activePanel) return;
        if (this._player) this._player.disable();

        const backdrop = document.createElement('div');
        backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:4999;';
        backdrop.addEventListener('click', () => this._closePanel());
        document.body.appendChild(backdrop);
        this._panelBackdrop = backdrop;

        const color = this._getPanelColor(zone);
        const panel = document.createElement('div');
        panel.style.cssText = `position:fixed;right:5%;top:15%;width:320px;background:rgba(42,36,28,0.92);border-radius:12px;padding:20px;z-index:5000;border-left:3px solid ${color};font-family:'Fredoka',sans-serif;color:#D4CFC8;box-shadow:0 8px 32px rgba(0,0,0,0.5);`;
        panel.innerHTML = this._buildPanelHTML(zone);
        document.body.appendChild(panel);
        this._activePanel = panel;

        for (const ep of this._ePrompts) ep.sprite.visible = false;
    }

    _closePanel() {
        if (this._activePanel) {
            this._activePanel.remove();
            this._activePanel = null;
        }
        if (this._panelBackdrop) {
            this._panelBackdrop.remove();
            this._panelBackdrop = null;
        }
        if (this._player) this._player.enable();
    }

    _getPanelColor(zone) {
        if (zone.type === 'npc') return STATE_HEX[NPCS[zone.npcIdx].state] || '#888';
        if (zone.type === 'empty') return '#8AAAB8';
        return '#F5F0E8';
    }

    _ghostSVG(color) {
        return `<svg width="20" height="24" viewBox="0 0 20 24" style="flex-shrink:0;margin-top:2px;"><path d="M10 1C15 1 19 5 19 11C19 21 15 23 13 17C12 21 8 21 7 17C5 23 1 21 1 11C1 5 5 1 10 1Z" fill="${color}" opacity="0.7"/><circle cx="7" cy="9" r="1.5" fill="white" opacity="0.9"/><circle cx="13" cy="9" r="1.5" fill="white" opacity="0.9"/></svg>`;
    }

    _buildPanelHTML(zone) {
        if (zone.type === 'npc') return this._buildNPCPanel(zone);
        if (zone.type === 'empty') return this._buildEmptyPanel();
        if (zone.type === 'whiteboard') return this._buildWhiteboardPanel();
        return '';
    }

    _buildNPCPanel(zone) {
        const npc = NPCS[zone.npcIdx];
        const color = STATE_HEX[npc.state];
        const bio = this._getBioData(zone.id);
        const bpmColor = npc.state === 'STRESSED' ? '#FF5A4A' : color;
        const bpmStyle = npc.state === 'STRESSED' ? 'animation:dlPulse 1s infinite;' : '';

        return `<style>@keyframes dlPulse{0%,100%{opacity:1}50%{opacity:0.4}}@keyframes dlBlink{0%,100%{opacity:1}50%{opacity:0}}</style>` +
            `<h3 style="font-size:16px;color:${color};margin:0 0 14px 0;font-weight:500;">${bio.title}</h3>` +
            `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:12px;margin-bottom:14px;">` +
                `<div>\u2764\uFE0F <span style="color:${bpmColor};${bpmStyle}">${bio.bpm} bpm</span></div>` +
                `<div>Recovery: <span style="color:${color}">${bio.recovery}%</span></div>` +
                `<div>Strain: <span style="color:${color}">${bio.strain}</span></div>` +
                `<div>HRV: <span style="color:${color}">${bio.hrv}ms</span></div>` +
                `<div style="grid-column:1/-1">State: <span style="color:${color};font-weight:600">${npc.state.replace('_', ' ')}</span></div>` +
            `</div>` +
            `<div style="background:#1E2D3D;border-radius:6px;padding:10px 12px;font-family:'Courier New',monospace;font-size:11px;line-height:1.7;color:#D4D4D4;margin-bottom:14px;white-space:pre;">${this._getCodeBlock(zone.id)}</div>` +
            `<div style="display:flex;align-items:flex-start;gap:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);">` +
                this._ghostSVG(color) +
                `<div style="font-style:italic;color:#A8A098;font-size:12px;line-height:1.5;">${this._getGhostMsg(zone.id)}</div>` +
            `</div>`;
    }

    _getBioData(id) {
        switch (id) {
            case 'alex': return { title: 'Alex \u2014 Backend Developer',  bpm: '112', recovery: '35', strain: '19.2', hrv: '22' };
            case 'sam':  return { title: 'Sam \u2014 Frontend Developer',  bpm: '68',  recovery: '82', strain: '11.5', hrv: '65' };
            case 'mia':  return { title: 'Mia \u2014 Data Scientist',      bpm: '55',  recovery: '22', strain: '21.0', hrv: '18' };
            default:     return { title: '', bpm: '0', recovery: '0', strain: '0', hrv: '0' };
        }
    }

    _getCodeBlock(id) {
        switch (id) {
            case 'alex':
                return `<span style="color:#569CD6">async</span> <span style="color:#DCDCAA">processQueue</span>(<span style="color:#9CDCFE">items</span>) {\n` +
                    `  <span style="color:#569CD6">const</span> <span style="color:#9CDCFE">lock</span> = <span style="color:#569CD6">await</span> <span style="color:#DCDCAA">acquireLock</span>();\n` +
                    `  <span style="color:#C586C0">for</span> (<span style="color:#569CD6">const</span> <span style="color:#9CDCFE">item</span> <span style="color:#C586C0">of</span> <span style="color:#9CDCFE">items</span>) {\n` +
                    `    <span style="color:#569CD6">await</span> <span style="text-decoration:underline wavy #F44747;color:#DCDCAA">procss</span>(<span style="color:#9CDCFE">item</span>); <span style="color:#F44747">// \u2190 TypeError</span>\n` +
                    `  }`;
            case 'sam':
                return `<span style="color:#569CD6">export function</span> <span style="color:#DCDCAA">Dashboard</span>() {\n` +
                    `  <span style="color:#569CD6">const</span> [<span style="color:#9CDCFE">data</span>] = <span style="color:#DCDCAA">useBio</span>(); <span style="color:#6A9955">\u2713</span>\n` +
                    `  <span style="color:#C586C0">return</span> &lt;<span style="color:#4EC9B0">Grid</span> <span style="color:#9CDCFE">cols</span>={3}&gt;\n` +
                    `    &lt;<span style="color:#4EC9B0">Card</span> <span style="color:#9CDCFE">metric</span>=<span style="color:#CE9178">"hrv"</span> /&gt; <span style="color:#6A9955">\u2713</span>\n` +
                    `  &lt;/<span style="color:#4EC9B0">Grid</span>&gt;`;
            case 'mia':
                return `<span style="color:#569CD6">def</span> <span style="color:#DCDCAA">train_model</span>(<span style="color:#9CDCFE">df</span>):\n` +
                    `    <span style="color:#9CDCFE">X</span> = <span style="color:#9CDCFE">df</span>.<span style="color:#DCDCAA">drop</span>(<span style="color:#CE9178">"target"</span>)\n` +
                    `    <span style="color:#9CDCFE">model</span> = <span style="color:#4EC9B0">XGBoost</span>().<span style="color:#DCDCAA">fit</span>(<span style="color:#9CDCFE">X</span>,\n` +
                    `    <span style="color:#9CDCFE;animation:dlBlink 1s infinite">\u2502</span>\n` +
                    ` `;
            default: return '';
        }
    }

    _getGhostMsg(id) {
        switch (id) {
            case 'alex': return "Alex has been debugging a race condition for 4 hours. His cortisol is through the roof. I\u2019ve blocked his git push twice already.";
            case 'sam':  return "Sam entered flow state 47 minutes ago. Optimal HRV. I haven\u2019t said a word \u2014 that\u2019s how you know it\u2019s going well.";
            case 'mia':  return "Mia\u2019s been here since 6am. Her sleep score was 42% last night. I\u2019ve been dimming her screen gradually \u2014 she hasn\u2019t noticed yet.";
            default:     return '';
        }
    }

    _buildEmptyPanel() {
        return `<div style="display:flex;align-items:flex-start;gap:10px;">` +
            this._ghostSVG('#8AAAB8') +
            `<div style="font-style:italic;color:#A8A098;font-size:13px;line-height:1.6;">` +
                `That desk is free. In the future, other players could sit here and you\u2019d see their real biometrics. Imagine that.` +
            `</div></div>`;
    }

    _buildWhiteboardPanel() {
        return `<div style="display:flex;align-items:flex-start;gap:10px;">` +
            this._ghostSVG('#F5F0E8') +
            `<div style="font-style:italic;color:#A8A098;font-size:13px;line-height:1.6;">` +
                `Sprint board says: \u2018Ship DevLife by March 22.\u2019 Sounds familiar.` +
            `</div></div>`;
    }
}
