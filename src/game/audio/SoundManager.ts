/**
 * SoundManager: Generador de efectos de sonido y ambientación espacial procedural.
 * Utiliza la API nativa de Web Audio: 100% libre de dependencias, ligero y sin
 * restricciones de derechos de autor ni archivos de terceros.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private ambientGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private isPlayingAmbient = false;
  private _muted = false;
  private volume = 0.5;

  private initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this._muted ? 0 : this.volume;
        this.masterGain.connect(this.ctx.destination);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.7;
        this.sfxGain.connect(this.masterGain);

        this.ambientGain = this.ctx.createGain();
        this.ambientGain.gain.value = 0.3;
        this.ambientGain.connect(this.masterGain);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public get muted(): boolean {
    return this._muted;
  }

  public setMuted(mute: boolean): void {
    this._muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(mute ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this._muted);
    return this._muted;
  }

  public setVolume(val: number): void {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx && !this._muted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  /** Reproduce un clic sutil de interfaz */
  public playClick(): void {
    const ctx = this.initContext();
    if (!ctx || this._muted || !this.sfxGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  }

  /** Reproduce sonido de pasos al caminar */
  public playFootstep(): void {
    const ctx = this.initContext();
    if (!ctx || this._muted || !this.sfxGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  /** Efecto de captura óptica (obturador espacial / shutter) */
  public playCapture(): void {
    const ctx = this.initContext();
    if (!ctx || this._muted || !this.sfxGain) return;

    const t = ctx.currentTime;
    // Tono de recarga y disparo
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.08);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.22);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.26);

    // Chime armónico de confirmación
    const chime = ctx.createOscillator();
    const chimeGain = ctx.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(980, t + 0.12);
    chime.frequency.exponentialRampToValueAtTime(1470, t + 0.35);

    chimeGain.gain.setValueAtTime(0.12, t + 0.12);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    chime.connect(chimeGain);
    chimeGain.connect(this.sfxGain);
    chime.start(t + 0.12);
    chime.stop(t + 0.46);
  }

  /** Efecto de transmisión de datos (pulsos de frecuencia telemétrica) */
  public playTransmit(): void {
    const ctx = this.initContext();
    if (!ctx || this._muted || !this.sfxGain) return;

    const t = ctx.currentTime;
    const freqs = [740, 880, 1100, 1320];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = t + idx * 0.06;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.12, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(startTime);
      osc.stop(startTime + 0.055);
    });
  }

  /** Aviso sonoro de alerta o incidente (dos tonos ámbar) */
  public playAlert(): void {
    const ctx = this.initContext();
    if (!ctx || this._muted || !this.sfxGain) return;

    const t = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(440, t);
    gain1.gain.setValueAtTime(0.15, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc1.connect(gain1);
    gain1.connect(this.sfxGain);
    osc1.start(t);
    osc1.stop(t + 0.13);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(370, t + 0.15);
    gain2.gain.setValueAtTime(0.15, t + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc2.connect(gain2);
    gain2.connect(this.sfxGain);
    osc2.start(t + 0.15);
    osc2.stop(t + 0.31);
  }

  /** Inicia música ambiental espacial sintetizada (pad atmosférico relajante) */
  public startAmbientMusic(): void {
    if (this.isPlayingAmbient) return;
    const ctx = this.initContext();
    if (!ctx || !this.ambientGain) return;

    this.isPlayingAmbient = true;
    const chords = [
      [130.81, 196.0, 261.63], // C3, G3, C4
      [116.54, 174.61, 233.08], // Bb2, F3, Bb3
      [146.83, 220.0, 293.66], // D3, A3, D4
      [130.81, 196.0, 293.66], // C3, G3, D4 (Csus2)
    ];

    let chordIdx = 0;
    const playChord = () => {
      if (!this.isPlayingAmbient || !this.ctx || !this.ambientGain) return;
      const t = this.ctx.currentTime;
      const freqs = chords[chordIdx % chords.length];
      chordIdx++;

      freqs.forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const filter = this.ctx!.createBiquadFilter();
        const gain = this.ctx!.createGain();

        osc.type = i === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(450, t);
        filter.frequency.exponentialRampToValueAtTime(750, t + 2.5);
        filter.frequency.exponentialRampToValueAtTime(350, t + 5.5);

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.06, t + 1.8);
        gain.gain.linearRampToValueAtTime(0.001, t + 5.8);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ambientGain!);

        osc.start(t);
        osc.stop(t + 6.0);
      });

      if (this.isPlayingAmbient) {
        setTimeout(playChord, 5500);
      }
    };

    playChord();
  }

  public stopAmbientMusic(): void {
    this.isPlayingAmbient = false;
  }
}

export const soundManager = new SoundManager();
