import type { AmbienceKind } from '../stage/types';
import { Ambience } from './ambience';
import { MusicPlayer } from './music';
import { noiseBuffer, noiseSource, type NoiseColor } from './noise';
import { RunSound, type RunInput } from './run-sound';

/** Synthesized sound effects and music (no audio assets, fully original). The context unlocks on the first tap. */
export class AudioEngine {
  private music: MusicPlayer | null = null;
  /** The song asked for, started as soon as the context exists (iPad needs a tap first). */
  private song: string | null = null;
  private musicLevel = 1;
  private musicPaused = false;
  private ctx: BaseAudioContext | null = null;
  /** The context that plays (the one made on the first tap); an offline one only renders. */
  private live: AudioContext | null = null;
  /** Every sound effect goes through this gain (the "こうかおん" setting). */
  private sfx: GainNode | null = null;
  /** The train running ("たたん・たたん", "ごーっ"), made when the context is. */
  private run: RunSound | null = null;
  /** A small, soft room (a short reverb) that bells and chimes ring into. */
  private room: ConvolverNode | null = null;
  /** The island's sound around the train, and the one asked for (started once the context exists). */
  private ambience: Ambience | null = null;
  private ambienceKind: AmbienceKind | null = null;
  /** v1.10 (3-3): whether the island's sea sound has the faraway volcano in it. */
  private ambienceVolcano = true;
  /** v1.10 (3-2): a waterfall's steady "さーーっ" (made the first time one is heard) and its level now. */
  private falls: { gain: GainNode; stop: () => void } | null = null;
  private fallsLevel = 0;
  private sfxLevel = 1;
  /** Steps through a few notes of G major so the butterfly's bell does not repeat one pitch. */
  private butterflyNote = 0;

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const live = new Ctor();
      this.live = live;
      this.attach(live);
    }
    const live = this.live;
    // Suspended at first, or "interrupted" by iOS after a call or a trip to another app.
    if (!live || live.state === 'running') return;
    void live.resume();
    // Old iOS Safari also wants a sound started inside the gesture: one silent sample.
    const blip = live.createBufferSource();
    blip.buffer = live.createBuffer(1, 1, live.sampleRate);
    blip.connect(live.destination);
    blip.start();
  }

  /**
   * Unlocks the sound on the player's gestures. On a touch screen Safari lets sound start only in the handler of a
   * finished tap (touchend, pointerup, click), not when the finger goes down; so all of those are listened to, for
   * good: iOS can suspend the sound again later (a call, another app), and the next tap brings it back.
   */
  listenForGestures(target: EventTarget = window): void {
    const wake = (): void => {
      if (this.live?.state !== 'running') this.unlock();
    };
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
      target.addEventListener(type, wake, { capture: true, passive: true });
    }
  }

  /** The sound's state ("none" before the first tap): a hook for tests. */
  get state(): string {
    return this.live?.state ?? 'none';
  }

  /**
   * Builds the sound on a context: effects and music meet in a gentle compressor, so a pile of sounds at once
   * gets fuller rather than distorted. The sounds page (sounds.html) also attaches an OfflineAudioContext here to
   * measure each effect.
   */
  attach(ctx: BaseAudioContext, withMusic = ctx === this.live): void {
    this.ctx = ctx;
    const master = ctx.createDynamicsCompressor();
    master.threshold.value = -14;
    master.knee.value = 12;
    master.ratio.value = 4;
    master.attack.value = 0.003;
    master.release.value = 0.25;
    master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxLevel;
    this.sfx.connect(this.underwaterFilter(ctx, master));
    this.room = ctx.createConvolver();
    this.room.buffer = roomImpulse(ctx);
    const roomLevel = ctx.createGain();
    roomLevel.gain.value = 0.6;
    this.room.connect(roomLevel);
    roomLevel.connect(this.sfx);
    this.run = new RunSound(ctx, this.sfx);
    if (!withMusic) return;
    this.setAmbience(this.ambienceKind);
    this.music = new MusicPlayer(ctx, master);
    this.music.setVolume(this.musicLevel);
    this.music.setPaused(this.musicPaused);
    if (this.song) this.music.play(this.song);
  }

  /** Every frame: the train running (see RunSound). Silent until the first tap unlocks the sound. */
  updateRun(dt: number, input: RunInput): void {
    this.run?.update(dt, input);
    this.ambience?.update(dt);
  }

  /** The island's quiet sound around the train (null = none). Asking again for the one playing does nothing. */
  setAmbience(kind: AmbienceKind | null, volcano = this.ambienceVolcano): void {
    this.ambienceKind = kind;
    this.ambienceVolcano = volcano;
    const ctx = this.ctx;
    if (!ctx || !this.sfx || this.ambience?.kind === kind) return;
    this.ambience?.stop();
    this.ambience = kind ? new Ambience(ctx, this.sfx, kind, this.ambienceVolcano) : null;
    this.ambience?.setPaused(this.musicPaused);
  }

  /** Rail joints clicked so far and the running sound's level (hooks for tests and the sounds page). */
  get runStats(): { joints: number; releases: number; level: number } {
    return { joints: this.run?.joints ?? 0, releases: this.run?.releases ?? 0, level: this.run?.level ?? 0 };
  }

  /** "ぷしゅー" on its own (the sounds page). */
  playRelease(): void {
    this.run?.release();
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
    this.ambience?.setPaused(paused);
  }

  /** The song playing or waiting for the first tap. */
  get musicId(): string | null {
    return this.song;
  }

  /** Sound-effect volume, 0..1 (applies to sounds started from now on and to ones still playing). */
  setSoundVolume(gain: number): void {
    this.sfxLevel = gain;
    if (this.sfx) this.sfx.gain.value = gain;
  }

  // ---- building blocks --------------------------------------------------------------------------------------

  /**
   * Where one sound goes: straight to the effects bus at `level`, and `wet` of it into the small room (a short,
   * soft reverb that makes bells and chimes ring). Null before the context exists.
   */
  private out(wet = 0, level = 1): AudioNode | null {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return null;
    const g = ctx.createGain();
    g.gain.value = level;
    g.connect(this.sfx);
    if (wet > 0 && this.room) {
      const send = ctx.createGain();
      send.gain.value = wet;
      g.connect(send);
      send.connect(this.room);
    }
    return g;
  }

  /**
   * One enveloped oscillator on the audio clock, `delay` s from now: a short attack to `gain`, then an
   * exponential tail that is gone after `seconds`.
   */
  private ping(
    freq: number,
    delay: number,
    seconds: number,
    type: OscillatorType,
    gain: number,
    endFreq = freq,
    attack = 0.004,
    dest: AudioNode | null = this.out(),
  ): void {
    const ctx = this.ctx;
    if (!ctx || !dest) return;
    const at = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, at + seconds);
    g.gain.value = 0.0001;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    osc.connect(g);
    g.connect(dest);
    osc.start(at);
    osc.stop(at + seconds + 0.05);
  }

  /**
   * A burst of filtered noise ("しゅっ", "ぼふっ", "ざっ"): `color` noise through a `filter` at `freq` (sweeping to
   * `endFreq`), rising to `gain` over `attack` and gone after `seconds`.
   */
  private hiss(o: {
    color?: NoiseColor;
    delay?: number;
    seconds: number;
    gain: number;
    attack?: number;
    filter?: BiquadFilterType;
    freq: number;
    endFreq?: number;
    q?: number;
    dest?: AudioNode | null;
  }): void {
    const ctx = this.ctx;
    const dest = o.dest === undefined ? this.out() : o.dest;
    if (!ctx || !dest) return;
    const at = ctx.currentTime + (o.delay ?? 0);
    const src = noiseSource(ctx, o.color ?? 'white', at);
    const f = ctx.createBiquadFilter();
    f.type = o.filter ?? 'bandpass';
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.freq, at);
    if (o.endFreq !== undefined) f.frequency.exponentialRampToValueAtTime(o.endFreq, at + o.seconds);
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(o.gain, at + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, at + o.seconds);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.stop(at + o.seconds + 0.05);
  }

  /** A small music-box bell (like the music's bell voice): a sine and a quiet partial two octaves up. */
  private bell(freq: number, delay: number, gain: number, ring: number, dest: AudioNode | null = this.out(0.35)): void {
    this.ping(freq, delay, ring, 'sine', gain, freq, 0.004, dest);
    this.ping(freq * 4, delay, ring * 0.3, 'sine', gain * 0.2, freq * 4, 0.002, dest);
    this.ping(freq * 2.76, delay, ring * 0.15, 'sine', gain * 0.1, freq * 2.76, 0.002, dest);
  }

  /** "こつん": a tiny woodblock — a quick, slightly falling body and an off-key click on top. */
  private knock(freq: number, delay: number, gain: number, dest: AudioNode | null = this.out(0.1)): void {
    this.ping(freq, delay, 0.09, 'triangle', gain, freq * 0.9, 0.002, dest);
    this.ping(freq * 2.76, delay, 0.035, 'sine', gain * 0.35, freq * 2.76, 0.001, dest);
    this.hiss({ delay, seconds: 0.02, gain: gain * 0.4, freq: freq * 4, q: 2, dest });
  }

  /** "どすん" (soft): a low sine drop and a puff of low noise. */
  private thump(freq: number, delay: number, gain: number, seconds = 0.22, dest: AudioNode | null = this.out()): void {
    this.ping(freq, delay, seconds, 'sine', gain, freq * 0.5, 0.004, dest);
    this.hiss({ color: 'brown', delay, seconds: seconds * 0.8, gain: gain * 0.9, filter: 'lowpass', freq: 380, q: 0.7, dest });
  }

  // ---- the effects ------------------------------------------------------------------------------------------

  /** Stage clear: a rising fanfare on bright chords, the last one ringing out. */
  playFanfare(): void {
    const out = this.out(0.3);
    const steps: [number[], number, number][] = [
      [[523, 659], 0, 0.2],
      [[659, 784], 0.12, 0.2],
      [[784, 988], 0.24, 0.2],
      [[523, 659, 784, 1047], 0.38, 1.1],
    ];
    for (const [chord, delay, len] of steps) {
      for (const f of chord) {
        this.ping(f, delay, len, 'triangle', 0.1, f, 0.008, out);
        this.ping(f * 2, delay, len * 0.6, 'sine', 0.03, f * 2, 0.008, out);
      }
    }
    this.hiss({ delay: 0.38, seconds: 0.9, gain: 0.02, filter: 'highpass', freq: 6000, attack: 0.05, dest: out });
  }

  /** A record found: a sparkly three-note arpeggio with a shimmer. */
  playRecord(): void {
    [1175, 1568, 2093].forEach((f, i) => this.bell(f, i * 0.09, 0.1, 0.6));
    this.hiss({ delay: 0.05, seconds: 0.6, gain: 0.015, filter: 'highpass', freq: 7000, attack: 0.08, dest: this.out(0.4) });
  }

  /** The map's water light reaches an island (chapter 3's end): a round, wet "ぽこん" of a bubble coming up. */
  playBubblePop(): void {
    const wet = this.out(0.3, 1.4);
    this.ping(380, 0, 0.16, 'sine', 0.16, 900, 0.004, wet);
    this.ping(760, 0.05, 0.1, 'sine', 0.05, 1300, 0.003, wet);
    this.hiss({ delay: 0.01, seconds: 0.06, gain: 0.02, freq: 1400, q: 3, dest: wet });
  }

  /** Powder snow falls on the map's islands: a soft "しゃらん" (a quick run of high bells over a hush of air). */
  playSnowShimmer(): void {
    [2093, 2637, 3136, 2349, 2794].forEach((f, i) => this.bell(f, i * 0.06, 0.05, 0.7));
    this.hiss({ seconds: 0.9, gain: 0.012, attack: 0.15, filter: 'highpass', freq: 6500, dest: this.out(0.4) });
  }

  /**
   * The map at night (chapter 5's end): a firefly glows on an island, a soft round "ぽわん" that swells in and
   * floats up a little. A quiet octave over it keeps it heard on a small speaker.
   */
  playFirefly(): void {
    const wet = this.out(0.35, 1.2);
    this.ping(520, 0, 0.35, 'sine', 0.16, 780, 0.05, wet);
    this.ping(1040, 0, 0.25, 'sine', 0.03, 1560, 0.05, wet);
  }

  /** The windows of the castle light up on the map: three tiny bells in a row, "ちりりん". */
  playWindows(): void {
    [2100, 2640, 3150].forEach((f, i) => this.bell(f, i * 0.08, 0.05, 0.7));
  }

  /** The world's rainbow rails reach across (the ending): a bright rising slide with a little bell on top, "きらーん". */
  playBridge(): void {
    const wet = this.out(0.35);
    this.ping(880, 0, 0.6, 'sine', 0.12, 1760, 0.02, wet);
    this.ping(1760, 0.3, 0.3, 'sine', 0.03, 3520, 0.02, wet);
    this.bell(2637, 0.45, 0.05, 0.9);
  }

  /**
   * The golden light passes an island in the ending: one bell of a five-note scale (C D E G A). `i` counts up
   * from 0 at the start of each map page, so the notes climb and start low again on the next page (past the fifth
   * it goes up an octave, at most two). `delay` (seconds) is for playing a run of them at once.
   */
  playWorldStep(i: number, delay = 0): void {
    const scale = [523, 587, 659, 784, 880];
    const n = Math.max(0, Math.floor(i));
    const octave = Math.min(2, Math.floor(n / scale.length));
    this.bell(scale[n % scale.length] * 2 ** octave, delay, 0.16, 0.25);
  }

  /**
   * A two-tone steam-whistle-like chord with a breath of air, a soft attack and a short tail in the room. v1.11 (5-1)
   * `reversed` (a whistle-reversed stretch): the same chord with its loudness turned round, "…っぴー": it swells in over
   * 0.9 s and stops short (the same pitch; never a scary sound).
   */
  playWhistle(options: { reversed?: boolean } = {}): void {
    const ctx = this.ctx;
    const dest = this.out(0.25);
    if (!ctx || !dest) return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    if (options.reversed) {
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.3, now + 0.88);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
    } else {
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.3, now + 0.06);
      master.gain.setValueAtTime(0.3, now + 0.55);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
    }
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, now);
    master.connect(filter);
    filter.connect(dest);

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
    // The steam: breathy noise around the chord, a little ahead of it (reversed: swelling in with it).
    if (options.reversed) {
      this.hiss({ color: 'pink', seconds: 0.95, gain: 0.05, attack: 0.85, freq: 1300, q: 1.5, dest });
    } else {
      this.hiss({ color: 'pink', seconds: 0.95, gain: 0.05, attack: 0.04, freq: 1300, q: 1.5, dest });
      this.hiss({ seconds: 0.25, gain: 0.03, attack: 0.01, filter: 'highpass', freq: 3000, dest });
    }
  }

  // ---- v1.11 (5-1 よるの もり, PHASE9_CHAPTER5_6 第 4 部 §10): all small and soft; no owl, growl or creak ----

  /** A startled rabbit ducks into its nest: three tiny rising wood taps, "ぴょこっ". */
  playHushStartle(): void {
    const o = this.out(0.15, 1.4);
    for (let i = 0; i < 3; i++) this.ping(900, i * 0.08, 0.05, 'triangle', 0.12, 1200, 0.002, o);
  }

  /** The fawn blinks: two tiny clicks, "ぱちぱち". */
  playFawnBlink(): void {
    const o = this.out(0.1, 1.4);
    this.ping(2400, 0, 0.05, 'sine', 0.1, 2400, 0.001, o);
    this.ping(2400, 0.12, 0.05, 'sine', 0.1, 2400, 0.001, o);
  }

  /** The fawn hops off: "ぴょん ぴょん" on two woodblocks. */
  playFawnHop(): void {
    const o = this.out(0.1, 1.2);
    this.knock(600, 0, 0.12, o);
    this.knock(800, 0.18, 0.12, o);
  }

  /** The little tanukis come: woodblocks back and forth six times, "ぴょこぴょこ". */
  playLureCome(): void {
    const o = this.out(0.1, 1.2);
    for (let i = 0; i < 6; i++) this.knock(i % 2 ? 900 : 700, i * 0.12, 0.1, o);
  }

  /** The little tanukis dance: a bell running up and down a five-note scale, "くるくる". */
  playLureDance(): void {
    const scale = [784, 880, 988, 1175, 1319, 1175, 988, 880];
    scale.forEach((f, i) => this.bell(f, i * 0.09, 0.05, 0.3));
  }

  /**
   * The fireflies fly up: three soft rising "ぽわん" (the map's firefly, a little apart) and a bell on top, "しゃらん".
   */
  playFireflyWake(): void {
    const wet = this.out(0.35, 1.1);
    for (let i = 0; i < 3; i++) this.ping(520, i * 0.15, 0.35, 'sine', 0.12, 780, 0.05, wet);
    this.bell(2640, 0.3, 0.05, 0.8);
  }

  /** Sakasa's fake lanterns go out: a little puff and a soft falling note, "ぽしゅん". */
  playFakeOut(): void {
    const o = this.out(0.2, 1.8);
    this.hiss({ seconds: 0.15, gain: 0.06, filter: 'lowpass', freq: 1200, q: 0.7, dest: o });
    this.ping(400, 0.02, 0.2, 'sine', 0.1, 250, 0.01, o);
  }

  /** The hedgehog curls up and rolls aside: five small wood taps, "ころころ". */
  playHedgehogRoll(): void {
    const o = this.out(0.1, 1.1);
    for (let i = 0; i < 5; i++) this.knock(500, i * 0.07, 0.09, o);
  }

  // ---- v1.11 (5-2) おもちゃの まち (PHASE9_CHAPTER5_6 第 5 部 §10) ----------------------------------------------------

  /** A key wound back the right way: small clicks coming faster, then a rising "くるりん", "きりきり… くるりん！". */
  playWindUp(): void {
    const o = this.out(0.15, 1.4);
    let t = 0;
    for (let i = 0; i < 12; i++) {
      this.ping(2400, t, 0.02, 'triangle', 0.05, 2400, 0.001, o);
      t += 0.05 - (0.03 * i) / 11;
    }
    this.ping(660, t + 0.02, 0.15, 'sine', 0.1, 990, 0.01, o);
  }

  /** The toy band's "ぱっぱかぱーん": four notes of the game's own (G G C E) on a soft trumpet, and a soft cymbal. */
  playBandFanfare(delay = 0): void {
    const o = this.out(0.3, 1.3);
    const notes: [number, number, number][] = [
      [392, 0, 0.12],
      [392, 0.14, 0.08],
      [523, 0.24, 0.12],
      [659, 0.38, 0.4],
    ];
    for (const [f, at, len] of notes) {
      this.ping(f, delay + at, len, 'triangle', 0.11, f, 0.01, o);
      this.ping(f * 2, delay + at, len * 0.6, 'sine', 0.03, f * 2, 0.01, o);
    }
    this.hiss({ delay: delay + 0.38, seconds: 0.2, gain: 0.03, filter: 'highpass', freq: 6000, dest: o });
  }

  /** The band's footstep "とん" on the beat (`accent`: every fourth, with a tiny cymbal "ちっ"). */
  playBandStep(accent = false): void {
    const o = this.out(0.05, 1);
    this.ping(110, 0, 0.1, 'sine', 0.2, 90, 0.004, o);
    this.hiss({ seconds: 0.04, gain: 0.06, filter: 'bandpass', freq: 900, q: 1, dest: o });
    if (accent) this.hiss({ delay: 0.01, seconds: 0.06, gain: 0.04, filter: 'highpass', freq: 7000, dest: o });
  }

  /** A spinning fork turning over: four wooden clicks and a little rise, "かたかた… くるっ". */
  playSpinTurn(): void {
    const o = this.out(0.1, 1.1);
    for (let i = 0; i < 4; i++) this.knock(900, i * 0.06, 0.06, o);
    this.ping(500, 0.24, 0.1, 'sine', 0.06, 700, 0.01, o);
  }

  /** A spinning fork points the good way: two high notes, "ぴこん" (higher than the magnet's "ぴろん"). */
  playSpinGood(): void {
    const o = this.out(0.2, 1.2);
    this.ping(1568, 0, 0.06, 'sine', 0.07, 1568, 0.004, o);
    this.ping(2093, 0.07, 0.08, 'sine', 0.07, 2093, 0.004, o);
  }

  /** The whistle stopped a spinning fork: a wooden "ぴたっ" with a little bell. */
  playSpinStop(): void {
    const o = this.out(0.2, 1.3);
    this.knock(1200, 0, 0.1, o);
    this.ping(880, 0, 0.05, 'sine', 0.08, 880, 0.004, o);
    this.bell(1319, 0.04, 0.08, 0.5);
  }

  /** Into the ball pit: a soft wobbling drop and a puff, "ぼよよん… ぽふっ". */
  playBallPit(): void {
    const o = this.out(0.1, 1.6);
    this.ping(300, 0, 0.4, 'sine', 0.12, 180, 0.01, o);
    this.ping(318, 0.04, 0.34, 'sine', 0.06, 190, 0.01, o);
    this.ping(282, 0.08, 0.3, 'sine', 0.05, 170, 0.01, o);
    this.hiss({ color: 'pink', delay: 0.35, seconds: 0.2, gain: 0.08, filter: 'lowpass', freq: 1000, q: 0.7, dest: o });
  }

  /** Sakasa's toy block train: two tiny puffs, "しゅっ しゅっ". */
  playToyPuff(): void {
    const o = this.out(0.05, 1.2);
    this.hiss({ seconds: 0.1, gain: 0.12, filter: 'bandpass', freq: 2400, q: 1, dest: o });
    this.hiss({ delay: 0.22, seconds: 0.1, gain: 0.12, filter: 'bandpass', freq: 2400, q: 1, dest: o });
  }

  // ---- v1.11 (PR5) じしゃくライト (PHASE9_CHAPTER5_6 第 2 部 M13): soft and round; no zap, buzz, beam or creak ----------

  /** The light turns to the magnet step: two rising notes, "ぴろん" (lower than the spinning fork's "ぴこん"). */
  playMagnetOn(): void {
    const o = this.out(0.2, 1.2);
    this.ping(880, 0, 0.09, 'sine', 0.08, 880, 0.004, o);
    this.ping(1320, 0.07, 0.11, 'sine', 0.08, 1320, 0.004, o);
  }

  /**
   * The magnet pulls: a soft sine rising over the flight ("きゅいーん", `seconds` s) with a slow wobble, and little bells
   * here and there. It is over when the thing arrives.
   */
  playMagnetPull(seconds = 1.2): void {
    const ctx = this.ctx;
    const o = this.out(0.3, 1.2);
    if (!ctx || !o) return;
    const at = ctx.currentTime;
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, at);
    osc.frequency.exponentialRampToValueAtTime(960, at + seconds);
    lfo.frequency.value = 7;
    depth.gain.value = 15;
    lfo.connect(depth);
    depth.connect(osc.frequency);
    g.gain.value = 0.0001;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.05, at + 0.08);
    g.gain.setValueAtTime(0.05, at + Math.max(0.1, seconds - 0.12));
    g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    osc.connect(g);
    g.connect(o);
    osc.start(at);
    lfo.start(at);
    osc.stop(at + seconds + 0.05);
    lfo.stop(at + seconds + 0.05);
    [1319, 1568, 1976, 2637].forEach((f, i) => {
      const t = (i + 0.5) * (seconds / 4.5);
      if (t < seconds) this.bell(f, t, 0.03, 0.4);
    });
  }

  /** A fetched thing arrives: a tiny click and a round rising note, "かちっ… ぽん". */
  playMagnetCatch(): void {
    const o = this.out(0.2, 1.2);
    this.ping(1800, 0, 0.04, 'triangle', 0.08, 1800, 0.001, o);
    this.ping(520, 0.05, 0.12, 'sine', 0.12, 780, 0.006, o);
  }

  /** The loose rail piece snaps into the gap: a soft low knock, two clicks and three little bells, "がちゃん… かちっ". */
  playRailSnap(): void {
    const o = this.out(0.25, 1.2);
    this.ping(110, 0, 0.15, 'sine', 0.16, 100, 0.004, o);
    this.hiss({ color: 'brown', seconds: 0.08, gain: 0.08, filter: 'lowpass', freq: 900, q: 0.7, dest: o });
    this.knock(1500, 0.12, 0.08, o);
    this.knock(1500, 0.24, 0.08, o);
    [1047, 1319, 1568].forEach((f, i) => this.bell(f, 0.3 + i * 0.08, 0.05, 0.5));
  }

  /** The iron gate slides open: six wooden taps and a round wooden knock, "からから… かこん". */
  playGateOpen(): void {
    const o = this.out(0.15, 1.2);
    for (let i = 0; i < 6; i++) this.knock(1100, i * 0.07, 0.07, o);
    this.knock(400, 0.5, 0.14, o);
  }

  /** "ぽよん" off the soap film or the round cushion: the fail's boing and a soft wobbling "ぷるん". */
  playMagnetBounce(): void {
    this.playBoing();
    const ctx = this.ctx;
    const o = this.out(0.1, 1.2);
    if (!ctx || !o) return;
    const at = ctx.currentTime;
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, at);
    osc.frequency.exponentialRampToValueAtTime(220, at + 0.25);
    lfo.frequency.value = 12;
    depth.gain.value = 12;
    lfo.connect(depth);
    depth.connect(osc.frequency);
    g.gain.value = 0.0001;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.09, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
    osc.connect(g);
    g.connect(o);
    osc.start(at);
    lfo.start(at);
    osc.stop(at + 0.3);
    lfo.stop(at + 0.3);
  }

  /** An iron odd or end jumps to the train: a springy rise, "びよん". */
  playIronBiyon(): void {
    const o = this.out(0.1, 1.2);
    this.ping(420, 0, 0.12, 'sine', 0.1, 900, 0.004, o);
    this.ping(430, 0.03, 0.1, 'sine', 0.05, 920, 0.004, o);
  }

  /** It drops off: two little tin taps, "からん". */
  playIronKaran(): void {
    const o = this.out(0.15, 1.2);
    this.ping(2400, 0, 0.05, 'triangle', 0.09, 2400, 0.001, o);
    this.ping(1800, 0.06, 0.05, 'triangle', 0.08, 1800, 0.001, o);
  }

  /** A sign's bell on its string: "ちりん". */
  playSignBell(): void {
    this.bell(1568, 0, 0.07, 0.5);
    this.bell(2349, 0.02, 0.05, 0.5);
  }

  /** Stop grade: a bell for ok; for perfect, two rising bells and a little sparkle. */
  playStop(kind: 'perfect' | 'ok'): void {
    this.bell(660, 0, 0.16, 0.6);
    if (kind === 'perfect') {
      this.bell(990, 0.14, 0.16, 0.9);
      this.bell(1320, 0.14, 0.06, 0.9);
      this.hiss({ delay: 0.14, seconds: 0.5, gain: 0.012, filter: 'highpass', freq: 7000, attack: 0.05, dest: this.out(0.4) });
    }
  }

  /** Doors: "ぷしゅー" of air, the doors gliding, and a soft thud at the end. */
  playDoor(open: boolean): void {
    const o = this.out(0.1, 1.6);
    this.hiss({ color: 'white', seconds: 0.45, gain: 0.06, attack: 0.02, freq: 2600, endFreq: 1600, q: 0.9, dest: o });
    this.ping(open ? 300 : 420, 0.05, 0.3, 'triangle', 0.08, open ? 420 : 300, 0.03, o);
    this.knock(open ? 160 : 190, 0.33, 0.12, o);
  }

  /** Comical "boing" for a fail: a springy drop with a soft landing under it (not scary). */
  playBoing(): void {
    const o = this.out(0.15, 1.6);
    this.ping(220, 0, 0.45, 'square', 0.08, 110, 0.006, o);
    this.ping(440, 0, 0.3, 'triangle', 0.05, 220, 0.004, o);
    this.thump(120, 0.02, 0.12, 0.25, o);
  }

  /** The hard brake: a shorter, softer squeal with the hiss of the brakes and a low shudder. */
  playSqueal(): void {
    const o = this.out(0.1, 2);
    this.ping(1800, 0, 0.5, 'sawtooth', 0.025, 900, 0.02, o);
    this.ping(2200, 0, 0.45, 'sine', 0.03, 1500, 0.02, o);
    this.hiss({ color: 'pink', seconds: 0.7, gain: 0.07, attack: 0.02, filter: 'highpass', freq: 2200, dest: o });
    this.hiss({ color: 'brown', seconds: 0.5, gain: 0.1, filter: 'lowpass', freq: 200, q: 0.7, dest: o });
  }

  /** A card comes up: two soft bells. */
  playCard(): void {
    this.bell(523, 0, 0.13, 0.5);
    this.bell(784, 0.11, 0.13, 0.7);
  }

  /** "ぴょん": a quick rising hop with a whoosh of air and a springy body. */
  playJump(): void {
    const o = this.out(0.1, 2.2);
    this.ping(330, 0, 0.22, 'sine', 0.16, 880, 0.004, o);
    this.ping(180, 0, 0.18, 'triangle', 0.1, 360, 0.004, o);
    this.hiss({ seconds: 0.35, gain: 0.05, attack: 0.03, freq: 500, endFreq: 1800, q: 0.8, dest: o });
  }

  /** Landing: a soft "どすん" (the running sound adds its "がたん"). */
  playLand(): void {
    const o = this.out(0, 2);
    this.thump(130, 0, 0.2, 0.26, o);
    this.ping(160, 0, 0.18, 'triangle', 0.1, 90, 0.004, o);
  }

  /** "ひゅ〜… ぽよん": a slow slide down with wind, then a soft bounce (not scary). */
  playFall(): void {
    this.ping(900, 0, 0.8, 'sine', 0.1, 220, 0.02, this.out(0.15));
    this.hiss({ seconds: 0.85, gain: 0.05, attack: 0.1, freq: 1800, endFreq: 500, q: 0.8 });
    this.ping(260, 0.85, 0.35, 'sine', 0.16, 520, 0.004, this.out(0.15));
    this.thump(110, 0.85, 0.1, 0.2);
  }

  /** The light: a small click and a soft rising (on) or falling (off) glow. */
  playLight(on: boolean): void {
    const o = this.out(0.3, 2);
    this.knock(on ? 1400 : 1100, 0, 0.06, o);
    this.ping(on ? 600 : 900, 0.02, 0.25, 'sine', 0.06, on ? 900 : 600, 0.02, o);
  }

  /** "ぴょこん": a grasshopper climbs onto the roof — a short rising tone, then a little wooden knock. */
  playHopperBoard(): void {
    const o = this.out(0.2, 1.4);
    this.ping(520, 0, 0.12, 'sine', 0.14, 1040, 0.004, o);
    this.knock(700, 0.12, 0.14, o);
    this.hiss({ delay: 0.1, seconds: 0.06, gain: 0.03, freq: 2500, q: 1.5, dest: o });
  }

  /**
   * "びよーん": the grasshopper jump — the normal jump sound with a wobbling spring on top. Call it instead of
   * playJump() while a grasshopper rides.
   */
  playHopperJump(): void {
    this.playJump();
    const ctx = this.ctx;
    const dest = this.out(0.2);
    if (!ctx || !dest) return;
    const at = ctx.currentTime + 0.04;
    const len = 0.7;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, at);
    osc.frequency.exponentialRampToValueAtTime(470, at + len);
    // The spring: a vibrato that starts wide and quick, then settles.
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(15, at);
    lfo.frequency.exponentialRampToValueAtTime(6, at + len);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(70, at);
    depth.gain.exponentialRampToValueAtTime(3, at + len);
    lfo.connect(depth);
    depth.connect(osc.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.14, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(lp);
    lp.connect(g);
    g.connect(dest);
    osc.start(at);
    lfo.start(at);
    osc.stop(at + len + 0.05);
    lfo.stop(at + len + 0.05);
  }

  /** A butterfly follows: one tiny, quiet bell. Meant to be called every ~1.5 s while it follows. */
  playButterfly(): void {
    const notes = [2349, 1976, 2637, 1976];
    this.bell(notes[this.butterflyNote++ % notes.length], 0, 0.06, 0.45);
  }

  /** "ぱあっ": a flower opens — four bells rising, a soft G major chord, and a breath of air. */
  playBloom(): void {
    [784, 988, 1175, 1568].forEach((f, i) => this.bell(f, i * 0.08, 0.09, 0.8));
    const pad = this.out(0.4);
    for (const f of [392, 494, 587, 784]) this.ping(f, 0.3, 1.3, 'triangle', 0.045, f, 0.08, pad);
    this.hiss({ color: 'pink', delay: 0.25, seconds: 1, gain: 0.025, attack: 0.25, freq: 2500, q: 0.7, dest: pad });
  }

  /** The silk bridge sways (going too fast): a small, soft "びよびよ" with a rustle. The fail itself is playBoing(). */
  playSilkShake(): void {
    const ctx = this.ctx;
    const dest = this.out(0.15);
    if (!ctx || !dest) return;
    const at = ctx.currentTime;
    const len = 0.5;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(330, at);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const depth = ctx.createGain();
    depth.gain.value = 30;
    lfo.connect(depth);
    depth.connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.08, at + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(g);
    g.connect(dest);
    osc.start(at);
    lfo.start(at);
    osc.stop(at + len + 0.05);
    lfo.stop(at + len + 0.05);
    this.hiss({ color: 'pink', seconds: 0.45, gain: 0.03, attack: 0.05, freq: 3500, q: 1.2 });
  }

  /** v1.7: the rocket lights: "ぼぼぼ… しゅごー" (low pops, then a rush; the burn itself is in the running sound). */
  playRocket(): void {
    const o = this.out(0.1, 1.5);
    for (let i = 0; i < 3; i++) {
      const d = i * 0.11;
      this.ping(110 + i * 12, d, 0.12, 'square', 0.04, 90, 0.004, o);
      this.hiss({ color: 'brown', delay: d, seconds: 0.12, gain: 0.16, filter: 'lowpass', freq: 300, q: 0.8, dest: o });
    }
    this.hiss({ delay: 0.3, seconds: 1.2, gain: 0.1, attack: 0.15, freq: 400, endFreq: 2400, q: 0.7, dest: o });
    this.hiss({ color: 'brown', delay: 0.3, seconds: 1.2, gain: 0.18, attack: 0.1, filter: 'lowpass', freq: 180, q: 0.7, dest: o });
  }

  /** v1.7: the rocket stops: "ぷしゅっ". */
  playPuff(): void {
    const o = this.out(0.1, 3);
    this.hiss({ seconds: 0.3, gain: 0.07, attack: 0.005, freq: 2400, endFreq: 800, q: 0.9, dest: o });
    this.ping(1400, 0, 0.22, 'triangle', 0.05, 300, 0.004, o);
  }

  /** v1.7: slipping back down a slope: a sliding whistle going down over a rumble of gravel ("ずるずる〜"). */
  playSlip(): void {
    this.ping(700, 0, 1.1, 'sine', 0.1, 180, 0.02, this.out(0.1));
    for (let i = 0; i < 8; i++) {
      this.hiss({ color: 'brown', delay: i * 0.13, seconds: 0.16, gain: 0.12 * (1 - i * 0.08), filter: 'lowpass', freq: 420, q: 0.8 });
    }
  }

  /** v1.7: the volcano sneezes: "ぷしゅーっ… ぽふーん" (a swelling hiss, then a soft, round puff — not a bang). */
  playSneeze(): void {
    this.ping(500, 0, 0.5, 'triangle', 0.06, 1100, 0.02);
    this.hiss({ color: 'pink', seconds: 0.5, gain: 0.07, attack: 0.35, freq: 800, endFreq: 2200, q: 0.8 });
    this.ping(180, 0.52, 0.7, 'sine', 0.18, 70, 0.01, this.out(0.2));
    this.hiss({ color: 'brown', delay: 0.52, seconds: 0.8, gain: 0.2, attack: 0.02, filter: 'lowpass', freq: 260, q: 0.7 });
  }

  /** v1.7: the volcano's everyday smoke ring: a small, soft "ぽふっ" (quiet: it comes every few seconds). */
  playVolcanoPuff(): void {
    this.ping(150, 0, 0.35, 'sine', 0.08, 75, 0.02);
    this.ping(420, 0.02, 0.18, 'triangle', 0.025, 260, 0.01);
    this.hiss({ color: 'brown', seconds: 0.4, gain: 0.09, attack: 0.02, filter: 'lowpass', freq: 220, q: 0.7 });
  }

  /** v1.7: a rolling rock about to go: "ぐらぐら" (low wooden rocking, left-right-left-right, with a scrape). */
  playRockWobble(): void {
    [0, 0.13, 0.26, 0.39].forEach((d, i) => {
      this.knock(i % 2 ? 150 : 175, d, 0.13);
      this.hiss({ color: 'brown', delay: d, seconds: 0.1, gain: 0.08, filter: 'lowpass', freq: 300 });
    });
  }

  /** v1.7: a rock rolls across the rail for `seconds`: "ごろごろ" (low knocks over a rumble that fade, at most 2 s). */
  playRockRoll(seconds: number): void {
    const len = Math.min(2, Math.max(0.4, seconds));
    for (let d = 0, i = 0; d < len; d += 0.11, i++) {
      const fade = 1 - (0.6 * d) / len;
      this.knock([95, 110, 85, 120][i % 4], d, 0.14 * fade);
      this.hiss({ color: 'brown', delay: d, seconds: 0.14, gain: 0.1 * fade, filter: 'lowpass', freq: 240, q: 0.7 });
    }
  }

  /** v1.7: the train bumps a rock: "ぽよん" (the fail boing, an octave higher and rounder, with a soft bump). */
  playRockBonk(): void {
    this.ping(440, 0, 0.4, 'triangle', 0.14, 220, 0.004, this.out(0.15));
    this.ping(330, 0.18, 0.3, 'sine', 0.1, 520, 0.004, this.out(0.15));
    this.thump(140, 0, 0.12, 0.2);
  }

  /** v1.7: something small lands in the sea: "ぽちゃん" (a splash of water, a quick rise, then a little bubble). */
  playSplash(delay = 0): void {
    const wet = this.out(0.3, 2);
    this.hiss({ delay, seconds: 0.25, gain: 0.06, attack: 0.003, freq: 1800, endFreq: 900, q: 0.8, dest: wet });
    this.ping(500, delay, 0.1, 'sine', 0.14, 1500, 0.003, wet);
    this.ping(1100, delay + 0.09, 0.16, 'sine', 0.06, 700, 0.003, wet);
    this.ping(1500, delay + 0.2, 0.08, 'sine', 0.03, 1900, 0.003, wet);
  }

  /** v1.7: the wobbly bridge goes: "がらがら… ぽちゃん" (wooden planks tumbling down, then the splash). */
  playBridgeFall(): void {
    for (let i = 0; i < 9; i++) this.knock(420 - i * 25 + (i % 2) * 40, i * 0.09, 0.13);
    this.hiss({ color: 'brown', seconds: 0.9, gain: 0.12, attack: 0.05, filter: 'lowpass', freq: 350, q: 0.7 });
    this.playSplash(1.1);
  }

  /** v1.7: a seabird takes off: "ぱたぱた" (soft wing flaps of air, no call). */
  playFlap(): void {
    const o = this.out(0, 2.5);
    for (let i = 0; i < 5; i++) {
      const g = 1 - i * 0.12;
      this.hiss({ color: 'pink', delay: i * 0.075, seconds: 0.06, gain: 0.08 * g, attack: 0.01, freq: 700, q: 0.8, dest: o });
      this.ping(260 + (i % 2) * 30, i * 0.075, 0.05, 'triangle', 0.04 * g, 180, 0.004, o);
    }
  }

  // ---- chapters 3 and 4 -------------------------------------------------------------------------------------

  /**
   * v1.10: the train is under water (or not): the island's sound crossfades to the underwater bed (see
   * Ambience.setUnderwater). Cheap to call every frame; call it each frame so a newly set ambience follows too.
   */
  setAmbienceUnderwater(on: boolean): void {
    this.ambience?.setUnderwater(on);
  }

  /** 4-1: thin ice under the wheels: "ぴし ぴしぴし" (small, bright cracks; nothing breaks yet). */
  playIceCrack(): void {
    const o = this.out(0.25, 1.6);
    [0, 0.16, 0.24, 0.37].forEach((d, i) => {
      const f = [3400, 2900, 3700, 3100][i];
      this.ping(f, d, 0.06, 'triangle', 0.05, f * 0.8, 0.001, o);
      this.ping(f * 1.5, d, 0.03, 'sine', 0.02, f * 1.3, 0.001, o);
      this.hiss({ delay: d, seconds: 0.03, gain: 0.05, filter: 'highpass', freq: 4000, dest: o });
    });
  }

  /** 4-1: through the thin ice, gently: "ぽちゃん … ぷかぷか" (a splash, then bobbing back up twice). */
  playIceSplash(): void {
    this.playSplash();
    const o = this.out(0.2, 1.6);
    [0.55, 0.85].forEach((d, i) => {
      this.ping(480 - i * 30, d, 0.16, 'sine', 0.1, 720 - i * 40, 0.01, o);
      this.ping(900, d + 0.05, 0.06, 'sine', 0.025, 1300, 0.003, o);
    });
  }

  /** 4-1: a row of little snowbirds: "ぴよぴよ" (short high chirps, a few voices). */
  playSnowbirds(): void {
    const o = this.out(0.2, 1.2);
    [0, 0.12, 0.3, 0.42, 0.6].forEach((d, i) => {
      const f = 2300 + (i % 3) * 180;
      this.ping(f, d, 0.07, 'sine', 0.035, f * 1.35, 0.004, o);
    });
  }

  /** 4-1: a seal slides off on its belly: "きゅっ きゅっ" (two small squeaks). */
  playSeal(): void {
    const o = this.out(0.15, 1.2);
    [0, 0.22].forEach((d) => {
      this.ping(900, d, 0.12, 'triangle', 0.06, 1350, 0.01, o);
      this.ping(1800, d, 0.06, 'sine', 0.015, 2400, 0.005, o);
    });
  }

  /** 4-1: the ice mirror catches the light: "きらーん" (quick high bells up, one ringing out, a shimmer). */
  playMirror(): void {
    [1568, 2093, 2637].forEach((f, i) => this.bell(f, i * 0.045, 0.06, 0.5));
    this.bell(3136, 0.14, 0.08, 1.6);
    this.ping(2637, 0.14, 1.4, 'sine', 0.025, 2800, 0.02, this.out(0.5));
    this.hiss({ delay: 0.1, seconds: 1.1, gain: 0.018, attack: 0.1, filter: 'highpass', freq: 7500, dest: this.out(0.4) });
  }

  /** 4-2: the snowplow blade drops ("かこん！") and throws the snow aside ("ざざーっ"). */
  playPlow(): void {
    const o = this.out(0.1, 1.6);
    this.knock(900, 0, 0.14, o);
    this.ping(180, 0.01, 0.12, 'sine', 0.14, 120, 0.004, o);
    this.hiss({ color: 'pink', delay: 0.08, seconds: 0.9, gain: 0.1, attack: 0.06, filter: 'lowpass', freq: 2600, endFreq: 800, q: 0.7, dest: o });
    this.hiss({ delay: 0.1, seconds: 0.6, gain: 0.03, attack: 0.05, freq: 4500, endFreq: 2500, q: 0.8, dest: o });
    // Lumps of snow landing to the side.
    [0.35, 0.5, 0.62].forEach((d, i) => this.hiss({ color: 'brown', delay: d, seconds: 0.1, gain: 0.07 - i * 0.015, filter: 'lowpass', freq: 500, dest: o }));
  }

  /** 4-2: the snowplow forgotten, the train stops in soft snow: "ぽすっ". */
  playPlowBump(): void {
    const o = this.out(0.05, 2);
    this.hiss({ color: 'pink', seconds: 0.12, gain: 0.14, attack: 0.004, filter: 'lowpass', freq: 600, dest: o });
    this.ping(140, 0, 0.2, 'sine', 0.16, 100, 0.004, o);
  }

  /**
   * 4-2: the snowplow bursts a snow wall: "ずぼーん！" (a soft pink-noise burst falling from bright to low, a round low
   * "ぼふ") and a sparkle of four bells going up. With the rocket burning it is bigger and longer ("ずばばーん！").
   */
  playWallBurst(boosted = false): void {
    const o = this.out(0.2, 1.4);
    const k = boosted ? 1.5 : 1;
    this.hiss({ color: 'pink', seconds: 0.45 * (boosted ? 1.35 : 1), gain: 0.12 * k, attack: 0.01, filter: 'lowpass', freq: 1400, endFreq: 400, q: 0.7, dest: o });
    this.ping(90, 0, 0.3, 'sine', 0.16, 60, 0.005, o);
    [1047, 1319, 1568, 2093].forEach((f, i) => this.bell(f, 0.12 + i * 0.05, 0.03, 0.5));
  }

  /** 4-2: the snowplow's blade folds up again: a light "ぽん". */
  playBladeUp(): void {
    this.ping(500, 0, 0.16, 'sine', 0.1, 800, 0.004, this.out(0.1));
  }

  /**
   * 4-2: snow flying off the snowplow while it clears a buried stretch: one short "ざざっ" (played again and again it
   * makes the "ざざざー").
   */
  playPlowSpray(speed: number): void {
    const o = this.out(0.05, 1);
    const v = Math.min(1, Math.max(0.25, speed / 10));
    this.hiss({ color: 'pink', seconds: 0.4, gain: 0.2 * v + 0.04, attack: 0.08, filter: 'bandpass', freq: 600 + 60 * speed, q: 0.9, dest: o });
    this.hiss({ color: 'brown', delay: 0.15, seconds: 0.12, gain: 0.08 * v, filter: 'lowpass', freq: 500, dest: o });
  }

  /** 4-2: the wiper clearing the snowy window: "きゅっ きゅっ" (two funny little squeaks). */
  playWiper(): void {
    const o = this.out(0.05, 1.2);
    [0.35, 0.8].forEach((d) => this.ping(1200, d, 0.12, 'triangle', 0.05, 900, 0.006, o));
  }

  /** 4-2: the ski jump folds down when whistled for: "ばたん！" (a wooden board landing softly in snow). */
  playPadFlop(): void {
    const o = this.out(0.15, 1.3);
    this.knock(420, 0, 0.12, o);
    this.thump(120, 0.03, 0.12, 0.25, o);
    this.hiss({ color: 'pink', delay: 0.04, seconds: 0.3, gain: 0.05, filter: 'lowpass', freq: 900, endFreq: 300, dest: o });
  }

  /** 4-2: the lanterns come on one after another at dusk: "ぽっ ぽっ ぽっ …" (soft, high). */
  playLanterns(): void {
    const o = this.out(0.3, 0.9);
    for (let i = 0; i < 12; i++) this.ping(700 + (i % 4) * 90, i * 0.12, 0.08, 'sine', 0.035, 760 + (i % 4) * 90, 0.004, o);
  }

  /**
   * 4-3: the snow wave coming down behind: a soft, big "もこもこ" that swells and settles (a round, fluttering
   * rumble with little soft thumps in it — no roar, nothing scary).
   */
  playSnowWave(): void {
    const ctx = this.ctx;
    const dest = this.out(0.15, 1.4);
    if (!ctx || !dest) return;
    const at = ctx.currentTime;
    const len = 2.4;
    const src = noiseSource(ctx, 'pink', at);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, at);
    f.frequency.linearRampToValueAtTime(750, at + len * 0.5);
    f.frequency.linearRampToValueAtTime(280, at + len);
    // "もこもこ": the level flutters slowly, like snow tumbling over itself.
    const flutter = ctx.createGain();
    flutter.gain.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5;
    const depth = ctx.createGain();
    depth.gain.value = 0.3;
    lfo.connect(depth);
    depth.connect(flutter.gain);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.16, at + len * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    src.connect(f);
    f.connect(flutter);
    flutter.connect(g);
    g.connect(dest);
    lfo.start(at);
    src.stop(at + len + 0.05);
    lfo.stop(at + len + 0.05);
    this.hiss({ color: 'brown', seconds: len, gain: 0.1, attack: len * 0.45, filter: 'lowpass', freq: 160, q: 0.7, dest });
    [0.5, 0.8, 1.05, 1.35, 1.6].forEach((d, i) => this.ping(120 + (i % 2) * 25, d, 0.18, 'sine', 0.05, 80, 0.01, dest));
  }

  /** 4-3: caught by the snow wave: a soft "もふっ" (a puff of snow and a low, round "ぼふ"). */
  playSnowCatch(): void {
    const o = this.out(0.1, 1.8);
    this.hiss({ color: 'pink', seconds: 0.3, gain: 0.12, attack: 0.01, filter: 'lowpass', freq: 1000, endFreq: 300, q: 0.7, dest: o });
    this.ping(160, 0, 0.3, 'sine', 0.15, 90, 0.006, o);
    this.hiss({ delay: 0.05, seconds: 0.4, gain: 0.02, attack: 0.05, filter: 'highpass', freq: 5000, dest: o });
  }

  // ---- v1.10: water ("もぐる") --------------------------------------------------------------------------------

  /** Lowpass between the effects bus and the master (open above water); made in attach(). */
  private underwaterLp: BiquadFilterNode | null = null;
  private underwaterOn = false;

  /** The effects bus's way to the master, through the under-water lowpass (called once per context by attach()). */
  private underwaterFilter(ctx: BaseAudioContext, master: AudioNode): AudioNode {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.5;
    lp.frequency.value = this.underwaterOn ? UNDERWATER_CUTOFF : OPEN_CUTOFF;
    lp.connect(master);
    this.underwaterLp = lp;
    return lp;
  }

  /**
   * v1.10: the train under water: the sounds in the world (everything on the effects bus) go soft and muffled, in
   * about 0.3 s; the music does not. Asking again for the same does nothing (cheap to call every frame).
   */
  setUnderwater(on: boolean): void {
    if (on === this.underwaterOn) return;
    this.underwaterOn = on;
    const lp = this.underwaterLp;
    if (!lp || !this.ctx) return;
    lp.frequency.setTargetAtTime(on ? UNDERWATER_CUTOFF : OPEN_CUTOFF, this.ctx.currentTime, 0.1);
  }

  // ---- v1.10 (3-2 たきのかわ) -----------------------------------------------------------------------------

  /**
   * A waterfall's steady "さーーっ" (a soft hiss of falling water, no low roar), `level` 0–1 by how near it is. Cheap to
   * call every frame; 0 fades it out (and pausing the game sets 0).
   */
  setWaterfall(level: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    const want = Math.max(0, Math.min(1, level));
    if (Math.abs(want - this.fallsLevel) < 0.01) return;
    this.fallsLevel = want;
    if (!this.falls && want > 0) {
      const src = noiseSource(ctx, 'pink');
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 800;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3000;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(hp);
      hp.connect(lp);
      lp.connect(gain);
      gain.connect(this.sfx);
      this.falls = { gain, stop: () => src.stop() };
    }
    this.falls?.gain.gain.setTargetAtTime(0.06 * want, ctx.currentTime, 0.3);
  }

  /** The shower under a waterfall on the roof: "ざーっ" (a light pattering rush of water), 1.5 s. */
  playShower(): void {
    const o = this.out(0.2, 1.4);
    this.hiss({ seconds: 1.5, gain: 0.07, attack: 0.15, freq: 2000, q: 0.7, dest: o });
    for (let i = 0; i < 10; i++) this.hiss({ delay: 0.1 + i * 0.12, seconds: 0.05, gain: 0.03, freq: 3500 + (i % 3) * 600, q: 3, dest: o });
  }

  /** The paper boat bumps the train: a small wooden "こつん". */
  playBoatBump(): void {
    this.knock(1200, 0, 0.12);
  }

  /** The mother duck calls ("があ", a soft honk, once) and the ducklings answer ("ぴよぴよ"). */
  playDuck(): void {
    const ctx = this.ctx;
    const dest = this.out(0.15, 1.2);
    if (!ctx || !dest) return;
    const at = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, at);
    osc.frequency.exponentialRampToValueAtTime(360, at + 0.28);
    const mouth = ctx.createBiquadFilter();
    mouth.type = 'bandpass';
    mouth.frequency.setValueAtTime(1100, at);
    mouth.frequency.exponentialRampToValueAtTime(700, at + 0.28);
    mouth.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.09, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
    osc.connect(mouth);
    mouth.connect(g);
    g.connect(dest);
    osc.start(at);
    osc.stop(at + 0.35);
    [0.45, 0.58, 0.72].forEach((d, i) => this.ping(2500 + i * 180, d, 0.07, 'sine', 0.035, 3000 + i * 150, 0.004, dest));
  }

  /** A frog on a leaf: "けろっ" (two short low notes), then a little "ぽちゃ" as it hops in. */
  playFrog(): void {
    const o = this.out(0.1);
    this.ping(300, 0, 0.06, 'triangle', 0.08, 280, 0.003, o);
    this.ping(260, 0.09, 0.07, 'triangle', 0.07, 240, 0.003, o);
    this.hiss({ color: 'pink', delay: 0.3, seconds: 0.12, gain: 0.03, freq: 1200, endFreq: 600, q: 1, dest: o });
  }

  /** A fish leaps: "ぴちゃっ". */
  playFishLeap(): void {
    const o = this.out(0.2);
    this.hiss({ seconds: 0.14, gain: 0.08, freq: 2400, endFreq: 1400, q: 1.2, dest: o });
    this.ping(900, 0, 0.08, 'sine', 0.07, 600, 0.002, o);
    this.ping(1300, 0.1, 0.06, 'sine', 0.04, 1000, 0.002, o);
  }

  /** A reversed sign turns the right way round: "くるっ… ぴかっ". */
  playSignFlip(): void {
    const o = this.out(0.2);
    this.ping(500, 0, 0.3, 'triangle', 0.06, 1000, 0.01, o);
    this.bell(1760, 0.35, 0.07, 0.5);
  }

  // ---- v1.10 (3-3 ほしのうみ) ------------------------------------------------------------------------------

  /** The sea turtle wakes up: a round, sleepy "ぽわん" and a few bubbles as it swims off. */
  playTurtleWake(): void {
    const o = this.out(0.3, 1.4);
    this.ping(400, 0, 0.35, 'sine', 0.1, 600, 0.02, o);
    [700, 900, 800].forEach((f, i) => this.ping(f, 0.35 + i * 0.12, 0.07, 'sine', 0.03, f * 1.4, 0.003, o));
  }

  /** The lighthouse comes on: "ぴかーん" (a bright F–A–C chord going up, ringing). */
  playBeacon(): void {
    [698, 880, 1047, 1397].forEach((f, i) => this.bell(f, i * 0.12, 0.09, 1.2));
    this.hiss({ delay: 0.3, seconds: 1, gain: 0.015, filter: 'highpass', freq: 6500, attack: 0.1, dest: this.out(0.4) });
  }

  /** The festival's glowing balls come up: "しゃらら〜ん" (eight soft high bells running up). No bang. */
  playFestival(): void {
    [1397, 1568, 1760, 2093, 2349, 2637, 2794, 3136].forEach((f, i) => this.bell(f, i * 0.05, 0.05, 0.9));
    this.hiss({ seconds: 1.4, gain: 0.012, attack: 0.2, filter: 'highpass', freq: 6000, dest: this.out(0.4) });
  }

  /** Out of time: the moon comes up ("ぽろろん", a harp running down five notes). */
  playMoonUp(): void {
    [1047, 880, 784, 659, 523].forEach((f, i) => {
      this.ping(f, i * 0.16, 0.8, 'triangle', 0.07, f, 0.004, this.out(0.4));
      this.ping(f * 2, i * 0.16, 0.3, 'sine', 0.015, f * 2, 0.004, this.out(0.4));
    });
  }

  /** The whistle in the dark: the glowing motes flash, "ちりりん" (very quiet). */
  playGlimmer(): void {
    [2637, 3136, 2794].forEach((f, i) => this.bell(f, i * 0.07, 0.025, 0.5));
  }

  /** v1.10: a dive: "ぷくっ" (a round bubble going up), then a soft "ざぶん" and a few small bubbles. */
  playDive(): void {
    const o = this.out(0.25, 2);
    this.ping(300, 0, 0.25, 'sine', 0.14, 700, 0.004, o);
    this.ping(600, 0.03, 0.12, 'sine', 0.04, 900, 0.003, o);
    this.hiss({ color: 'pink', delay: 0.1, seconds: 0.5, gain: 0.09, attack: 0.02, filter: 'lowpass', freq: 2400, endFreq: 500, q: 0.7, dest: o });
    this.hiss({ color: 'brown', delay: 0.1, seconds: 0.35, gain: 0.12, filter: 'lowpass', freq: 320, q: 0.7, dest: o });
    [900, 1300, 1100].forEach((f, i) => this.ping(f, 0.32 + i * 0.07, 0.06, 'sine', 0.04, f * 1.5, 0.003, o));
  }

  /**
   * v1.10: up again. "ぷかっ" (`long` false: the front out of a dive): a quick, round pop. "ぷはっ" (the last car
   * out of the water, the dome off): water running off, then a brighter pop and a little sparkle.
   */
  playSurface(long = false): void {
    const o = this.out(0.3, 2);
    const at = long ? 0.12 : 0;
    if (long) {
      this.hiss({ seconds: 0.4, gain: 0.07, attack: 0.005, freq: 2200, endFreq: 900, q: 0.8, dest: o });
      this.hiss({ color: 'brown', seconds: 0.3, gain: 0.08, filter: 'lowpass', freq: 400, q: 0.7, dest: o });
    }
    this.ping(long ? 600 : 500, at, 0.14, 'sine', 0.14, long ? 1200 : 1000, 0.003, o);
    this.ping(long ? 900 : 760, at + 0.06, 0.1, 'sine', 0.05, long ? 1500 : 1100, 0.003, o);
    if (long) this.hiss({ delay: at + 0.05, seconds: 0.4, gain: 0.012, filter: 'highpass', freq: 7000, attack: 0.05, dest: o });
  }

  /** v1.10: "ぽよん" on the water: the surface gives like jelly (a soft wobble down and back up) and a small splash. */
  playWaterBounce(): void {
    const o = this.out(0.2, 1.8);
    this.ping(360, 0, 0.3, 'sine', 0.14, 200, 0.005, o);
    this.ping(200, 0.22, 0.35, 'sine', 0.12, 420, 0.005, o);
    this.ping(720, 0.22, 0.2, 'triangle', 0.03, 840, 0.005, o);
    this.hiss({ color: 'pink', delay: 0.05, seconds: 0.3, gain: 0.05, attack: 0.01, freq: 1500, endFreq: 700, q: 0.8, dest: o });
  }

  /**
   * v1.10 (3-1): the whale sings back ("ぼえ〜♪"): a low, round voice sliding up and down with a slow vibrato and a
   * soft echo, 1.6 s. Gentle, never a growl.
   */
  playWhaleSong(): void {
    const ctx = this.ctx;
    const dest = this.out(0.6, 1.6);
    if (!ctx || !dest) return;
    const now = ctx.currentTime;
    for (const [delay, level] of [
      [0, 1],
      [0.45, 0.35],
    ] as const) {
      const at = now + delay;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.16 * level, at + 0.25);
      g.gain.setValueAtTime(0.16 * level, at + 1.1);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      g.connect(lp);
      lp.connect(dest);
      for (const [mult, type, gain] of [
        [1, 'sine', 1],
        [2, 'triangle', 0.25],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(180 * mult, at);
        osc.frequency.exponentialRampToValueAtTime(240 * mult, at + 0.6);
        osc.frequency.exponentialRampToValueAtTime(200 * mult, at + 1.5);
        const vib = ctx.createOscillator();
        vib.frequency.value = 4;
        const vibGain = ctx.createGain();
        vibGain.gain.value = 5 * mult;
        vib.connect(vibGain);
        vibGain.connect(osc.frequency);
        const og = ctx.createGain();
        og.gain.value = gain;
        osc.connect(og);
        og.connect(g);
        osc.start(at);
        vib.start(at);
        osc.stop(at + 1.7);
        vib.stop(at + 1.7);
      }
    }
    // A few small bubbles going up with the song.
    [500, 700, 600].forEach((f, i) => this.ping(f, 0.3 + i * 0.25, 0.08, 'sine', 0.03, f * 1.5, 0.003, dest));
  }

  /** v1.10 (3-1): the whale's spout lifts the train: "ぷしゅーっ" (a rush of spray going up) and a soft "ざぶーん". */
  playSpout(): void {
    const o = this.out(0.3, 1.8);
    this.hiss({ seconds: 0.9, gain: 0.1, attack: 0.03, freq: 1800, endFreq: 3600, q: 0.8, dest: o });
    this.hiss({ color: 'pink', seconds: 0.6, gain: 0.06, attack: 0.02, filter: 'lowpass', freq: 900, q: 0.7, dest: o });
    this.hiss({ color: 'brown', delay: 0.8, seconds: 0.6, gain: 0.08, filter: 'lowpass', freq: 500, endFreq: 250, q: 0.7, dest: o });
  }

  /** v1.10 (3-1): a big bubble pops ("ぱちん") and little bubbles scatter. */
  playPop(): void {
    const o = this.out(0.3, 1.8);
    this.hiss({ seconds: 0.07, gain: 0.08, freq: 2600, q: 1.2, dest: o });
    this.ping(900, 0, 0.12, 'sine', 0.12, 1800, 0.002, o);
    [1100, 1500, 1300, 1700].forEach((f, i) => this.ping(f, 0.08 + i * 0.05, 0.06, 'sine', 0.03, f * 1.4, 0.003, o));
  }

  /** v1.10 (3-1): the true (rising) bubbles chosen: a short "きらりん" (the record's sparkle, shorter). */
  playBubbleTrue(): void {
    [1568, 2093].forEach((f, i) => this.bell(f, i * 0.08, 0.08, 0.5));
  }

  /**
   * PHASE9_0 §3: "もぐる" on land, a mole's dig: a soft "ずぶっ" (a low thud with loose earth) going in, and a "ぽこっ"
   * coming out.
   */
  playDig(): void {
    const o = this.out(0.12, 1.4);
    this.thump(110, 0, 0.14, 0.3, o);
    this.hiss({ color: 'brown', delay: 0.02, seconds: 0.35, gain: 0.07, filter: 'lowpass', freq: 700, endFreq: 250, dest: o });
    this.ping(420, 0.78, 0.1, 'sine', 0.09, 760, 0.004, o);
  }

  // ---- v1.11 (5-3 かがみの せかい, PHASE9_CHAPTER5_6 第 6 部 §10). No creaks, no breaking glass, no low hum. ------

  /** Through a mirror gate: "しゃらん… ぷるん" (a gliding sine down, three bells, a soft sparkle of noise). */
  playMirrorGate(): void {
    const o = this.out(0.35, 1.3);
    this.ping(1320, 0, 0.3, 'sine', 0.03, 660, 0.01, o);
    [1319, 1661, 1976].forEach((f, i) => this.bell(f, 0.03 + i * 0.05, 0.02 * 3, 0.5));
    this.hiss({ seconds: 0.25, gain: 0.015 * 2, attack: 0.03, filter: 'bandpass', freq: 3000, q: 1.2, dest: o });
  }

  /** The whistle opens a mirror gate: the glass wobbles like water, "ぽわわん" (a wavering sine and a bell). */
  playMirrorRipple(): void {
    const ctx = this.ctx;
    const o = this.out(0.3, 1.4);
    if (!ctx || !o) return;
    const at = ctx.currentTime;
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    const g = ctx.createGain();
    osc.frequency.value = 440;
    lfo.frequency.value = 6;
    depth.gain.value = 20;
    lfo.connect(depth);
    depth.connect(osc.frequency);
    g.gain.value = 0.0001;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.09, at + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
    osc.connect(g);
    g.connect(o);
    osc.start(at);
    lfo.start(at);
    osc.stop(at + 0.65);
    lfo.stop(at + 0.65);
    this.bell(1976, 0.1, 0.06, 0.6);
  }

  /** Into a shut mirror gate: "ぽよん… ちん" (the usual soft boing and a small high ting). */
  playMirrorBump(): void {
    this.playBoing();
    this.ping(2640, 0.3, 0.05, 'triangle', 0.02 * 2, 2640, 0.002, this.out(0.3));
  }

  /** A phantom pops into pink bubbles: "ぽわん" and four little pops, higher than the map's bubbles. */
  playPhantomPop(): void {
    const o = this.out(0.3, 1.5);
    this.ping(600, 0, 0.15, 'sine', 0.03 * 3, 900, 0.004, o);
    [780, 1050, 900, 1200].forEach((f, i) => this.ping(f * 1.5, 0.12 + i * 0.06, 0.06, 'sine', 0.035, f * 2.1, 0.003, o));
  }

  /** On a glass stretch (the first time in a mission): "しゃららん" (three high bells up). */
  playGlassOn(): void {
    [2093, 2637, 3136].forEach((f, i) => this.bell(f, i * 0.06, 0.02 * 3, 0.6));
    this.hiss({ delay: 0.05, seconds: 0.5, gain: 0.012, attack: 0.05, filter: 'highpass', freq: 7500, dest: this.out(0.4) });
  }

  /**
   * A mirror turns round: "くるっ" (three quick wooden taps), then "きらーん" when it turns to face the train (`flash`),
   * else a soft wooden "ぱたん".
   */
  playMirrorTurn(flash: boolean): void {
    const o = this.out(0.2, 1.3);
    [0, 0.05, 0.1].forEach((d) => this.knock(900, d, 0.08, o));
    if (flash) this.playMirror();
    else this.knock(400, 0.3, 0.12, o);
  }

  /** The card's notes show in the mirror: "しゃらーん" (a broken G major chord of bells over a soft pad). */
  playLetterReflect(): void {
    [784, 988, 1175, 1568].forEach((f, i) => this.bell(f, 0.4 + i * 0.1, 0.025 * 2.4, 0.8));
    const o = this.out(0.4);
    for (const f of [392, 494, 587]) this.ping(f, 0.4, 0.8, 'triangle', 0.015 * 1.6, f, 0.12, o);
  }

  /** v1.10: a press that only bobs the train (stopped, on the water, on the sea floor): "ぷくぷく", three small bubbles. */
  playBubbles(): void {
    const o = this.out(0.25, 2);
    [520, 760, 640].forEach((f, i) => this.ping(f, i * 0.09, 0.08, 'sine', 0.07, f * 1.6, 0.003, o));
  }
}

/** v1.10: the effects bus's lowpass above water (open) and under it (muffled), Hz. */
const OPEN_CUTOFF = 20000;
const UNDERWATER_CUTOFF = 900;

/** The room's echo: 1.1 s of noise fading out, darker as it fades (made once per context). */
function roomImpulse(ctx: BaseAudioContext): AudioBuffer {
  const seconds = 1.1;
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const noise = noiseBuffer(ctx, 'white').getChannelData(0);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let low = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Each channel reads the noise from another place, so the echo is wide.
      const n = noise[(i * 2 + ch * 7919) % noise.length] * 2;
      low += (n - low) * (0.6 - 0.5 * t);
      data[i] = low * (1 - t) ** 3 * 0.5;
    }
  }
  return buffer;
}
