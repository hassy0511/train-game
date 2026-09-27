import { MathUtils, Vector3 } from 'three';
import { Emitter } from '../core/events';
import type { GimmickDef, MirrorParams } from '../stage/types';
import { MIRROR } from '../train/params';
import type { Train } from '../train/train';

/** One "mirror" gimmick (4-1) with its defaults filled in. */
export interface MirrorDef {
  /** Its place in gimmicks[]. */
  index: number;
  /** Bottom centre (world m). */
  position: Vector3;
  rotationY: number;
  /** The way the glass faces (unit, level). */
  normal: Vector3;
  width: number;
  height: number;
  range: number;
  flashRange: number;
  reflectRadius: number;
  railId: string | null;
  junction: string | null;
  lightHint: boolean;
  reflectTrain: boolean;
  reflectCutscene: boolean;
}

/** Height of the glass's lower edge above the mirror's foot (a snow plinth under it). */
export const MIRROR_PLINTH = 1.2;

/** The mirrors of a stage, from its gimmicks. */
export function mirrorDefs(gimmicks: GimmickDef[]): MirrorDef[] {
  const out: MirrorDef[] = [];
  gimmicks.forEach((g, index) => {
    if (g.type !== 'mirror') return;
    const p = (g.params ?? {}) as unknown as MirrorParams;
    if (!Array.isArray(p.position)) return;
    const rotationY = p.rotationY ?? 0;
    const a = MathUtils.degToRad(rotationY);
    const reflect = p.reflect ?? ['train'];
    out.push({
      index,
      position: new Vector3(...p.position),
      rotationY,
      normal: new Vector3(Math.sin(a), 0, Math.cos(a)),
      width: p.width ?? 22,
      height: p.height ?? 14,
      range: p.range ?? MIRROR.range,
      flashRange: p.flashRange ?? MIRROR.flashRange,
      reflectRadius: p.reflectRadius ?? MIRROR.reflectRadius,
      railId: p.railId ?? null,
      junction: p.junction ?? null,
      lightHint: p.lightHint === true,
      reflectTrain: reflect.includes('train'),
      reflectCutscene: reflect.includes('cutscene'),
    });
  });
  return out;
}

/** Signed distance (m) of `point` in front of the mirror's glass (positive on the side it faces). */
export function inFront(m: MirrorDef, point: Vector3): number {
  return (point.x - m.position.x) * m.normal.x + (point.z - m.position.z) * m.normal.z;
}

/**
 * The mirror that shows reflections now: the nearest one within its range with `point` (the lead car) in front of
 * its glass. Only one at a time (PHASE8 第 7 部 §4.3).
 */
export function activeMirror(mirrors: MirrorDef[], point: Vector3): MirrorDef | null {
  let best: MirrorDef | null = null;
  let bestD = Infinity;
  for (const m of mirrors) {
    const d = Math.hypot(point.x - m.position.x, point.z - m.position.z);
    if (d > m.range || d >= bestD || inFront(m, point) <= 0.5) continue;
    best = m;
    bestD = d;
  }
  return best;
}

export interface MirrorEvents extends Record<string, unknown> {
  /** The light caught in a mirror ahead: "きらーん" (once per approach). */
  flash: MirrorDef;
  /** On a mirror's false way, MIRROR.fakeWarn m before it: "ワンダーごうが もう 1だい！？" (once per try). */
  fake: MirrorDef;
}

/**
 * Ice mirrors (4-1): which one reflects now, the light's "きらーん" and the call on a false way. Looks are the view's;
 * the reversed sign at a mirror junction is the usual signReversed rule (the mission runner).
 */
export class MirrorSystem {
  readonly events = new Emitter<MirrorEvents>();
  readonly mirrors: MirrorDef[];
  active: MirrorDef | null = null;
  lightOn = false;
  /** "きらーん"s so far (test hook). */
  flashes = 0;
  private readonly flashed = new Set<number>();
  private readonly faked = new Set<number>();
  private readonly forward = new Vector3();
  private readonly front = new Vector3();

  constructor(
    gimmicks: GimmickDef[],
    private readonly train: Train,
  ) {
    this.mirrors = mirrorDefs(gimmicks);
  }

  reset(): void {
    this.faked.clear();
    this.flashed.clear();
  }

  /** Call every frame after the train moved. */
  update(): void {
    if (this.mirrors.length === 0) return;
    const pose = this.train.getPose();
    this.forward.set(0, 0, 1).applyQuaternion(pose.quaternion).setY(0).normalize();
    this.front.copy(pose.position).addScaledVector(this.forward, 6);
    this.active = activeMirror(this.mirrors, pose.position);
    for (const m of this.mirrors) {
      const d = Math.hypot(this.front.x - m.position.x, this.front.z - m.position.z);
      if (d > m.range) this.flashed.delete(m.index);
      if (this.lightOn && !this.flashed.has(m.index) && d <= m.flashRange && inFront(m, this.front) > 0) {
        const toMirror = new Vector3(m.position.x - this.front.x, 0, m.position.z - this.front.z).normalize();
        if (toMirror.dot(this.forward) >= Math.cos(MathUtils.degToRad(MIRROR.flashCone))) {
          this.flashed.add(m.index);
          this.flashes += 1;
          this.events.emit('flash', m);
        }
      }
      if (m.railId && this.train.state.railId === m.railId && d <= MIRROR.fakeWarn && !this.faked.has(m.index)) {
        this.faked.add(m.index);
        this.events.emit('fake', m);
      }
    }
  }
}
