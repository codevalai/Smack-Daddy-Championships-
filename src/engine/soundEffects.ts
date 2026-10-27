// Procedural Web Audio API Sound Engine & Voice Trash-Talk — Zero External Audio Files

export class SlapAudioEngine {
  private ctx: AudioContext | null = null;
  public muted: boolean = false;

  private getContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playCountBeep(countNum: number): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280 + countNum * 90, now);
    osc.frequency.exponentialRampToValueAtTime(180 + countNum * 60, now + 0.14);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playChalkPuff(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.18);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.exp(-i / (ctx.sampleRate * 0.04));
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, now);
    filter.Q.value = 1.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  public playFlinchGasp(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Fast inhalation gasp noise
    const bufferSize = Math.floor(ctx.sampleRate * 0.28);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / ctx.sampleRate;
      const env = Math.sin((t / 0.28) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(550, now);
    filter.frequency.linearRampToValueAtTime(1400, now + 0.22);
    filter.Q.value = 2.4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.14);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  public playWindUpWhoosh(intensity: number = 1.0): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const bufferSize = Math.floor(ctx.sampleRate * 0.35);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(180, now);
    filter.frequency.exponentialRampToValueAtTime(920 * intensity, now + 0.28);
    filter.Q.value = 2.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.22 * intensity, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.35);
  }

  /**
   * Sonic Boom Slap Crack + Sub-Bass Impact Thud
   * Scaled by Newton force (e.g. 80N to 200N)
   */
  public playSlapSound(newtonForce: number, isCritical: boolean = false): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const forceRatio = Math.min(1.8, Math.max(0.6, newtonForce / 120));

    // 1. Sharp skin crack (high-passed white noise transient burst 0.04s)
    const crackSize = Math.floor(ctx.sampleRate * 0.16);
    const crackBuf = ctx.createBuffer(1, crackSize, ctx.sampleRate);
    const crackData = crackBuf.getChannelData(0);
    for (let i = 0; i < crackSize; i++) {
      const env = Math.exp(-i / (ctx.sampleRate * 0.022));
      crackData[i] = (Math.random() * 2 - 1) * env;
    }

    const crackSrc = ctx.createBufferSource();
    crackSrc.buffer = crackBuf;

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(isCritical ? 1900 : 1300, now);

    const peaking = ctx.createBiquadFilter();
    peaking.type = 'peaking';
    peaking.frequency.setValueAtTime(isCritical ? 2400 : 1600, now);
    peaking.gain.value = 9;
    peaking.Q.value = 2.0;

    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.65 * forceRatio, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    crackSrc.connect(highpass);
    highpass.connect(peaking);
    peaking.connect(crackGain);
    crackGain.connect(ctx.destination);
    crackSrc.start(now);

    // 2. Kinetic sub-bass thud (110Hz -> 35Hz drop)
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = isCritical ? 'triangle' : 'sine';
    subOsc.frequency.setValueAtTime(120 * forceRatio, now);
    subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.28);

    subGain.gain.setValueAtTime(0.6 * forceRatio, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.33);

    // 3. Metallic shockwave reverb tail for Critical Slaps (>150N)
    if (isCritical || newtonForce > 150) {
      const metalOsc = ctx.createOscillator();
      const metalGain = ctx.createGain();
      metalOsc.type = 'sawtooth';
      metalOsc.frequency.setValueAtTime(380, now + 0.02);
      metalOsc.frequency.exponentialRampToValueAtTime(80, now + 0.45);

      const metalFilter = ctx.createBiquadFilter();
      metalFilter.type = 'bandpass';
      metalFilter.frequency.setValueAtTime(650, now);
      metalFilter.Q.value = 4.0;

      metalGain.gain.setValueAtTime(0.25, now + 0.02);
      metalGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      metalOsc.connect(metalFilter);
      metalFilter.connect(metalGain);
      metalGain.connect(ctx.destination);
      metalOsc.start(now + 0.02);
      metalOsc.stop(now + 0.52);
    }
  }

  public playSlapImpact(damage: number, isCritical: boolean): void {
    const approxNewton = Math.round(75 + damage * 1.4);
    this.playSlapSound(approxNewton, isCritical);
  }

  public playCrowdReaction(isKO: boolean): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const duration = isKO ? 2.0 : 0.9;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const t = i / ctx.sampleRate;
      const mod = 0.7 + 0.3 * Math.sin(t * 26);
      data[i] = (Math.random() * 2 - 1) * mod;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.linearRampToValueAtTime(isKO ? 1050 : 680, now + 0.28);
    filter.frequency.exponentialRampToValueAtTime(340, now + duration);
    filter.Q.value = 1.1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(isKO ? 0.3 : 0.14, now + 0.14);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);

    // Multi-oscillator stadium horn chord on KO
    if (isKO) {
      const hornFreqs = [220, 277.18, 329.63]; // A major triad
      hornFreqs.forEach((hf) => {
        const horn = ctx.createOscillator();
        const hGain = ctx.createGain();
        horn.type = 'sawtooth';
        horn.frequency.setValueAtTime(hf, now + 0.05);
        hGain.gain.setValueAtTime(0.06, now + 0.05);
        hGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        horn.connect(hGain);
        hGain.connect(ctx.destination);
        horn.start(now + 0.05);
        horn.stop(now + 1.25);
      });
    }
  }

  public playKOBassDrop(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(110, now);
    sub.frequency.exponentialRampToValueAtTime(24, now + 1.35);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(260, now);
    lowpass.frequency.exponentialRampToValueAtTime(55, now + 1.35);

    subGain.gain.setValueAtTime(0.45, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

    sub.connect(lowpass);
    lowpass.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 1.42);

    // Boxing bell double ding
    [0.05, 0.28].forEach((offset) => {
      const bell = ctx.createOscillator();
      const bellGain = ctx.createGain();
      bell.type = 'sine';
      bell.frequency.setValueAtTime(920, now + offset);
      bellGain.gain.setValueAtTime(0.2, now + offset);
      bellGain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.85);

      bell.connect(bellGain);
      bellGain.connect(ctx.destination);
      bell.start(now + offset);
      bell.stop(now + offset + 0.9);
    });
  }

  public playSpecialActivate(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = [330, 440, 660, 880];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + idx * 0.045);
      gain.gain.setValueAtTime(0.12, now + idx * 0.045);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.045 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.045);
      osc.stop(now + idx * 0.045 + 0.24);
    });
  }

  /**
   * Browser Speech Synthesis for Cocky CEO Trash-Talk
   */
  public speakTaunt(text: string, pitch: number = 1.0, rate: number = 1.05): void {
    if (this.muted) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = 0.95;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Ignore if browser policy restricts speech before user interaction
    }
  }

  public getContenderTaunt(
    fighterId: string,
    type: 'VICTORY' | 'FAKEOUT' | 'PRE_SLAP'
  ): string {
    if (type === 'FAKEOUT') {
      const fakeoutPool = [
        'Too jumpy!',
        'Just testing the air!',
        'You blinked!',
        'Flinch detected!',
        'Did you see that wind-up?'
      ];
      return fakeoutPool[Math.floor(Math.random() * fakeoutPool.length)];
    }

    if (type === 'PRE_SLAP') {
      switch (fighterId) {
        case 'musk':
          return 'Taking your jaw to Mars!';
        case 'bezos':
          return 'Special delivery for that cheek!';
        case 'huang':
          return 'More slaps you buy, more you save!';
        case 'zuckerberg':
          return 'Send me location!';
        case 'ellison':
          return 'Your license expires right now!';
        case 'altman':
          return 'Simulating your knockout in 4K.';
        case 'nadella':
          return 'Copilot says watch your chin.';
        case 'gates':
          return 'Prepare for blue screen!';
        case 'pichai':
          return 'Indexing your chin coordinates.';
        case 'amodei':
          return 'Testing constitutional guardrails.';
        default:
          return 'Step up to the podium!';
      }
    }

    // VICTORY
    switch (fighterId) {
      case 'musk':
        return 'To Mars, baby! Next!';
      case 'bezos':
        return 'Same-day delivery on that chin!';
      case 'huang':
        return 'More slaps you buy, more you save!';
      case 'zuckerberg':
        return 'Send me location!';
      case 'ellison':
        return 'Your license just expired!';
      case 'altman':
        return 'Feel the AGI!';
      case 'nadella':
        return 'Copilot predicted that!';
      case 'gates':
        return 'Fatal system exception. Blue screen for you!';
      case 'pichai':
        return 'Organizing your chin data.';
      case 'amodei':
        return 'Safety test failed. Inadequate guardrails.';
      default:
        return 'Knockout confirmed!';
    }
  }
}

export const soundEngine = new SlapAudioEngine();
