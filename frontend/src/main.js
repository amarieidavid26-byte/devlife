import * as PIXI from 'pixi.js';
import { Howl } from 'howler';
import { GhostSocket } from './network/WebSocket.js';
import { Room } from './room/Room.js';
import { Furniture } from './room/Furniture.js';
import { Atmosphere } from './room/Atmosphere.js';
import { Player } from './character/Player.js';
import { Ghost } from './character/Ghost.js';
import { HUD } from './hud/HUD.js';
import { DashboardOverlay } from './hud/DashboardOverlay.js';
import { DemoHotbar } from './hud/DemoHotbar.js';
import { CodeEditorApp } from './apps/CodeEditor.js';
import { TerminalApp } from './apps/Terminal.js';
import { BrowserApp } from './apps/Browser.js';
import { NotesApp } from './apps/Notes.js';
import { ChatApp } from './apps/Chat.js';
import { WHOOPBluetooth } from './network/WHOOPBluetooth.js';

const pixiApp = new PIXI.Application({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x1a1a2e,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
});
document.body.appendChild(pixiApp.view);
// Set position/offset individually so autoDensity's width/height styles survive
pixiApp.view.style.position = 'fixed';
pixiApp.view.style.top = '0';
pixiApp.view.style.left = '0';

const GAME_ZOOM = 1.5;
let gameContainer = null;

window.addEventListener('resize', () => {
    pixiApp.renderer.resize(window.innerWidth, window.innerHeight);
    if (gameContainer && player) {
        // Snap immediately to player on resize (no lerp lag)
        gameContainer.x = window.innerWidth  / 2 - player.container.x * GAME_ZOOM;
        gameContainer.y = window.innerHeight / 2 - player.container.y * GAME_ZOOM;
    }
});

const socket = new GhostSocket(window.location.hostname === 'localhost' ? 'ws://localhost:8000/ws' : 'wss://devlife-production.up.railway.app/ws');

const room = new Room(pixiApp.stage);
const furniture = new Furniture(pixiApp.stage, room);
const player = new Player(pixiApp.stage, room, furniture);
const ghost = new Ghost(pixiApp.stage);
const atmosphere = new Atmosphere(pixiApp.stage);

// world container for z-sorting
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

// zoom
gameContainer = new PIXI.Container();
pixiApp.stage.removeChild(room.container);
pixiApp.stage.removeChild(worldContainer);
pixiApp.stage.addChildAt(gameContainer, 0); // index 0, before atmosphere.container
gameContainer.addChild(room.container);
gameContainer.addChild(worldContainer);
gameContainer.scale.set(GAME_ZOOM);
gameContainer.x = Math.round(window.innerWidth  / 2 * (1 - GAME_ZOOM));
gameContainer.y = Math.round(window.innerHeight / 2 * (1 - GAME_ZOOM));

// [E] prompt above interactable
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
ePrompt.zIndex = 10000;
worldContainer.addChild(ePrompt);

// Link atmosphere to ghost so critical interventions can trigger screen shake
ghost.setAtmosphere(atmosphere);

const hud = new HUD();
const beneathView = new DashboardOverlay();
const demoHotbar = new DemoHotbar();
demoHotbar.setClickHandler((key) => socket.sendMockState(key));

const whoop = new WHOOPBluetooth();
let bleWasConnected = false;
whoop.onUpdate((bpm, connected) => {
    demoHotbar.setBLEConnected(connected);
    if (connected && bpm > 0) {
        socket.send({ type: 'live_hr', heart_rate: bpm });
    }
    if (connected && !bleWasConnected) {
        socket.send({ type: 'ble_reconnected' });
    } else if (!connected && bleWasConnected) {
        socket.send({ type: 'ble_disconnected' });
    }
    bleWasConnected = connected;
});
window.connectWHOOP = () => whoop.connect();

// app overlays
const apps = {
    desk_computer: new CodeEditorApp(socket),
    desk_terminal: new TerminalApp(socket),
    second_monitor: new BrowserApp(socket),
    whiteboard: new NotesApp(socket),
    phone: new ChatApp(socket),
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

// ambient music
// Drop ambient.mp3/ogg in /public to enable speaker toggle
let ambientSound = new Howl({
    src:         ['/ambient.mp3', '/ambient.ogg'],
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

// furniture interactions
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

// ghost feedback
ghost.setFeedbackHandler((label) => {
    socket.sendFeedback(label);
    if (label === 'Apply Fix' || label === 'I Understand') {
        furniture.onInterventionAccepted();
    }
});

// apply fix handler
ghost.setApplyFixHandler((code) => {
    const editor = apps.desk_computer;
    if (editor && editor.isOpen && code) {
        editor.replaceContent(code);
    }
});

socket.on('connected', () => { hud.setConnected(true); beneathView.setConnected(true); });
socket.on('disconnected', () => { hud.setConnected(false); beneathView.setConnected(false); });

socket.on('intervention',     (data) => {
    ghost.showSpeechBubble(data);
    beneathView.ddIntervention(data);
});

socket.on('biometric_update', (data) => {
    hud.update(data);
    beneathView.update(data);
    if (data.source) demoHotbar.setSource(data.source);
    demoHotbar.setActive(data.state);
    atmosphere.setState(data.state);
    ghost.setStateTint(data.state);
    furniture.setMonitorState(data.state);
});

socket.on('state_change', (data) => {
    demoHotbar.setActive(data.to);
    atmosphere.transition(data.from, data.to);
    ghost.setStateTint(data.to);
    furniture.setMonitorState(data.to);
});

// keyboard
document.addEventListener('keydown', (e) => {
    // 1-5: ALWAYS change mock biometric state, even inside app overlays
    if (e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        socket.sendMockState(parseInt(e.key));
        return;
    }

    // Escape always works (closes apps/bubbles even while typing)
    if (e.key === 'Escape') {
        if (ghost._bubble) { ghost.dismissBubble(true); return; }
        beneathView.hide();
        closeAllApps();
        return;
    }

    // TAB: toggle Beneath the Surface overlay (only when no app is open)
    if (e.key === 'Tab') {
        e.preventDefault();
        if (!activeApp) beneathView.toggle();
        return;
    }

    // Don't capture WASD/E when an app overlay is open — let the app handle them
    if (activeApp) return;

    // Skip game shortcuts while typing in an input field (e.g. HUD search)
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

    if (e.key.toLowerCase() === 'e') {
        const name = furniture.getNearbyInteractable(player.gridX, player.gridY);
        if (name) furniture.emit('interact', name);
    }
});

// game loop
pixiApp.ticker.add((delta) => {
    player.update(delta);
    ghost.update(delta, player.position);
    atmosphere.update(delta);
    furniture.update(delta);

    // Smooth camera follow — lerp gameContainer toward player centre
    const camTargetX = window.innerWidth  / 2 - player.container.x * GAME_ZOOM;
    const camTargetY = window.innerHeight / 2 - player.container.y * GAME_ZOOM;
    const camLerp = 0.07 * delta;
    gameContainer.x += (camTargetX - gameContainer.x) * camLerp;
    gameContainer.y += (camTargetY - gameContainer.y) * camLerp;

    // Screen shake (critical interventions — Fatigue Firewall)
    atmosphere.applyScreenShake(gameContainer);

    // DashboardOverlay is HTML-based, no screen-space position feed needed

    // z-sorting — higher screen Y = closer to camera
    furniture._items.forEach(item => { item.container.zIndex = item.container.y; });
    player.container.zIndex = player.container.y;
    ghost.container.zIndex = player.container.y + 50;

    // [E] prompt
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

    // highlight ring
    furniture.updateHighlights(player.gridX, player.gridY);
});

// splash screen
const splash = document.createElement('div');
splash.style.cssText = [
    'position:fixed;top:0;left:0;width:100vw;height:100vh',
    'background:#1a1a2e;z-index:9999;color:#e0e0e0',
    'display:flex;align-items:center;justify-content:center;flex-direction:column',
    "font-family:'Segoe UI',monospace,sans-serif",
    'transition:opacity 0.8s ease',
].join(';');

// Inject keyframes
const splashStyle = document.createElement('style');
splashStyle.textContent = `
    @keyframes ghostFloat { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-8px) scale(1.08)} }
    @keyframes ecgDraw { from{stroke-dashoffset:520} to{stroke-dashoffset:0} }
    @keyframes subFade { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
`;
document.head.appendChild(splashStyle);

splash.innerHTML = `
    <div style="font-size:54px;animation:ghostFloat 1.8s ease-in-out infinite;margin-bottom:12px;filter:drop-shadow(0 0 18px rgba(128,0,255,0.6))">👻</div>
    <div style="font-weight:800;font-size:26px;letter-spacing:0.18em;color:#ffffff">DEVLIFE</div>
    <svg width="300" height="64" style="margin:18px 0;overflow:visible" viewBox="0 0 300 64">
        <path d="M0,32 L70,32 L80,30 L90,32 L100,8 L106,56 L112,32 L122,22 L132,32 L190,32 L300,32"
              fill="none" stroke="#00c864" stroke-width="2.5"
              stroke-dasharray="520" stroke-dashoffset="520"
              style="animation:ecgDraw 1.1s cubic-bezier(.4,0,.2,1) 0.25s forwards;
                     filter:drop-shadow(0 0 5px #00c864)"/>
    </svg>
    <div id="splash-sub" style="color:#888;font-size:13px;letter-spacing:0.05em;
         animation:subFade 0.6s ease 0.7s both">
        Reading what's beneath the surface…
    </div>
    <div style="margin-top:22px;color:#2e2e48;font-size:11px;letter-spacing:0.08em">
        WASD · E interact · 1-5 states · ESC
    </div>
`;
document.body.appendChild(splash);

// check if backend is alive
fetch(window.location.hostname === 'localhost' ? 'http://localhost:8000/health' : 'https://devlife-production.up.railway.app/health').then(r => r.json()).then(d => {
    console.log('[main] backend health:', d.status);
}).catch(() => {});

// After 1.5s swap sub-text to "Connected", then fade out
setTimeout(() => {
    const sub = document.getElementById('splash-sub');
    if (sub) { sub.style.color = '#00c864'; sub.textContent = '● Connected'; }
}, 1500);
setTimeout(() => {
    splash.style.opacity = '0';
    setTimeout(() => { splash.remove(); splashStyle.remove(); }, 820);
}, 2200);

// console.log("here")
console.log('[DevLife] Running. WASD=move, E/click=interact, 1-5=state, ESC=close');
