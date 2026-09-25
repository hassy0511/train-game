import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { StageEvent } from '../../core/stage-events';
import type { Rail } from '../../rail/types';
import type { StageData } from '../../stage/types';
import type { ModelLibrary } from './models';
import { buildTrack } from './rail-mesh';

const BARK = new Color('#7A5A3C');
/** The nut rolls with its centre this far above the rail (m). */
const NUT_LIFT = 0.1;
/** Where a squirrel sits over its rail, and where it holds the nut (m above the rail). */
const SQUIRREL_HEIGHT = 6;
const SQUIRREL_LATERAL = 1.8;
const HELD_NUT_HEIGHT = 5.4;

/** A bough's track and log, bent every frame (vertices move down by sag × u², u = 0 at the trunk, 1 at the tip). */
interface BoughVisual {
  geometry: BufferGeometry;
  base: Float32Array;
  u: Float32Array;
  down: Vector3;
}

interface NutVisual {
  object: Object3D;
  railId: string;
  /** "roll": rolling from `at` at `speed`, `t` s ago; "fall": falling from `from` to `to` in `seconds`. */
  mode: 'wait' | 'roll' | 'rest' | 'fall' | 'bonk' | 'hidden';
  at: number;
  speed: number;
  t: number;
  from: Vector3;
  to: Vector3;
  seconds: number;
  /** After a fall onto the rail it rests; off the rail it hides. */
  then: 'rest' | 'hidden';
  range: number;
}

/**
 * The giant tree's moving parts (2-1): springy boughs that bend under the train, nuts that roll down the
 * branches, and squirrels that drop theirs. Driven by stage events; animated on the view's clock (so a pause
 * holds them too).
 */
export class ForestGimmicks {
  readonly group = new Group();
  private readonly boughs = new Map<number, BoughVisual>();
  private readonly nuts = new Map<string, NutVisual>();
  private readonly squirrels = new Map<string, Object3D>();

  constructor(private readonly stage: StageData) {
    this.group.name = 'forest-gimmicks';
  }

  async init(models: ModelLibrary): Promise<void> {
    const material = new MeshLambertMaterial({ vertexColors: true });
    for (const [index, g] of this.stage.file.gimmicks.entries()) {
      if (g.type !== 'bough' || g.railId === undefined || g.from === undefined || g.to === undefined) continue;
      const visual = buildBough(this.stage.network.getRail(g.railId), g.from, g.to);
      if (!visual) continue;
      const mesh = new Mesh(visual.geometry, material);
      mesh.name = `bough-${index}`;
      // Bent vertices move within a few metres: keep it drawn rather than recomputing bounds every frame.
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.boughs.set(index, visual);
    }

    const acorn = await models.load('acorn');
    for (const actor of this.stage.actors) {
      if ((actor.type !== 'nut' && actor.type !== 'squirrel') || !actor.onRail) continue;
      const nut = acorn.clone(true);
      this.group.add(nut);
      const range = Number((actor.params as { range?: number }).range ?? 160);
      const visual: NutVisual = {
        object: nut,
        railId: actor.onRail.railId,
        mode: 'wait',
        at: actor.onRail.at,
        speed: 0,
        t: 0,
        from: new Vector3(),
        to: new Vector3(),
        seconds: 0,
        then: 'rest',
        range,
      };
      this.nuts.set(actor.id, visual);
      if (actor.type === 'squirrel') {
        const squirrel = (await models.load('squirrel')).clone(true);
        const f = this.frame(actor.onRail.railId, actor.onRail.at);
        squirrel.position.copy(f.position).addScaledVector(f.up, SQUIRREL_HEIGHT).addScaledVector(f.right, SQUIRREL_LATERAL);
        // Face across the rail, towards the approaching train a little.
        squirrel.lookAt(squirrel.position.clone().sub(f.right).addScaledVector(f.tangent, -0.6));
        this.group.add(squirrel);
        this.squirrels.set(actor.id, squirrel);
        this.hold(visual);
      } else {
        this.place(visual, visual.at);
      }
    }
  }

  private frame(railId: string, s: number): { position: Vector3; up: Vector3; right: Vector3; tangent: Vector3 } {
    const rail = this.stage.network.getRail(railId);
    return rail.frameAt(Math.max(0, Math.min(rail.length, s)));
  }

  /** Puts a nut on its rail at `s`. */
  private place(nut: NutVisual, s: number): void {
    const f = this.frame(nut.railId, s);
    nut.object.position.copy(f.position).addScaledVector(f.up, NUT_LIFT);
    nut.object.visible = true;
  }

  /** A squirrel's nut, held over the rail. */
  private hold(nut: NutVisual): void {
    const f = this.frame(nut.railId, nut.at);
    nut.object.position.copy(f.position).addScaledVector(f.up, HELD_NUT_HEIGHT).addScaledVector(f.right, SQUIRREL_LATERAL * 0.6);
    nut.object.rotation.set(0, 0, 0);
    nut.object.visible = true;
    nut.mode = 'rest';
  }

  private fall(nut: NutVisual, to: Vector3, seconds: number, then: 'rest' | 'hidden'): void {
    nut.from.copy(nut.object.position);
    nut.to.copy(to);
    nut.t = 0;
    nut.seconds = seconds;
    nut.then = then;
    nut.mode = 'fall';
  }

  onEvent(e: StageEvent): void {
    if (e.type === 'bough') {
      const b = this.boughs.get(e.index);
      if (!b) return;
      const pos = b.geometry.getAttribute('position') as BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < b.u.length; i++) {
        const k = e.sag * b.u[i] * b.u[i];
        arr[i * 3] = b.base[i * 3] + b.down.x * k;
        arr[i * 3 + 1] = b.base[i * 3 + 1] + b.down.y * k;
        arr[i * 3 + 2] = b.base[i * 3 + 2] + b.down.z * k;
      }
      pos.needsUpdate = true;
      return;
    }
    if (e.type === 'nut') {
      const nut = this.nuts.get(e.id);
      if (!nut) return;
      switch (e.state) {
        case 'roll':
          nut.mode = 'roll';
          nut.at = e.at;
          nut.speed = e.speed ?? 5;
          nut.t = 0;
          break;
        case 'rest': {
          const f = this.frame(nut.railId, e.at);
          this.fall(nut, f.position.clone().addScaledVector(f.up, NUT_LIFT), 0.45, 'rest');
          break;
        }
        case 'bonk': {
          // Bumped: it hops off the rail to the side and is gone. Nothing scary, just "ぽこん".
          const f = this.frame(nut.railId, e.at);
          this.fall(nut, f.position.clone().addScaledVector(f.right, 5).addScaledVector(f.up, -6), 0.9, 'hidden');
          break;
        }
        case 'hide':
          nut.mode = 'hidden';
          nut.object.visible = false;
          break;
        case 'reset':
          nut.mode = 'wait';
          nut.at = e.at;
          this.place(nut, e.at);
          break;
      }
      return;
    }
    if (e.type === 'squirrel') {
      const nut = this.nuts.get(e.id);
      if (!nut) return;
      if (e.state === 'hold') this.hold(nut);
      if (e.state === 'drop-side') {
        // Whistled: the nut goes down beside the branch, well clear of the rail.
        const f = this.frame(nut.railId, nut.at);
        this.fall(nut, f.position.clone().addScaledVector(f.right, 4.5).addScaledVector(f.up, -9), 1.1, 'hidden');
      }
    }
  }

  update(dt: number): void {
    for (const nut of this.nuts.values()) {
      if (nut.mode === 'roll') {
        nut.t += dt;
        const travelled = Math.min(nut.range, nut.speed * nut.t);
        this.place(nut, nut.at - travelled);
        // Rolling towards the train: it turns about its side axis.
        nut.object.rotation.x -= (nut.speed * dt) / 0.8;
        if (travelled >= nut.range) {
          nut.mode = 'hidden';
          nut.object.visible = false;
        }
      } else if (nut.mode === 'fall') {
        nut.t += dt;
        const k = Math.min(1, nut.t / nut.seconds);
        nut.object.position.lerpVectors(nut.from, nut.to, k);
        // A small hop at the start of the fall.
        nut.object.position.y += Math.sin(k * Math.PI) * 1.2;
        nut.object.rotation.z += dt * 6;
        if (k >= 1) {
          nut.mode = nut.then;
          if (nut.then === 'hidden') nut.object.visible = false;
        }
      }
    }
    // Squirrels bob a little.
    for (const squirrel of this.squirrels.values()) squirrel.rotation.z = Math.sin(performance.now() / 300) * 0.05;
  }
}

/** The bent part of a bough: its own track plus a log under it, with u (0 at the root, 1 at the tip) per vertex. */
function buildBough(rail: Rail, from: number, to: number): BoughVisual | null {
  const track = buildTrack(rail, from, to);
  if (!track) return null;
  const log = buildLog(rail, from, to);
  const geometry = mergeGeometries([track, log]);
  track.dispose();
  log.dispose();
  if (!geometry) return null;
  const start = rail.frameAt(from);
  const end = rail.frameAt(to);
  const along = end.position.clone().sub(start.position);
  const length = along.length();
  along.normalize();
  const pos = geometry.getAttribute('position') as BufferAttribute;
  const base = new Float32Array(pos.array as Float32Array);
  const u = new Float32Array(pos.count);
  const p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).sub(start.position);
    u[i] = Math.max(0, Math.min(1, p.dot(along) / length));
  }
  return { geometry, base, u, down: start.up.clone().negate() };
}

/** A tapering log under the rail from `from` to `to` (1.9 m radius at the root, 1.2 at the tip). */
function buildLog(rail: Rail, from: number, to: number): BufferGeometry {
  const SIDES = 10;
  const positions: number[] = [];
  const indices: number[] = [];
  const steps = Math.max(2, Math.ceil((to - from) / 2));
  for (let i = 0; i <= steps; i++) {
    const s = from + ((to - from) * i) / steps;
    const f = rail.frameAt(s);
    const r = 1.9 - 0.7 * (i / steps);
    const centre = f.position.clone().addScaledVector(f.up, -(0.6 + r));
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2;
      const v = centre.clone().addScaledVector(f.right, Math.cos(a) * r).addScaledVector(f.up, Math.sin(a) * r);
      positions.push(v.x, v.y, v.z);
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let k = 0; k < SIDES; k++) {
      const a = i * SIDES + k;
      const b = i * SIDES + ((k + 1) % SIDES);
      const c = a + SIDES;
      const d = b + SIDES;
      // Outward-facing (counter-clockwise seen from outside).
      indices.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  const colors = new Float32Array((positions.length / 3) * 3);
  for (let i = 0; i < positions.length / 3; i++) colors.set([BARK.r, BARK.g, BARK.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return g;
}
