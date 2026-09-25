import { MusicPlayer } from './music';

/** Synthesized sound effects and music (no audio assets, fully original). The context unlocks on the first tap. */
export class AudioEngine {
  private music: MusicPlayer | null = null;
  /** The song asked for, started as soon as the context exists (iPad needs a tap first). */
  private song: string | null = null;
  private musicLevel = 1;
  private musicPaused = false;
  private ctx: AudioContext | null = null;
  /** Every sound effect goes through this gain (the "こうかおん" setting). */
  private sfx: GainNode | null = null;
  private sfxLevel = 1;

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = this.sfxLevel;
      this.sfx.connect(this.ctx.destination);
      this.music = new MusicPlayer(this.ctx, this.ctx.destination);
      this.music.setVolume(this.musicLevel);
      this.music.setPaused(this.musicPaused);
      if (this.song) this.music.play(this.song);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Plays a song from src/audio/songs.ts (null = silence). Asking again for the playing song does nothing. */
  playMusic(id: string | null): void {
    this.song = id;
    if (!this.music) return;
    if (id) this.music.play(id);
    else this.music.stop();
  }

  /** Music volume, 0..1 (0 = off). */
  setMusicVolume(gain: number): void {
    this.musicLevel = gain;
    this.music?.setVolume(gain);
  }

  /** Holds the music (the pause menu). */
  setMusicPaused(paused: boolean): void {
    this.musicPaused = paused;
    this.music?.setPaused(paused);
  }

  /** The song playing or waiting for the first tap. */
  get musicId(): string | null {
    return this.song;
  }

  /** Stage clear: a short rising fanfare. */
  playFanfare(): void {
    const notes: [number, number][] = [
      [523, 0],
      [659, 120],
      [784, 240],
      [1047, 380],
    ];
    for (const [f, delay] of notes) window.setTimeout(() => this.tone(f, delay === 380 ? 0.6 : 0.18, 'triangle', 0.18), delay);
  }

  /** A record found: a sparkly three-note arpeggio. */
  playRecord(): void {
    for (const [f, delay] of [
      [1175, 0],
      [1568, 90],
      [2093, 180],
    ] as [number, number][]) {
      window.setTimeout(() => this.tone(f, 0.35, 'sine', 0.12), delay);
    }
  }

  /** Sound-effect volume, 0..1 (applies to sounds started from now on and to ones still playing). */
  setSoundVolume(gain: number): void {
    this.sfxLevel = gain;
    if (this.sfx) this.sfx.gain.value = gain;
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
    filter.connect(this.sfx ?? ctx.destination);

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

  /** Short helper for one-shot tones. */
  private tone(freq: number, seconds: number, type: OscillatorType, gain = 0.2, endFreq = freq): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, now + seconds);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    osc.connect(g);
    g.connect(this.sfx ?? ctx.destination);
    osc.start(now);
    osc.stop(now + seconds + 0.05);
  }

  /** Stop grade: a rising two-note chime for perfect, one note for ok. */
  playStop(kind: 'perfect' | 'ok'): void {
    this.tone(660, 0.18, 'sine', 0.2);
    if (kind === 'perfect') window.setTimeout(() => this.tone(990, 0.3, 'sine', 0.2), 140);
  }

  playDoor(open: boolean): void {
    this.tone(open ? 300 : 420, 0.25, 'triangle', 0.15, open ? 420 : 300);
  }

  /** Comical "boing" for a fail. */
  playBoing(): void {
    this.tone(220, 0.45, 'square', 0.12, 110);
  }

  /** Brake squeal for the hard brake. */
  playSqueal(): void {
    this.tone(1800, 0.5, 'sawtooth', 0.05, 900);
  }

  playCard(): void {
    this.tone(523, 0.12, 'triangle', 0.15);
    window.setTimeout(() => this.tone(784, 0.2, 'triangle', 0.15), 110);
  }

  /** "ぴょん": a quick rising hop. */
  playJump(): void {
    this.tone(330, 0.22, 'sine', 0.2, 880);
  }

  /** Soft thump on landing. */
  playLand(): void {
    this.tone(160, 0.18, 'triangle', 0.18, 90);
  }

  /** "ひゅ〜… ぽよん": a slow slide down, then a soft bounce (not scary). */
  playFall(): void {
    this.tone(900, 0.8, 'sine', 0.12, 220);
    window.setTimeout(() => this.tone(260, 0.35, 'sine', 0.18, 520), 850);
  }

  playLight(on: boolean): void {
    this.tone(on ? 1200 : 700, 0.08, 'square', 0.06);
  }
}
