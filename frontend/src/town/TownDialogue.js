import * as PIXI from 'pixi.js';

// Ambient dialogue lines, grouped by proximity
const LINES = {
    HOME: [
        "Home sweet home. Your recovery score lives in there.",
        "Should we go back inside? I miss the monitors.",
    ],
    CAFE: [
        "I can smell the coffee from here... wait, can ghosts smell?",
        "A coffee break would boost your recovery by 12%. Probably.",
    ],
    COWORK: [
        "Other developers in there. They don't have ghost assistants though.",
        "Want to cowork? I promise I won't read their screens.",
    ],
    PARK: [
        "Fresh air is good for HRV. That's science.",
        "Nature walk detected. Stress levels dropping.",
        "Touch grass, as they say.",
    ],
    GENERAL: [
        "Nice night for a walk.",
        "Your heart rate is steady. Keep moving.",
        "I like it out here. Less screen glare.",
        "Did you know walking improves code quality by 23%? I made that up.",
        "The stars are procedurally generated, just like me.",
    ],
};

// Building center grid positions (matching Town.js layout)
const BUILDINGS = [
    { name: 'HOME',   gx: 5,  gy: 5  },
    { name: 'CAFE',   gx: 16, gy: 5  },
    { name: 'COWORK', gx: 5,  gy: 16 },
    { name: 'PARK',   gx: 16, gy: 16 },
];

const PROXIMITY_PX = 150;
const BUBBLE_OFFSET_Y = -50;
const BUBBLE_MAX_WIDTH = 200;
const FADE_IN_MS = 200;
const FADE_OUT_MS = 500;
const FLOAT_UP_PX = 5;

export class TownDialogue {
    constructor(container) {
        this._container = container;
        this._bubbles = [];        // active bubble objects
        this._ambientTimer = null;
        this._getPlayerPos = null;
        this._getGhostPos = null;
        this._stateColor = 0xe94560; // default accent, can be updated
    }

    // ─────────────────────────────────────────────
    //  Public API
    // ─────────────────────────────────────────────

    say(text, duration = 3000) {
        const ghostPos = this._getGhostPos ? this._getGhostPos() : { x: 0, y: 0 };
        this._createBubble(text, ghostPos, duration);
    }

    startAmbient(getPlayerPos, getGhostPos) {
        this._getPlayerPos = getPlayerPos;
        this._getGhostPos = getGhostPos;
        this._scheduleNextAmbient();
    }

    stopAmbient() {
        if (this._ambientTimer !== null) {
            clearTimeout(this._ambientTimer);
            this._ambientTimer = null;
        }
    }

    update(delta) {
        const now = performance.now();

        for (let i = this._bubbles.length - 1; i >= 0; i--) {
            const b = this._bubbles[i];

            // Follow ghost position
            if (this._getGhostPos) {
                const pos = this._getGhostPos();
                b.root.x = pos.x;
                b.root.y = pos.y + BUBBLE_OFFSET_Y;
            }

            const elapsed = now - b.startTime;

            if (elapsed < FADE_IN_MS) {
                // Fade in
                b.root.alpha = elapsed / FADE_IN_MS;
            } else if (elapsed < FADE_IN_MS + b.duration) {
                // Visible
                b.root.alpha = 1;
            } else {
                // Fade out + float up
                const fadeElapsed = elapsed - FADE_IN_MS - b.duration;
                const fadeProgress = Math.min(fadeElapsed / FADE_OUT_MS, 1);
                b.root.alpha = 1 - fadeProgress;
                b.root.y = (this._getGhostPos ? this._getGhostPos().y : b.originY) + BUBBLE_OFFSET_Y - fadeProgress * FLOAT_UP_PX;

                if (fadeProgress >= 1) {
                    this._removeBubble(i);
                }
            }
        }
    }

    destroy() {
        this.stopAmbient();
        // Remove all active bubbles
        for (let i = this._bubbles.length - 1; i >= 0; i--) {
            this._removeBubble(i);
        }
        this._getPlayerPos = null;
        this._getGhostPos = null;
    }

    // ─────────────────────────────────────────────
    //  Bubble creation
    // ─────────────────────────────────────────────

    _createBubble(text, ghostPos, duration) {
        // Remove any existing bubble so they don't pile up
        for (let i = this._bubbles.length - 1; i >= 0; i--) {
            this._removeBubble(i);
        }

        const root = new PIXI.Container();
        root.x = ghostPos.x;
        root.y = ghostPos.y + BUBBLE_OFFSET_Y;
        root.alpha = 0;

        // Text
        const label = new PIXI.Text(text, {
            fontFamily: 'monospace',
            fontSize: 13,
            fill: 0xe0e0e0,
            wordWrap: true,
            wordWrapWidth: BUBBLE_MAX_WIDTH - 16, // padding
        });
        label.anchor.set(0.5, 1);

        // Measure for background sizing
        const textW = Math.min(label.width, BUBBLE_MAX_WIDTH - 16);
        const textH = label.height;
        const padX = 8;
        const padY = 6;
        const bgW = textW + padX * 2;
        const bgH = textH + padY * 2;
        const pointerH = 6;

        // Background rounded rect + pointer triangle
        const bg = new PIXI.Graphics();
        const borderColor = this._stateColor;

        // Fill
        bg.beginFill(0x1a1a2e, 0.85);
        bg.drawRoundedRect(-bgW / 2, -bgH, bgW, bgH, 6);
        bg.endFill();

        // Border
        bg.lineStyle(1, borderColor, 0.3);
        bg.drawRoundedRect(-bgW / 2, -bgH, bgW, bgH, 6);

        // Triangle pointer at bottom center
        bg.lineStyle(0);
        bg.beginFill(0x1a1a2e, 0.85);
        bg.moveTo(-5, 0);
        bg.lineTo(0, pointerH);
        bg.lineTo(5, 0);
        bg.closePath();
        bg.endFill();

        // Pointer border edges
        bg.lineStyle(1, borderColor, 0.3);
        bg.moveTo(-5, 0);
        bg.lineTo(0, pointerH);
        bg.lineTo(5, 0);

        // Position text centered above pointer
        label.x = 0;
        label.y = -padY;

        root.addChild(bg);
        root.addChild(label);

        this._container.addChild(root);

        this._bubbles.push({
            root,
            startTime: performance.now(),
            duration,
            originY: ghostPos.y,
        });
    }

    _removeBubble(index) {
        const b = this._bubbles[index];
        if (b.root.parent) {
            b.root.parent.removeChild(b.root);
        }
        b.root.destroy({ children: true });
        this._bubbles.splice(index, 1);
    }

    // ─────────────────────────────────────────────
    //  Ambient line selection
    // ─────────────────────────────────────────────

    _scheduleNextAmbient() {
        const delay = 15000 + Math.random() * 10000; // 15-25 seconds
        this._ambientTimer = setTimeout(() => {
            this._sayAmbientLine();
            this._scheduleNextAmbient();
        }, delay);
    }

    _sayAmbientLine() {
        if (!this._getPlayerPos || !this._getGhostPos) return;

        const playerPos = this._getPlayerPos();
        const nearbyBuilding = this._findNearbyBuilding(playerPos);
        const pool = nearbyBuilding ? LINES[nearbyBuilding] : LINES.GENERAL;
        const line = pool[Math.floor(Math.random() * pool.length)];

        this.say(line);
    }

    _findNearbyBuilding(playerPos) {
        // Building centers in screen space — use the same isometric formula as Town.js
        // cartToIso: x = (gx-gy)*32, y = (gx+gy)*16
        // Then offset by viewport center / zoom and grid offset
        // Since playerPos is in the same coordinate space (container-local),
        // we compare using cartToIso directly, matching Town._gridToScreen
        for (const b of BUILDINGS) {
            const isoX = (b.gx - b.gy) * 32; // TILE_WIDTH/2
            const isoY = (b.gx + b.gy) * 16;  // TILE_HEIGHT/2

            // Player position relative to the same container origin
            // We need raw iso coords since both player and buildings live in the same container
            // The viewport offset cancels out when computing distance, so just use raw iso
            const dx = playerPos.x - isoX;
            const dy = playerPos.y - isoY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < PROXIMITY_PX) return b.name;
        }
        return null;
    }

    setStateColor(color) {
        this._stateColor = color;
    }
}
