// bootstrap + game orchestration. module map:
// game/socketHandlers.js -- WS message -> UI wiring
// game/keyboard.js       -- global keyboard shortcuts
// game/scenes.js         -- room/town/cafe/cowork scene graph
// game/blePairing.js     -- WHOOP Web Bluetooth pairing
// game/applyFixFlow.js   -- apply-fix preview/confirm/rollback flow
// this file -- PIXI app, world containers, in-room interactions, game loop ticker

import * as PIXI from 'pixi.js';
import { i18n } from './i18n/index.js';
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
import { PythonRunner } from './apps/runners/PythonRunner.js';
import { TerminalApp } from './apps/Terminal.js';
import { BrowserApp } from './apps/Browser.js';
import { NotesApp } from './apps/Notes.js';
import { ChatApp } from './apps/Chat.js';
import { SpotifyApp } from './apps/SpotifyApp.js';
import { MainMenu } from './menu/MainMenu.js';
import { SoundManager } from './audio/SoundManager.js';
import { DemoMode } from './demo/DemoMode.js';
import { ToastSystem } from './hud/ToastSystem.js';
import { ShortcutsOverlay } from './hud/ShortcutsOverlay.js';
import { SettingsMenu } from './menu/SettingsMenu.js';
import { KeystrokeCapture } from './network/KeystrokeCapture.js';
import { CONFIG } from './config.js';
import { initSession } from './network/session.js';
import { OfflineBiometrics } from './network/offlineBiometrics.js';
import { Spotify } from './network/Spotify.js';
import { wireSocketHandlers } from './game/socketHandlers.js';
import { wireKeyboard } from './game/keyboard.js';
import { setupScenes } from './game/scenes.js';
import { wireBLEPairing } from './game/blePairing.js';
import { createApplyFixHandler } from './game/applyFixFlow.js';

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
let player = null;
let soundManager = null;
let demoMode = null;
let toastSystem = null;

window.addEventListener('resize', () => {
    pixiApp.renderer.resize(window.innerWidth, window.innerHeight);
    if (gameContainer && player) {
        // Snap immediately to player on resize (no lerp lag)
        gameContainer.x = window.innerWidth / 2 - player.container.x * GAME_ZOOM;
        gameContainer.y = window.innerHeight / 2 - player.container.y * GAME_ZOOM;
    }
});

// Sound & Toast (before menu so click-to-resume works on menu buttons)
soundManager = new SoundManager();
document.addEventListener('click', () => soundManager.resume(), { once: true });
toastSystem = new ToastSystem();

const settingsMenu = new SettingsMenu();
let _savedSpotifyVol = 0.5; // remembered across mute/unmute so the SDK volume is restored
settingsMenu.onVolumeChange((vol) => {
    soundManager.setMasterVolume(vol);
    _savedSpotifyVol = vol;
    Spotify.setVolume(vol);
});
settingsMenu.onMuteToggle((muted) => {
    if (muted) { soundManager.mute(); Spotify.setVolume(0); }
    else { soundManager.unmute(); Spotify.setVolume(_savedSpotifyVol); }
});

// Spotify OAuth callback — runs once on load if ?code= is present.
// Fire-and-forget; Spotify.onChange() notifies the settings menu when it lands.
Spotify.completeAuthFromUrl().catch(() => {});

// Main Menu
const mainMenu = new MainMenu(pixiApp);
mainMenu.show(
    () => { soundManager.playClick(); startGame(false); },
    () => { soundManager.playClick(); startGame(true); },
    () => { soundManager.playClick(); settingsMenu.show(); },
    soundManager
);

// Game init (called when menu START or DEMO is clicked)
async function startGame(enableDemo = false) {
    // background-load Pyodide so the desk code editor is ready when opened
    PythonRunner.get().preload().catch(() => {
        // silent — code editor surfaces the error on first Run if pyodide missing
    });

    let activeApp = null;
    let sceneManager = null;
    let town = null;
    let coffeeCount = 0;
    const sceneState = { current: 'room' };

    const socket = new GhostSocket(CONFIG.WS_URL);
    socket.setToastSystem(toastSystem);
    i18n.onChange((lang) => socket.sendLang(lang));
    window.addEventListener('devlife:personality', (e) => socket.sendPersonality(e.detail));

    const keystrokeCapture = new KeystrokeCapture(socket);
    keystrokeCapture.start();

    // client-side biometric demo when there's no backend; the real backend takes over
    // the moment the WS connects (see game/socketHandlers.js).
    const offlineBio = new OfflineBiometrics(socket);
    offlineBio.start();
    const applyMockState = (key) => {
        if (offlineBio.isActive()) offlineBio.setState(key);
        else socket.sendMockState(key);
    };

    const room = new Room(pixiApp.stage);
    const furniture = new Furniture(pixiApp.stage, room);
    player = new Player(pixiApp.stage, room, furniture);
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
    gameContainer.x = Math.round(window.innerWidth / 2 * (1 - GAME_ZOOM));
    gameContainer.y = Math.round(window.innerHeight / 2 * (1 - GAME_ZOOM));

    // [E] prompt above interactable
    const ePrompt = new PIXI.Text('[E]', {
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
    ePrompt.anchor.set(0.5, 1);
    ePrompt.visible = false;
    ePrompt.zIndex = 10000;
    worldContainer.addChild(ePrompt);

    // Link atmosphere to ghost so critical interventions can trigger screen shake
    ghost.setAtmosphere(atmosphere);

    const shortcutsOverlay = new ShortcutsOverlay();
    const hud = new HUD();
    // real "last night" sleep arrives via biometric_update (WHOOP sleep endpoint) — no placeholder
    const dashboard = new DashboardOverlay();
    const demoHotbar = new DemoHotbar();
    demoHotbar.setClickHandler((key) => {
        if (!demoHotbar.manualEnabled) {
            toastSystem.show('warning', '🔒 ' + i18n.t('toast.live_mode_locked_title'), i18n.t('toast.live_mode_locked'), 3000);
            return;
        }
        applyMockState(key);
    });
    // returning to live drops the backend's demo-state lock so real WHOOP resumes immediately
    demoHotbar.setModeHandler((isDemo) => {
        if (!isDemo) socket.resumeLive();
    });

    wireBLEPairing({ socket, hud, demoHotbar, toastSystem, offlineBio });

    // app overlays
    const apps = {
        desk_computer: new CodeEditorApp(socket),
        desk_terminal: new TerminalApp(socket),
        second_monitor: new BrowserApp(socket),
        whiteboard: new NotesApp(socket),
        phone: new ChatApp(socket),
        speaker: new SpotifyApp(socket),
    };

    // wire each app's in-app close button to the FULL game-state reset, so closing via
    // the ✕ never leaves the game locked (pointer-events off / activeApp dangling).
    Object.values(apps).forEach(a => { a.onClose = () => closeAllApps(); });

    function openApp(name) {
        closeAllApps();
        const app = apps[name];
        if (!app) return;
        app.open();
        soundManager.playOpen();
        socket.sendAppFocus(app.appType);
        activeApp = app;
        pixiApp.view.style.pointerEvents = 'none';
        player.sit();
        hud.setVisible(false);
        demoHotbar.hide();
        dashboard.hide();   // the dashboard paints above the app overlay; leaving it up traps both
    }

    function closeAllApps() {
        if (activeApp) soundManager.playClose();
        Object.values(apps).forEach(a => a.close());
        socket.sendAppFocus(null);
        activeApp = null;
        pixiApp.view.style.pointerEvents = 'auto';
        player.stand();
        hud.setVisible(true);
        demoHotbar.show();
    }

    // furniture interactions
    // door -> town transition
    furniture.onDoorInteract = () => {
        if (sceneManager && sceneManager.getCurrentScene() === 'room') {
            town.setSpawnPoint(7, 7);
            sceneState.current = 'town';
            sceneManager.transitionTo('town', { duration: 800 });
        }
    };

    furniture.on('interact', (name) => {
        if (name === 'coffee_machine') {
            coffeeCount++;
            let message, priority, buttons;
            if (coffeeCount < 3) {
                message = i18n.t('ghost.coffee_1');
                priority = 'low';
                buttons = [i18n.t('ghost.btn_thanks')];
                toastSystem.show('info', '☕ ' + i18n.t('toast.caffeine_boost'), i18n.t('toast.caffeine_boost_body'), 4000);
            } else if (coffeeCount === 3) {
                message = i18n.t('ghost.coffee_3');
                priority = 'warning';
                buttons = [i18n.t('ghost.btn_im_fine'), i18n.t('ghost.btn_youre_right')];
                toastSystem.triggerAchievement('coffee_addict');
                toastSystem.show('warning', '☕ ' + i18n.t('toast.overcaffeinated'), i18n.t('toast.overcaffeinated_body'), 4000);
            } else {
                message = i18n.t('ghost.coffee_many', { n: coffeeCount });
                priority = 'warning';
                buttons = [i18n.t('ghost.btn_ok_ok'), i18n.t('ghost.btn_one_more')];
                toastSystem.show('warning', '☕ ' + i18n.t('toast.overcaffeinated'), i18n.t('toast.overcaffeinated_body'), 4000);
            }
            ghost.showSpeechBubble({
                message,
                priority,
                state: ghost._state,
                buttons,
                biometric: {},
            });
            return;
        }
        if (name === 'whiteboard') {
            toastSystem.show('info', '📋 ' + i18n.t('toast.sprint_board'), i18n.t('toast.sprint_board_body'), 4000);
        }
        if (name === 'desk_terminal') {
            toastSystem.show('ghost', '💻 ' + i18n.t('toast.terminal_title'), i18n.t('toast.terminal_body'), 3000);
        }
        if (name === 'speaker') {
            soundManager.resume();   // user gesture unlocks the audio context
            openApp('speaker');      // opens the Spotify embed player overlay
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

    // apply fix handler — goes through preview + backend validation before applying
    ghost.setApplyFixHandler(createApplyFixHandler({ apps, socket, toastSystem }));

    wireSocketHandlers({
        socket, offlineBio, hud, dashboard, demoHotbar, atmosphere,
        ghost, player, furniture, soundManager, toastSystem, apps,
    });

    wireKeyboard({
        getActiveApp: () => activeApp,
        getSceneManager: () => sceneManager,
        demoHotbar, toastSystem, applyMockState,
        shortcutsOverlay, ghost, dashboard, closeAllApps, furniture, player, settingsMenu,
    });

    // game loop
    pixiApp.ticker.add((delta) => {
        if (sceneManager) sceneManager.update(delta);

        if (sceneState.current !== 'room') return;

        player.update(delta);
        ghost.update(delta, player.position);
        atmosphere.update(delta);
        furniture.update(delta);

        // Smooth camera follow - lerp gameContainer toward player centre
        const camTargetX = window.innerWidth / 2 - player.container.x * GAME_ZOOM;
        const camTargetY = window.innerHeight / 2 - player.container.y * GAME_ZOOM;
        const camLerp = 0.07 * delta;
        gameContainer.x += (camTargetX - gameContainer.x) * camLerp;
        gameContainer.y += (camTargetY - gameContainer.y) * camLerp;

        // Screen shake (critical interventions - Fatigue Firewall)
        atmosphere.applyScreenShake(gameContainer);

        // dashboard overlay: feed screen-space positions for rings + particles
        if (dashboard._visible) {
            dashboard.setPositions(
                {
                    x: gameContainer.x + player.container.x * GAME_ZOOM,
                    y: gameContainer.y + player.container.y * GAME_ZOOM,
                },
                {
                    x: gameContainer.x + ghost.container.x * GAME_ZOOM,
                    y: gameContainer.y + ghost.container.y * GAME_ZOOM,
                }
            );
        }

        // z-sorting - higher screen Y = closer to camera
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

    // check if backend is alive
    fetch(CONFIG.BACKEND_URL + '/health').then(r => r.json()).then(d => {
        console.log('[main] backend health:', d.status);
    }).catch(() => {
        console.log('[main] backend unreachable - running in offline/demo mode');
    });

    // fetch the session token for privileged local endpoints (terminal/files/lsp/inline AI)
    initSession().then(d => {
        if (d) console.log('[main] session ready, features:', d.features);
    });

    console.log('[DevLife] Running. WASD=move, E/click=interact, 1-5=state, ESC=close');

    // Demo mode - auto-play cinematic sequence
    if (enableDemo) {
        demoMode = new DemoMode({ socket, ghost, atmosphere, hud, furniture, player });
        demoMode.onCinematicStart = () => { hud.setVisible(false); demoHotbar.hide(); toastSystem.setEnabled(false); };
        demoMode.onCinematicEnd = () => {
            hud.setVisible(true);
            demoHotbar.show();
            toastSystem.setEnabled(true);
        };
        demoMode.start({ loop: true });
        console.log('[DevLife] Demo mode started - looping through all states');
    }

    // Scene Manager (room/town/cafe/cowork) -- see game/scenes.js
    const scenes = setupScenes({ pixiApp, gameContainer, atmosphere, hud, demoHotbar, ghost, sceneState });
    sceneManager = scenes.sceneManager;
    town = scenes.town;
}
