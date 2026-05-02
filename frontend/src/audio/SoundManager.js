// procedural sound system, all sounds are synthesized with web audio api
// no external audio files needed
export class SoundManager {
  constructor() {
    this._ctx = null;
    this._masterGain = null;
    this._muted = false;
    this._masterVolume = 1;
    this._currentState = null;
    this._ambientNodes = null; // { oscillators, gains, lfo, lfoGain, output }
    this._crossfadeDuration = 2;
  }

  // AudioContext lazy init

  _ensureContext() {
    if (this._ctx) return;
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._masterGain = this._ctx.createGain();
      this._masterGain.gain.value = this._masterVolume;
      this._masterGain.connect(this._ctx.destination);
    } catch {
      // Audio not supported -- all methods will gracefully no-op
    }
  }

  resume() {
    try {
      this._ensureContext();
      if (this._ctx && this._ctx.state === 'suspended') {
        this._ctx.resume();
      }
    } catch { /* ignore */ }
  }

  // ambient drones

  _stateConfig(state) {
    const configs = {
      RELAXED: {
        tones: [
          { freq: 80, type: 'sine', vol: 0.03 },
          { freq: 160, type: 'sine', vol: 0.03 },
        ],
        lfoFreq: 0.5,
        lfoDepth: 0.4,
        filter: null,
      },
      DEEP_FOCUS: {
        tones: [
          { freq: 200, type: 'sine', vol: 0.015 },
        ],
        lfoFreq: 0,
        lfoDepth: 0,
        filter: null,
      },
      STRESSED: {
        tones: [
          { freq: 120, type: 'sine', vol: 0.04 },
          { freq: 127, type: 'sine', vol: 0.04 },
        ],
        lfoFreq: 2,
        lfoDepth: 0.5,
        filter: null,
      },
      FATIGUED: {
        tones: [
          { freq: 60, type: 'sine', vol: 0.02 },
        ],
        lfoFreq: 0.2,
        lfoDepth: 0.4,
        filter: { type: 'lowpass', frequency: 200 },
      },
      WIRED: {
        tones: [
          { freq: 150, type: 'sawtooth', vol: 0.02 },
          { freq: 300, type: 'sine', vol: 0.01 },
        ],
        lfoFreq: 1,
        lfoDepth: 0.4,
        filter: null,
      },
    };
    return configs[state] || null;
  }

  _createAmbient(config) {
    const ctx = this._ctx;
    const output = ctx.createGain();
    output.gain.value = 1;

    let destination = output;

    // Optional filter
    let filterNode = null;
    if (config.filter) {
      filterNode = ctx.createBiquadFilter();
      filterNode.type = config.filter.type;
      filterNode.frequency.value = config.filter.frequency;
      filterNode.connect(output);
      destination = filterNode;
    }

    // LFO modulates a shared gain node
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 1;
    lfoGain.connect(destination);

    let lfo = null;
    if (config.lfoFreq > 0) {
      lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = config.lfoFreq;
      const lfoDepthNode = ctx.createGain();
      lfoDepthNode.gain.value = config.lfoDepth;
      lfo.connect(lfoDepthNode);
      lfoDepthNode.connect(lfoGain.gain);
      lfo.start();
    }

    const oscillators = [];
    const gains = [];
    for (const tone of config.tones) {
      const osc = ctx.createOscillator();
      osc.type = tone.type;
      osc.frequency.value = tone.freq;
      const g = ctx.createGain();
      g.gain.value = tone.vol;
      osc.connect(g);
      g.connect(lfoGain);
      osc.start();
      oscillators.push(osc);
      gains.push(g);
    }

    output.connect(this._masterGain);

    return { oscillators, gains, lfo, lfoGain, filterNode, output };
  }

  _destroyAmbient(ambient, fadeTime) {
    if (!ambient) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    // Fade out the output gain
    ambient.output.gain.setValueAtTime(ambient.output.gain.value, now);
    ambient.output.gain.linearRampToValueAtTime(0, now + fadeTime);

    // Schedule cleanup after fade
    setTimeout(() => {
      try {
        for (const osc of ambient.oscillators) {
          osc.stop();
          osc.disconnect();
        }
        for (const g of ambient.gains) g.disconnect();
        if (ambient.lfo) {
          ambient.lfo.stop();
          ambient.lfo.disconnect();
        }
        ambient.lfoGain.disconnect();
        if (ambient.filterNode) ambient.filterNode.disconnect();
        ambient.output.disconnect();
      } catch { /* already cleaned up */ }
    }, (fadeTime + 0.1) * 1000);
  }

  setState(state) {
    try {
      this._ensureContext();
      if (!this._ctx) return;
      if (state === this._currentState) return;

      const config = this._stateConfig(state);
      if (!config) return;

      const fadeDuration = this._crossfadeDuration;

      // Fade out old ambient
      this._destroyAmbient(this._ambientNodes, fadeDuration);

      // Create new ambient and fade it in
      const newAmbient = this._createAmbient(config);
      const now = this._ctx.currentTime;
      newAmbient.output.gain.setValueAtTime(0, now);
      newAmbient.output.gain.linearRampToValueAtTime(1, now + fadeDuration);

      this._ambientNodes = newAmbient;
      this._currentState = state;
    } catch { /* graceful fail */ }
  }

  // sfx stuff

  _playSfx(fn) {
    try {
      this._ensureContext();
      if (!this._ctx) return;
      fn(this._ctx, this._masterGain);
    } catch { /* graceful fail */ }
  }

  playClick() {
    this._playSfx((ctx, dest) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 800;
      const g = ctx.createGain();
      const now = ctx.currentTime;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.15, now + 0.005);
      g.gain.linearRampToValueAtTime(0, now + 0.03);
      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + 0.03);
    });
  }

  playOpen() {
    this._playSfx((ctx, dest) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.1);
      const g = ctx.createGain();
      const now = ctx.currentTime;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.15, now + 0.005);
      g.gain.linearRampToValueAtTime(0, now + 0.1);
      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + 0.1);
    });
  }

  playClose() {
    this._playSfx((ctx, dest) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.1);
      const g = ctx.createGain();
      const now = ctx.currentTime;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.15, now + 0.005);
      g.gain.linearRampToValueAtTime(0, now + 0.1);
      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + 0.1);
    });
  }

  playNotification() {
    this._playSfx((ctx, dest) => {
      const now = ctx.currentTime;

      // First tone: 600Hz
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = 600;
      const g1 = ctx.createGain();
      g1.gain.setValueAtTime(0, now);
      g1.gain.linearRampToValueAtTime(0.15, now + 0.005);
      g1.gain.linearRampToValueAtTime(0, now + 0.08);
      osc1.connect(g1);
      g1.connect(dest);
      osc1.start(now);
      osc1.stop(now + 0.08);

      // Second tone: 900Hz
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 900;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0, now + 0.08);
      g2.gain.linearRampToValueAtTime(0.15, now + 0.085);
      g2.gain.linearRampToValueAtTime(0, now + 0.16);
      osc2.connect(g2);
      g2.connect(dest);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.16);
    });
  }

  playHeartbeat() {
    this._playSfx((ctx, dest) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 50;
      const g = ctx.createGain();
      const now = ctx.currentTime;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.15, now + 0.005);
      g.gain.linearRampToValueAtTime(0, now + 0.2);
      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + 0.2);
    });
  }

  // ghost sounds

  playGhostAppear() {
    this._playSfx((ctx, dest) => {
      const now = ctx.currentTime;

      // White noise burst (50ms)
      const bufferSize = Math.ceil(ctx.sampleRate * 0.05);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.1, now);
      noiseGain.gain.linearRampToValueAtTime(0, now + 0.05);
      noise.connect(noiseGain);
      noiseGain.connect(dest);
      noise.start(now);

      // Sweep 1000Hz -> 200Hz over 200ms
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, now + 0.05);
      osc.frequency.linearRampToValueAtTime(200, now + 0.25);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.setValueAtTime(0.1, now + 0.05);
      g.gain.linearRampToValueAtTime(0, now + 0.25);
      osc.connect(g);
      g.connect(dest);
      osc.start(now + 0.05);
      osc.stop(now + 0.25);
    });
  }

  playGhostSpeak() {
    this._playSfx((ctx, dest) => {
      const now = ctx.currentTime;
      for (let i = 0; i < 5; i++) {
        const t = now + i * 0.03;
        const freq = 300 + Math.random() * 300;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.1, t + 0.003);
        g.gain.linearRampToValueAtTime(0, t + 0.02);
        osc.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + 0.02);
      }
    });
  }

  playGhostAlert() {
    this._playSfx((ctx, dest) => {
      const now = ctx.currentTime;
      const freqs = [400, 600, 800];
      for (let i = 0; i < 3; i++) {
        const t = now + i * 0.06;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freqs[i];
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.2, t + 0.005);
        g.gain.linearRampToValueAtTime(0, t + 0.06);
        osc.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + 0.06);
      }
    });
  }

  // volume

  setMasterVolume(v) {
    try {
      this._masterVolume = Math.max(0, Math.min(1, v));
      if (this._masterGain) {
        this._masterGain.gain.setValueAtTime(
          this._muted ? 0 : this._masterVolume,
          this._ctx.currentTime
        );
      }
    } catch { /* ignore */ }
  }

  mute() {
    try {
      this._muted = true;
      if (this._masterGain) {
        this._masterGain.gain.setValueAtTime(0, this._ctx.currentTime);
      }
    } catch { /* ignore */ }
  }

  unmute() {
    try {
      this._muted = false;
      if (this._masterGain) {
        this._masterGain.gain.setValueAtTime(this._masterVolume, this._ctx.currentTime);
      }
    } catch { /* ignore */ }
  }

  destroy() {
    try {
      this._destroyAmbient(this._ambientNodes, 0.05);
      this._ambientNodes = null;
      this._currentState = null;
      if (this._ctx) {
        this._ctx.close();
        this._ctx = null;
      }
      this._masterGain = null;
    } catch { /* ignore */ }
  }
}
