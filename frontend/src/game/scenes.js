// scene graph: room <-> town <-> cafe/cowork. sceneState.current is the shared
// mutable flag the main ticker and the door handler read/write

import { i18n } from '../i18n/index.js';
import { SceneManager } from '../scenes/SceneManager.js';
import { Town } from '../town/Town.js';
import { CafeScene } from '../town/CafeScene.js';
import { CoworkScene } from '../town/CoworkScene.js';

export function setupScenes({ pixiApp, gameContainer, atmosphere, hud, demoHotbar, ghost, sceneState }) {
    const sceneManager = new SceneManager(pixiApp);

    const roomScene = {
        enter() {
            pixiApp.stage.addChild(gameContainer);
            pixiApp.stage.addChild(atmosphere.container);
            if (hud._el) hud._el.style.display = '';
            if (demoHotbar._el) demoHotbar._el.style.display = '';
            sceneState.current = 'room';
        },
        exit() {
            pixiApp.stage.removeChild(gameContainer);
            pixiApp.stage.removeChild(atmosphere.container);
            if (hud._el) hud._el.style.display = 'none';
            if (demoHotbar._el) demoHotbar._el.style.display = 'none';
            sceneState.current = null;
        },
        update(delta) {
            // Room updates happen in the main ticker
        },
    };

    const town = new Town(pixiApp);

    // snap town camera on resize so player doesnt end up in the void
    window.addEventListener('resize', () => {
        if (sceneState.current === 'town' && town._player) town.snapCamera();
    });

    town.onEnterHome = () => {
        sceneManager.transitionTo('room', { duration: 800 });
    };
    town.onEnterCafe = () => {
        sceneState.current = 'cafe';
        sceneManager.transitionTo('cafe', { duration: 800 });
    };
    town.onEnterCowork = () => {
        sceneState.current = 'cowork';
        sceneManager.transitionTo('cowork', { duration: 800 });
    };

    const ghostSay = (msg) => ghost.showSpeechBubble?.({
        message: msg, priority: 'low', state: ghost._state, buttons: [i18n.t('ghost.btn_nice')], biometric: {},
    }) || console.log('[ghost]', msg);

    const cafeScene = new CafeScene(pixiApp);
    cafeScene.onGhostSay = ghostSay;
    cafeScene.onExit = () => {
        town.setSpawnPoint(16, 7);
        sceneState.current = 'town';
        sceneManager.transitionTo('town', { duration: 800 });
    };

    const coworkScene = new CoworkScene(pixiApp);
    coworkScene.onGhostSay = ghostSay;
    coworkScene.onExit = () => {
        town.setSpawnPoint(7, 16);
        sceneState.current = 'town';
        sceneManager.transitionTo('town', { duration: 800 });
    };

    sceneManager.registerScene('room', roomScene);
    sceneManager.registerScene('town', town);
    sceneManager.registerScene('cafe', cafeScene);
    sceneManager.registerScene('cowork', coworkScene);
    sceneManager.transitionTo('room', { duration: 0 });

    return { sceneManager, town };
}
