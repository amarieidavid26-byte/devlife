// demo mode - "a day in the life" cinematic auto play
// cycles through all 5 states in ~5 min so judges can see everything without a whoop

const STATES = {
  RELAXED: 'RELAXED',
  DEEP_FOCUS: 'DEEP_FOCUS',
  STRESSED: 'STRESSED',
  FATIGUED: 'FATIGUED',
  WIRED: 'WIRED',
};

// intro text lines (shown one at a time during Chapter 0)
const INTRO_LINES = [
  { text: 'For 20 years, games asked players to adapt.', style: 'normal' },
  { text: 'What if a game could adapt to YOU?', style: 'normal' },
  { text: 'What if it could read your heartbeat...', style: 'normal' },
  { text: '...measure your stress...', style: 'normal' },
  { text: '...and protect you from yourself?', style: 'normal' },
  { text: 'This is DevLife.', style: 'title' },
];

// chapter transition descriptions
const CHAPTER_DESCRIPTIONS = {
  1: 'The morning begins. Coffee first.',
  2: 'Flow state. The code writes itself.',
  3: 'Pressure builds. Deadlines approach.',
  4: 'The body speaks. Will you listen?',
  5: 'Wired on caffeine. Running on fumes.',
  6: 'Rest. The most productive thing you can do.',
};

// outro credit lines
const OUTRO_LINES = [
  { text: 'DevLife', font: 'Fredoka', size: 32, color: '#6AD89A' },
  { text: 'A game that understands you.', font: 'Nunito', size: 16, color: '#F5F0E8' },
  { text: 'Built by David Amariei', font: 'Nunito', size: 14, color: '#B8A88C' },
];

// script definition

const SCRIPT = [
  // -- ch0 "Intro: The Next 20 Years" (cinematic text crawl)
  {
    title: 'The Next 20 Years',
    state: null,
    duration: 22_000,
    events: [
      { time: 0,      action: 'showIntro', data: {} },
      { time: 2_000,  action: 'introLine', data: { index: 0 } },
      { time: 4_800,  action: 'introLine', data: { index: 1 } },
      { time: 8_100,  action: 'introLine', data: { index: 2 } },
      { time: 10_900, action: 'introLine', data: { index: 3 } },
      { time: 13_700, action: 'introLine', data: { index: 4 } },
      { time: 17_000, action: 'introLine', data: { index: 5 } },
      { time: 19_800, action: 'introFadeOut', data: {} },
      { time: 20_500, action: 'hideOverlay', data: {} },
    ],
  },

  // -- ch1 "Morning: Fresh Start" (0:22-1:02)
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
        data: { app: 'desk_computer' },
      },
      {
        time: 16_000,
        action: 'ghostSay',
        data: { text: 'Nice and calm heartbeat. Perfect for deep work.' },
      },
    ],
  },

  // -- ch2 "Deep Work: The Zone"
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

  // -- ch3 "Stress: Something Broke"
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

  // -- ch4 "Fatigue: Running on Empty"
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

  // -- ch5 "Wired: Can't Stop"
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

  // -- ch6 "Sleep Mode"
  {
    title: 'Sleep Mode',
    state: null,
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

  // -- ch7 "Outro" (credits sequence)
  {
    title: 'Outro',
    state: null,
    duration: 11_000,
    events: [
      { time: 0,     action: 'showOutro', data: {} },
      { time: 500,   action: 'outroLine', data: { index: 0 } },
      { time: 2_500, action: 'outroLine', data: { index: 1 } },
      { time: 4_500, action: 'outroLine', data: { index: 2 } },
      { time: 6_000, action: 'outroLine', data: { index: 3 } },
      { time: 9_500, action: 'hideOverlay', data: {} },
    ],
  },
];

// --- DemoMode class ---

export class DemoMode {
  // takes all the game objects so demo can control everything
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

    // cinematic state
    this._currentIntroLine = null;
    this._currentIntroGlow = null;
    this._heartbeatInterval = null;
    this._heartbeatPulseEl = null;
    this._driftRaf = null;
    this._transitionOverlay = null;

    // hide hud during cinematics
    this.onCinematicStart = null;
    this.onCinematicEnd = null;
  }

  // --- public api

  start({ loop = false } = {}) {
    if (this._running) return;
    this._running = true;
    this._looping = loop;
    this._chapterIndex = 0;
    this._scheduleChapter(0);
  }

  stop() {
    this._running = false;
    this._looping = false;
    this._clearTimers();
    this._destroyOverlay();
    this._destroyTransition();
  }

  isRunning() {
    return this._running;
  }

  // --- scheduling

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

    // chapters 1-6 get a cinematic transition card before gameplay
    if (index >= 1 && index <= 6) {
      this._showChapterTransition(chapter, index, () => {
        this._scheduleChapterEvents(chapter, index);
      });
    } else {
      this._scheduleChapterEvents(chapter, index);
    }
  }

  _scheduleChapterEvents(chapter, index) {
    for (const event of chapter.events) {
      const id = setTimeout(() => {
        this._executeEvent(event, chapter);
      }, event.time);
      this._timers.push(id);
    }

    const nextId = setTimeout(() => {
      this._scheduleChapter(index + 1);
    }, chapter.duration);
    this._timers.push(nextId);
  }

  // --- chapter transition card

  _showChapterTransition(chapter, index, callback) {
    this.onCinematicStart?.();
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 5000;
      background: rgba(0, 0, 0, 0.6);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      opacity: 0;
      transition: opacity 0.5s ease;
    `;
    document.body.appendChild(overlay);
    this._transitionOverlay = overlay;

    // force reflow then fade in
    void overlay.offsetWidth;
    overlay.style.opacity = '1';

    // chapter title with typewriter
    const titleEl = document.createElement('div');
    titleEl.style.cssText = `
      font-family: 'Fredoka', sans-serif;
      font-size: 18px; color: #F5F0E8;
      letter-spacing: 2px; text-align: center;
    `;
    overlay.appendChild(titleEl);

    // description (hidden until title finishes)
    const descEl = document.createElement('div');
    descEl.style.cssText = `
      font-family: 'Nunito', sans-serif;
      font-size: 13px; color: #B8A88C;
      margin-top: 10px; text-align: center;
      opacity: 0; transition: opacity 0.5s ease;
    `;
    descEl.textContent = CHAPTER_DESCRIPTIONS[index] || '';
    overlay.appendChild(descEl);

    // typewriter effect
    const fullTitle = `Chapter ${index}: ${chapter.title}`;
    let charIdx = 0;
    const typeInterval = setInterval(() => {
      if (!this._running) { clearInterval(typeInterval); return; }
      if (charIdx < fullTitle.length) {
        titleEl.textContent += fullTitle[charIdx];
        charIdx++;
      } else {
        clearInterval(typeInterval);
        // show description after title finishes
        descEl.style.opacity = '1';
      }
    }, 30);
    this._timers.push(typeInterval);

    // hold for 2.5s after typing finishes, then fade out
    const typeTime = fullTitle.length * 30;
    const holdEnd = 500 + typeTime + 2500; // overlay fade-in + typing + hold

    const fadeOutId = setTimeout(() => {
      if (!this._running) return;
      overlay.style.opacity = '0';
      const removeId = setTimeout(() => {
        this._destroyTransition();
        this.onCinematicEnd?.();
        callback();
      }, 500);
      this._timers.push(removeId);
    }, holdEnd);
    this._timers.push(fadeOutId);
  }

  _destroyTransition() {
    if (this._transitionOverlay) {
      this._transitionOverlay.remove();
      this._transitionOverlay = null;
    }
  }

  // --- event execution

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
      case 'showIntro':
        this._showIntro();
        break;
      case 'introLine':
        this._introLine(event.data.index);
        break;
      case 'introFadeOut':
        this._introFadeOut();
        break;
      case 'showOutro':
        this._showOutro();
        break;
      case 'outroLine':
        this._outroLine(event.data.index);
        break;
      case 'hideOverlay':
        this._hideOverlay();
        break;
      case 'sleep':
        this._sleep();
        break;
      default:
        console.warn(`[DemoMode] Unknown action: ${event.action}`);
    }
  }

  // --- action handlers

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

    if (this._socket && typeof this._socket.send === 'function') {
      try {
        this._socket.send(JSON.stringify(message));
      } catch {
        // Socket not ready
      }
    }

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
      console.log(`[DemoMode] Player -> ${target}`);
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
    this._ghostSay(`\u26A0\uFE0F Blocked: ${command}`);
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
    console.log('[DemoMode] Sleep mode');
  }

  // --- cinematic intro overlay (chapter 0)

  _createOverlayEl() {
    if (this._overlayEl) return;
    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed; inset: 0; z-index: 5000;
      background: rgba(5, 5, 15, 0.97);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      transition: opacity 1s ease;
      opacity: 0;
    `;
    document.body.appendChild(el);
    this._overlayEl = el;
    void el.offsetWidth;
    el.style.opacity = '1';
  }

  _showIntro() {
    this.onCinematicStart?.();
    this._createOverlayEl();
    this._currentIntroLine = null;
    this._currentIntroGlow = null;

    // heartbeat pulse element behind text
    const pulse = document.createElement('div');
    pulse.style.cssText = `
      position: absolute; inset: 0;
      background: radial-gradient(circle at center, rgba(180, 30, 30, 0.08), transparent 60%);
      opacity: 0; pointer-events: none;
      transition: opacity 0.3s ease-in;
    `;
    this._overlayEl.appendChild(pulse);
    this._heartbeatPulseEl = pulse;

    // pulse every 1.5 seconds
    const doPulse = () => {
      if (!this._running || !pulse.parentNode) return;
      pulse.style.transition = 'opacity 0.3s ease-in';
      pulse.style.opacity = '1';
      const fadeId = setTimeout(() => {
        if (!pulse.parentNode) return;
        pulse.style.transition = 'opacity 0.8s ease-out';
        pulse.style.opacity = '0';
      }, 300);
      this._timers.push(fadeId);
    };
    doPulse();
    this._heartbeatInterval = setInterval(doPulse, 1500);
  }

  _introLine(index) {
    if (!this._overlayEl) return;
    const lineData = INTRO_LINES[index];
    if (!lineData) return;

    const prevLine = this._currentIntroLine;
    const prevGlow = this._currentIntroGlow;
    const isTitle = lineData.style === 'title';

    // create new line element
    const el = document.createElement('div');
    el.textContent = lineData.text;
    el.style.cssText = `
      color: #F5F0E8;
      font-family: 'Fredoka', sans-serif;
      font-size: ${isTitle ? '28px' : '20px'};
      font-weight: ${isTitle ? '600' : '400'};
      text-align: center;
      opacity: 0;
      transition: opacity 0.8s ease;
      position: absolute;
      pointer-events: none;
    `;
    this._overlayEl.appendChild(el);

    // glow element (behind text, blurred)
    const glow = document.createElement('div');
    glow.textContent = lineData.text;
    glow.style.cssText = `
      color: #F5F0E8;
      font-family: 'Fredoka', sans-serif;
      font-size: ${isTitle ? '28px' : '20px'};
      font-weight: ${isTitle ? '600' : '400'};
      text-align: center;
      opacity: 0;
      transition: opacity 0.8s ease;
      position: absolute;
      pointer-events: none;
      filter: blur(3px);
      transform: scale(1.02);
    `;
    this._overlayEl.insertBefore(glow, el);

    this._currentIntroLine = el;
    this._currentIntroGlow = glow;

    // fade out previous line, then fade in new
    if (prevLine) {
      prevLine.style.transition = 'opacity 0.5s ease';
      prevLine.style.opacity = '0';
      if (prevGlow) {
        prevGlow.style.transition = 'opacity 0.5s ease';
        prevGlow.style.opacity = '0';
      }
      const removeId = setTimeout(() => {
        if (prevLine.parentNode) prevLine.remove();
        if (prevGlow && prevGlow.parentNode) prevGlow.remove();
      }, 600);
      this._timers.push(removeId);

      // fade in new after old fades out
      const showId = setTimeout(() => {
        void el.offsetWidth;
        el.style.opacity = '1';
        glow.style.opacity = '0.1';
      }, 500);
      this._timers.push(showId);
    } else {
      // first line -- fade in immediately
      void el.offsetWidth;
      el.style.opacity = '1';
      glow.style.opacity = '0.1';
    }

    // cancel previous drift
    if (this._driftRaf) {
      cancelAnimationFrame(this._driftRaf);
      this._driftRaf = null;
    }

    // start upward drift + optional scale pulse
    let y = 0;
    let t = 0;
    const drift = () => {
      if (!el.parentNode) return;
      y -= 0.3;
      t += 0.016;
      let transform = `translateY(${y}px)`;
      if (isTitle) {
        const scale = 1.0 + Math.sin(t * Math.PI * 2 / 1.5) * 0.025;
        transform += ` scale(${scale})`;
      }
      el.style.transform = transform;
      if (glow.parentNode) {
        glow.style.transform = transform + ' scale(1.02)';
      }
      this._driftRaf = requestAnimationFrame(drift);
    };
    this._driftRaf = requestAnimationFrame(drift);
  }

  _introFadeOut() {
    // fade out current intro line
    if (this._currentIntroLine) {
      this._currentIntroLine.style.transition = 'opacity 0.5s ease';
      this._currentIntroLine.style.opacity = '0';
    }
    if (this._currentIntroGlow) {
      this._currentIntroGlow.style.transition = 'opacity 0.5s ease';
      this._currentIntroGlow.style.opacity = '0';
    }
    this._currentIntroLine = null;
    this._currentIntroGlow = null;

    // stop heartbeat pulse
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
    if (this._heartbeatPulseEl) {
      this._heartbeatPulseEl.style.opacity = '0';
    }

    // stop drift
    if (this._driftRaf) {
      cancelAnimationFrame(this._driftRaf);
      this._driftRaf = null;
    }
  }

  // --- cinematic outro overlay (chapter 7)

  _showOutro() {
    this.onCinematicStart?.();
    this._createOverlayEl();
    this._overlayTextEls = [];
  }

  _outroLine(index) {
    if (!this._overlayEl) return;
    const lineData = OUTRO_LINES[index];
    if (!lineData) return;

    const el = document.createElement('div');
    el.textContent = lineData.text;
    el.style.cssText = `
      color: ${lineData.color};
      font-family: '${lineData.font}', sans-serif;
      font-size: ${lineData.size}px;
      font-weight: ${index === 0 ? '600' : '400'};
      letter-spacing: ${index === 0 ? '3px' : '1px'};
      text-align: center;
      margin: 8px 0;
      opacity: 0;
      transition: opacity 0.6s ease;
    `;
    this._overlayEl.appendChild(el);
    this._overlayTextEls.push(el);

    // fade in
    void el.offsetWidth;
    el.style.opacity = '1';
  }

  // --- overlay lifecycle

  _hideOverlay() {
    // stop any intro animations
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
    if (this._driftRaf) {
      cancelAnimationFrame(this._driftRaf);
      this._driftRaf = null;
    }

    if (!this._overlayEl) return;
    this._overlayEl.style.opacity = '0';
    const el = this._overlayEl;
    const removeId = setTimeout(() => {
      el.remove();
    }, 1100);
    this._timers.push(removeId);
    this._overlayEl = null;
    this._overlayTextEls = [];
    this._currentIntroLine = null;
    this._currentIntroGlow = null;
    this._heartbeatPulseEl = null;
    this.onCinematicEnd?.();
  }

  _destroyOverlay() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
    if (this._driftRaf) {
      cancelAnimationFrame(this._driftRaf);
      this._driftRaf = null;
    }
    if (this._overlayEl) {
      this._overlayEl.remove();
      this._overlayEl = null;
      this._overlayTextEls = [];
    }
    this._currentIntroLine = null;
    this._currentIntroGlow = null;
    this._heartbeatPulseEl = null;
  }

  // --- cleanup

  _clearTimers() {
    for (const id of this._timers) {
      clearTimeout(id);
      clearInterval(id);
    }
    this._timers = [];
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
    if (this._driftRaf) {
      cancelAnimationFrame(this._driftRaf);
      this._driftRaf = null;
    }
  }
}
