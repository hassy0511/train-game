/** Synthesized sound effects (no audio assets, fully original). The context unlocks on the first tap. */
export class AudioEngine {
  private ctx: AudioContext | null = null;

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** A two-tone steam-whistle-like chord with a soft attack and a short tail. */
  playWhistle(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.35, now + 0.06);
    master.gain.setValueAtTime(0.35, now + 0.55);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, now);
    master.connect(filter);
    filter.connect(ctx.destination);

    for (const base of [392, 523]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(base * 0.94, now);
      osc.frequency.exponentialRampToValueAtTime(base, now + 0.12);
      const vibrato = ctx.createOscillator();
      vibrato.frequency.value = 5.5;
      const vibratoGain = ctx.createGain();
      vibratoGain.gain.value = base * 0.006;
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc.frequency);
      osc.connect(master);
      osc.start(now);
      vibrato.start(now);
      osc.stop(now + 1.0);
      vibrato.stop(now + 1.0);
    }
  }
}
