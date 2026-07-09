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
import { SceneManager } from './scenes/SceneManager.js';
import { Town } from './town/Town.js';
import { CafeScene } from './town/CafeScene.js';
import { CoworkScene } from './town/CoworkScene.js';
import { WHOOPBluetooth } from './network/WHOOPBluetooth.js';
import { CONFIG } from './config.js';
import { initSession } from './network/session.js';
import { OfflineBiometrics } from './network/offlineBiometrics.js';
import { Spotify } from './network/Spotify.js';

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
    await Furniture.preloadTextures();

    // background-load Pyodide so the desk code editor is ready when opened
    PythonRunner.get().preload().catch(() => {
        // silent — code editor surfaces the error on first Run if pyodide missing
    });

    let socket, room, furniture, ghost, atmosphere, hud, dashboard, demoHotbar, apps, activeApp, ePrompt;
    let currentGameScene = 'room';
    let coffeeCount = 0;
    let _lastRecVel = null;

    socket = new GhostSocket(CONFIG.WS_URL);
    socket.setToastSystem(toastSystem);
    i18n.onChange((lang) => socket.sendLang(lang));
    window.addEventListener('devlife:personality', (e) => socket.sendPersonality(e.detail));

    // client-side biometric demo when there's no backend; the real backend takes over
    // the moment the WS connects (see the 'connected'/'disconnected' handlers below).
    const offlineBio = new OfflineBiometrics(socket);
    offlineBio.start();
    const applyMockState = (key) => {
        if (offlineBio.isActive()) offlineBio.setState(key);
        else socket.sendMockState(key);
    };

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
    gameContainer.x = Math.round(window.innerWidth / 2 * (1 - GAME_ZOOM));
    gameContainer.y = Math.round(window.innerHeight / 2 * (1 - GAME_ZOOM));

    // [E] prompt above interactable
    ePrompt = new PIXI.Text('[E]', {
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
    hud = new HUD();
    // real "last night" sleep arrives via biometric_update (WHOOP sleep endpoint) — no placeholder
    dashboard = new DashboardOverlay();
    demoHotbar = new DemoHotbar();
    demoHotbar.setClickHandler((key) => {
        if (!demoHotbar.manualEnabled) {
            toastSystem.show('warning', '\uD83D\uDD12 ' + i18n.t('toast.live_mode_locked_title'), i18n.t('toast.live_mode_locked'), 3000);
            return;
        }
        applyMockState(key);
    });
    // returning to live drops the backend's demo-state lock so real WHOOP resumes immediately
    demoHotbar.setModeHandler((isDemo) => {
        if (!isDemo) socket.resumeLive();
    });

    // WHOOP BLE pairing - connects the PAIR WHOOP button to the Web Bluetooth API
    const whoop = new WHOOPBluetooth();
    window.connectWHOOP = async () => {
        const res = await whoop.connect();
        if (res.ok) {
            demoHotbar.setBLEConnected(true);
            toastSystem.show('info', '\u2764\uFE0F ' + i18n.t('ble.connected'), i18n.t('ble.connected_body'), 2500);
            return;
        }
        // user cancelled the browser picker -- silent, expected
        if (res.errorName === 'NotFoundError') return;
        if (res.errorName === 'SecurityError') {
            toastSystem.show('warning', '\uD83D\uDD12 ' + i18n.t('ble.pair_failed_https'), '', 6000);
        } else if (res.errorName === 'NotSupportedError') {
            toastSystem.show('warning', '\u26A0\uFE0F ' + i18n.t('ble.pair_failed_not_supported'), '', 6000);
        } else {
            toastSystem.show('warning', '\uD83D\uDCE1 ' + i18n.t('ble.pair_failed_generic', { err: res.errorMessage }), '', 5000);
        }
    };
    whoop.onUpdate((bpm, connected) => {
        demoHotbar.setBLEConnected(connected);
        if (connected && bpm > 0) {
            socket.send({ type: 'heart_rate', bpm });
            hud.update({ heartRate: bpm });
        }
        if (!connected) {
            toastSystem.show('warning', '\uD83D\uDCF4 ' + i18n.t('ble.disconnected'), i18n.t('ble.disconnected_body'), 4000);
        }
    });
    whoop.onGiveUp(() => {
        toastSystem.show('warning', '\uD83D\uDCF4 ' + i18n.t('ble.reconnect_giveup'), i18n.t('ble.reconnect_giveup_body'), 8000);
    });

    // app overlays
    apps = {
        desk_computer: new CodeEditorApp(socket),
        desk_terminal: new TerminalApp(socket),
        second_monitor: new BrowserApp(socket),
        whiteboard: new NotesApp(socket),
        phone: new ChatApp(socket),
        speaker: new SpotifyApp(socket),
    };

    activeApp = null;

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

    // ambient music — procedural pad synthesized in SoundManager (no audio file needed,
    // so it can't silently break when an asset is missing).
    let musicPlaying = false;

    function toggleMusic() {
        soundManager.resume(); // the speaker click is the user gesture that unlocks audio
        if (musicPlaying) {
            soundManager.stopMusic();
            musicPlaying = false;
        } else {
            soundManager.startMusic();
            musicPlaying = true;
        }
        try { localStorage.setItem('devlife_music', musicPlaying ? '1' : '0'); } catch (_) {}
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
    ghost.setApplyFixHandler(async (code, rationale) => {
        const editor = apps.desk_computer;
        if (!editor || !editor.isOpen || !code) return;

        const originalText = editor.editor ? editor.editor.getValue() : '';
        const lang = editor.currentLang || 'python';

        // backend validation first
        const patchBody = {
            file: `demo.${lang === 'javascript' ? 'js' : lang}`,
            language: lang,
            range: { start_line: 1, end_line: (originalText.split('\n').length) },
            replacement_text: code,
            rationale: rationale || 'ghost suggestion',
            severity: 'medium',
            original_text: originalText,
        };

        let patchHash = null;
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/apply-fix/preview`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patchBody),
            });
            const json = await res.json();
            if (!res.ok || !json.valid) {
                toastSystem.show('warning', i18n.t('toast.fix_rejected'), json.reason || i18n.t('apply_fix.validation_failed'), 4000);
                return;
            }
            patchHash = json.patch_hash;
        } catch (e) {
            toastSystem.show('warning', i18n.t('toast.fix_rejected'), i18n.t('toast.whoop_unavailable'), 3000);
            return;
        }

        // show preview — user must confirm
        const confirmed = await editor.showPatchPreview(originalText, code, rationale);
        if (!confirmed) {
            toastSystem.show('info', i18n.t('toast.fix_cancelled'), i18n.t('toast.fix_cancelled_body'), 2000);
            return;
        }

        // confirm with backend and apply
        await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/apply-fix/confirm`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patch_hash: patchHash }),
        });

        editor.replaceContent(code);
        socket.sendFeedback('Apply Fix');

        toastSystem.show('ghost', i18n.t('toast.fix_applied'), i18n.t('toast.fix_applied_body'), 8000, {
            label: i18n.t('toast.revert'),
            onClick: async () => {
                try {
                    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/apply-fix/rollback`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ patch_hash: patchHash }),
                    });
                    const json = await res.json();
                    if (res.ok && json.original_text != null) {
                        editor.replaceContent(json.original_text);
                        toastSystem.show('info', i18n.t('toast.fix_reverted'), '', 3000);
                    }
                } catch (e) {
                    editor.replaceContent(originalText);
                    toastSystem.show('info', i18n.t('toast.fix_reverted'), '', 3000);
                }
            },
        });
    });

    socket.on('connected', () => { hud.setConnected(true); dashboard.setConnected(true); offlineBio.stop(); });
    socket.on('disconnected', () => { hud.setConnected(false); dashboard.setConnected(false); offlineBio.start(); });

    socket.on('intervention', (data) => {
        ghost.showSpeechBubble(data);
        dashboard.ddIntervention(data);
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
        dashboard.update(data);
        demoHotbar.setActive(data.state);
        atmosphere.setState(data.state);
        ghost.setStateTint(data.state);
        ghost.setBiometrics(data);
        furniture.setMonitorState(data.state);
        soundManager.setState(data.state);
        soundManager.setHeartbeat(data.heartRate, data.state === 'FATIGUED' || data.state === 'STRESSED');
        if (apps && apps.desk_computer && apps.desk_computer.isOpen) {
            apps.desk_computer.setBiometricState(data.state); // biometric Cursor indicator
        }

        // real "last night" sleep from WHOOP's sleep endpoint (null until it's scored)
        if (data.sleepHours != null && data.sleepScore != null) {
            hud.setSleepData({
                hours: data.sleepHours,
                efficiency: data.sleepEfficiency ?? 0,
                rem_pct: data.sleepRemPct ?? 0,
                deep_pct: data.sleepDeepPct ?? 0,
                score: data.sleepScore,
            });
        }

        // CQI - weighted composite of recovery, HRV, and inverse stress
        const recovery = data.recovery || 50;
        const hrv = data.hrv || 40;
        const stress = data.estimated_stress || 0;
        const cqi = Math.round((Math.min(recovery / 100, 1) * 0.4 + Math.min(hrv / 80, 1) * 0.35 + Math.max(0, 1 - stress / 3) * 0.25) * 100);
        hud.updateCQI(cqi);

        // dont spam this
        if (data.recovery_velocity && data.recovery_velocity > 0) {
            if (_lastRecVel !== data.recovery_velocity) {
                _lastRecVel = data.recovery_velocity;
                const mins = (data.recovery_velocity / 60).toFixed(1);
                toastSystem.show('info', '💓 ' + i18n.t('toast.recovery_complete'), i18n.t('toast.recovery_complete_body', { mins }), 4000);
            }
        } else {
            _lastRecVel = null;
        }
    });

    socket.on('state_change', (data) => {
        demoHotbar.setActive(data.to);
        atmosphere.transition(data.from, data.to);
        ghost.setStateTint(data.to);
        furniture.setMonitorState(data.to);
        soundManager.setState(data.to);
        toastSystem.show('state', i18n.t('toast.state_prefix') + i18n.t('state.' + data.to), i18n.t('toast.state_change_body', { state: i18n.t('state.' + data.to) }));
        if (data.to === 'DEEP_FOCUS') {
            toastSystem.triggerAchievement('first_flow');
        }
    });

    // Plant health from backend: clean code heals it, ignored interventions wither it
    socket.on('plant_update', (data) => {
        if (furniture && typeof data.delta === 'number') {
            furniture.adjustPlantHealth(data.delta);
        }
    });

    // Sleep mode from backend: WHOOP taken off the wrist (live pulse stopped) or a very low
    // resting HR. The character and the ghost both fall asleep, and we stop trusting the
    // resting-HR fallback as a live reading.
    socket.on('sleep_mode', (data) => {
        if (ghost) ghost.setSleepMode(data.active);
        if (player) player.setSleepMode(data.active);
        const offWrist = data.reason && data.reason.indexOf('off wrist') !== -1;
        if (data.active && offWrist) {
            toastSystem.show('info', '💤 ' + i18n.t('sleep.whoop_off_title'), i18n.t('sleep.whoop_off_body'), 4000);
        } else if (!data.active) {
            toastSystem.show('info', '❤️ ' + i18n.t('sleep.awake_title'), i18n.t('sleep.awake_body'), 2500);
        }
    });

    // keyboard
    document.addEventListener('keydown', (e) => {
        // a focused real terminal/editor needs every key (digits, Escape for vim, Tab…) —
        // don't let game shortcuts steal them. The app provides its own close button.
        if (activeApp && activeApp.capturesKeyboard) return;

        // 1-5: change mock biometric state (disabled when WHOOP BLE is streaming live data)
        if (e.key >= '1' && e.key <= '5') {
            e.preventDefault();
            if (!demoHotbar.manualEnabled) {
                toastSystem.show('warning', '\uD83D\uDD12 ' + i18n.t('toast.live_mode_locked_title'), i18n.t('toast.live_mode_locked'), 3000);
                return;
            }
            applyMockState(parseInt(e.key));
            return;
        }

        // Escape always works (closes apps/bubbles even while typing)
        if (e.key === 'Escape') {
            if (shortcutsOverlay.visible) { shortcutsOverlay.hide(); return; }
            if (ghost._bubble) { ghost.dismissBubble(true); return; }
            closeAllApps();
            return;
        }

        // ?: keyboard shortcuts overlay
        if (e.key === '?') {
            const t = e.target.tagName;
            if (t === 'INPUT' || t === 'TEXTAREA' || e.target.isContentEditable) return;
            e.preventDefault();
            shortcutsOverlay.toggle();
            return;
        }

        // TAB: toggle Beneath the Surface overlay (only when no app is open)
        if (e.key === 'Tab') {
            e.preventDefault();
            if (!activeApp) dashboard.toggle();
            return;
        }

        // Don't capture WASD/E when an app overlay is open - let the app handle them
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

        // Smooth camera follow - lerp gameContainer toward player centre
        const camTargetX = window.innerWidth / 2 - player.container.x * GAME_ZOOM;
        const camTargetY = window.innerHeight / 2 - player.container.y * GAME_ZOOM;
        const camLerp = 0.07 * delta;
        gameContainer.x += (camTargetX - gameContainer.x) * camLerp;
        gameContainer.y += (camTargetY - gameContainer.y) * camLerp;

        // Screen shake (critical interventions - Fatigue Firewall)
        atmosphere.applyScreenShake(gameContainer);

        // Beneath the Surface: feed screen-space positions for rings + particles
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

    // Scene Manager
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

    // snap town camera on resize so player doesnt end up in the void
    window.addEventListener('resize', () => {
        if (currentGameScene === 'town' && town._player) town.snapCamera();
    });

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
        message: msg, priority: 'low', state: ghost._state, buttons: [i18n.t('ghost.btn_nice')], biometric: {},
    }) || console.log('[ghost]', msg);
    cafeScene.onExit = () => {
        town.setSpawnPoint(16, 7);
        currentGameScene = 'town';
        sceneManager.transitionTo('town', { duration: 800 });
    };

    const coworkScene = new CoworkScene(pixiApp);
    coworkScene.onGhostSay = (msg) => ghost.showSpeechBubble?.({
        message: msg, priority: 'low', state: ghost._state, buttons: [i18n.t('ghost.btn_nice')], biometric: {},
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
