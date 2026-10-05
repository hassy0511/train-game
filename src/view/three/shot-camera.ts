import { MathUtils, Vector3 } from 'three';
import type { Ease, ShotDef, ShotSize } from '../../stage/types';

/**
 * v1.12 (えんしゅつ): the cutscene camera's shots (docs/STAGE_SCHEMA.md §25). A shot frames a subject (a figure, a car,
 * the train, a point): the distance comes from the subject's size so it fills a set part of the picture (inside the
 * letterbox when it is on), the camera stands at `angle` round it and `height` above it, and follows it when it moves
 * (turning with it unless `world`). Moving from the shot before, the camera swings round the subject (an orbit when
 * the subject is the same, a dolly from one framing to another otherwise), eased; then a slow push-in and drift if
 * asked. Pure maths on Three's vectors: the view (ThreeSceneView) gives the subject, the clip test and the ground.
 */

/** A shot's subject this frame: its middle, how big it looks (m: the frame height it needs), its height and facing. */
export interface ShotSubject {
  center: Vector3;
  /** The frame height (m) that just holds it: its height, or its length over the screen's aspect if wider. */
  size: number;
  height: number;
  /** Its facing: radians about the vertical from world +Z towards +X. */
  yaw: number;
}

export interface ShotPose {
  position: Vector3;
  lookAt: Vector3;
  fov: number;
}

/** The part of the picture height the subject fills, by shot size. */
const FILL: Record<ShotSize, number> = { close: 0.72, medium: 0.4, wide: 0.15 };
/** The lens (vertical field of view, degrees): a little long for a close shot (no big noses), wider for a wide one. */
const FOV: Record<ShotSize, number> = { close: 34, medium: 42, wide: 50 };
/** Degrees above level the camera looks down from, by default. */
const ELEVATION: Record<ShotSize, number> = { close: 8, medium: 16, wide: 30 };
/** The aim above the subject's middle, as a part of its height (a close shot looks at the face). */
const LIFT: Record<ShotSize, number> = { close: 0.16, medium: 0.06, wide: 0 };
/** The camera never comes nearer than this (m) to what it frames, nor lower than this above the ground. */
const MIN_DISTANCE = 0.7;
const GROUND_CLEAR = 0.45;
/** How long the push-in and the drift take by default (s). */
const HOLD_SECONDS = 8;
/** How often the clip test runs (s) and how fast the camera backs out again once clear (m/s). */
const CLIP_EVERY = 0.12;
const CLIP_RELEASE = 12;

export function ease(kind: Ease | undefined, t: number): number {
  const x = MathUtils.clamp(t, 0, 1);
  switch (kind ?? 'inOut') {
    case 'linear':
      return x;
    case 'in':
      return x * x * x;
    case 'out':
      return 1 - (1 - x) ** 3;
    case 'inOut':
      return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
  }
}

/** The shortest signed turn from angle `a` to `b` (radians). */
function turn(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** A camera offset round a point in spherical terms: radius, azimuth (from +Z towards +X) and elevation (radians). */
interface Polar {
  r: number;
  az: number;
  el: number;
}

function toPolar(v: Vector3): Polar {
  const r = Math.max(1e-3, v.length());
  return { r, az: Math.atan2(v.x, v.z), el: Math.asin(MathUtils.clamp(v.y / r, -1, 1)) };
}

function fromPolar(p: Polar, out: Vector3): Vector3 {
  const c = Math.cos(p.el);
  return out.set(Math.sin(p.az) * c * p.r, Math.sin(p.el) * p.r, Math.cos(p.az) * c * p.r);
}

const Y = new Vector3(0, 1, 0);
const tmp = new Vector3();
const tmp2 = new Vector3();

export class ShotCamera {
  /** prefers-reduced-motion: every move is a cut, no push-in or drift. */
  reduced = false;
  /** The part of the screen height each letterbox bar covers (0: none). */
  letterboxPart = 0;
  private def: ShotDef | null = null;
  private t = 0;
  /** Where the camera was when the shot started, relative to the subject's middle (in its turning frame). */
  private from: { offset: Polar; look: Vector3; fov: number } | null = null;
  private clipLeft = 0;
  private clipDistance = Infinity;
  private wanted = Infinity;

  get active(): boolean {
    return this.def !== null;
  }

  /** The shot on now (null: none). */
  get shot(): ShotDef | null {
    return this.def;
  }

  /** As a fixed camera's reach: how many times further than the stage fog it sees. */
  get reach(): number {
    const def = this.def;
    if (!def) return 1;
    return def.reach ?? (def.shot === 'wide' ? 2.5 : 1);
  }

  /** Seconds the move from the shot before takes (0: a cut). */
  moveSeconds(def: ShotDef): number {
    return this.reduced ? 0 : Math.max(0, def.seconds ?? 0);
  }

  /** Starts `def`; the camera is at `current` now, `subject` is what it frames (null: unknown yet, a cut). */
  start(def: ShotDef, subject: ShotSubject | null, current: ShotPose): void {
    this.def = def;
    this.t = 0;
    this.clipLeft = 0;
    this.clipDistance = Infinity;
    this.wanted = Infinity;
    if (this.moveSeconds(def) > 0 && subject) {
      const frame = def.world ? 0 : subject.yaw;
      const offset = tmp.copy(current.position).sub(subject.center).applyAxisAngle(Y, -frame);
      const look = current.lookAt.clone().sub(subject.center).applyAxisAngle(Y, -frame);
      this.from = { offset: toPolar(offset), look, fov: current.fov };
    } else {
      this.from = null;
    }
  }

  stop(): void {
    this.def = null;
    this.from = null;
    this.clipDistance = Infinity;
  }

  /**
   * The camera this frame. `clip(target, camera)` says how far from `target` towards `camera` the way is clear (m);
   * `ground` is the lowest the camera may go (null: no ground).
   */
  update(
    dt: number,
    subject: ShotSubject,
    aspect: number,
    clip: (target: Vector3, camera: Vector3) => number,
    ground: number | null,
    out: ShotPose,
  ): void {
    const def = this.def;
    if (!def) return;
    this.t += dt;
    const size = def.shot;
    const fov = FOV[size];
    const visible = 1 - 2 * this.letterboxPart;
    const auto = subject.size / (FILL[size] * visible) / (2 * Math.tan(MathUtils.degToRad(fov) / 2));
    let distance = Math.max(MIN_DISTANCE, def.distance ?? auto);
    const move = this.moveSeconds(def);
    const held = MathUtils.clamp((this.t - move) / (def.hold ?? HOLD_SECONDS), 0, 1);
    const drift = this.reduced ? 0 : ease('inOut', held);
    distance *= 1 - MathUtils.clamp(this.reduced ? 0 : (def.push ?? 0), 0, 0.6) * drift;
    const frame = def.world ? 0 : subject.yaw;
    const to: Polar = {
      r: distance,
      az: MathUtils.degToRad((def.angle ?? 30) + (this.reduced ? 0 : (def.orbit ?? 0)) * drift),
      el: MathUtils.degToRad(def.height ?? ELEVATION[size]),
    };
    // The aim: a little above the middle (the face, in a close shot).
    const look = tmp2.set(0, LIFT[size] * subject.height, 0);
    let polar = to;
    let lens = fov;
    if (this.from && this.t < move) {
      const k = ease(def.ease, this.t / move);
      const a = this.from.offset;
      polar = {
        r: Math.exp(MathUtils.lerp(Math.log(a.r), Math.log(to.r), k)),
        az: a.az + turn(a.az, to.az) * k,
        el: MathUtils.lerp(a.el, to.el, k),
      };
      look.lerpVectors(this.from.look, look, k);
      lens = MathUtils.lerp(this.from.fov, fov, k);
    } else if (this.from) {
      this.from = null;
    }
    // Into the world: turned with the subject, about its middle.
    out.lookAt.copy(look).applyAxisAngle(Y, frame).add(subject.center);
    out.position.copy(fromPolar(polar, tmp)).applyAxisAngle(Y, frame).add(out.lookAt);
    out.fov = lens;
    // Where the subject sits across the frame: the aim moves the other way.
    const side = MathUtils.clamp(def.side ?? 0, -0.8, 0.8);
    if (side !== 0) {
      const view = tmp.subVectors(out.lookAt, out.position);
      const reachAt = view.length();
      const right = view.cross(Y).normalize();
      const half = reachAt * Math.tan(MathUtils.degToRad(lens) / 2) * aspect;
      out.lookAt.addScaledVector(right, -side * half);
    }
    // Nothing between the subject and the camera: come nearer instead (tested now and then, eased back out).
    this.clipLeft -= dt;
    const aim = tmp.copy(subject.center).setY(subject.center.y + LIFT[size] * subject.height);
    const want = out.position.distanceTo(aim);
    if (this.clipLeft <= 0) {
      this.clipLeft = CLIP_EVERY;
      this.wanted = clip(aim, out.position);
    }
    const allowed = Math.min(want, this.wanted);
    if (allowed < this.clipDistance) this.clipDistance = allowed;
    else this.clipDistance = Math.min(allowed, this.clipDistance + CLIP_RELEASE * dt);
    if (this.clipDistance < want - 1e-3) {
      const dir = tmp2.subVectors(out.position, aim).normalize();
      out.position.copy(aim).addScaledVector(dir, Math.max(MIN_DISTANCE * 0.6, this.clipDistance));
    }
    if (ground !== null && out.position.y < ground + GROUND_CLEAR) out.position.y = ground + GROUND_CLEAR;
  }
}
