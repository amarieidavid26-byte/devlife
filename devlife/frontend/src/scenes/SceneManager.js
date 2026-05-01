import * as PIXI from 'pixi.js';

export class SceneManager {
  constructor(pixiApp) {
    this._app = pixiApp;
    this._scenes = new Map();
    this._currentScene = null;   // name of active scene
    this._transitioning = false;
    this._pendingTransition = null;
  }

  // public api

  registerScene(name, scene) {
    this._scenes.set(name, scene);
  }

  getCurrentScene() {
    return this._currentScene;
  }

  update(delta) {
    if (!this._currentScene) return;
    const scene = this._scenes.get(this._currentScene);
    if (scene && typeof scene.update === 'function') {
      scene.update(delta);
    }
  }

  transitionTo(sceneName, options = {}) {
    if (!this._scenes.has(sceneName)) {
      console.warn(`[SceneManager] Unknown scene: "${sceneName}"`);
      return;
    }

    // If mid-transition, queue this one (only keep the latest)
    if (this._transitioning) {
      this._pendingTransition = { sceneName, options };
      return;
    }

    const duration = options.duration ?? 500;
    const color = options.color ?? 0x000000;
    const halfDuration = duration / 2;

    // No current scene -- skip the fade-out, just enter directly
    if (!this._currentScene) {
      this._currentScene = sceneName;
      const next = this._scenes.get(sceneName);
      if (next && typeof next.enter === 'function') next.enter();
      return;
    }

    this._transitioning = true;

    // Create full-screen overlay
    const overlay = new PIXI.Graphics();
    this._drawOverlay(overlay, color);
    overlay.alpha = 0;
    this._app.stage.addChild(overlay);

    const startTime = Date.now();

    // Phase 1: fade out (alpha 0 -> 1)
    const fadeOut = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / halfDuration, 1);
      overlay.alpha = t;

      if (t < 1) {
        requestAnimationFrame(fadeOut);
        return;
      }

      // Mid-point: swap scenes
      const prev = this._scenes.get(this._currentScene);
      if (prev && typeof prev.exit === 'function') prev.exit();

      this._currentScene = sceneName;
      const next = this._scenes.get(sceneName);
      if (next && typeof next.enter === 'function') next.enter();

      // Make sure overlay stays on top after new scene enters
      this._app.stage.removeChild(overlay);
      this._app.stage.addChild(overlay);

      // Phase 2: fade in (alpha 1 -> 0)
      const fadeInStart = Date.now();
      const fadeIn = () => {
        const elapsed2 = Date.now() - fadeInStart;
        const t2 = Math.min(elapsed2 / halfDuration, 1);
        overlay.alpha = 1 - t2;

        if (t2 < 1) {
          requestAnimationFrame(fadeIn);
          return;
        }

        // Done -- clean up
        this._app.stage.removeChild(overlay);
        overlay.destroy();
        this._transitioning = false;

        // Process queued transition if any
        if (this._pendingTransition) {
          const pending = this._pendingTransition;
          this._pendingTransition = null;
          this.transitionTo(pending.sceneName, pending.options);
        }
      };

      requestAnimationFrame(fadeIn);
    };

    requestAnimationFrame(fadeOut);
  }

  // internal

  _drawOverlay(gfx, color) {
    const { width, height } = this._app.screen;
    gfx.beginFill(color);
    gfx.drawRect(0, 0, width, height);
    gfx.endFill();
  }
}
