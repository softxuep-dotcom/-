type EffectName = "ui" | "fling" | "impact" | "spring" | "victory" | "failure";

export class AudioSystem {
  private context: AudioContext | null = null;
  private musicEnabled = true;
  private effectsEnabled = true;
  private suspended = false;
  private externallyMuted = false;
  private musicTimer = 0;
  private beat = 0;

  configure(music: boolean, effects: boolean): void {
    this.musicEnabled = music;
    this.effectsEnabled = effects;
    this.refreshMusic();
  }

  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    this.refreshMusic();
  }

  setExternalMute(muted: boolean): void {
    this.externallyMuted = muted;
    this.refreshMusic();
  }

  async unlock(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
    }
    if (this.context.state === "suspended") {
      await this.context.resume().catch(() => undefined);
    }
    this.refreshMusic();
  }

  play(name: EffectName, strength = 1): void {
    if (!this.effectsEnabled || this.suspended || this.externallyMuted) return;
    const context = this.context;
    if (!context || context.state !== "running") return;
    const now = context.currentTime;
    switch (name) {
      case "ui":
        this.tone(now, 280, 0.045, "square", 0.025);
        break;
      case "fling":
        this.slide(now, 180, 540, 0.16, "triangle", 0.06);
        break;
      case "impact":
        this.tone(
          now,
          90 + Math.min(150, strength * 45),
          0.09,
          "sine",
          0.02 + strength * 0.015,
        );
        break;
      case "spring":
        this.slide(now, 170, 720, 0.22, "sine", 0.08);
        break;
      case "victory":
        [0, 0.09, 0.18, 0.32].forEach((offset, index) => {
          this.tone(
            now + offset,
            [523, 659, 784, 1046][index]!,
            0.28,
            "triangle",
            0.07,
          );
        });
        break;
      case "failure":
        this.slide(now, 260, 105, 0.45, "sawtooth", 0.045);
        break;
    }
  }

  dispose(): void {
    window.clearTimeout(this.musicTimer);
    void this.context?.close();
    this.context = null;
  }

  private refreshMusic(): void {
    const active =
      this.musicEnabled &&
      !this.suspended &&
      !this.externallyMuted &&
      this.context?.state === "running";
    if (active && !this.musicTimer) this.scheduleBeat();
    if (!active && this.musicTimer) {
      window.clearTimeout(this.musicTimer);
      this.musicTimer = 0;
    }
  }

  private scheduleBeat(): void {
    const context = this.context;
    if (
      !context ||
      !this.musicEnabled ||
      this.suspended ||
      this.externallyMuted
    ) {
      this.musicTimer = 0;
      return;
    }
    const notes = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
    const note = notes[this.beat % notes.length]!;
    this.tone(context.currentTime, note, 0.18, "triangle", 0.018);
    if (this.beat % 2 === 0)
      this.tone(context.currentTime, note / 2, 0.25, "sine", 0.012);
    this.beat += 1;
    this.musicTimer = window.setTimeout(() => this.scheduleBeat(), 330);
  }

  private tone(
    start: number,
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
  ): void {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private slide(
    start: number,
    from: number,
    to: number,
    duration: number,
    type: OscillatorType,
    volume: number,
  ): void {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}
