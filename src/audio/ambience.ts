import type { AmbienceKind } from '../stage/types';
import { noiseSource } from './noise';

/** Overall level of the ambience: always well under the train and the effects. */
const LEVEL = 0.55;
/** Seconds to fade in, and out when paused or changed. */
const FADE = 1.2;

/**
 * A quiet bed of sound around the island, all synthesized: a steady layer (wind, waves, a distant town, grass)
 * with a slow swell, and little things now and then (birds, crickets, a wind chime, a seabird). The small
 * things come at seeded random times, so every visit sounds the same. Nothing loud, nothing scary.
 */
export class Ambience {
  private readonly bus: GainNode;
  private readonly stops: (() => void)[] = [];
  /** Seconds until the next little sound. */
  private nextIn = 1.5;
  private seed = 0x51f15e;
  private paused = false;

  constructor(
    private readonly ctx: BaseAudioContext,
    out: AudioNode,
    readonly kind: AmbienceKind,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(out);
    this.bus.gain.setTargetAtTime(LEVEL, ctx.currentTime, FADE / 3);
    this.bed();
  }

  /** Every frame (real time, so the birds keep singing while a card is up). */
  update(dt: number): void {
    if (this.paused) return;
    this.nextIn -= dt;
    if (this.nextIn > 0) return;
    const [min, max] = GAPS[this.kind];
    this.nextIn = min + (max - min) * this.random();
    this.little();
  }

  /** The pause menu: fade out (and hold the little sounds); fade back in after. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.bus.gain.setTargetAtTime(paused ? 0 : LEVEL, this.ctx.currentTime, 0.2);
  }

  /** Fades out and lets everything go. */
  stop(): void {
    const at = this.ctx.currentTime;
    this.bus.gain.setTargetAtTime(0, at, FADE / 4);
    for (const stop of this.stops) stop();
  }

  private random(): number {
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5;
    return (this.seed >>> 0) / 0xffffffff;
  }

  /** A noise layer: `color` through `filter` at `freq`, at `gain`, its level swelling by `swell` every `period` s. */
  private layer(color: 'white' | 'pink' | 'brown', filter: BiquadFilterType, freq: number, q: number, gain: number, swell = 0, period = 8): void {
    const ctx = this.ctx;
    const at = ctx.currentTime;
    const src = noiseSource(ctx, color, at);
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f);
    f.connect(g);
    g.connect(this.bus);
    let lfo: OscillatorNode | null = null;
    if (swell > 0) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = 1 / period;
      const depth = ctx.createGain();
      depth.gain.value = gain * swell;
      lfo.connect(depth);
      depth.connect(g.gain);
      lfo.start(at);
    }
    this.stops.push(() => {
      const end = ctx.currentTime + FADE;
      src.stop(end);
      lfo?.stop(end);
    });
  }

  /** The steady layer of each island. */
  private bed(): void {
    switch (this.kind) {
      case 'town':
        // A distant, soft murmur of a town.
        this.layer('pink', 'bandpass', 420, 0.5, 0.05, 0.3, 11);
        this.layer('brown', 'lowpass', 160, 0.7, 0.05, 0.2, 7);
        break;
      case 'valley':
        // Wind through a wide valley, rising and falling.
        this.layer('pink', 'bandpass', 520, 0.6, 0.07, 0.6, 9);
        this.layer('brown', 'lowpass', 200, 0.7, 0.05, 0.4, 13);
        break;
      case 'sky':
        // High, airy wind above the clouds.
        this.layer('white', 'bandpass', 2400, 0.5, 0.035, 0.5, 10);
        this.layer('pink', 'bandpass', 800, 0.6, 0.045, 0.6, 7);
        break;
      case 'forest':
        // Leaves rustling high up.
        this.layer('pink', 'highpass', 2200, 0.6, 0.035, 0.6, 6);
        this.layer('brown', 'lowpass', 180, 0.7, 0.03, 0.2, 12);
        break;
      case 'meadow':
        // Grass in a breeze.
        this.layer('pink', 'bandpass', 1600, 0.5, 0.055, 0.5, 8);
        break;
      case 'sea':
        // Waves coming in, and the volcano grumbling very softly far away.
        this.layer('pink', 'lowpass', 900, 0.6, 0.08, 0.8, 7);
        this.layer('brown', 'lowpass', 90, 0.7, 0.05, 0.3, 17);
        break;
    }
  }

  /** One little sound of the island, now. */
  private little(): void {
    const r = this.random();
    switch (this.kind) {
      case 'town':
        if (r < 0.7) this.chirp(3200 + 600 * this.random(), 2 + Math.floor(3 * this.random()), 0.05);
        else this.chime(1568, 0.03);
        break;
      case 'valley':
        this.chirp(2400 + 500 * this.random(), 2, 0.04);
        break;
      case 'sky':
        this.chime(2093 + 400 * this.random(), 0.035);
        break;
      case 'forest':
        if (r < 0.5) this.chirp(3600 + 900 * this.random(), 3 + Math.floor(4 * this.random()), 0.06);
        else this.warble(2600 + 500 * this.random(), 0.05);
        break;
      case 'meadow':
        if (r < 0.75) this.cricket(4200 + 500 * this.random(), 0.05);
        else this.chirp(3400, 2, 0.04);
        break;
      case 'sea':
        if (r < 0.4) this.gull(0.04);
        else this.wave(0.08);
        break;
    }
  }

  /** A small bird: `count` quick falling "ちゅん"s. */
  private chirp(freq: number, count: number, gain: number): void {
    for (let i = 0; i < count; i++) this.tweet(freq * (1 + 0.05 * (i % 2)), i * 0.11, 0.06, gain, freq * 0.75);
  }

  /** A songbird's short rising and falling phrase. */
  private warble(freq: number, gain: number): void {
    const notes = [1, 1.25, 1.12, 1.33, 1.2];
    notes.forEach((k, i) => this.tweet(freq * k, i * 0.09, 0.08, gain, freq * k * 1.1));
  }

  /** A cricket: a few trills of short pulses. */
  private cricket(freq: number, gain: number): void {
    for (let t = 0; t < 3; t++) for (let p = 0; p < 4; p++) this.tweet(freq, t * 0.32 + p * 0.028, 0.018, gain, freq);
  }

  /** A seabird far off: a soft "みゃあ" falling. */
  private gull(gain: number): void {
    for (let i = 0; i < 2; i++) this.tweet(1400, i * 0.35, 0.28, gain, 900, 'triangle');
  }

  /** A wave breaking a little closer than the rest. */
  private wave(gain: number): void {
    const ctx = this.ctx;
    const at = ctx.currentTime;
    const src = noiseSource(ctx, 'pink', at);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, at);
    f.frequency.linearRampToValueAtTime(1800, at + 1.2);
    f.frequency.linearRampToValueAtTime(400, at + 3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 3);
    src.connect(f);
    f.connect(g);
    g.connect(this.bus);
    src.stop(at + 3.1);
  }

  /** A wind chime: one bell with its partials. */
  private chime(freq: number, gain: number): void {
    this.tweet(freq, 0, 1.4, gain, freq, 'sine', 0.003);
    this.tweet(freq * 2.76, 0, 0.5, gain * 0.3, freq * 2.76, 'sine', 0.002);
  }

  /** One enveloped tone into the ambience. */
  private tweet(freq: number, delay: number, seconds: number, gain: number, endFreq: number, type: OscillatorType = 'sine', attack = 0.008): void {
    const ctx = this.ctx;
    const at = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, at + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    osc.connect(g);
    g.connect(this.bus);
    osc.start(at);
    osc.stop(at + seconds + 0.05);
  }
}

/** Seconds between little sounds, [shortest, longest], per island. */
const GAPS: Record<AmbienceKind, [number, number]> = {
  town: [3, 8],
  valley: [5, 11],
  sky: [3, 7],
  forest: [1.5, 4],
  meadow: [1.2, 3.5],
  sea: [3, 7],
};
