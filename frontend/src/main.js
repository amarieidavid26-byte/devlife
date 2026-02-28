import * as PIXI from 'pixi.js';
import { Howl }         from 'howler';
import { GhostSocket }  from './network/WebSocket.js';
import { Room }         from './room/Room.js';
import { Furniture }    from './room/Furniture.js';
import { Atmosphere }   from './room/Atmosphere.js';
import { Player }       from './character/Player.js';
import { Ghost }        from './character/Ghost.js';
import { HUD }          from './hud/HUD.js';
import { CodeEditorApp } from './apps/CodeEditor.js';
import { TerminalApp }  from './apps/Terminal.js';
import { BrowserApp }   from './apps/Browser.js';
import { NotesApp }     from './apps/Notes.js';
import { ChatApp }      from './apps/Chat.js';

// ── PixiJS init ──────────────────────────────────────────────────────────────
const pixiApp = new PIXI.Application({
    width:           window.innerWidth,
    height:          window.innerHeight,
    backgroundColor: 0x1a1a2e,
    antialias:       true,
    resolution:      window.devicePixelRatio || 1,
    autoDensity:     true,
});
document.body.appendChild(pixiApp.view);
// Set position/offset individually so autoDensity's width/height styles survive
pixiApp.view.style.position = 'fixed';
pixiApp.view.style.top      = '0';
pixiApp.view.style.left     = '0';

const GAME_ZOOM     = 1.5;
let   gameContainer = null; // assigned after construction below

window.addEventListener('resize', () => {
    pixiApp.renderer.resize(window.innerWidth, window.innerHeight);
    if (gameContainer && player) {
        // Snap immediately to player on resize (no lerp lag)
        gameContainer.x = window.innerWidth  / 2 - player.container.x * GAME_ZOOM;
        gameContainer.y = window.innerHeight / 2 - player.container.y * GAME_ZOOM;
    }
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
const socket = new GhostSocket('ws://localhost:8000/ws');

// ── Game objects (each adds itself to stage during construction) ──────────────
const room       = new Room(pixiApp.stage);
const furniture  = new Furniture(pixiApp.stage, room);
const player     = new Player(pixiApp.stage, room, furniture); // C2: collision
const ghost      = new Ghost(pixiApp.stage);
const atmosphere = new Atmosphere(pixiApp.stage);

// ── C1: World container for isometric z-sorting ───────────────────────────────
const worldContainer = new PIXI.Container();
worldContainer.sortableChildren = true;

// Remove from stage (room.container stays at index 0)
pixiApp.stage.removeChild(furniture.container);
pixiApp.stage.removeChild(player.container);
pixiApp.stage.removeChild(ghost.container);
pixiApp.stage.removeChild(atmosphere.container);

pixiApp.stage.addChild(worldContainer);       // sorted world objects
pixiApp.stage.addChild(atmosphere.container); // atmosphere overlay always on top

furniture.attachToWorld(worldContainer);
worldContainer.addChild(player.container);
worldContainer.addChild(ghost.container);

// ── Zoom: wrap room + world in a single scaled container ──────────────────────
gameContainer = new PIXI.Container();
pixiApp.stage.removeChild(room.container);
pixiApp.stage.removeChild(worldContainer);
pixiApp.stage.addChildAt(gameContainer, 0); // index 0, before atmosphere.container
gameContainer.addChild(room.container);
gameContainer.addChild(worldContainer);
gameContainer.scale.set(GAME_ZOOM);
gameContainer.x = Math.round(window.innerWidth  / 2 * (1 - GAME_ZOOM));
gameContainer.y = Math.round(window.innerHeight / 2 * (1 - GAME_ZOOM));

// ── C3: [E] prompt above nearby interactable ──────────────────────────────────
const ePrompt = new PIXI.Text('[E]', {
    fontFamily:         'monospace',
    fontSize:           13,
    fill:               0xe94560,
    fontWeight:         'bold',
    dropShadow:         true,
    dropShadowColor:    '#000000',
    dropShadowBlur:     4,
    dropShadowAlpha:    0.6,
    dropShadowDistance: 0,
});
ePrompt.anchor.set(0.5, 1);
ePrompt.visible = false;
ePrompt.zIndex  = 10000;
worldContainer.addChild(ePrompt);

// ── HUD (HTML) ────────────────────────────────────────────────────────────────
const hud = new HUD();

// ── App overlays ──────────────────────────────────────────────────────────────
const apps = {
    desk_computer:  new CodeEditorApp(socket),
    desk_terminal:  new TerminalApp(socket),
    second_monitor: new BrowserApp(socket),
    whiteboard:     new NotesApp(socket),
    phone:          new ChatApp(socket),
};

let activeApp = null;

function openApp(name) {
    closeAllApps();
    const app = apps[name];
    if (!app) return;
    app.open();
    socket.sendAppFocus(app.appType);
    activeApp = app;
    pixiApp.view.style.pointerEvents = 'none';
    player.sit();
}

function closeAllApps() {
    Object.values(apps).forEach(a => a.close());
    socket.sendAppFocus(null);
    activeApp = null;
    pixiApp.view.style.pointerEvents = 'auto';
    player.stand();
}

// ── B2: Ambient music — Howler with onloaderror (not try/catch) ───────────────
// Drop ambient.mp3/ogg in /public to enable speaker toggle
let ambientSound = new Howl({
    src:         ['/ambient.ogg', '/ambient.mp3'],
    loop:        true,
    volume:      0.35,
    html5:       true,
    onloaderror: () => {
        ambientSound = null;
        console.log('[main] No ambient audio file found — speaker will be silent');
    },
});
let musicPlaying = false;

function toggleMusic() {
    if (!ambientSound) return;
    if (musicPlaying) {
        ambientSound.pause();
        musicPlaying = false;
    } else {
        ambientSound.play();
        musicPlaying = true;
    }
}

// ── Furniture interactions ────────────────────────────────────────────────────
furniture.on('interact', (name) => {
    if (name === 'coffee_machine') {
        ghost.showSpeechBubble({
            message:   "Good idea — coffee fuels great code. Don't forget to hydrate too! ☕",
            priority:  'low',
            state:     ghost._state,
            buttons:   ['Thanks!'],
            biometric: {},
        });
        return;
    }
    if (name === 'speaker') {
        toggleMusic();
        ghost.showSpeechBubble({
            message:   musicPlaying ? "Music on. Let the flow state begin. 🎵" : "Music off.",
            priority:  'low',
            state:     ghost._state,
            buttons:   ['Nice'],
            biometric: {},
        });
        return;
    }
    openApp(name);
});

// ── Ghost feedback ────────────────────────────────────────────────────────────
ghost.setFeedbackHandler((label) => {
    socket.sendFeedback(label);
    if (label === 'Apply Fix' || label === 'I Understand') {
        furniture.onInterventionAccepted();
    }
});

// ── WebSocket events ──────────────────────────────────────────────────────────
socket.on('connected',    ()     => hud.setConnected(true));   // V5
socket.on('disconnected', ()     => hud.setConnected(false));  // V5

socket.on('intervention',     (data) => ghost.showSpeechBubble(data));

socket.on('biometric_update', (data) => {
    hud.update(data);
    atmosphere.setState(data.state);
    ghost.setStateTint(data.state);
    furniture.setMonitorState(data.state);
});

socket.on('state_change', (data) => {
    atmosphere.transition(data.from, data.to);
    ghost.setStateTint(data.to);
    furniture.setMonitorState(data.to);
});

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
    // Escape always works (closes apps/bubbles even while typing)
    if (e.key === 'Escape') {
        if (ghost._bubble) { ghost.dismissBubble(true); return; }
        closeAllApps();
        return;
    }

    // Skip game shortcuts while the user is typing inside an app's input/editor
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

    if (e.key.toLowerCase() === 'e') {
        if (activeApp) { closeAllApps(); return; } // E also closes open apps
        const name = furniture.getNearbyInteractable(player.gridX, player.gridY);
        if (name) furniture.emit('interact', name);
    }
    if (['1','2','3','4','5'].includes(e.key)) {
        socket.sendMockState(parseInt(e.key));
    }
});

// ── Game loop ─────────────────────────────────────────────────────────────────
pixiApp.ticker.add((delta) => {
    player.update(delta);
    ghost.update(delta, player.position);
    atmosphere.update(delta);
    furniture.update(delta); // V2 scan + V3 steam

    // Smooth camera follow — lerp gameContainer toward player centre
    const camTargetX = window.innerWidth  / 2 - player.container.x * GAME_ZOOM;
    const camTargetY = window.innerHeight / 2 - player.container.y * GAME_ZOOM;
    const camLerp    = 0.07 * delta;
    gameContainer.x += (camTargetX - gameContainer.x) * camLerp;
    gameContainer.y += (camTargetY - gameContainer.y) * camLerp;

    // C1: Isometric z-sorting — higher screen Y = closer to camera = renders last
    furniture._items.forEach(item => { item.container.zIndex = item.container.y; });
    player.container.zIndex = player.container.y;
    ghost.container.zIndex  = player.container.y + 50;

    // C3: [E] prompt above nearest interactable
    const nearbyName = furniture.getNearbyInteractable(player.gridX, player.gridY);
    const nearbyItem = nearbyName
        ? furniture._items.find(i => i.name === nearbyName)
        : null;
    if (nearbyItem && !activeApp) {
        ePrompt.visible = true;
        ePrompt.x = nearbyItem.container.x;
        ePrompt.y = nearbyItem.container.y - 55 + Math.sin(Date.now() / 280) * 4;
    } else {
        ePrompt.visible = false;
    }

    // V6: Animated highlight ring
    furniture.updateHighlights(player.gridX, player.gridY);
});

// ── Splash screen ─────────────────────────────────────────────────────────────
const splash = document.createElement('div');
splash.style.cssText = `
    position:fixed;top:0;left:0;width:100vw;height:100vh;
    background:#1a1a2e;z-index:9999;color:#e0e0e0;
    display:flex;align-items:center;justify-content:center;flex-direction:column;
    font-family:'Segoe UI',monospace,sans-serif;
    transition:opacity 0.8s ease;
`;
splash.innerHTML = `
    <div style="font-size:48px;margin-bottom:16px">👻</div>
    <div style="font-weight:700;font-size:24px;letter-spacing:0.1em">DEVLIFE</div>
    <div style="color:#555;margin-top:8px;font-size:14px">Ghost is waking up…</div>
    <div style="margin-top:24px;color:#333;font-size:12px">
        WASD · E interact / close · click to interact · 1-5 states · ESC
    </div>
`;
document.body.appendChild(splash);
setTimeout(() => {
    splash.style.opacity = '0';
    setTimeout(() => splash.remove(), 800);
}, 1800);

console.log('[DevLife] Running. WASD=move, E/click=interact, 1-5=state, ESC=close');
