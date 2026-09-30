import type { AmbienceKind } from '../stage/types';
import { noiseSource } from './noise';

/** Overall level of the ambience: always well under the train and the effects. */
const LEVEL = 0.55;
/** Seconds to fade in, and out when paused or changed; also the crossfade into and out of the water. */
const FADE = 1.2;

/**
 * A quiet bed of sound around the island, all synthesized: a steady layer (wind, waves, a distant town, grass)
 * with a slow swell, and little things now and then (birds, crickets, a wind chime, a seabird). The small
 * things come at seeded random times, so every visit sounds the same. Nothing loud, nothing scary.
 *
 * Under water (setUnderwater) the island's sound crossfades to the "underwater" bed and its little sounds, and
 * back again when the train comes up.
 */
export class Ambience {
  private readonly bus: GainNode;
  /** The island's own sound, and the underwater one (made the first time the train goes under). */
  private readonly above: GainNode;
  private below: GainNode | null = null;
  /** Where layers and little sounds being made now go. */
  private into: GainNode;
  private underwater = false;
  private readonly stops: (() => void)[] = [];
  /** Seconds until the next little sound. */
  private nextIn = 1.5;
  private seed = 0x51f15e;
  private paused = false;
  /** The castle's big room: a soft echo the little sounds also feed (null on every other island). */
  private room: { send: GainNode; feedback: GainNode } | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    out: AudioNode,
    readonly kind: AmbienceKind,
    /** v1.10 (3-3): the sea's faraway volcano grumble only where there is a volcano (2-3; not 3-1 or 3-3). */
    private readonly volcano = true,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(out);
    this.bus.gain.setTargetAtTime(LEVEL, ctx.currentTime, FADE / 3);
    this.above = ctx.createGain();
    this.above.connect(this.bus);
    this.into = this.above;
    if (kind === 'castle') this.room = this.makeRoom();
    this.bed(kind);
  }

  /** A wide, quiet room: the little sounds come back once or twice, softer and duller each time. */
  private makeRoom(): { send: GainNode; feedback: GainNode } {
    const ctx = this.ctx;
    const send = ctx.createGain();
    send.gain.value = 0.5;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.27;
    const dull = ctx.createBiquadFilter();
    dull.type = 'lowpass';
    dull.frequency.value = 2600;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.4;
    send.connect(delay);
    delay.connect(dull);
    dull.connect(feedback);
    feedback.connect(delay);
    dull.connect(this.above);
    return { send, feedback };
  }

  /** The sound playing now: the island's, or "underwater" while under water. */
  get heard(): AmbienceKind {
    return this.underwater ? 'underwater' : this.kind;
  }

  /** Every frame (real time, so the birds keep singing while a card is up). */
  update(dt: number): void {
    if (this.paused) return;
    this.nextIn -= dt;
    if (this.nextIn > 0) return;
    const [min, max] = GAPS[this.heard];
    this.nextIn = min + (max - min) * this.random();
    this.into = this.underwater && this.below ? this.below : this.above;
    this.little(this.heard);
  }

  /**
   * The train goes under water (or comes up): crossfade to the underwater sound over about a second. Cheap to
   * call every frame; nothing happens unless it changes. An island whose own sound is "underwater" stays as it is.
   */
  setUnderwater(on: boolean): void {
    if (on === this.underwater || this.kind === 'underwater') return;
    this.underwater = on;
    const at = this.ctx.currentTime;
    if (on && !this.below) {
      this.below = this.ctx.createGain();
      this.below.gain.value = 0;
      this.below.connect(this.bus);
      this.into = this.below;
      this.bed('underwater');
    }
    this.above.gain.setTargetAtTime(on ? 0 : 1, at, FADE / 3);
    this.below?.gain.setTargetAtTime(on ? 1 : 0, at, FADE / 3);
    // A little sound of the new place soon, not after the old place's wait.
    this.nextIn = Math.min(this.nextIn, 0.8);
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
    this.room?.feedback.gain.setTargetAtTime(0, at, FADE / 4);
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
    g.connect(this.into);
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
  private bed(kind: AmbienceKind): void {
    switch (kind) {
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
        if (this.volcano) this.layer('brown', 'lowpass', 90, 0.7, 0.05, 0.3, 17);
        break;
      case 'underwater':
        // A soft, muffled hush of deep water, and a faraway murmur swaying slowly.
        this.layer('brown', 'lowpass', 220, 0.7, 0.07, 0.4, 9);
        this.layer('pink', 'bandpass', 600, 0.8, 0.02, 0.6, 5);
        break;
      case 'river':
        // Water running over stones (the babble), and the river's low flow under it.
        this.layer('pink', 'bandpass', 1500, 0.7, 0.03, 0.5, 7);
        this.layer('white', 'bandpass', 3400, 1.2, 0.008, 0.6, 3);
        this.layer('brown', 'lowpass', 260, 0.7, 0.035, 0.3, 11);
        break;
      case 'ice':
        // A thin, cold, high wind and a low breath under it.
        this.layer('white', 'bandpass', 3200, 1, 0.02, 0.5, 11);
        this.layer('pink', 'lowpass', 400, 0.7, 0.03, 0.3, 13);
        break;
      case 'snow':
        // The hush of falling snow: a soft low wind and the faintest fine hiss of flakes.
        this.layer('pink', 'lowpass', 500, 0.7, 0.05, 0.5, 10);
        this.layer('pink', 'highpass', 5000, 0.7, 0.006, 0.4, 6);
        break;
      case 'night':
        // A soft night breeze, slowly rising and falling.
        this.layer('pink', 'lowpass', 350, 0.7, 0.04, 0.4, 12);
        break;
      case 'toy':
        // The air of a playroom: a faint, mid, papery hush.
        this.layer('pink', 'bandpass', 1200, 0.6, 0.015, 0.3, 10);
        break;
      case 'mirror':
        // Only a thin shimmer of glass air. No steady tone on purpose: a constant hum would feel eerie.
        this.layer('white', 'bandpass', 6000, 0.4, 0.008);
        break;
      case 'castle':
        // A big, calm hall: a low-passed breath (the room's echo comes with the little sounds).
        this.layer('pink', 'lowpass', 600, 0.7, 0.03, 0.3, 14);
        break;
    }
  }

  /** One little sound of the island, now. */
  private little(kind: AmbienceKind): void {
    const r = this.random();
    switch (kind) {
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
      case 'underwater':
        if (r < 0.6) this.bubbles(3 + Math.floor(4 * this.random()), 0.04);
        else if (r < 0.82) this.chime(1760, 0.02);
        else this.whale(0.03);
        break;
      case 'river':
        if (r < 0.4) this.tweet(900, 0, 0.08, 0.04, 400);
        else if (r < 0.75) this.kingfisher(0.03);
        else this.frog(0.035);
        break;
      case 'ice':
        if (r < 0.45) {
          // "ちりん": two little bits of ice touching.
          const f = 2800 + 800 * this.random();
          this.chime(f, 0.03, 0.4);
          this.chime(f * 1.19, 0.02, 0.4, 0.09);
        } else if (r < 0.8) {
          this.squeak(0.02);
        } else {
          // A bell far across the lake.
          this.chime(880, 0.018, 2.2);
        }
        break;
      case 'snow':
        if (r < 0.5) this.wave(0.05, 300, 900);
        else if (r < 0.8) this.plop(0.04);
        else this.chirp(3000, 2, 0.03);
        break;
      case 'night':
        if (r < 0.6) this.suzumushi(0.02);
        else if (r < 0.85) this.nightFrog(0.015);
        else this.grain('pink', 'bandpass', 2000, 1, 0.3, 0.02, 0.1);
        break;
      case 'toy':
        if (r < 0.4) this.windup(0.015);
        else if (r < 0.7) this.musicBox(0.02);
        else this.tweet(700, 0, 0.07, 0.03, 600, 'sine', 0.002);
        break;
      case 'mirror':
        if (r < 0.5) {
          // "きらーん": two glass bells together, ringing out for over a second.
          this.tweet(1760, 0, 1.2, 0.02, 1760, 'sine', 0.004);
          this.tweet(2640, 0, 1.0, 0.012, 2640, 'sine', 0.004);
        } else if (r < 0.8) {
          this.reverseBell(2093 + 500 * this.random(), 0.012);
        } else {
          // "ちりちり": a few tiny, high ticks.
          const n = 3 + Math.floor(2 * this.random());
          for (let i = 0; i < n; i++) this.tweet(5200 + 900 * this.random(), i * 0.07, 0.03, 0.01, 5200, 'sine', 0.002);
        }
        break;
      case 'castle':
        if (r < 0.4) this.flags(0.02);
        else if (r < 0.7) this.faraway(0.02);
        else this.rollUp(0.02);
        break;
    }
  }

  /** A cricket-like bell insect: a high "りーん" that trembles about 30 times a second. */
  private suzumushi(gain: number): void {
    const ctx = this.ctx;
    const at = ctx.currentTime;
    const len = 0.5;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 4200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    // The tremble: the level swings by a third either way.
    const trem = ctx.createGain();
    trem.gain.value = 0.67;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 30;
    const depth = ctx.createGain();
    depth.gain.value = 0.33;
    lfo.connect(depth);
    depth.connect(trem.gain);
    osc.connect(trem);
    trem.connect(g);
    this.send(g);
    for (const o of [osc, lfo]) {
      o.start(at);
      o.stop(at + len + 0.05);
    }
  }

  /** A small frog far away: two tiny square-wave notes, "けろっ" (very quiet; not a croak). */
  private nightFrog(gain: number): void {
    this.tweet(600, 0, 0.06, gain, 560, 'square', 0.006);
    this.tweet(500, 0.09, 0.07, gain * 0.9, 460, 'square', 0.006);
  }

  /** A wind-up toy: a quick ratchet "じーっ" (a sawtooth buzz softened by a low-pass, chopped about 30 times a second). */
  private windup(gain: number): void {
    const ctx = this.ctx;
    const at = ctx.currentTime;
    const len = 0.3;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2000, at);
    osc.frequency.exponentialRampToValueAtTime(1500, at + len);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    const chop = ctx.createGain();
    chop.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 32;
    const depth = ctx.createGain();
    depth.gain.value = 0.4;
    lfo.connect(depth);
    depth.connect(chop.gain);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(lp);
    lp.connect(chop);
    chop.connect(g);
    this.send(g);
    for (const o of [osc, lfo]) {
      o.start(at);
      o.stop(at + len + 0.05);
    }
  }

  /** A music box plays three notes of a five-note scale (C D E G A), no tune in particular. */
  private musicBox(gain: number): void {
    const scale = [1047, 1175, 1319, 1568, 1760];
    for (let i = 0; i < 3; i++) {
      const f = scale[Math.floor(this.random() * scale.length)];
      this.chime(f, gain, 0.7, i * 0.22);
    }
  }

  /** A bell played backwards: it starts small and swells, then ends softly (high notes only, at most 0.4 s). */
  private reverseBell(freq: number, gain: number): void {
    const ctx = this.ctx;
    const at = ctx.currentTime;
    const swell = 0.35;
    const end = 0.05;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + swell);
    g.gain.exponentialRampToValueAtTime(0.0001, at + swell + end);
    osc.connect(g);
    this.send(g);
    osc.start(at);
    osc.stop(at + swell + end + 0.05);
  }

  /** Little flags fluttering in a hall: three to five soft puffs of air, "ぱたぱた". */
  private flags(gain: number): void {
    const n = 3 + Math.floor(3 * this.random());
    let t = 0;
    for (let i = 0; i < n; i++) {
      this.grain('pink', 'bandpass', 1300 + 500 * this.random(), 1.2, 0.05, gain, 0.008, t);
      t += 0.07 + 0.05 * this.random();
    }
  }

  /** A clock far away in the castle: two small bell strokes (never a low bell). */
  private faraway(gain: number): void {
    this.chime(660, gain, 1.6);
    this.chime(990, gain * 0.8, 1.6, 0.7);
  }

  /** The stairs of the upside-down castle: a bell run rolling up, "ぽろろん". */
  private rollUp(gain: number): void {
    [587, 740, 880, 1175, 1480].forEach((f, i) => this.chime(f, gain * (0.8 + 0.06 * i), 0.9, i * 0.11));
  }

  /** A short puff of noise: `color` through `filter` at `freq`, `seconds` long. */
  private grain(color: 'white' | 'pink' | 'brown', filter: BiquadFilterType, freq: number, q: number, seconds: number, gain: number, attack: number, delay = 0): void {
    const ctx = this.ctx;
    const at = ctx.currentTime + delay;
    const src = noiseSource(ctx, color, at);
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    src.connect(f);
    f.connect(g);
    this.send(g);
    src.stop(at + seconds + 0.05);
  }

  /** Sends a little sound to the island's bed (and into the castle's echo where there is one). */
  private send(g: AudioNode): void {
    g.connect(this.into);
    if (this.room && this.into === this.above) g.connect(this.room.send);
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

  /** "ぽこぽこ": a few small bubbles going up, each a quick rising blip. */
  private bubbles(count: number, gain: number): void {
    for (let i = 0; i < count; i++) {
      const f = 500 + 250 * this.random();
      this.tweet(f, i * 0.07 + 0.02 * this.random(), 0.05, gain * (1 - i * 0.08), f * 2.1);
    }
  }

  /** A whale far away: a low, soft hum sliding up and settling, like a slow "ぼえ〜" (gentle, not a foghorn). */
  private whale(gain: number): void {
    const ctx = this.ctx;
    const at = ctx.currentTime;
    const len = 2.2;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, at);
    osc.frequency.exponentialRampToValueAtTime(240, at + len * 0.45);
    osc.frequency.exponentialRampToValueAtTime(205, at + len);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 4.5;
    const depth = ctx.createGain();
    depth.gain.value = 3;
    lfo.connect(depth);
    depth.connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.6);
    g.gain.setValueAtTime(gain, at + len - 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    // Its octave, very quiet, so it is heard on a small speaker too.
    const octave = ctx.createOscillator();
    octave.type = 'sine';
    octave.frequency.setValueAtTime(360, at);
    octave.frequency.exponentialRampToValueAtTime(480, at + len * 0.45);
    octave.frequency.exponentialRampToValueAtTime(410, at + len);
    const og = ctx.createGain();
    og.gain.value = 0.35;
    octave.connect(og);
    og.connect(g);
    osc.connect(g);
    g.connect(this.into);
    for (const o of [osc, lfo, octave]) {
      o.start(at);
      o.stop(at + len + 0.05);
    }
  }

  /** A kingfisher over the river: a thin, quick "ちーっ ちっ" high up. */
  private kingfisher(gain: number): void {
    this.tweet(3700, 0, 0.14, gain, 4300);
    this.tweet(4100, 0.2, 0.06, gain * 0.8, 3600);
  }

  /** A frog on the bank: a short "けろっ" of two low notes (not a song). */
  private frog(gain: number): void {
    this.tweet(300, 0, 0.07, gain, 250, 'triangle');
    this.tweet(290, 0.1, 0.06, gain * 0.8, 240, 'triangle');
  }

  /** Ice settling: a tiny, high "きゅっ" (high and small on purpose: a low creak would be scary). */
  private squeak(gain: number): void {
    this.tweet(1150, 0, 0.09, gain, 900, 'triangle');
    this.tweet(1000, 0.1, 0.07, gain * 0.7, 820, 'triangle');
  }

  /** Snow sliding off a branch: a soft, low "どさっ". */
  private plop(gain: number): void {
    const ctx = this.ctx;
    const at = ctx.currentTime;
    const src = noiseSource(ctx, 'brown', at);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 250;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
    src.connect(f);
    f.connect(g);
    g.connect(this.into);
    src.stop(at + 0.3);
  }

  /** A wave breaking a little closer than the rest (or, lower, a gust of wind). */
  private wave(gain: number, low = 500, high = 1800): void {
    const ctx = this.ctx;
    const at = ctx.currentTime;
    const src = noiseSource(ctx, 'pink', at);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(low, at);
    f.frequency.linearRampToValueAtTime(high, at + 1.2);
    f.frequency.linearRampToValueAtTime(low * 0.8, at + 3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 3);
    src.connect(f);
    f.connect(g);
    g.connect(this.into);
    src.stop(at + 3.1);
  }

  /** A wind chime: one bell with its partials. */
  private chime(freq: number, gain: number, ring = 1.4, delay = 0): void {
    this.tweet(freq, delay, ring, gain, freq, 'sine', 0.003);
    this.tweet(freq * 2.76, delay, ring * 0.36, gain * 0.3, freq * 2.76, 'sine', 0.002);
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
    this.send(g);
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
  underwater: [1.5, 4],
  river: [2, 6],
  ice: [3, 7],
  snow: [3, 8],
  night: [2, 5],
  toy: [2.5, 6],
  mirror: [3, 7],
  castle: [3, 7],
};
