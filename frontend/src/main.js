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
import { MainMenu } from './menu/MainMenu.js';
import { SoundManager } from './audio/SoundManager.js';
import { DemoMode } from './demo/DemoMode.js';
import { ToastSystem } from './hud/ToastSystem.js';
import { SettingsMenu } from './menu/SettingsMenu.js';
import { SceneManager } from './scenes/SceneManager.js';
import { Town } from './town/Town.js';
import { CafeScene } from './town/CafeScene.js';
import { CoworkScene } from './town/CoworkScene.js';
import { WHOOPBluetooth } from './network/WHOOPBluetooth.js';
import { CONFIG } from './config.js';

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
let sceneManager = null;

window.addEventListener('resize', () => {
    pixiApp.renderer.resize(window.innerWidth, window.innerHeight);
    if (gameContainer && player) {
        // Snap immediately to player on resize (no lerp lag)
        gameContainer.x = window.innerWidth  / 2 - player.container.x * GAME_ZOOM;
        gameContainer.y = window.innerHeight / 2 - player.container.y * GAME_ZOOM;
    }
});

// --- Sound & Toast (before menu so click-to-resume works on menu buttons) ---
soundManager = new SoundManager();
document.addEventListener('click', () => soundManager.resume(), { once: true });
toastSystem = new ToastSystem();

const settingsMenu = new SettingsMenu();
settingsMenu.onVolumeChange((vol) => soundManager.setMasterVolume(vol));
settingsMenu.onMuteToggle((muted) => muted ? soundManager.mute() : soundManager.unmute());

// --- Main Menu ---
const mainMenu = new MainMenu(pixiApp);
mainMenu.show(
    () => { soundManager.playClick(); startGame(false); },
    () => { soundManager.playClick(); startGame(true); },
    () => { soundManager.playClick(); settingsMenu.show(); }
);

// --- Game init (called when menu START or DEMO is clicked) ---
async function startGame(enableDemo = false) {
    await Furniture.preloadTextures();

    let socket, room, furniture, ghost, atmosphere, hud, beneathView, demoHotbar, apps, activeApp, ePrompt;
    let currentGameScene = 'room';
    let coffeeCount = 0;
    let lastRecoveryVelocity = null;

    socket = new GhostSocket(CONFIG.WS_URL);

    room = new Room(pixiApp.stage);
    furniture = new Furniture(pixiApp.stage, room);
    player = new Player(pixiApp.stage, room, furniture);
    ghost = new Ghost(pixiApp.stage);
    atmosphere = new Atmosphere(pixiApp.stage);

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
    ePrompt = new PIXI.Text('[E]', {
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

    hud = new HUD();
    hud.setSleepData({ hours: 5.8, efficiency: 72, rem_pct: 18, deep_pct: 14, score: 55 });
    beneathView = new DashboardOverlay();
    demoHotbar = new DemoHotbar();
    demoHotbar.setClickHandler((key) => {
        if (!demoHotbar.manualEnabled) {
            toastSystem.show('warning', '\uD83D\uDD12 Live Mode', 'WHOOP is streaming real data. Manual override disabled.', 3000);
            return;
        }
        socket.sendMockState(key);
    });

    // WHOOP BLE pairing -- connects the PAIR WHOOP button to the Web Bluetooth API
    const whoop = new WHOOPBluetooth();
    window.connectWHOOP = async () => {
        const ok = await whoop.connect();
        if (ok) demoHotbar.setBLEConnected(true);
    };
    whoop.onUpdate((bpm, connected) => {
        demoHotbar.setBLEConnected(connected);
        if (connected && bpm > 0) {
            socket.send({ type: 'heart_rate', bpm });
            hud.update({ heart_rate: bpm });
        }
        if (!connected) {
            toastSystem.show('warning', '\uD83D\uDCF4 WHOOP Disconnected', 'Falling back to demo states. Reconnecting...', 4000);
        }
    });

    // app overlays
    apps = {
        desk_computer: new CodeEditorApp(socket),
        desk_terminal: new TerminalApp(socket),
        second_monitor: new BrowserApp(socket),
        whiteboard: new NotesApp(socket),
        phone: new ChatApp(socket),
    };

    activeApp = null;

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
    }

    function closeAllApps() {
        if (activeApp) soundManager.playClose();
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
            console.log('[main] No ambient audio file found -- speaker will be silent');
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
    // door -> town transition
    furniture.onDoorInteract = () => {
        if (sceneManager && sceneManager.getCurrentScene() === 'room') {
            town.setSpawnPoint(7, 7);
            currentGameScene = 'town';
            sceneManager.transitionTo('town', { duration: 800 });
        }
    };

    // furniture interactions
    furniture.on('interact', (name) => {
        if (name === 'coffee_machine') {
            coffeeCount++;
            let message, priority, buttons;
            if (coffeeCount < 3) {
                message = "Good idea -- coffee fuels great code. Don't forget to hydrate too! ☕";
                priority = 'low';
                buttons = ['Thanks!'];
                toastSystem.show('info', '☕ Caffeine Boost', 'HR +5bpm, Alertness +15%, Recovery -3%', 4000);
            } else if (coffeeCount === 3) {
                message = "That's coffee #3... maybe slow down a bit? Your heart rate doesn't need the help. ☕⚠️";
                priority = 'warning';
                buttons = ['I\'m fine', 'You\'re right'];
                toastSystem.triggerAchievement('coffee_addict');
                toastSystem.show('warning', '☕ Overcaffeinated', 'HR +12bpm, Anxiety +20%, Ghost is judging you', 4000);
            } else {
                message = `Coffee #${coffeeCount}. I'm genuinely worried now. Hydrate. Please. 💀`;
                priority = 'warning';
                buttons = ['Ok ok...', 'One more won\'t hurt'];
                toastSystem.show('warning', '☕ Overcaffeinated', 'HR +12bpm, Anxiety +20%, Ghost is judging you', 4000);
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
            toastSystem.show('info', '📋 Sprint Board', 'Tasks remaining: Ship DevLife, Win ROG Challenge, Sleep (optional)', 4000);
        }
        if (name === 'desk_terminal') {
            toastSystem.show('ghost', '💻 Terminal', 'Ghost is watching your commands...', 3000);
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

    socket.on('intervention', (data) => {
        ghost.showSpeechBubble(data);
        beneathView.ddIntervention(data);
        if (data.priority === 'critical' || data.priority === 'warning') {
            soundManager.playGhostAlert();
        } else {
            soundManager.playGhostSpeak();
        }
        if (data.priority === 'critical') {
            toastSystem.triggerAchievement('firewall_blocked');
        }
    });

    socket.on('biometric_update', (data) => {
        hud.update(data);
        beneathView.update(data);
        demoHotbar.setActive(data.state);
        atmosphere.setState(data.state);
        ghost.setStateTint(data.state);
        furniture.setMonitorState(data.state);
        soundManager.setState(data.state);

        // CQI -- weighted composite of recovery, HRV, and inverse stress
        const recovery = data.recovery || 50;
        const hrv = data.hrv || 40;
        const stress = data.estimated_stress || 0;
        const cqi = Math.round((Math.min(recovery / 100, 1) * 0.4 + Math.min(hrv / 80, 1) * 0.35 + Math.max(0, 1 - stress / 3) * 0.25) * 100);
        hud.updateCQI(cqi);

        // Recovery velocity toast (deduplicated — only fire once per distinct value)
        if (data.recovery_velocity && data.recovery_velocity > 0) {
            if (lastRecoveryVelocity !== data.recovery_velocity) {
                lastRecoveryVelocity = data.recovery_velocity;
                const mins = (data.recovery_velocity / 60).toFixed(1);
                toastSystem.show('info', '💓 Recovery Complete', `HR returned to baseline in ${mins} minutes`, 4000);
            }
        } else {
            lastRecoveryVelocity = null;
        }
    });

    socket.on('state_change', (data) => {
        demoHotbar.setActive(data.to);
        atmosphere.transition(data.from, data.to);
        ghost.setStateTint(data.to);
        furniture.setMonitorState(data.to);
        soundManager.setState(data.to);
        toastSystem.show('state', 'State: ' + data.to, 'Biometric state shifted to ' + data.to);
        if (data.to === 'DEEP_FOCUS') {
            toastSystem.triggerAchievement('first_flow');
        }
    });

    // Plant growth from backend
    socket.on('plant_update', (data) => {
        if (data.delta > 0 && furniture) {
            furniture.onInterventionAccepted();
        }
    });

    // Sleep mode from backend (BLE disconnect / very low HR)
    socket.on('sleep_mode', (data) => {
        if (ghost) {
            ghost.setSleepMode(data.active);
        }
    });

    // keyboard
    document.addEventListener('keydown', (e) => {
        // 1-5: change mock biometric state (disabled when WHOOP BLE is streaming live data)
        if (e.key >= '1' && e.key <= '5') {
            e.preventDefault();
            if (!demoHotbar.manualEnabled) {
                toastSystem.show('warning', '\uD83D\uDD12 Live Mode', 'WHOOP is streaming real data. Manual override disabled.', 3000);
                return;
            }
            socket.sendMockState(parseInt(e.key));
            return;
        }

        // Escape always works (closes apps/bubbles even while typing)
        if (e.key === 'Escape') {
            if (ghost._bubble) { ghost.dismissBubble(true); return; }
            closeAllApps();
            return;
        }

        // TAB: toggle Beneath the Surface overlay (only when no app is open)
        if (e.key === 'Tab') {
            e.preventDefault();
            if (!activeApp) beneathView.toggle();
            return;
        }

        // Don't capture WASD/E when an app overlay is open -- let the app handle them
        if (activeApp) return;

        // Skip game shortcuts while typing in an input field (e.g. HUD search)
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

        if (e.key.toLowerCase() === 't') {
            if (sceneManager) {
                sceneManager.transitionTo(
                    sceneManager.getCurrentScene() === 'room' ? 'town' : 'room',
                    { duration: 800 }
                );
            }
            return;
        }

        if (e.key.toLowerCase() === 'e') {
            const name = furniture.getNearbyInteractable(player.gridX, player.gridY);
            if (name) furniture.emit('interact', name);
        }
    });

    // game loop
    pixiApp.ticker.add((delta) => {
        if (sceneManager) sceneManager.update(delta);

        if (currentGameScene !== 'room') return;

        player.update(delta);
        ghost.update(delta, player.position);
        atmosphere.update(delta);
        furniture.update(delta);

        // Smooth camera follow -- lerp gameContainer toward player centre
        const camTargetX = window.innerWidth  / 2 - player.container.x * GAME_ZOOM;
        const camTargetY = window.innerHeight / 2 - player.container.y * GAME_ZOOM;
        const camLerp = 0.07 * delta;
        gameContainer.x += (camTargetX - gameContainer.x) * camLerp;
        gameContainer.y += (camTargetY - gameContainer.y) * camLerp;

        // Screen shake (critical interventions -- Fatigue Firewall)
        atmosphere.applyScreenShake(gameContainer);

        // Beneath the Surface: feed screen-space positions for rings + particles
        if (beneathView._visible) {
            beneathView.setPositions(
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

        // z-sorting -- higher screen Y = closer to camera
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
        console.log('[main] backend unreachable -- running in offline/demo mode');
    });

    console.log('[DevLife] Running. WASD=move, E/click=interact, 1-5=state, ESC=close');

    // Demo mode -- auto-play cinematic sequence
    if (enableDemo) {
        demoMode = new DemoMode({ socket, ghost, atmosphere, hud, furniture, player });
        demoMode.onCinematicStart = () => {
            hud.setVisible(false);
            demoHotbar.hide();
            toastSystem.setEnabled(false);
        };
        demoMode.onCinematicEnd = () => {
            hud.setVisible(true);
            demoHotbar.show();
            toastSystem.setEnabled(true);
        };
        demoMode.start({ loop: true });
        console.log('[DevLife] Demo mode started -- looping through all states');
    }

    // -- Scene Manager --
    sceneManager = new SceneManager(pixiApp);

    const roomScene = {
        enter() {
            pixiApp.stage.addChild(gameContainer);
            pixiApp.stage.addChild(atmosphere.container);
            if (hud._el) hud._el.style.display = '';
            if (demoHotbar._el) demoHotbar._el.style.display = '';
            currentGameScene = 'room';
        },
        exit() {
            pixiApp.stage.removeChild(gameContainer);
            pixiApp.stage.removeChild(atmosphere.container);
            if (hud._el) hud._el.style.display = 'none';
            if (demoHotbar._el) demoHotbar._el.style.display = 'none';
            currentGameScene = null;
        },
        update(delta) {
            // Room updates happen in the main ticker
        },
    };

    const town = new Town(pixiApp);
    town.onEnterHome = () => {
        sceneManager.transitionTo('room', { duration: 800 });
    };
    town.onEnterCafe = () => {
        currentGameScene = 'cafe';
        sceneManager.transitionTo('cafe', { duration: 800 });
    };
    town.onEnterCowork = () => {
        currentGameScene = 'cowork';
        sceneManager.transitionTo('cowork', { duration: 800 });
    };

    const cafeScene = new CafeScene(pixiApp);
    cafeScene.onGhostSay = (msg) => ghost.showSpeechBubble?.({
        message: msg, priority: 'low', state: ghost._state, buttons: ['Nice'], biometric: {},
    }) || console.log('[ghost]', msg);
    cafeScene.onExit = () => {
        town.setSpawnPoint(16, 7);
        currentGameScene = 'town';
        sceneManager.transitionTo('town', { duration: 800 });
    };

    const coworkScene = new CoworkScene(pixiApp);
    coworkScene.onGhostSay = (msg) => ghost.showSpeechBubble?.({
        message: msg, priority: 'low', state: ghost._state, buttons: ['Nice'], biometric: {},
    }) || console.log('[ghost]', msg);
    coworkScene.onExit = () => {
        town.setSpawnPoint(7, 16);
        currentGameScene = 'town';
        sceneManager.transitionTo('town', { duration: 800 });
    };

    sceneManager.registerScene('room', roomScene);
    sceneManager.registerScene('town', town);
    sceneManager.registerScene('cafe', cafeScene);
    sceneManager.registerScene('cowork', coworkScene);
    sceneManager.transitionTo('room', { duration: 0 });
}
