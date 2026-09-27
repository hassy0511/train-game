import { noiseSource } from './noise';

/**
 * What the track under the train sounds like: plain rail; spider silk ("silk", soft and hushed); a hollow iron
 * bridge; old wooden planks; a soft bed of petals. From the rail's look and the stage's "sound" zones (v1.9).
 * v1.10: ice (a high "しゃーっ" glide, thin "ちん" joints), snow (muffled "さく さく"), a tunnel (louder, with a
 * short echo on the joints).
 */
export type RunSurface = 'rail' | 'silk' | 'bridge' | 'wood' | 'soft' | 'ice' | 'snow' | 'tunnel';
export const RUN_SURFACES: readonly RunSurface[] = ['rail', 'silk', 'bridge', 'wood', 'soft', 'ice', 'snow', 'tunnel'];

/** One frame of the train, as the running sound needs it. */
export interface RunInput {
  /** m/s along the rail (never negative). */
  speed: number;
  /** The speed the lever asks for: above the speed the motor pulls ("ういーん"). */
  target: number;
  /** The lever is on a brake notch (or the train is stopping on its own). */
  braking: boolean;
  /** The lead bogie is off the rail (a jump): no rail sounds, only the wind. */
  airborne: boolean;
  surface: RunSurface;
  /** 2-3: the rocket burns ("しゅごーっ" for as long as it lasts). */
  rocket?: boolean;
  /** v1.10: the lead car is under water: everything muffled, soft joints, no wind, and "ぶくぶく" bubbles. */
  underwater?: boolean;
  /** Game paused, a card up, or a fade: everything goes quiet. */
  quiet: boolean;
}

/**
 * Tuning of the running sound (global, not per stage). Speeds in m/s: "びゅーん" is 22.
 * - joint: metres between rail joints ("たたん"); bogie: metres between the two clicks of one joint.
 * - rumble/roll/motor/wind: gain at `full` speed; the rumble has a floor so a slow train is still heard.
 */
export const RUN_SOUND = {
  full: 22,
  joint: 12,
  bogie: 2.4,
  clack: 0.2,
  rumble: 0.1,
  rumbleFloor: 0.03,
  roll: 0.05,
  motor: 0.035,
  wind: 0.1,
  airWind: 0.07,
  brakeHiss: 0.03,
  squeal: 0.012,
  release: 0.2,
  rocket: 0.12,
  /** Ice and snow: the high "しゃーっ" of the wheels sliding along, at full speed (times the surface's own share). */
  slide: 0.05,
  /** Under water: the muffle (Hz, the running sound's low-pass) and the bubbles' level and rate (per s, at full). */
  muffle: 700,
  bubble: 0.03,
  bubbles: [2, 12] as [number, number],
  /** In a tunnel: the slap-back of the joints (s) and how much of it comes back. */
  echo: [0.12, 0.25] as [number, number],
  /** Seconds to glide to a new level (so a jump or a pause fades rather than clicks). */
  glide: 0.08,
} as const;

interface SurfaceSound {
  /** Levels of the rumble, the wheel whir and the joints; a resonance (Hz, dB) for hollow ones. */
  rumble: number;
  roll: number;
  clack: number;
  ring: [number, number];
  /** The high sliding hiss: share of RUN_SOUND.slide and its centre (Hz). */
  slide?: [number, number];
}

const SURFACES: Record<RunSurface, SurfaceSound> = {
  rail: { rumble: 1, roll: 1, clack: 1, ring: [160, 0] },
  silk: { rumble: 0.25, roll: 0, clack: 0.35, ring: [160, 0] },
  bridge: { rumble: 1.3, roll: 1.1, clack: 1.3, ring: [170, 10] },
  wood: { rumble: 1.1, roll: 0.6, clack: 1.2, ring: [280, 7] },
  soft: { rumble: 0.5, roll: 0.3, clack: 0.4, ring: [160, 0] },
  ice: { rumble: 0.55, roll: 1.2, clack: 0.5, ring: [2400, 4], slide: [1, 3500] },
  snow: { rumble: 0.7, roll: 0.4, clack: 0.55, ring: [160, 0], slide: [0.3, 5500] },
  tunnel: { rumble: 1.25, roll: 1, clack: 1.1, ring: [110, 8] },
};

/**
 * One wheel over a joint, per surface: the click's band (Hz, Q) and share, the thump's pitch, share and length,
 * little rings on top ([Hz, share, length]), and a second, smaller "さく" just after (snow).
 */
interface ClickSound {
  band: number;
  q: number;
  click: number;
  clickDecay: number;
  low: number;
  thump: number;
  thumpDecay: number;
  rings: [number, number, number][];
  crunch?: boolean;
}

const CLICKS: Record<RunSurface, ClickSound> = {
  rail: { band: 2000, q: 1.2, click: 0.8, clickDecay: 0.035, low: 120, thump: 1.1, thumpDecay: 0.08, rings: [[1650, 0.12, 0.05]] },
  silk: { band: 500, q: 1.2, click: 0.3, clickDecay: 0.035, low: 120, thump: 1.1, thumpDecay: 0.08, rings: [] },
  bridge: { band: 2000, q: 1.2, click: 0.8, clickDecay: 0.035, low: 95, thump: 1.1, thumpDecay: 0.16, rings: [[1250, 0.12, 0.12]] },
  wood: { band: 900, q: 1.2, click: 0.8, clickDecay: 0.035, low: 150, thump: 1.1, thumpDecay: 0.08, rings: [] },
  soft: { band: 500, q: 1.2, click: 0.3, clickDecay: 0.035, low: 120, thump: 1.1, thumpDecay: 0.08, rings: [] },
  // "ちん": thin and high, hardly any thump.
  ice: { band: 3000, q: 1.5, click: 0.5, clickDecay: 0.03, low: 130, thump: 0.5, thumpDecay: 0.06, rings: [[3000, 0.4, 0.16], [2600, 0.2, 0.12]] },
  // "さく さく": a muffled crunch of packed snow, twice, and a soft low step.
  snow: { band: 700, q: 0.8, click: 0.9, clickDecay: 0.07, low: 110, thump: 0.6, thumpDecay: 0.1, rings: [], crunch: true },
  tunnel: { band: 2000, q: 1.2, click: 0.8, clickDecay: 0.035, low: 110, thump: 1.1, thumpDecay: 0.1, rings: [[1650, 0.12, 0.05]] },
};

/** Under water every joint is a soft "ことっ". */
const UNDERWATER_CLICK: ClickSound = { band: 500, q: 1, click: 0.4, clickDecay: 0.04, low: 110, thump: 0.8, thumpDecay: 0.08, rings: [] };

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * The sound of the train running, made of a few always-running voices whose levels follow the train:
 * - "ごーっ": low rumble (brown noise, brighter and louder with speed), with a hollow ring on bridges;
 * - a soft wheel whir (pink noise, mid), and on ice and snow a high sliding "しゃーっ";
 * - "たたん・たたん": two clicks at each rail joint, closer together as the train goes faster (in a tunnel with a
 *   short echo);
 * - "ういーん": a gentle motor hum that rises with speed while the lever pulls (a plain hum, no scale);
 * - "びゅーっ": wind at high speed, and in the air;
 * - braking: a soft hiss and, just before stopping, a quiet squeal; then "ぷしゅー" once stopped;
 * - under water: all of it through a low-pass (muffled), and small bubbles "ぶくぶく".
 */
export class RunSound {
  /** Everything but the bubbles goes out through this low-pass (open, except under water). */
  private readonly muffle: BiquadFilterNode;
  /** The tunnel's slap-back (joints only). */
  private readonly echo: GainNode;
  private readonly rumbleFilter: BiquadFilterNode;
  private readonly ring: BiquadFilterNode;
  private readonly rumbleGain: GainNode;
  private readonly rollFilter: BiquadFilterNode;
  private readonly rollGain: GainNode;
  private readonly slideFilter: BiquadFilterNode;
  private readonly slideGain: GainNode;
  private readonly motorOscs: OscillatorNode[];
  private readonly motorGain: GainNode;
  private readonly windFilter: BiquadFilterNode;
  private readonly windGain: GainNode;
  private readonly hissGain: GainNode;
  private readonly squealOsc: OscillatorNode;
  private readonly squealGain: GainNode;
  private readonly rocketGain: GainNode;
  /** Metres run on the rail since the last joint. */
  private sinceJoint = RUN_SOUND.joint * 0.5;
  private wasAirborne = false;
  private lastSpeed = 0;
  /** The train got going since it last stood still (so stopping lets out the brakes' air). */
  private ranSinceStop = false;
  private movingFor = 0;
  /** Seconds until the next bubble under water, and the seed for their pitches. */
  private bubbleIn = 0;
  private seed = 0x1b0b1e;
  /** Rail joints clicked so far, "ぷしゅー"s after stopping, and bubbles (hooks for tests). */
  joints = 0;
  releases = 0;
  bubbles = 0;
  /** Sum of the voice levels asked for last frame (a hook for tests). */
  level = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly out: AudioNode,
  ) {
    const now = ctx.currentTime;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = ctx.sampleRate / 2;
    this.muffle.Q.value = 0.5;
    this.muffle.connect(out);
    const gain = (): GainNode => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.muffle);
      return g;
    };

    this.echo = ctx.createGain();
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = RUN_SOUND.echo[0];
    const feedback = ctx.createGain();
    feedback.gain.value = RUN_SOUND.echo[1];
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    // A little darker each time it comes back, like a stone wall.
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 2500;
    this.echo.connect(delay);
    delay.connect(dark);
    dark.connect(feedback);
    feedback.connect(delay);
    dark.connect(wet);
    wet.connect(this.muffle);

    this.rumbleGain = gain();
    this.ring = ctx.createBiquadFilter();
    this.ring.type = 'peaking';
    this.ring.Q.value = 3;
    this.ring.gain.value = 0;
    this.ring.connect(this.rumbleGain);
    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'lowpass';
    this.rumbleFilter.frequency.value = 120;
    this.rumbleFilter.connect(this.ring);
    noiseSource(ctx, 'brown', now).connect(this.rumbleFilter);

    this.rollGain = gain();
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'bandpass';
    this.rollFilter.Q.value = 0.8;
    this.rollFilter.frequency.value = 700;
    this.rollFilter.connect(this.rollGain);
    noiseSource(ctx, 'pink', now).connect(this.rollFilter);

    this.slideGain = gain();
    this.slideFilter = ctx.createBiquadFilter();
    this.slideFilter.type = 'bandpass';
    this.slideFilter.Q.value = 1.1;
    this.slideFilter.frequency.value = 3500;
    this.slideFilter.connect(this.slideGain);
    noiseSource(ctx, 'white', now).connect(this.slideFilter);

    this.motorGain = gain();
    const motorFilter = ctx.createBiquadFilter();
    motorFilter.type = 'lowpass';
    motorFilter.frequency.value = 900;
    motorFilter.connect(this.motorGain);
    // A hum and its octave and a quiet buzz a fifth above that: a soft electric motor, not a tune.
    this.motorOscs = (
      [
        ['triangle', 1, 1],
        ['sine', 2, 0.6],
        ['sawtooth', 3, 0.12],
      ] as [OscillatorType, number, number][]
    ).map(([type, , level]) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = 60;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g);
      g.connect(motorFilter);
      osc.start(now);
      return osc;
    });

    this.windGain = gain();
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.Q.value = 0.7;
    this.windFilter.frequency.value = 800;
    this.windFilter.connect(this.windGain);
    noiseSource(ctx, 'white', now).connect(this.windFilter);

    this.hissGain = gain();
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = 'highpass';
    hissFilter.frequency.value = 2500;
    hissFilter.connect(this.hissGain);
    noiseSource(ctx, 'pink', now).connect(hissFilter);

    this.squealGain = gain();
    this.squealOsc = ctx.createOscillator();
    this.squealOsc.type = 'sine';
    this.squealOsc.frequency.value = 2600;
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 7;
    const wobbleDepth = ctx.createGain();
    wobbleDepth.gain.value = 18;
    wobble.connect(wobbleDepth);
    wobbleDepth.connect(this.squealOsc.frequency);
    this.squealOsc.connect(this.squealGain);
    this.squealOsc.start(now);
    wobble.start(now);

    // The rocket's roar: a rush of noise over a low rumble, fluttering a little like a flame.
    this.rocketGain = gain();
    const flame = ctx.createGain();
    flame.gain.value = 0.8;
    flame.connect(this.rocketGain);
    const flutter = ctx.createOscillator();
    flutter.frequency.value = 11;
    const flutterDepth = ctx.createGain();
    flutterDepth.gain.value = 0.2;
    flutter.connect(flutterDepth);
    flutterDepth.connect(flame.gain);
    flutter.start(now);
    const rush = ctx.createBiquadFilter();
    rush.type = 'bandpass';
    rush.frequency.value = 1100;
    rush.Q.value = 0.6;
    rush.connect(flame);
    noiseSource(ctx, 'pink', now).connect(rush);
    const roar = ctx.createBiquadFilter();
    roar.type = 'lowpass';
    roar.frequency.value = 170;
    const roarLevel = ctx.createGain();
    roarLevel.gain.value = 1.6;
    roar.connect(roarLevel);
    roarLevel.connect(flame);
    noiseSource(ctx, 'brown', now).connect(roar);
  }

  /** Called every frame with the game's dt (s). */
  update(dt: number, input: RunInput): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const R = RUN_SOUND;
    const surface = SURFACES[input.surface];
    const under = input.underwater === true;
    const speed = Math.max(0, input.speed);
    const v = speed / R.full;
    const onRail = !input.airborne && !input.quiet && speed > 0.2;
    const set = (param: AudioParam, value: number, glide: number = R.glide): void => {
      param.setTargetAtTime(value, now, glide);
    };

    // Under water the whole running sound slides down into a muffle over about 0.3 s (and opens up again).
    set(this.muffle.frequency, under ? R.muffle : ctx.sampleRate / 2, 0.1);

    // A train starting off is heard at once, but not with a jolt: a short swell over the first half second.
    this.movingFor = onRail ? this.movingFor + dt : 0;
    const swell = clamp01(this.movingFor / 0.5);

    const rumble = onRail ? (R.rumbleFloor + R.rumble * Math.min(v, 1.4)) * surface.rumble * swell : 0;
    set(this.rumbleGain.gain, rumble);
    set(this.rumbleFilter.frequency, 90 + 420 * Math.min(v, 1.4));
    set(this.ring.frequency, surface.ring[0]);
    set(this.ring.gain, surface.ring[1], 0.15);

    const roll = onRail ? R.roll * Math.min(v, 1.3) * surface.roll * swell : 0;
    set(this.rollGain.gain, roll);
    set(this.rollFilter.frequency, 600 + 1000 * Math.min(v, 1.3));

    // Ice and snow: "しゃーっ", louder with speed, and on ice louder still while the brakes try to hold.
    const [slideShare, slideFreq] = surface.slide ?? [0, 3500];
    const skid = input.surface === 'ice' && input.braking && speed > 0.5 ? 1.8 : 1;
    const slide = onRail ? R.slide * slideShare * Math.min(v, 1.3) * skid * swell : 0;
    set(this.slideGain.gain, slide, 0.12);
    set(this.slideFilter.frequency, slideFreq * (0.85 + 0.25 * Math.min(v, 1.2)));

    // The motor pulls while the lever asks for more than the speed; a little hum while cruising; none coasting
    // down or braking.
    const pulling = input.target > speed + 0.3 ? 1 : input.target > 0.5 && !input.braking ? 0.35 : 0;
    const motor = !input.quiet && !input.airborne && pulling > 0 ? R.motor * pulling * (0.45 + 0.55 * Math.min(v, 1)) : 0;
    set(this.motorGain.gain, motor, 0.12);
    const hum = 55 + 230 * Math.min(v, 1.3);
    this.motorOscs.forEach((osc, i) => set(osc.frequency, hum * [1, 2, 3][i], 0.1));

    const fast = Math.max(0, v - 0.45) / 0.55;
    const wind = input.quiet || under ? 0 : R.wind * fast ** 1.3 + (input.airborne ? R.airWind : 0);
    set(this.windGain.gain, wind, 0.15);
    set(this.windFilter.frequency, 500 + 1500 * Math.min(v, 1.4) + (input.airborne ? 400 : 0));

    set(this.rocketGain.gain, input.rocket && !input.quiet ? R.rocket : 0, input.rocket ? 0.12 : 0.3);

    const braking = input.braking && onRail && speed > 0.5;
    set(this.hissGain.gain, braking ? R.brakeHiss * (0.4 + 0.6 * Math.min(v, 1)) : 0, 0.1);
    set(this.squealGain.gain, braking && speed < 3 ? R.squeal : 0, 0.1);

    // "たたん": two clicks per joint; the second one bogie-length later (skipped when too close to hear apart).
    if (onRail) {
      this.sinceJoint += speed * dt;
      if (this.sinceJoint >= R.joint) {
        this.sinceJoint %= R.joint;
        // Heard clearly even slow: that is where a child feels the rhythm.
        const loud = R.clack * (0.7 + 0.5 * Math.min(v, 1.2)) * surface.clack;
        this.clack(0, loud, input.surface, under);
        const apart = R.bogie / speed;
        if (apart > 0.05 && apart < 0.6) this.clack(apart, loud * 0.85, input.surface, under);
        this.joints += 1;
      }
    }
    // Landing from a jump: "がたん".
    if (this.wasAirborne && !input.airborne && !input.quiet) {
      this.clack(0, R.clack * 1.3 * surface.clack, input.surface, under);
      this.clack(0.09, R.clack * 1.1 * surface.clack, input.surface, under);
    }
    this.wasAirborne = input.airborne;

    // Under water: small bubbles going up, more of them the faster the train goes.
    if (under && !input.quiet) {
      this.bubbleIn -= dt;
      if (this.bubbleIn <= 0) {
        const [slow, quick] = R.bubbles;
        this.bubbleIn = (0.5 + this.random()) / (slow + (quick - slow) * Math.min(v, 1));
        this.bubble();
      }
    } else {
      this.bubbleIn = 0;
    }

    // Stopped after a run (braked down to a standstill, not put back by a rewind): the brakes let out their
    // air, "ぷしゅー".
    if (speed > 2) this.ranSinceStop = true;
    if (!input.quiet && !input.airborne && this.ranSinceStop && speed <= 0.05 && this.lastSpeed > 0 && this.lastSpeed < 1.5) {
      this.release(0.25);
      this.releases += 1;
    }
    if (speed <= 0.05) this.ranSinceStop = false;
    this.lastSpeed = input.quiet ? 0 : speed;

    this.level = rumble + roll + slide + motor + wind;
  }

  private random(): number {
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5;
    return (this.seed >>> 0) / 0xffffffff;
  }

  /** "ぷく": one small bubble, a sine rising quickly (heard past the muffle, as if right by the window). */
  private bubble(): void {
    const ctx = this.ctx;
    const at = ctx.currentTime;
    const f = 300 + 500 * this.random();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, at);
    osc.frequency.exponentialRampToValueAtTime(f * 1.8, at + 0.04);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(RUN_SOUND.bubble * (0.6 + 0.4 * this.random()), at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    osc.connect(g);
    g.connect(this.out);
    osc.start(at);
    osc.stop(at + 0.08);
    this.bubbles += 1;
  }

  /** One wheel over a joint: a click of noise, a low thump and a small ring (a knock on wood, a crunch in snow). */
  private clack(delay: number, gain: number, surface: RunSurface, underwater = false): void {
    const ctx = this.ctx;
    const c = underwater ? UNDERWATER_CLICK : CLICKS[surface];
    const echo = surface === 'tunnel' && !underwater;
    const at = ctx.currentTime + delay;
    const env = (g: GainNode, peak: number, decay: number, start = at): void => {
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    };
    const send = (g: GainNode): void => {
      g.connect(this.muffle);
      if (echo) g.connect(this.echo);
    };

    // The click: a short burst of band-passed noise (in snow, a second smaller one just after: "さく").
    for (const [lag, share] of c.crunch ? [[0, 1], [0.028, 0.6]] : [[0, 1]]) {
      const noise = noiseSource(ctx, 'white', at + lag);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = lag > 0 ? c.band * 1.15 : c.band;
      band.Q.value = c.q;
      const clickGain = ctx.createGain();
      env(clickGain, gain * c.click * share, c.clickDecay, at + lag);
      noise.connect(band);
      band.connect(clickGain);
      send(clickGain);
      noise.stop(at + lag + c.clickDecay + 0.02);
    }

    // The thump under it.
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(c.low, at);
    thump.frequency.exponentialRampToValueAtTime(c.low * 0.6, at + 0.07);
    const thumpGain = ctx.createGain();
    env(thumpGain, gain * c.thump, c.thumpDecay);
    thump.connect(thumpGain);
    send(thumpGain);
    thump.start(at);
    thump.stop(at + c.thumpDecay + 0.12);

    // Steel on steel: a faint ring (not on silk, petals, wood or snow); on ice a thin "ちん".
    for (const [freq, share, decay] of c.rings) {
      const ping = ctx.createOscillator();
      ping.type = 'triangle';
      ping.frequency.value = freq;
      const pingGain = ctx.createGain();
      env(pingGain, gain * share, decay);
      ping.connect(pingGain);
      send(pingGain);
      ping.start(at);
      ping.stop(at + decay + 0.1);
    }
  }

  /** "ぷしゅー": air let out of the brakes (noise sweeping down, fading over most of a second). */
  release(delay = 0): void {
    const ctx = this.ctx;
    const at = ctx.currentTime + delay;
    const noise = noiseSource(ctx, 'white', at);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.9;
    band.frequency.setValueAtTime(3200, at);
    band.frequency.exponentialRampToValueAtTime(1400, at + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(RUN_SOUND.release, at + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.95);
    noise.connect(band);
    band.connect(g);
    g.connect(this.muffle);
    noise.stop(at + 1);
  }
}
