import { SONGS, type Song, type Voice } from './songs';

/** Steps scheduled ahead of the audio clock (s), and how often the scheduler wakes (ms). */
const LOOKAHEAD = 0.25;
const TICK_MS = 50;

interface Note {
  step: number;
  steps: number;
  /** MIDI note, or a drum name. */
  pitch: number | 'k' | 's' | 'h';
}

interface CompiledTrack {
  voice: Voice;
  gain: number;
  notes: Note[];
}

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#5" → 73. */
function midi(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note "${name}"`);
  return 12 * (Number(m[3]) + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** "C5:2 -:1 k:1 | …": pitch or drum or rest, and its length in steps. Bars ("|") are only for reading. */
export function compileTrack(text: string): { notes: Note[]; steps: number } {
  const notes: Note[] = [];
  let step = 0;
  for (const token of text.split(/\s+/)) {
    if (!token || token === '|') continue;
    const [name, len] = token.split(':');
    const steps = Number(len ?? 1);
    if (!(steps > 0)) throw new Error(`bad length in "${token}"`);
    if (name !== '-') notes.push({ step, steps, pitch: name === 'k' || name === 's' || name === 'h' ? name : midi(name) });
    step += steps;
  }
  return { notes, steps: step };
}

export function compileSong(song: Song): { tracks: CompiledTrack[]; steps: number } {
  let steps = 0;
  const tracks = song.tracks.map((t) => {
    const c = compileTrack(t.notes);
    if (steps && c.steps !== steps) throw new Error(`song "${song.id}": tracks have different lengths (${steps} vs ${c.steps})`);
    steps = c.steps;
    return { voice: t.voice, gain: t.gain ?? 1, notes: c.notes };
  });
  return { tracks, steps };
}

const hz = (m: number): number => 440 * 2 ** ((m - 69) / 12);

/**
 * Background music: original tunes (src/audio/songs.ts) played on small synth voices, looped, scheduled a
 * little ahead of the audio clock. One song at a time; volume from the "おんがく" setting.
 */
export class MusicPlayer {
  private readonly out: GainNode;
  private noise: AudioBuffer | null = null;
  private song: ReturnType<typeof compileSong> | null = null;
  private songId: string | null = null;
  private stepSeconds = 0.25;
  private nextStep = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private paused = false;

  constructor(
    private readonly ctx: BaseAudioContext,
    destination: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.connect(destination);
  }

  /** 0..1 ("けす" = 0 stops scheduling altogether). */
  setVolume(gain: number): void {
    this.out.gain.setTargetAtTime(gain * 0.5, this.ctx.currentTime, 0.05);
  }

  get current(): string | null {
    return this.songId;
  }

  play(id: string): void {
    if (this.songId === id) return;
    const def = SONGS[id];
    if (!def) throw new Error(`unknown song "${id}"`);
    this.stop();
    this.song = compileSong(def);
    this.songId = id;
    this.stepSeconds = 60 / def.bpm / def.stepsPerBeat;
    this.nextStep = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.song = null;
    this.songId = null;
  }

  /** Holds the tune (the pause menu); it picks up where it was. */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    if (!paused) this.nextTime = this.ctx.currentTime + 0.05;
  }

  private schedule(): void {
    const song = this.song;
    if (!song || this.paused || this.ctx.state !== 'running') {
      // Keep the clock from running away while nothing plays (a locked context, a pause).
      this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.05);
      return;
    }
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.playStep(song, this.nextStep % song.steps, this.nextTime, this.stepSeconds);
      this.nextStep += 1;
      this.nextTime += this.stepSeconds;
    }
  }

  private playStep(song: ReturnType<typeof compileSong>, step: number, at: number, stepSeconds: number): void {
    for (const track of song.tracks) {
      for (const note of track.notes) {
        if (note.step === step) this.voice(track.voice, note, at, note.steps * stepSeconds, track.gain);
      }
    }
  }

  /** Schedules a whole song from time 0 for `seconds` (offline rendering: tools/music-render.html). */
  scheduleAll(id: string, seconds: number): void {
    const def = SONGS[id];
    const song = compileSong(def);
    const stepSeconds = 60 / def.bpm / def.stepsPerBeat;
    for (let n = 0; n * stepSeconds < seconds; n++) this.playStep(song, n % song.steps, 0.05 + n * stepSeconds, stepSeconds);
  }

  private envelope(at: number, attack: number, peak: number, hold: number, release: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.setValueAtTime(peak, at + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
    g.connect(this.out);
    return g;
  }

  private osc(type: OscillatorType, freq: number, at: number, until: number, to: AudioNode): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    o.connect(to);
    o.start(at);
    o.stop(until + 0.05);
    return o;
  }

  private noiseBuffer(): AudioBuffer {
    if (!this.noise) {
      const n = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
      const data = n.getChannelData(0);
      let seed = 7;
      for (let i = 0; i < data.length; i++) {
        seed = (seed * 16807) % 2147483647;
        data[i] = (seed / 2147483647) * 2 - 1;
      }
      this.noise = n;
    }
    return this.noise;
  }

  private voice(voice: Voice, note: Note, at: number, length: number, gain: number): void {
    const p = note.pitch;
    if (p === 'k') {
      const g = this.envelope(at, 0.005, 0.5 * gain, 0, 0.18);
      const o = this.osc('sine', 120, at, at + 0.2, g);
      o.frequency.exponentialRampToValueAtTime(45, at + 0.15);
      return;
    }
    if (p === 's' || p === 'h') {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer();
      const f = this.ctx.createBiquadFilter();
      f.type = p === 'h' ? 'highpass' : 'bandpass';
      f.frequency.value = p === 'h' ? 7000 : 1800;
      const g = this.envelope(at, 0.003, (p === 'h' ? 0.12 : 0.25) * gain, 0, p === 'h' ? 0.05 : 0.14);
      src.connect(f);
      f.connect(g);
      src.start(at);
      src.stop(at + 0.2);
      return;
    }
    const f = hz(p);
    switch (voice) {
      case 'lead': {
        // Soft square through a low-pass: a toy flute.
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2200;
        const g = this.envelope(at, 0.015, 0.16 * gain, Math.max(0, length * 0.7 - 0.015), 0.12);
        lp.connect(g);
        this.osc('square', f, at, at + length + 0.15, lp);
        return;
      }
      case 'bass': {
        const g = this.envelope(at, 0.01, 0.35 * gain, Math.max(0, length * 0.6), 0.1);
        this.osc('triangle', f, at, at + length + 0.12, g);
        return;
      }
      case 'bell': {
        // Music box: a sine with a quiet partial two octaves up, ringing out.
        const g = this.envelope(at, 0.004, 0.22 * gain, 0, 1.1);
        this.osc('sine', f, at, at + 1.2, g);
        const g2 = this.envelope(at, 0.002, 0.05 * gain, 0, 0.35);
        this.osc('sine', f * 4, at, at + 0.4, g2);
        return;
      }
      case 'wood': {
        // Marimba-ish: short and round.
        const g = this.envelope(at, 0.003, 0.3 * gain, 0, 0.4);
        this.osc('sine', f, at, at + 0.45, g);
        const g2 = this.envelope(at, 0.001, 0.06 * gain, 0, 0.05);
        this.osc('triangle', f * 3.9, at, at + 0.08, g2);
        return;
      }
      case 'pad': {
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        const g = this.envelope(at, Math.min(0.4, length / 3), 0.09 * gain, Math.max(0, length * 0.6), 0.5);
        lp.connect(g);
        this.osc('sawtooth', f, at, at + length + 0.6, lp);
        this.osc('sawtooth', f * 1.004, at, at + length + 0.6, lp);
        return;
      }
    }
  }
}
