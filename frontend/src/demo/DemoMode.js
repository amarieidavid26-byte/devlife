/**
 * DemoMode — "A Day in the Life" cinematic auto-play sequence.
 *
 * Cycles through all 5 cognitive states in ~3.5 minutes so judges can see
 * every feature without needing a WHOOP strap.
 */

const STATES = {
  RELAXED: 'RELAXED',
  DEEP_FOCUS: 'DEEP_FOCUS',
  STRESSED: 'STRESSED',
  FATIGUED: 'FATIGUED',
  WIRED: 'WIRED',
};

// ---------------------------------------------------------------------------
// Script definition
// ---------------------------------------------------------------------------

const SCRIPT = [
  // ── Chapter 0 — "Intro: The Next 20 Years" (0:00 – 0:15) ──────────────
  {
    title: 'The Next 20 Years',
    state: null,
    duration: 15_000,
    events: [
      { time: 0,     action: 'showOverlay', data: {} },
      { time: 500,   action: 'overlayText', data: { index: 0, fade: 'in' } },   // "In the next 20 years..."
      { time: 3_000, action: 'overlayText', data: { index: 0, fade: 'out' } },
      { time: 3_500, action: 'overlayText', data: { index: 1, fade: 'in' } },   // "...your code will change the world."
      { time: 6_000, action: 'overlayText', data: { index: 1, fade: 'out' } },
      { time: 6_500, action: 'overlayText', data: { index: 2, fade: 'in' } },   // "But who watches over you?"
      { time: 9_000, action: 'overlayText', data: { index: 2, fade: 'out' } },
      { time: 9_500, action: 'overlayText', data: { index: 3, fade: 'in' } },   // "DevLife"
      { time: 12_000, action: 'overlayText', data: { index: 3, fade: 'out' } },
      { time: 12_500, action: 'overlayText', data: { index: 4, fade: 'in' } },  // Credit
      { time: 14_000, action: 'overlayText', data: { index: 4, fade: 'out' } },
      { time: 14_500, action: 'hideOverlay', data: {} },
    ],
  },

  // ── Chapter 1 — "Morning: Fresh Start" (0:15 – 0:55) ──────────────────
  {
    title: 'Morning: Fresh Start',
    state: STATES.RELAXED,
    duration: 40_000,
    events: [
      {
        time: 0,
        action: 'setBiometrics',
        data: { recovery: 85, strain: 4, hr: 65, hrv: 75, stress: 0.5 },
      },
      {
        time: 500,
        action: 'ghostSay',
        data: { text: "Good morning! Recovery looks great today. Let's build something cool." },
      },
      {
        time: 10_000,
        action: 'playerMoveTo',
        data: { target: 'desk_computer' },
      },
      {
        time: 15_000,
        action: 'openApp',
        data: { app: 'code_editor' },
      },
      {
        time: 16_000,
        action: 'ghostSay',
        data: { text: 'Nice and calm heartbeat. Perfect for deep work.' },
      },
    ],
  },

  // ── Chapter 2 — "Deep Work: The Zone" (0:40 – 1:20) ───────────────────
  {
    title: 'Deep Work: The Zone',
    state: STATES.DEEP_FOCUS,
    duration: 40_000,
    events: [
      {
        time: 0,
        action: 'setBiometrics',
        data: { recovery: 80, strain: 10, hr: 78, hrv: 65, stress: 1.2 },
      },
      {
        time: 10_000,
        action: 'ghostSay',
        data: { text: '...' },
      },
      {
        time: 20_000,
        action: 'ghostSay',
        data: { text: "You've been in flow for 20 minutes. I'll keep quiet." },
      },
    ],
  },

  // ── Chapter 3 — "Stress: Something Broke" (1:20 – 2:00) ───────────────
  {
    title: 'Stress: Something Broke',
    state: STATES.STRESSED,
    duration: 40_000,
    events: [
      {
        time: 0,
        action: 'setBiometrics',
        data: { recovery: 60, strain: 18, hr: 112, hrv: 35, stress: 2.5 },
      },
      {
        time: 500,
        action: 'ghostSay',
        data: { text: 'Whoa, heart rate spiking. 112 bpm. Take a breath.' },
      },
      {
        time: 10_000,
        action: 'openApp',
        data: { app: 'terminal' },
      },
      {
        time: 12_000,
        action: 'triggerFirewall',
        data: { command: 'git push --force' },
      },
      {
        time: 12_500,
        action: 'ghostSay',
        data: { text: "I'm blocking that git push --force. You're not thinking straight." },
      },
      {
        time: 25_000,
        action: 'ghostSay',
        data: { text: "Let's step back. Maybe grab some coffee?" },
      },
    ],
  },

  // ── Chapter 4 — "Fatigue: Running on Empty" (2:00 – 2:40) ─────────────
  {
    title: 'Fatigue: Running on Empty',
    state: STATES.FATIGUED,
    duration: 40_000,
    events: [
      {
        time: 0,
        action: 'setBiometrics',
        data: { recovery: 30, strain: 20, hr: 58, hrv: 38, sleep: 55, stress: 0.8 },
      },
      {
        time: 500,
        action: 'ghostSay',
        data: { text: "Recovery is at 30%. You've been coding for 8 hours." },
      },
      {
        time: 15_000,
        action: 'ghostSay',
        data: { text: 'Your HRV dropped below 40ms. That\'s your body saying stop.' },
      },
      {
        time: 25_000,
        action: 'ghostSay',
        data: { text: "I'm dimming the lights. You need to rest." },
      },
    ],
  },

  // ── Chapter 5 — "Wired: Can't Stop" (2:40 – 3:10) ────────────────────
  {
    title: "Wired: Can't Stop",
    state: STATES.WIRED,
    duration: 30_000,
    events: [
      {
        time: 0,
        action: 'setBiometrics',
        data: { recovery: 45, strain: 14, hr: 100, hrv: 42, stress: 1.8 },
      },
      {
        time: 500,
        action: 'ghostSay',
        data: { text: "Still going? Heart rate says you're wired but your body is done." },
      },
      {
        time: 15_000,
        action: 'ghostSay',
        data: { text: 'This is where bugs happen. Last commit was 3am.' },
      },
    ],
  },

  // ── Chapter 6 — "Sleep Mode" (3:10 – 3:30) ────────────────────────────
  {
    title: 'Sleep Mode',
    state: null, // wind-down, no cognitive state
    duration: 20_000,
    events: [
      {
        time: 0,
        action: 'setBiometrics',
        data: { recovery: 20, strain: 0, hr: 52, hrv: 30, stress: 0.2 },
      },
      {
        time: 500,
        action: 'ghostSay',
        data: { text: "Goodnight. I'll watch over the code." },
      },
      {
        time: 2_000,
        action: 'sleep',
        data: {},
      },
    ],
  },

  // ── Chapter 7 — "Outro" (3:30 – 3:35) ────────────────────────────────
  {
    title: 'Outro',
    state: null,
    duration: 5_000,
    events: [
      { time: 0,     action: 'showOutro', data: {} },
      { time: 4_500, action: 'hideOverlay', data: {} },
    ],
  },
];

// ---------------------------------------------------------------------------
// DemoMode class
// ---------------------------------------------------------------------------

// Intro text lines (shown sequentially during Chapter 0)
const INTRO_LINES = [
  'In the next 20 years...',
  '...your code will change the world.',
  'But who watches over you?',
  'DevLife',
  'ROG 20-Year Coding Challenge 2026',
];

// Outro text lines (shown simultaneously during Chapter 7)
const OUTRO_LINES = [
  'DevLife — The Biometric Developer Simulator',
  'A game that understands you.',
  'ROG 20-Year Coding Challenge 2026',
];

export class DemoMode {
  /**
   * @param {object} deps
   * @param {object} deps.socket      — WebSocket (or wrapper) for biometric messages
   * @param {object} deps.ghost       — Ghost AI companion
   * @param {object} deps.atmosphere  — Atmosphere / lighting controller
   * @param {object} deps.hud         — HUD overlay
   * @param {object} deps.furniture   — Furniture / interaction manager
   * @param {object} deps.player      — Player controller
   */
  constructor({ socket, ghost, atmosphere, hud, furniture, player }) {
    this._socket = socket;
    this._ghost = ghost;
    this._atmosphere = atmosphere;
    this._hud = hud;
    this._furniture = furniture;
    this._player = player;

    this._running = false;
    this._timers = [];
    this._chapterIndex = 0;
    this._startTime = 0;
    this._looping = false;

    // DOM overlay elements
    this._overlayEl = null;
    this._overlayTextEls = [];
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Start the demo from the beginning. Optionally loop forever. */
  start({ loop = false } = {}) {
    if (this._running) return;
    this._running = true;
    this._looping = loop;
    this._chapterIndex = 0;
    this._scheduleChapter(0);
  }

  /** Stop the demo and cancel all pending events. */
  stop() {
    this._running = false;
    this._looping = false;
    this._clearTimers();
    this._destroyOverlay();
  }

  /** @returns {boolean} */
  isRunning() {
    return this._running;
  }

  // -----------------------------------------------------------------------
  // Scheduling
  // -----------------------------------------------------------------------

  /** Schedule all events for chapter at `index`, then chain to next chapter. */
  _scheduleChapter(index) {
    if (!this._running) return;
    if (index >= SCRIPT.length) {
      if (this._looping) {
        this._chapterIndex = 0;
        this._scheduleChapter(0);
      } else {
        this._running = false;
      }
      return;
    }

    const chapter = SCRIPT[index];
    this._chapterIndex = index;

    // Schedule each event within this chapter
    for (const event of chapter.events) {
      const id = setTimeout(() => {
        this._executeEvent(event, chapter);
      }, event.time);
      this._timers.push(id);
    }

    // After chapter duration, advance to the next chapter
    const nextId = setTimeout(() => {
      this._scheduleChapter(index + 1);
    }, chapter.duration);
    this._timers.push(nextId);
  }

  // -----------------------------------------------------------------------
  // Event execution
  // -----------------------------------------------------------------------

  _executeEvent(event, chapter) {
    if (!this._running) return;

    switch (event.action) {
      case 'setBiometrics':
        this._setBiometrics(event.data, chapter.state);
        break;
      case 'ghostSay':
        this._ghostSay(event.data.text);
        break;
      case 'playerMoveTo':
        this._playerMoveTo(event.data.target);
        break;
      case 'openApp':
        this._openApp(event.data.app);
        break;
      case 'closeApp':
        this._closeApp(event.data.app);
        break;
      case 'triggerFirewall':
        this._triggerFirewall(event.data.command);
        break;
      case 'showOverlay':
        this._showOverlay();
        break;
      case 'hideOverlay':
        this._hideOverlay();
        break;
      case 'overlayText':
        this._overlayText(event.data.index, event.data.fade);
        break;
      case 'showOutro':
        this._showOutro();
        break;
      case 'sleep':
        this._sleep();
        break;
      default:
        console.warn(`[DemoMode] Unknown action: ${event.action}`);
    }
  }

  // -----------------------------------------------------------------------
  // Action handlers — stubs that call into game objects.
  // Each one is safe to call even if the dependency isn't wired yet.
  // -----------------------------------------------------------------------

  /**
   * Push mock biometric data through the socket (or directly update HUD).
   * Mirrors the `biometric_update` WebSocket message format.
   */
  _setBiometrics(data, state) {
    const message = {
      type: 'biometric_update',
      data: {
        heartRate: data.hr,
        hrv: data.hrv,
        recovery: data.recovery,
        strain: data.strain,
        stress: data.stress,
        sleep: data.sleep ?? null,
        cognitiveState: state,
        timestamp: Date.now(),
      },
    };

    // Prefer socket so the entire pipeline processes it naturally.
    if (this._socket && typeof this._socket.send === 'function') {
      try {
        this._socket.send(JSON.stringify(message));
      } catch {
        // Socket not ready — fall through to direct update.
      }
    }

    // Direct HUD/atmosphere update as fallback.
    if (this._hud && typeof this._hud.update === 'function') {
      this._hud.update(message.data);
    }
    if (this._atmosphere && typeof this._atmosphere.setState === 'function') {
      this._atmosphere.setState(state);
    }
  }

  _ghostSay(text) {
    if (!this._ghost) return;
    if (typeof this._ghost.showMessage === 'function') {
      this._ghost.showMessage(text);
    } else if (typeof this._ghost.say === 'function') {
      this._ghost.say(text);
    } else {
      console.log(`[DemoMode] Ghost: "${text}"`);
    }
  }

  _playerMoveTo(target) {
    if (!this._player) return;
    if (typeof this._player.moveTo === 'function') {
      this._player.moveTo(target);
    } else {
      console.log(`[DemoMode] Player → ${target}`);
    }
  }

  _openApp(app) {
    if (!this._furniture) return;
    if (typeof this._furniture.interact === 'function') {
      this._furniture.interact(app);
    } else {
      console.log(`[DemoMode] Open app: ${app}`);
    }
  }

  _closeApp(app) {
    if (!this._furniture) return;
    if (typeof this._furniture.closeApp === 'function') {
      this._furniture.closeApp(app);
    } else {
      console.log(`[DemoMode] Close app: ${app}`);
    }
  }

  _triggerFirewall(command) {
    // Ghost intercepts a dangerous command
    this._ghostSay(`⚠️ Blocked: ${command}`);
    if (this._ghost && typeof this._ghost.triggerFirewall === 'function') {
      this._ghost.triggerFirewall(command);
    }
  }

  _sleep() {
    if (this._atmosphere && typeof this._atmosphere.darken === 'function') {
      this._atmosphere.darken();
    }
    if (this._player && typeof this._player.lieDown === 'function') {
      this._player.lieDown();
    }
    console.log('[DemoMode] 💤 Sleep mode');
  }

  // -----------------------------------------------------------------------
  // Overlay — Intro & Outro cinematic screens
  // -----------------------------------------------------------------------

  _createOverlayEl() {
    if (this._overlayEl) return;
    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed; inset: 0; z-index: 5000;
      background: rgba(5, 5, 15, 0.97);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      transition: opacity 0.5s ease;
      opacity: 0;
    `;
    document.body.appendChild(el);
    this._overlayEl = el;
    // Force reflow then fade in
    void el.offsetWidth;
    el.style.opacity = '1';
  }

  _showOverlay() {
    this._createOverlayEl();
    this._overlayTextEls = [];

    // Pre-create all intro text elements (hidden)
    for (let i = 0; i < INTRO_LINES.length; i++) {
      const line = INTRO_LINES[i];
      const span = document.createElement('div');
      const isTitle = i === 3; // "DevLife" — larger
      const isCredit = i === 4;
      span.textContent = line;
      span.style.cssText = `
        color: ${isTitle ? '#e94560' : isCredit ? '#888' : '#e0e0e0'};
        font-family: monospace;
        font-size: ${isTitle ? '42px' : isCredit ? '14px' : '22px'};
        font-weight: ${isTitle ? 'bold' : 'normal'};
        letter-spacing: ${isTitle ? '6px' : '1px'};
        text-align: center;
        opacity: 0;
        transition: opacity 0.5s ease;
        position: absolute;
      `;
      this._overlayEl.appendChild(span);
      this._overlayTextEls.push(span);
    }
  }

  _overlayText(index, fade) {
    const el = this._overlayTextEls[index];
    if (!el) return;
    el.style.opacity = fade === 'in' ? '1' : '0';
  }

  _showOutro() {
    this._createOverlayEl();
    this._overlayTextEls = [];

    // Show all outro lines at once, stacked vertically
    for (let i = 0; i < OUTRO_LINES.length; i++) {
      const line = OUTRO_LINES[i];
      const span = document.createElement('div');
      const isTitle = i === 0;
      const isCredit = i === 2;
      span.textContent = line;
      span.style.cssText = `
        color: ${isTitle ? '#e94560' : isCredit ? '#888' : '#e0e0e0'};
        font-family: monospace;
        font-size: ${isTitle ? '24px' : isCredit ? '14px' : '18px'};
        font-weight: ${isTitle ? 'bold' : 'normal'};
        letter-spacing: ${isTitle ? '3px' : '1px'};
        text-align: center;
        margin: 8px 0;
        opacity: 0;
        transition: opacity 0.6s ease;
      `;
      this._overlayEl.appendChild(span);
      this._overlayTextEls.push(span);

      // Stagger fade-in for each line
      setTimeout(() => { span.style.opacity = '1'; }, 300 + i * 400);
    }
  }

  _hideOverlay() {
    if (!this._overlayEl) return;
    this._overlayEl.style.opacity = '0';
    const el = this._overlayEl;
    setTimeout(() => {
      el.remove();
    }, 600);
    this._overlayEl = null;
    this._overlayTextEls = [];
  }

  _destroyOverlay() {
    if (this._overlayEl) {
      this._overlayEl.remove();
      this._overlayEl = null;
      this._overlayTextEls = [];
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  _clearTimers() {
    for (const id of this._timers) {
      clearTimeout(id);
    }
    this._timers = [];
  }
}
