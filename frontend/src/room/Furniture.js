import * as PIXI from 'pixi.js';
import { EventEmitter } from '../utils/EventEmitter.js';

const HIGHLIGHT_COLOR = 0xe94560;
let plantStage = 0;

export class Furniture extends EventEmitter {
    constructor(stage, room) {
        super();
        this.room = room;
        this.container = new PIXI.Container();
        stage.addChild(this.container);

        this._items = [];
        this._plantGraphics = null;
        this.acceptedInterventions = 0;

        // Animation state
        this._animTick = 0;
        this._deskScanLine = null;
        this._termCursor = null;
        this._coffeeContainer = null;
        this._coffeeSpawnAccum = 0;
        this._steamParticles = [];
        this._doorHandleGlow = null;
        this.onDoorInteract = null;
        this._deskLedStrip = null;
        this._ledFlashTimer = 0;
        this._ledFlashing = false;
        this._currentState = 'RELAXED';

        this._buildRoom();

        this.on('interact', (name) => {
            if (name === 'door' && this.onDoorInteract) this.onDoorInteract();
        });
    }

    static async preloadTextures() {
        const sprites = {
            desk: '/assets/Isometric/desk_SE.png',
            monitor: '/assets/Isometric/computerScreen_SE.png',
            keyboard: '/assets/Isometric/computerKeyboard_SE.png',
            chair: '/assets/Isometric/chairDesk_SE.png',
            coffee: '/assets/Isometric/kitchenCoffeeMachine_SE.png',
            speaker: '/assets/Isometric/speaker_SE.png',
            plant: '/assets/Isometric/pottedPlant_SE.png',
            radio: '/assets/Isometric/radio_SE.png',
            lamp: '/assets/Isometric/lampRoundTable_SE.png',
            bookcase: '/assets/Isometric/bookcaseOpen_SE.png',
            laptop: '/assets/Isometric/laptop_SE.png',
            rug: '/assets/Isometric/rugRectangle_SE.png',
            televisionModern: '/assets/Isometric/televisionModern_SE.png',
            trashcan: '/assets/Isometric/trashcan_SE.png',
        };
        Furniture._textures = {};
        for (const [key, path] of Object.entries(sprites)) {
            try {
                Furniture._textures[key] = await PIXI.Assets.load(path);
            } catch(e) { console.warn('Sprite load failed:', key); }
        }
    }

    _buildRoom() {
        this._addDecorative('rug', 6, 6, 0.35);   // rug first so it renders behind everything
        this._addDesk(5, 2);
        this._addTerminal(7, 2);
        this._addSecondMonitor(2, 2);
        this._addWhiteboard(1, 4);
        this._addPhone(5, 3);
        this._addCoffeeMachine(1, 8);
        this._addPlant(10, 10);
        this._addSpeaker(8, 2);
        this._addChair(5, 4);
        this._addDoor(0, 10);
        this._addDecorative('lamp', 3, 3, 0.45);
        this._addDecorative('trashcan', 8, 4, 0.38);
    }

    _addDecorative(key, gx, gy, scale) {
        if (!Furniture._textures?.[key]) return;
        const sprite = new PIXI.Sprite(Furniture._textures[key]);
        sprite.anchor.set(0.5, 0.85);
        sprite.scale.set(scale);
        const { x, y } = this.room.getTileCenter(gx, gy);
        sprite.x = x;
        sprite.y = y;
        this.container.addChild(sprite);
    }

    // these offsets took forever to get right
    _addDesk(gx, gy) {
        const c = new PIXI.Container();

        if (Furniture._textures?.desk) {
            const deskSprite = new PIXI.Sprite(Furniture._textures.desk);
            deskSprite.anchor.set(0.5, 0.88);
            deskSprite.scale.set(0.50);
            c.addChild(deskSprite);

            if (Furniture._textures?.monitor) {
                const monSprite = new PIXI.Sprite(Furniture._textures.monitor);
                monSprite.anchor.set(0.5, 0.85);
                monSprite.scale.set(0.45);
                monSprite.x = 2;
                monSprite.y = -40;
                c.addChild(monSprite);
            }

            if (Furniture._textures?.keyboard) {
                const kbSprite = new PIXI.Sprite(Furniture._textures.keyboard);
                kbSprite.anchor.set(0.5, 0.85);
                kbSprite.scale.set(0.30);
                kbSprite.x = 2;
                kbSprite.y = -8;
                c.addChild(kbSprite);
            }
        } else {
            const g = new PIXI.Graphics();

            // Desk shadow (warm, not cold black)
            g.beginFill(0x3C2A1A, 0.12);
            g.drawRect(-35, -9, 80, 40);
            g.endFill();

            g.beginFill(0xA0845C);
            g.drawRect(-40, -12, 80, 40);
            g.endFill();
            g.beginFill(0x8B7348);
            g.drawRect(-35, 28, 10, 28);
            g.drawRect(25, 28, 10, 28);
            g.endFill();
            g.lineStyle(1, 0xBFA072, 0.8);
            g.drawRect(-40, -12, 80, 40);
            // Top edge highlight
            g.lineStyle(1, 0xBFA072, 1);
            g.moveTo(-40, -12);
            g.lineTo(40, -12);

            // Monitor frame
            g.lineStyle(0);
            g.beginFill(0xE8E0D4);
            g.drawRect(-20, -46, 40, 30);
            g.endFill();
            // Bezel border
            g.lineStyle(2, 0xE8E0D4, 1);
            g.drawRect(-20, -46, 40, 30);
            g.lineStyle(0);
            g.beginFill(0xE8E0D4);
            g.drawRect(-18, -44, 36, 26);
            g.endFill();
            // Screen content
            g.beginFill(0x1E2D3D);
            g.drawRect(-16, -43, 32, 23);
            g.endFill();
            // Scanline effect
            g.beginFill(0x000000, 0.05);
            for (let sy = -43; sy < -20; sy += 2) {
                g.drawRect(-16, sy, 32, 1);
            }
            g.endFill();
            // Static code lines
            g.lineStyle(1, 0x00ff41, 0.3);
            for (let i = 0; i < 4; i++) {
                const y = -40 + i * 5;
                const w = 14 + Math.floor(i * 3.5);
                g.moveTo(-14, y); g.lineTo(-14 + w, y);
            }
            // Power LED on bottom bezel
            g.lineStyle(0);
            g.beginFill(0x50D890, 0.5);
            g.drawCircle(0, -17, 1);
            g.endFill();
            // Monitor stand
            g.beginFill(0xC8C0B4);
            g.drawRect(-4, -16, 8, 6);
            g.endFill();
            // Keyboard
            g.beginFill(0xE8E0D4);
            g.drawRoundedRect(-18, 10, 30, 10, 2);
            g.endFill();
            // Key dots (3x2 grid)
            g.beginFill(0xD4CCC0);
            for (let kx = 0; kx < 3; kx++) {
                for (let ky = 0; ky < 2; ky++) {
                    g.drawRect(-14 + kx * 9, 12 + ky * 4, 6, 2);
                }
            }
            g.endFill();
            // Mouse
            g.beginFill(0xE8E0D4);
            g.drawEllipse(18, 15, 3, 5);
            g.endFill();

            c.addChild(g);
        }

        // Ambient monitor glow on the floor beneath the desk
        const monitorGlow = new PIXI.Graphics();
        monitorGlow.beginFill(0x2244cc, 0.07);
        monitorGlow.drawEllipse(0, 34, 88, 28);
        monitorGlow.endFill();
        c.addChildAt(monitorGlow, 0); // behind everything in this container

        // Procedural overlays (only when not using sprite textures)
        if (!Furniture._textures?.desk) {
            // Monitor underglow (state-reactive, updated via setMonitorState)
            this._monitorUnderglow = new PIXI.Graphics();
            this._monitorUnderglow.beginFill(0x00c864, 0.04);
            this._monitorUnderglow.drawRect(-22, -16, 44, 6);
            this._monitorUnderglow.endFill();
            c.addChild(this._monitorUnderglow);

            // LED strip along desk back edge (warm amber by default)
            this._deskLedStrip = new PIXI.Graphics();
            this._deskLedStrip.beginFill(0xE8A04C, 0.2);
            this._deskLedStrip.drawRect(-38, -12, 76, 2);
            this._deskLedStrip.endFill();
            c.addChild(this._deskLedStrip);

            // State-reactive screen overlay (sits on top of static screen, under scan line)
            this._deskScreenOverlay = new PIXI.Graphics();
            this._drawMonitorContent(this._deskScreenOverlay, 'RELAXED');
            c.addChild(this._deskScreenOverlay);

            // Animated scan line (separate Graphics, animated in update())
            const scanLine = new PIXI.Graphics();
            scanLine.beginFill(0x00ff41, 0.28);
            scanLine.drawRect(-14, 0, 30, 2);
            scanLine.endFill();
            scanLine.y = -43;
            c.addChild(scanLine);
            this._deskScanLine = scanLine;
        }

        this._placeItem(c, gx, gy, 'desk_computer', true, 'code');
    }

    _addTerminal(gx, gy) {
        const c = new PIXI.Container();

        if (Furniture._textures?.laptop) {
            const sprite = new PIXI.Sprite(Furniture._textures.laptop);
            sprite.anchor.set(0.5, 0.88);
            sprite.scale.set(0.50);
            c.addChild(sprite);
        } else {
            const g = new PIXI.Graphics();

            g.beginFill(0xC8C0B4);
            g.drawRect(-20, 0, 40, 16);
            g.endFill();
            g.beginFill(0xE8E0D4);
            g.drawRect(-18, -34, 36, 36);
            g.endFill();
            g.beginFill(0x1E2D3D);
            g.drawRect(-16, -32, 32, 32);
            g.endFill();
            // Static text lines
            g.lineStyle(1, 0x00ff41, 0.3);
            g.moveTo(-13, -28); g.lineTo(0, -28);
            g.moveTo(-13, -23); g.lineTo(6, -23);

            c.addChild(g);
        }

        // Blinking cursor (separate Graphics, toggled in update())
        const cursor = new PIXI.Graphics();
        cursor.beginFill(0x00ff41, 0.9);
        cursor.drawRect(-13, -16, 8, 3);
        cursor.endFill();
        c.addChild(cursor);
        this._termCursor = cursor;

        this._placeItem(c, gx, gy, 'desk_terminal', true, 'terminal');
    }

    _addSecondMonitor(gx, gy) {
        const c = new PIXI.Container();

        if (Furniture._textures?.televisionModern) {
            const sprite = new PIXI.Sprite(Furniture._textures.televisionModern);
            sprite.anchor.set(0.5, 0.88);
            sprite.scale.set(0.50);
            c.addChild(sprite);
        } else {
            const g = new PIXI.Graphics();

            g.beginFill(0xE8E0D4);
            g.drawRect(-30, -50, 60, 40);
            g.endFill();
            // Bezel border
            g.lineStyle(2, 0xD4CCC0, 1);
            g.drawRect(-30, -50, 60, 40);
            g.lineStyle(0);
            g.beginFill(0xE8E0D4);
            g.drawRect(-27, -47, 54, 34);
            g.endFill();
            g.beginFill(0x1E2D3D);
            g.drawRect(-25, -45, 50, 30);
            g.endFill();
            // Scanline effect
            g.beginFill(0x000000, 0.05);
            for (let sy = -45; sy < -15; sy += 2) {
                g.drawRect(-25, sy, 50, 1);
            }
            g.endFill();
            // Browser tabs
            g.beginFill(0x2A3A4A);
            g.drawRect(-25, -45, 16, 6);
            g.endFill();
            g.beginFill(0x1E2D3D);
            g.drawRect(-8, -45, 16, 6);
            g.endFill();
            // Power LED on bottom bezel
            g.beginFill(0x50D890, 0.5);
            g.drawCircle(0, -11, 1);
            g.endFill();
            // Stand
            g.beginFill(0xC8C0B4);
            g.drawRect(-4, -10, 8, 12);
            g.endFill();
            g.drawRect(-10, 2, 20, 4);

            c.addChild(g);
        }

        this._placeItem(c, gx, gy, 'second_monitor', true, 'browser');
    }

    _addWhiteboard(gx, gy) {
        const c = new PIXI.Container();

        if (Furniture._textures?.bookcase) {
            const sprite = new PIXI.Sprite(Furniture._textures.bookcase);
            sprite.anchor.set(0.5, 0.92);
            sprite.scale.set(0.55);
            c.addChild(sprite);
        } else {
            const g = new PIXI.Graphics();

            g.beginFill(0xA0845C);
            g.drawRect(-35, -65, 70, 58);
            g.endFill();
            g.beginFill(0xF5F0E8);
            g.drawRect(-32, -62, 64, 52);
            g.endFill();
            // Brainstorm lines in state colors
            g.lineStyle(2, 0x8000ff, 0.2);
            g.moveTo(-26, -56); g.lineTo(4, -56);
            g.lineStyle(2, 0x334466, 0.8);
            g.moveTo(-26, -50); g.lineTo(10, -50);
            g.moveTo(-26, -42); g.lineTo(20, -42);
            g.moveTo(-26, -34); g.lineTo(5, -34);
            g.lineStyle(2, 0x0096ff, 0.2);
            g.moveTo(-26, -28); g.lineTo(12, -28);
            g.lineStyle(1.5, 0xcc3333, 0.35);
            g.drawRect(-10, -44, 20, 16);
            // Sticky notes
            g.lineStyle(0);
            g.beginFill(0x00c864, 0.25);
            g.drawRect(14, -56, 6, 6);
            g.endFill();
            g.beginFill(0xffd700, 0.25);
            g.drawRect(6, -24, 6, 6);
            g.endFill();
            g.beginFill(0xff5050, 0.25);
            g.drawRect(18, -38, 6, 6);
            g.endFill();
            g.lineStyle(0);
            g.beginFill(0xA0845C);
            g.drawRect(-32, -10, 64, 6);
            g.endFill();

            c.addChild(g);
        }

        this._placeItem(c, gx, gy, 'whiteboard', true, 'notes');
    }

    // phone is tiny, no need for a container wrapper
    _addPhone(gx, gy) {
        const c = new PIXI.Container();

        if (Furniture._textures?.radio) {
            const sprite = new PIXI.Sprite(Furniture._textures.radio);
            sprite.anchor.set(0.5, 0.88);
            sprite.scale.set(0.38);
            c.addChild(sprite);
        } else {
            const g = new PIXI.Graphics();
            g.beginFill(0xE8E0D4);
            g.drawRoundedRect(-8, -18, 16, 28, 3);
            g.endFill();
            g.beginFill(0x1E2D3D);
            g.drawRoundedRect(-6, -16, 12, 22, 2);
            g.endFill();
            g.beginFill(0xff5050);
            g.drawCircle(4, -14, 3);
            g.endFill();
            g.lineStyle(1, 0xC8C0B4);
            g.drawCircle(0, 10, 3);
            c.addChild(g);
        }

        this._placeItem(c, gx, gy, 'phone', true, 'chat');
    }

    _addCoffeeMachine(gx, gy) {
        const c = new PIXI.Container();

        if (Furniture._textures?.coffee) {
            const sprite = new PIXI.Sprite(Furniture._textures.coffee);
            sprite.anchor.set(0.5, 0.88);
            sprite.scale.set(0.50);
            c.addChild(sprite);
        } else {
            const g = new PIXI.Graphics();

            g.beginFill(0xD4C5A9);
            g.drawRoundedRect(-16, -40, 32, 52, 4);
            g.endFill();
            g.beginFill(0xC4B599);
            g.drawRoundedRect(-13, -38, 26, 20, 3);
            g.endFill();
            g.beginFill(0xC85A4A, 0.9);
            g.drawRoundedRect(-10, -52, 20, 16, 3);
            g.endFill();
            // Cup
            g.beginFill(0xffffff);
            g.drawRect(-7, 8, 14, 14);
            g.endFill();
            g.beginFill(0x3a1a00);
            g.drawRect(-5, 10, 10, 10);
            g.endFill();
            // LED
            g.beginFill(0xC85A4A);
            g.drawCircle(0, -10, 4);
            g.endFill();

            c.addChild(g);
        }

        // Warm LED glow on the floor beneath
        const coffeeGlow = new PIXI.Graphics();
        coffeeGlow.beginFill(0xC85A4A, 0.06);
        coffeeGlow.drawEllipse(0, 22, 40, 14);
        coffeeGlow.endFill();
        c.addChildAt(coffeeGlow, 0);

        this._coffeeContainer = c; // track for steam particles
        this._steamStartY = Furniture._textures?.coffee ? -16 : 5;
        this._placeItem(c, gx, gy, 'coffee_machine', true, null);
    }

    _addPlant(gx, gy) {
        const c = new PIXI.Container();

        if (Furniture._textures?.plant) {
            const sprite = new PIXI.Sprite(Furniture._textures.plant);
            sprite.anchor.set(0.5, 0.92);
            sprite.scale.set(0.50);
            c.addChild(sprite);
        } else {
            this._plantGraphics = new PIXI.Graphics();
            this._drawPlantStage(this._plantGraphics, plantStage);
            c.addChild(this._plantGraphics);
        }

        this._placeItem(c, gx, gy, 'plant', false, null);
    }

    _drawPlantStage(g, stage) {
        g.clear();
        g.beginFill(0xC87A4A);
        g.drawRect(-10, 10, 20, 16);
        g.endFill();
        g.beginFill(0xB06A3A);
        g.moveTo(-10, 10); g.lineTo(10, 10); g.lineTo(12, 26); g.lineTo(-12, 26); g.closePath();
        g.endFill();
        g.beginFill(0x6B4A2A);
        g.drawEllipse(0, 10, 10, 4);
        g.endFill();

        if (stage === 0) {
            g.beginFill(0x4A8A3C);
            g.drawRect(-1, 0, 2, 12);
            g.endFill();
            g.beginFill(0x5BA05C);
            g.drawEllipse(-4, 0, 5, 4);
            g.drawEllipse(4, 0, 5, 4);
            g.endFill();
        } else if (stage === 1) {
            g.beginFill(0x4A8A3C);
            g.drawRect(-1, -20, 2, 32);
            g.endFill();
            g.beginFill(0x5BA05C);
            g.drawEllipse(-10, -10, 10, 7);
            g.drawEllipse(10, -15, 10, 7);
            g.drawEllipse(-6, -22, 8, 6);
            g.endFill();
        } else {
            g.beginFill(0x4A8A3C);
            g.drawRect(-1, -40, 2, 52);
            g.endFill();
            g.beginFill(0x5BA05C);
            g.drawEllipse(0, -35, 18, 14);
            g.drawEllipse(-15, -20, 14, 10);
            g.drawEllipse(15, -22, 14, 10);
            g.drawEllipse(-10, -42, 10, 8);
            g.drawEllipse(10, -40, 10, 8);
            g.endFill();
            g.beginFill(0xffaa00);
            g.drawCircle(0, -46, 5);
            g.endFill();
        }
    }

    growPlant() {
        if (plantStage < 2) {
            plantStage++;
            if (this._plantGraphics) this._drawPlantStage(this._plantGraphics, plantStage);
        }
    }

    onInterventionAccepted() {
        this.acceptedInterventions++;
        if (this.acceptedInterventions === 3) this.growPlant();
        if (this.acceptedInterventions === 7) this.growPlant();
    }

    _addSpeaker(gx, gy) {
        const c = new PIXI.Container();

        if (Furniture._textures?.speaker) {
            const sprite = new PIXI.Sprite(Furniture._textures.speaker);
            sprite.anchor.set(0.5, 0.92);
            sprite.scale.set(0.42);
            c.addChild(sprite);
        } else {
            const g = new PIXI.Graphics();

            g.beginFill(0x5C4E3C);
            g.drawRoundedRect(-10, -24, 20, 36, 3);
            g.endFill();
            g.beginFill(0x4A3E30);
            g.drawCircle(0, -8, 8);
            g.endFill();
            g.beginFill(0x3A3228);
            g.drawCircle(0, -8, 4);
            g.endFill();

            c.addChild(g);
        }

        // Pulsing power LED
        const ledY = Furniture._textures?.speaker ? 2 : 8;
        this._speakerLED = new PIXI.Graphics();
        this._speakerLED.beginFill(0x50D890);
        this._speakerLED.drawCircle(0, ledY, 2);
        this._speakerLED.endFill();
        c.addChild(this._speakerLED);

        this._placeItem(c, gx, gy, 'speaker', true, null);
    }

    _addChair(gx, gy) {
        const c = new PIXI.Container();

        if (Furniture._textures?.chair) {
            const sprite = new PIXI.Sprite(Furniture._textures.chair);
            sprite.anchor.set(0.5, 0.90);
            sprite.scale.set(0.50);
            c.addChild(sprite);
        } else {
            const g = new PIXI.Graphics();

            // Seat
            g.beginFill(0x4A7A8C);
            g.drawRect(-16, -6, 32, 20);
            g.endFill();
            // Chair back
            g.beginFill(0x4A7A8C);
            g.drawRect(-14, -28, 28, 24);
            g.endFill();
            // Amber accent stripe down center (gaming chair style)
            g.lineStyle(1, 0xE8A04C, 0.6);
            g.moveTo(0, -26); g.lineTo(0, -6);
            // Horizontal support line
            g.lineStyle(1, 0x3A6A7C, 0.8);
            g.moveTo(-12, -16); g.lineTo(12, -16);
            // Headrest
            g.lineStyle(0);
            g.beginFill(0x5A8A9C);
            g.drawRoundedRect(-10, -34, 20, 8, 2);
            g.endFill();
            // Armrests
            g.beginFill(0x3A6A7C);
            g.drawRect(-20, -10, 6, 4);
            g.drawRect(14, -10, 6, 4);
            g.endFill();
            // Legs
            g.beginFill(0x3A6A7C);
            g.drawRect(-14, 14, 6, 16);
            g.drawRect(8, 14, 6, 16);
            g.endFill();
            // Wheels
            g.beginFill(0x5A8A9C);
            g.drawCircle(-11, 30, 4);
            g.drawCircle(11, 30, 4);
            g.endFill();

            c.addChild(g);
        }

        this._placeItem(c, gx, gy, 'chair', false, null);
    }

    _addDoor(gx, gy) {
        const c = new PIXI.Container();
        const g = new PIXI.Graphics();

        // Door panel on left wall -- isometric rectangle matching wall angle
        // The left wall face runs from top-right to bottom-left with a leftward slant
        const doorW = 40;
        const doorH = 60;
        const slant = (16 / 32) * doorW; // TILE_HEIGHT/TILE_WIDTH ratio for wall angle

        // Door frame (warm wood)
        g.lineStyle(2, 0xA0845C, 0.9);
        g.moveTo(0, 0);
        g.lineTo(-doorW / 2, slant / 2);
        g.lineTo(-doorW / 2, slant / 2 - doorH);
        g.lineTo(0, -doorH);
        g.closePath();

        // Door fill (dark wood)
        g.lineStyle(0);
        g.beginFill(0x6B5B3E);
        g.moveTo(0, 0);
        g.lineTo(-doorW / 2, slant / 2);
        g.lineTo(-doorW / 2, slant / 2 - doorH);
        g.lineTo(0, -doorH);
        g.closePath();
        g.endFill();

        // Inner panel detail
        g.lineStyle(1, 0x8B7348, 0.5);
        g.moveTo(-2, -4);
        g.lineTo(-doorW / 2 + 3, slant / 2 - 4 + 1.5);
        g.lineTo(-doorW / 2 + 3, slant / 2 - doorH + 6 + 1.5);
        g.lineTo(-2, -doorH + 6);
        g.closePath();

        c.addChild(g);

        // Door handle (warm amber/gold circle) -- on the right side of the door face
        this._doorHandleGlow = new PIXI.Graphics();
        this._doorHandleGlow.beginFill(0xE8A04C);
        this._doorHandleGlow.drawCircle(-4, -doorH / 2 + 4, 3);
        this._doorHandleGlow.endFill();
        this._doorHandleGlow.alpha = 0.5;
        c.addChild(this._doorHandleGlow);

        // "EXIT" label
        const label = new PIXI.Text('EXIT', {
            fontFamily: 'monospace',
            fontSize: 9,
            fill: 0xffffff,
        });
        label.alpha = 0.4;
        label.anchor.set(0.5, 0);
        label.x = -doorW / 4;
        label.y = 6;
        c.addChild(label);

        this._placeItem(c, gx, gy, 'door', true, null);
    }


    _setLedStripColor(color) {
        if (!this._deskLedStrip) return;
        this._deskLedStrip.clear();
        this._deskLedStrip.beginFill(color, 0.2);
        this._deskLedStrip.drawRect(-38, -12, 76, 2);
        this._deskLedStrip.endFill();
    }

    _placeItem(container, gx, gy, name, interactive, appType) {
        const { x, y } = this.room.getTileCenter(gx, gy);
        container.x = x;
        container.y = y;

        if (interactive) {
            container.interactive = true;
            container.cursor = 'pointer';
            container.on('pointerdown', () => this.emit('interact', name));
        }

        this.container.addChild(container);
        this._items.push({ name, container, gridX: gx, gridY: gy, interactive, appType });
    }

    // Returns true if a world position (in grid units) is blocked by furniture
    isBlocked(gx, gy) {
        return this._items.some(item => {
            // Chair and phone don't block (walkable -- chair is at desk, phone is on desk surface)
            if (item.name === 'chair' || item.name === 'phone') return false;
            return Math.abs(item.gridX - gx) < 0.65 && Math.abs(item.gridY - gy) < 0.65;
        });
    }

    attachToWorld(worldContainer) {
        this._items.forEach(item => {
            item.container.parent?.removeChild(item.container);
            worldContainer.addChild(item.container);
        });
    }

    _spawnSteam() {
        if (!this._coffeeContainer) return;
        const g = new PIXI.Graphics();
        const r = 1.5 + Math.random() * 2;
        g.beginFill(0xb0b8cc, 0.3);
        g.drawCircle(0, 0, r);
        g.endFill();
        const p = {
            gfx: g,
            x: (Math.random() - 0.5) * 6,
            y: this._steamStartY ?? 5,
            vy: -(0.25 + Math.random() * 0.25),
            vx: (Math.random() - 0.5) * 0.12,
            alpha: 0.4,
        };
        g.x = p.x; g.y = p.y;
        this._coffeeContainer.addChild(g);
        this._steamParticles.push(p);
    }

    update(delta) {
        this._animTick += delta;

        // scan line scrolls down the screen
        if (this._deskScanLine) {
            this._deskScanLine.y += 0.5 * delta;
            if (this._deskScanLine.y > -20) this._deskScanLine.y = -43;
        }

        // cursor blink
        if (this._termCursor) {
            this._termCursor.visible = Math.floor(this._animTick / 30) % 2 === 0;
        }

        // steam
        this._coffeeSpawnAccum += delta;
        if (this._coffeeSpawnAccum > 18 + Math.random() * 10) {
            this._spawnSteam();
            this._coffeeSpawnAccum = 0;
        }

        // speaker LED pulse
        if (this._speakerLED) {
            this._speakerLED.alpha = 0.2 + Math.sin(Date.now() / 1000) * 0.2 + 0.2;
        }

        // door handle glow pulse (2s period, alpha 0.3–0.7)
        if (this._doorHandleGlow) {
            this._doorHandleGlow.alpha = 0.5 + Math.sin(Date.now() / 318.3) * 0.2; // 318.3 ≈ 1000/π for 2s period
        }

        // LED strip -- flash red every ~30s when in RELAXED state
        if (this._deskLedStrip) {
            if (this._currentState === 'RELAXED') {
                this._ledFlashTimer += delta;
                if (!this._ledFlashing && this._ledFlashTimer >= 1800) {
                    this._ledFlashing = true;
                    this._ledFlashTimer = 0;
                    this._setLedStripColor(0xff0000);
                } else if (this._ledFlashing && this._ledFlashTimer >= 30) {
                    this._ledFlashing = false;
                    this._ledFlashTimer = 0;
                    this._setLedStripColor(0xE8A04C);
                }
            } else {
                this._ledFlashTimer = 0;
                this._ledFlashing = false;
            }
        }

        // update steam particles
        for (let i = this._steamParticles.length - 1; i >= 0; i--) {
            const p = this._steamParticles[i];
            p.x   += p.vx * delta;
            p.y   += p.vy * delta;
            p.alpha -= 0.005 * delta;
            p.gfx.x = p.x;
            p.gfx.y = p.y;
            p.gfx.alpha = p.alpha;
            if (p.alpha <= 0) {
                p.gfx.parent?.removeChild(p.gfx);
                p.gfx.destroy();
                this._steamParticles.splice(i, 1);
            }
        }
    }

    updateHighlights(playerGX, playerGY) {
        const INTERACT_RADIUS = 2;
        const pulse = 0.35 + Math.sin(Date.now() / 280) * 0.35; // 0..0.7

        this._items.forEach(item => {
            if (!item.interactive) return;
            const dist = Math.abs(item.gridX - playerGX) + Math.abs(item.gridY - playerGY);
            const on = dist <= INTERACT_RADIUS;
            this._applyHighlight(item.container, on, pulse);
        });
    }

    _applyHighlight(container, on, pulse = 1) {
        container.tint = on ? HIGHLIGHT_COLOR : 0xffffff;

        // Create ring graphic lazily
        if (on && !container._hlRing) {
            const ring = new PIXI.Graphics();
            container._hlRing = ring;
            container.addChildAt(ring, 0); // behind all children
        }
        if (!container._hlRing) return;

        container._hlRing.visible = on;
        if (on) {
            // Redraw ring each frame with pulsing alpha
            container._hlRing.clear();
            container._hlRing.lineStyle(2, HIGHLIGHT_COLOR, pulse);
            container._hlRing.drawEllipse(0, 15, 28, 10);
        }
    }

    // monitor content changes per state
    _drawMonitorContent(g, state) {
        g.clear();
        const S = {
            DEEP_FOCUS: { bg: 0x000820, line: 0x4488ff, alpha: 0.55, rows: 6 },
            STRESSED:   { bg: 0x1a0000, line: 0xff4444, alpha: 0.5,  rows: 4 },
            FATIGUED:   { bg: 0x0a0800, line: 0x886622, alpha: 0.3,  rows: 3 },
            RELAXED:    { bg: 0x1E2D3D, line: 0x00ff41, alpha: 0.4,  rows: 5 },
            WIRED:      { bg: 0x00061a, line: 0x00ccff, alpha: 0.6,  rows: 7 },
        };
        const cfg = S[state] || S.RELAXED;
        // Screen background
        g.beginFill(cfg.bg);
        g.drawRect(-16, -43, 32, 23);
        g.endFill();
        // Code lines
        const widths = [20, 12, 26, 8, 18, 24, 10, 14];
        g.lineStyle(1, cfg.line, cfg.alpha);
        for (let i = 0; i < cfg.rows; i++) {
            const y = -40 + i * 3;
            const w = widths[i % widths.length];
            g.moveTo(-14, y); g.lineTo(-14 + w, y);
        }
        // STRESSED: red error indicator in top-right corner
        if (state === 'STRESSED') {
            g.lineStyle(0);
            g.beginFill(0xff2222);
            g.drawCircle(10, -38, 2);
            g.endFill();
        }
        // WIRED: extra dense flickery lines
        if (state === 'WIRED') {
            g.lineStyle(1, cfg.line, 0.22);
            for (let i = 0; i < 4; i++) {
                g.moveTo(-14, -42 + i * 2); g.lineTo(6 + i * 2, -42 + i * 2);
            }
        }
        // Scanline effect (persists across state changes)
        g.lineStyle(0);
        g.beginFill(0x000000, 0.05);
        for (let sy = -43; sy < -20; sy += 2) {
            g.drawRect(-16, sy, 32, 1);
        }
        g.endFill();
    }

    setMonitorState(state) {
        this._currentState = state;
        if (this._deskScreenOverlay) this._drawMonitorContent(this._deskScreenOverlay, state);
        const colors = { DEEP_FOCUS: 0x8000ff, STRESSED: 0xff5050, FATIGUED: 0xffa000, RELAXED: 0x00c864, WIRED: 0x0096ff };
        const c = colors[state] || 0x00c864;
        if (this._monitorUnderglow) {
            this._monitorUnderglow.clear();
            this._monitorUnderglow.beginFill(c, 0.04);
            this._monitorUnderglow.drawRect(-22, -16, 44, 6);
            this._monitorUnderglow.endFill();
        }
        if (this._deskLedStrip && !this._ledFlashing) {
            this._setLedStripColor(c);
        }
    }

    // Returns name of nearest interactable within range, or null
    getNearbyInteractable(playerGX, playerGY) {
        const INTERACT_RADIUS = 2;
        let nearest = null;
        let nearestDist = Infinity;
        this._items.forEach(item => {
            if (!item.interactive) return;
            const dist = Math.abs(item.gridX - playerGX) + Math.abs(item.gridY - playerGY);
            if (dist <= INTERACT_RADIUS && dist < nearestDist) {
                nearestDist = dist;
                nearest = item.name;
            }
        });
        return nearest;
    }
}
