import { noiseSource } from './noise';

/**
 * What the track under the train sounds like: plain rail; spider silk ("silk", soft and hushed); a hollow iron
 * bridge; old wooden planks; a soft bed of petals. From the rail's look and the stage's "sound" zones (v1.9).
 */
export type RunSurface = 'rail' | 'silk' | 'bridge' | 'wood' | 'soft';

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
  rumble: 0.13,
  rumbleFloor: 0.03,
  roll: 0.05,
  motor: 0.035,
  wind: 0.1,
  airWind: 0.07,
  brakeHiss: 0.03,
  squeal: 0.012,
  release: 0.14,
  /** Seconds to glide to a new level (so a jump or a pause fades rather than clicks). */
  glide: 0.08,
} as const;

/** How each surface changes the sound: rumble and clack level, and a resonance (Hz, dB) for hollow ones. */
const SURFACES: Record<RunSurface, { rumble: number; roll: number; clack: number; ring: [number, number] }> = {
  rail: { rumble: 1, roll: 1, clack: 1, ring: [160, 0] },
  silk: { rumble: 0.25, roll: 0, clack: 0.35, ring: [160, 0] },
  bridge: { rumble: 1.3, roll: 1.1, clack: 1.3, ring: [170, 10] },
  wood: { rumble: 1.1, roll: 0.6, clack: 1.2, ring: [280, 7] },
  soft: { rumble: 0.5, roll: 0.3, clack: 0.4, ring: [160, 0] },
};

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * The sound of the train running, made of a few always-running voices whose levels follow the train:
 * - "ごーっ": low rumble (brown noise, brighter and louder with speed), with a hollow ring on bridges;
 * - a soft wheel whir (pink noise, mid);
 * - "たたん・たたん": two clicks at each rail joint, closer together as the train goes faster;
 * - "ういーん": a gentle motor hum that rises with speed while the lever pulls (a plain hum, no scale);
 * - "びゅーっ": wind at high speed, and in the air;
 * - braking: a soft hiss and, just before stopping, a quiet squeal; then "ぷしゅー" once stopped.
 */
export class RunSound {
  private readonly rumbleFilter: BiquadFilterNode;
  private readonly ring: BiquadFilterNode;
  private readonly rumbleGain: GainNode;
  private readonly rollFilter: BiquadFilterNode;
  private readonly rollGain: GainNode;
  private readonly motorOscs: OscillatorNode[];
  private readonly motorGain: GainNode;
  private readonly windFilter: BiquadFilterNode;
  private readonly windGain: GainNode;
  private readonly hissGain: GainNode;
  private readonly squealOsc: OscillatorNode;
  private readonly squealGain: GainNode;
  /** Metres run on the rail since the last joint. */
  private sinceJoint = RUN_SOUND.joint * 0.5;
  private wasAirborne = false;
  private lastSpeed = 0;
  /** The train got going since it last stood still (so stopping lets out the brakes' air). */
  private ranSinceStop = false;
  private movingFor = 0;
  /** Rail joints clicked so far, and "ぷしゅー"s after stopping (hooks for tests). */
  joints = 0;
  releases = 0;
  /** Sum of the voice levels asked for last frame (a hook for tests). */
  level = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly out: AudioNode,
  ) {
    const now = ctx.currentTime;
    const gain = (): GainNode => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(out);
      return g;
    };

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
  }

  /** Called every frame with the game's dt (s). */
  update(dt: number, input: RunInput): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const R = RUN_SOUND;
    const surface = SURFACES[input.surface];
    const speed = Math.max(0, input.speed);
    const v = speed / R.full;
    const onRail = !input.airborne && !input.quiet && speed > 0.2;
    const set = (param: AudioParam, value: number, glide: number = R.glide): void => {
      param.setTargetAtTime(value, now, glide);
    };

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

    // The motor pulls while the lever asks for more than the speed; a little hum while cruising; none coasting
    // down or braking.
    const pulling = input.target > speed + 0.3 ? 1 : input.target > 0.5 && !input.braking ? 0.35 : 0;
    const motor = !input.quiet && !input.airborne && pulling > 0 ? R.motor * pulling * (0.45 + 0.55 * Math.min(v, 1)) : 0;
    set(this.motorGain.gain, motor, 0.12);
    const hum = 55 + 230 * Math.min(v, 1.3);
    this.motorOscs.forEach((osc, i) => set(osc.frequency, hum * [1, 2, 3][i], 0.1));

    const fast = Math.max(0, v - 0.45) / 0.55;
    const wind = input.quiet ? 0 : R.wind * fast ** 1.3 + (input.airborne ? R.airWind : 0);
    set(this.windGain.gain, wind, 0.15);
    set(this.windFilter.frequency, 500 + 1500 * Math.min(v, 1.4) + (input.airborne ? 400 : 0));

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
        this.clack(0, loud, input.surface);
        const apart = R.bogie / speed;
        if (apart > 0.05 && apart < 0.6) this.clack(apart, loud * 0.85, input.surface);
        this.joints += 1;
      }
    }
    // Landing from a jump: "がたん".
    if (this.wasAirborne && !input.airborne && !input.quiet) {
      this.clack(0, R.clack * 1.3 * surface.clack, input.surface);
      this.clack(0.09, R.clack * 1.1 * surface.clack, input.surface);
    }
    this.wasAirborne = input.airborne;

    // Stopped after a run (braked down to a standstill, not put back by a rewind): the brakes let out their
    // air, "ぷしゅー".
    if (speed > 2) this.ranSinceStop = true;
    if (!input.quiet && !input.airborne && this.ranSinceStop && speed <= 0.05 && this.lastSpeed > 0 && this.lastSpeed < 1.5) {
      this.release(0.25);
      this.releases += 1;
    }
    if (speed <= 0.05) this.ranSinceStop = false;
    this.lastSpeed = input.quiet ? 0 : speed;

    this.level = rumble + roll + motor + wind;
  }

  /** One wheel over a joint: a click of noise, a low thump and a small metallic ring (or a knock on wood). */
  private clack(delay: number, gain: number, surface: RunSurface): void {
    const ctx = this.ctx;
    const at = ctx.currentTime + delay;
    const env = (g: GainNode, peak: number, decay: number): void => {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    };

    // The click: a short burst of band-passed noise.
    const noise = noiseSource(ctx, 'white', at);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = surface === 'wood' ? 900 : surface === 'silk' || surface === 'soft' ? 500 : 2000;
    band.Q.value = 1.2;
    const clickGain = ctx.createGain();
    env(clickGain, gain * (surface === 'silk' || surface === 'soft' ? 0.3 : 0.8), 0.035);
    noise.connect(band);
    band.connect(clickGain);
    clickGain.connect(this.out);
    noise.stop(at + 0.05);

    // The thump under it.
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    const low = surface === 'bridge' ? 95 : surface === 'wood' ? 150 : 120;
    thump.frequency.setValueAtTime(low, at);
    thump.frequency.exponentialRampToValueAtTime(low * 0.6, at + 0.07);
    const thumpGain = ctx.createGain();
    env(thumpGain, gain * 1.1, surface === 'bridge' ? 0.16 : 0.08);
    thump.connect(thumpGain);
    thumpGain.connect(this.out);
    thump.start(at);
    thump.stop(at + 0.2);

    // Steel on steel: a faint ring (not on silk, petals or wood).
    if (surface === 'rail' || surface === 'bridge') {
      const ping = ctx.createOscillator();
      ping.type = 'triangle';
      ping.frequency.value = surface === 'bridge' ? 1250 : 1650;
      const pingGain = ctx.createGain();
      env(pingGain, gain * 0.12, surface === 'bridge' ? 0.12 : 0.05);
      ping.connect(pingGain);
      pingGain.connect(this.out);
      ping.start(at);
      ping.stop(at + 0.15);
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
    g.connect(this.out);
    noise.stop(at + 1);
  }
}
