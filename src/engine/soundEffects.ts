// Procedural Web Audio API Sound Engine — Zero External Audio Files

class SlapAudioEngine {
  private ctx: AudioContext | null = null;
  public muted: boolean = false;

  private getContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

  public playWindUpWhoosh(intensity: number = 1.0): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Filtered noise whoosh
    const bufferSize = ctx.sampleRate * 0.35;
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

  public playSlapImpact(damage: number, isCritical: boolean): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const norm = Math.min(1.4, Math.max(0.5, damage / 75));

    // 1. Sharp palm-to-cheek transient crack (high-frequency noise burst)
    const crackSize = Math.floor(ctx.sampleRate * 0.18);
    const crackBuf = ctx.createBuffer(1, crackSize, ctx.sampleRate);
    const crackData = crackBuf.getChannelData(0);
    for (let i = 0; i < crackSize; i++) {
      const env = Math.exp(-i / (ctx.sampleRate * 0.025));
      crackData[i] = (Math.random() * 2 - 1) * env;
    }

    const crackSrc = ctx.createBufferSource();
    crackSrc.buffer = crackBuf;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'peaking';
    bandpass.frequency.setValueAtTime(isCritical ? 1850 : 1350, now);
    bandpass.Q.value = 1.4;
    bandpass.gain.value = 8;

    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.55 * norm, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

    crackSrc.connect(bandpass);
    bandpass.connect(crackGain);
    crackGain.connect(ctx.destination);
    crackSrc.start(now);

    // 2. Kinetic sub-punch thud
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(150 * norm, now);
    subOsc.frequency.exponentialRampToValueAtTime(34, now + 0.28);

    subGain.gain.setValueAtTime(0.5 * norm, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.31);
  }

  public playCrowdReaction(isKO: boolean): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const duration = isKO ? 1.8 : 0.85;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const t = i / ctx.sampleRate;
      const mod = 0.7 + 0.3 * Math.sin(t * 28);
      data[i] = (Math.random() * 2 - 1) * mod;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.linearRampToValueAtTime(isKO ? 980 : 680, now + 0.25);
    filter.frequency.exponentialRampToValueAtTime(360, now + duration);
    filter.Q.value = 1.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(isKO ? 0.24 : 0.13, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
  }

  public playKOBassDrop(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Cinema KO sub-bass drop + championship bell
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(110, now);
    sub.frequency.exponentialRampToValueAtTime(24, now + 1.35);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(260, now);
    lowpass.frequency.exponentialRampToValueAtTime(55, now + 1.35);

    subGain.gain.setValueAtTime(0.42, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

    sub.connect(lowpass);
    lowpass.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 1.42);

    // Metallic bell ring
    const bell = ctx.createOscillator();
    const bellGain = ctx.createGain();
    bell.type = 'sine';
    bell.frequency.setValueAtTime(880, now + 0.08);
    bellGain.gain.setValueAtTime(0.18, now + 0.08);
    bellGain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);

    bell.connect(bellGain);
    bellGain.connect(ctx.destination);
    bell.start(now + 0.08);
    bell.stop(now + 1.28);
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
}

export const soundEngine = new SlapAudioEngine();
