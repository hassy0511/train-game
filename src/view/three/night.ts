import {
  AdditiveBlending,
  BufferGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { StageEvent } from '../../core/stage-events';
import { fireflyForks } from '../../gimmick/fireflies';
import { resolvePlacement } from '../../stage/loader';
import type { StageData } from '../../stage/types';
import { FIREFLY_FORK, HUSH, LURE, NIGHT, TRAIN } from '../../train/params';
import type { ActorLayer } from './actors';
import { bakeModel } from './bake';
import { dotTexture } from './environment';
import type { ModelLibrary } from './models';
import { setFakeLanternGlow } from './night-placeholders';

/** A sleeper (a sleeping rabbit prop, or a hush record's figure) that hides when its hush stretch is startled. */
interface Sleeper {
  get(): Object3D | null;
  railId: string;
  at: number;
  baseY: number | null;
  /** 0 asleep in view, 1 hidden (only the ears peek out). */
  hide: number;
  target: number;
}

/** A group of little tanukis (a lure actor): where its bush is, where it dances on the rail, what it does now. */
interface Tanukis {
  object: Object3D;
  bush: Vector3;
  rail: Vector3;
  state: 'idle' | 'hop' | 'come' | 'dance' | 'back' | 'bump';
  t: number;
  seconds: number;
  from: Vector3;
  baseQuaternion: Quaternion;
}

/** One firefly fork's fireflies: resting ones in the grass, flying ones from the grass to the true way (or lost). */
interface ForkFlies {
  id: string;
  /** The first point of this fork's in the shared Points. */
  first: number;
  rest: Vector3[];
  origin: Vector3[];
  trail: Vector3[];
  /** Where the trail heads (for drifting away). */
  ahead: Vector3;
  centre: Vector3;
  state: 'sleep' | 'home' | 'lost' | 'away';
  t: number;
  /** Where each flyer was when the state changed (they fly on from there). */
  from: Vector3[];
}

const UP = new Vector3(0, 1, 0);
const HALF_TURN = new Quaternion().setFromAxisAngle(UP, Math.PI);
const ease = (t: number): number => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

/**
 * v1.11 (5-1) night pieces in the scene (PHASE9_CHAPTER5_6 第 4 部 §8, the code-made part): the sleeping rabbits hiding
 * when a hush stretch is startled (the hush record's figure with them), the little tanukis coming onto the rail and
 * dancing, the fireflies of the firefly forks (resting in the grass, flying up to line the true way, lost over a fake
 * fork, drifting away ahead once passed: one Points for every fork), Sakasa's fake lanterns going out, and at night the
 * cars' warm windows and a stronger light beam (setNight). The fawn and the hedgehog are drawn by the actor layer.
 */
export class NightGimmicks {
  readonly group = new Group();
  private readonly sleepers: Sleeper[] = [];
  private readonly tanukis = new Map<string, Tanukis>();
  private readonly forks: ForkFlies[] = [];
  private points: Points<BufferGeometry, PointsMaterial> | null = null;
  private readonly windows: Mesh[] = [];
  private lantern = 1;
  private lanternTarget = 1;
  private clock = 0;

  static wanted(stage: StageData): boolean {
    const f = stage.file;
    return (
      f.gimmicks.some((g) => g.type === 'hush' || g.type === 'whistle-reversed') ||
      f.actors.some((a) => a.type === 'lure') ||
      f.junctions.some((j) => j.fireflies) ||
      f.props.some((p) => p.sleeper) ||
      f.environment.lighting === 'night' ||
      Object.values(f.cutscenes ?? {}).some((steps) => steps.some((st) => 'environment' in st))
    );
  }

  constructor(
    private readonly stage: StageData,
    private readonly actors: ActorLayer,
    private readonly cars: Object3D[],
  ) {
    this.group.name = 'night';
    setFakeLanternGlow(1);
  }

  async init(models: ModelLibrary): Promise<void> {
    const stage = this.stage;
    const network = stage.network;
    const groundY = stage.file.environment.ground?.y ?? null;
    // The sleeping rabbits: each on its own (it hides by itself).
    for (const prop of stage.props) {
      if (!prop.sleeper || !prop.onRail) continue;
      const model = await models.load(prop.model);
      const object = (bakeModel(model) ?? model).clone(true);
      object.position.copy(prop.position);
      object.quaternion.copy(prop.quaternion);
      object.scale.setScalar(prop.scale);
      this.group.add(object);
      this.sleepers.push({ get: () => object, railId: prop.onRail.railId, at: prop.onRail.at, baseY: null, hide: 0, target: 0 });
    }
    for (const r of stage.records) {
      if (!r.def.hush || !r.onRail) continue;
      const id = `record:${r.def.id}`;
      this.sleepers.push({ get: () => this.actors.figure(id), railId: r.onRail.railId, at: r.onRail.at, baseY: null, hide: 0, target: 0 });
    }

    // The little tanukis, facing the train from their bush.
    for (const a of stage.actors) {
      if (a.type !== 'lure' || !a.onRail) continue;
      const count = Math.min(LURE.countMax, Math.max(1, Math.round(Number((a.params as { count?: number }).count ?? 2))));
      const model = await models.load(`tanuki-${count}`);
      const object = (bakeModel(model) ?? model).clone(true);
      object.name = `lure:${a.id}`;
      const q = a.quaternion.clone().multiply(HALF_TURN);
      object.position.copy(a.position);
      object.quaternion.copy(q);
      this.group.add(object);
      const rail = resolvePlacement({ onRail: { railId: a.onRail.railId, at: a.onRail.at } }, network, groundY).position;
      rail.y = a.position.y;
      this.tanukis.set(a.id, { object, bush: a.position.clone(), rail, state: 'idle', t: 0, seconds: 1, from: a.position.clone(), baseQuaternion: q });
    }

    this.buildFireflies();
    this.buildWindows();
  }

  /** The fireflies of every firefly fork, in one Points (positions and brightness written each frame). */
  private buildFireflies(): void {
    const network = this.stage.network;
    let total = 0;
    for (const f of fireflyForks(this.stage.file.junctions)) {
      const j = f.junction;
      const rest: Vector3[] = [];
      for (let i = 0; i < FIREFLY_FORK.rest * 2; i++) {
        const side = i % 2 ? 1 : -1;
        const s = Math.max(0, f.at - FIREFLY_FORK.grass[0] - ((i >> 1) / FIREFLY_FORK.rest) * (FIREFLY_FORK.grass[1] - FIREFLY_FORK.grass[0]));
        const frame = network.getRail(f.railId).frameAt(s);
        rest.push(frame.position.clone().addScaledVector(frame.right, side * (3 + (i % 3) * 0.7)).addScaledVector(UP, 0.5 + (i % 4) * 0.15));
      }
      const trueRail = j[f.trueSide] as string;
      const rail = network.getRail(trueRail);
      const s0 = trueRail === f.railId ? f.at : 0;
      const trail: Vector3[] = [];
      const origin: Vector3[] = [];
      for (let i = 0; i < f.count; i++) {
        const s = Math.min(rail.length, s0 + ((i + 0.5) / f.count) * FIREFLY_FORK.trail);
        const frame = rail.frameAt(s);
        trail.push(frame.position.clone().addScaledVector(frame.right, (i % 2 ? 1 : -1) * (1.3 + (i % 3) * 0.4)).addScaledVector(UP, 1.5 + (i % 4) * 0.35));
        origin.push(rest[i % rest.length].clone().add(new Vector3(0, 0.1 * (i % 3), 0)));
      }
      const end = rail.frameAt(Math.min(rail.length, s0 + FIREFLY_FORK.trail));
      const centre = network.getRail(f.railId).frameAt(f.at).position.clone().addScaledVector(UP, 3);
      this.forks.push({
        id: f.id,
        first: total,
        rest,
        origin,
        trail,
        ahead: end.tangent.clone(),
        centre,
        state: 'sleep',
        t: 0,
        from: origin.map((o) => o.clone()),
      });
      total += rest.length + f.count;
    }
    if (total === 0) return;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(total * 3), 3));
    g.setAttribute('color', new Float32BufferAttribute(new Float32Array(total * 3), 3));
    (g.getAttribute('position') as Float32BufferAttribute).setUsage(DynamicDrawUsage);
    (g.getAttribute('color') as Float32BufferAttribute).setUsage(DynamicDrawUsage);
    const material = new PointsMaterial({
      size: 0.55,
      vertexColors: true,
      map: dotTexture(),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.points = new Points(g, material);
    this.points.name = 'fork-fireflies';
    this.points.frustumCulled = false;
    this.group.add(this.points);
    this.updateFireflies(0);
  }

  /** The cars' windows glowing warm at night (hidden by day). */
  private buildWindows(): void {
    const quads: BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const q = new PlaneGeometry(1.3, 0.75);
        q.rotateY((side * Math.PI) / 2);
        q.translate(side * (TRAIN.width / 2 + 0.03), 2.25, -4.4 + i * 2.2);
        quads.push(q);
      }
    }
    const geometry = mergeGeometries(quads);
    for (const q of quads) q.dispose();
    if (!geometry) return;
    const material = new MeshBasicMaterial({ color: '#ffd88a', transparent: true, opacity: 0.4 + NIGHT.windowGlow * 0.6 });
    for (const car of this.cars) {
      const mesh = new Mesh(geometry, material);
      mesh.name = 'night-windows';
      mesh.visible = false;
      car.add(mesh);
      this.windows.push(mesh);
    }
  }

  /** Night or not (the look's lighting): the cars' windows glow at night. */
  setNight(on: boolean): void {
    for (const w of this.windows) w.visible = on;
  }

  onEvent(e: StageEvent): void {
    if (e.type === 'hush:startle') {
      for (const s of this.sleepers) if (s.railId === e.railId && s.at >= e.from && s.at <= e.to) s.target = 1;
    } else if (e.type === 'rewind') {
      for (const s of this.sleepers) s.target = 0;
      for (const [id] of this.tanukis) this.setTanukis(id, 'idle', 0);
      for (const f of this.forks) this.setFork(f, 'sleep');
      this.lanternTarget = 1;
    } else if (e.type === 'lure') {
      this.setTanukis(e.id, e.state, e.seconds ?? LURE.hop);
    } else if (e.type === 'fireflies:home' || e.type === 'fireflies:lost' || e.type === 'fireflies:away') {
      const f = this.forks.find((x) => x.id === e.junctionId);
      if (f) this.setFork(f, e.type === 'fireflies:home' ? 'home' : e.type === 'fireflies:lost' ? 'lost' : 'away');
    } else if (e.type === 'fake:out') {
      this.lanternTarget = 0;
    }
  }

  private setTanukis(id: string, state: Tanukis['state'], seconds: number): void {
    const t = this.tanukis.get(id);
    if (!t) return;
    t.from.copy(t.object.position);
    t.state = state;
    t.t = 0;
    t.seconds = Math.max(0.05, seconds);
    if (state === 'idle' && seconds === 0) {
      t.object.position.copy(t.bush);
      t.object.quaternion.copy(t.baseQuaternion);
    }
  }

  private setFork(f: ForkFlies, state: ForkFlies['state']): void {
    if (f.state === state) return;
    // They fly on from where they are now (a lost cloud finding the way, a trail drifting away).
    const pos = this.points?.geometry.getAttribute('position') as Float32BufferAttribute | undefined;
    f.from = f.origin.map((o, i) => (pos ? new Vector3().fromBufferAttribute(pos, f.first + f.rest.length + i) : o.clone()));
    if (state === 'sleep') f.from = f.origin.map((o) => o.clone());
    f.state = state;
    f.t = 0;
  }

  update(dt: number): void {
    this.clock += dt;
    for (const s of this.sleepers) {
      if (s.hide === s.target) continue;
      const o = s.get();
      if (!o) continue;
      s.baseY ??= o.position.y;
      const step = dt / HUSH.hideSeconds;
      s.hide = s.target > s.hide ? Math.min(1, s.hide + step) : Math.max(0, s.hide - step);
      // Down into the grass: only the ears peek out.
      o.position.y = s.baseY - 0.3 * ease(s.hide);
    }
    for (const t of this.tanukis.values()) this.updateTanukis(t, dt);
    this.updateFireflies(dt);
    if (this.lantern !== this.lanternTarget) {
      const step = dt / 0.3;
      this.lantern = this.lanternTarget > this.lantern ? Math.min(1, this.lantern + step) : Math.max(0, this.lantern - step);
      setFakeLanternGlow(this.lantern);
    }
  }

  private updateTanukis(t: Tanukis, dt: number): void {
    t.t += dt;
    const k = Math.min(1, t.t / t.seconds);
    const o = t.object;
    o.quaternion.copy(t.baseQuaternion);
    switch (t.state) {
      case 'come':
      case 'back':
      case 'bump': {
        const to = t.state === 'come' ? t.rail : t.bush;
        o.position.lerpVectors(t.from, to, ease(k));
        // "ぴょこぴょこ": little hops on the way.
        o.position.y += Math.abs(Math.sin(k * Math.PI * (t.state === 'bump' ? 2 : 4))) * 0.35;
        break;
      }
      case 'dance':
        // "くるくる": round and round with little hops.
        o.position.copy(t.rail);
        o.position.y += Math.abs(Math.sin(t.t * 6)) * 0.25;
        o.rotateY(t.t * 4);
        break;
      case 'hop':
        o.position.copy(t.bush);
        o.position.y += Math.abs(Math.sin(t.t * 7)) * 0.25;
        o.rotateY(Math.sin(t.t * 5) * 0.6);
        break;
      default:
        o.position.copy(t.bush);
    }
  }

  private updateFireflies(dt: number): void {
    const points = this.points;
    if (!points) return;
    const pos = points.geometry.getAttribute('position') as Float32BufferAttribute;
    const col = points.geometry.getAttribute('color') as Float32BufferAttribute;
    const c = this.clock;
    const p = new Vector3();
    const put = (i: number, v: Vector3, glow: number): void => {
      pos.setXYZ(i, v.x, v.y, v.z);
      // Warm yellow-green (#d8ff7a), as bright as `glow`.
      col.setXYZ(i, 0.85 * glow, 1.0 * glow, 0.48 * glow);
    };
    for (const f of this.forks) {
      f.t += dt;
      f.rest.forEach((r, i) => {
        p.copy(r);
        p.y += Math.sin(c * 1.3 + i) * 0.08;
        put(f.first + i, p, 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(c * 1.7 + i * 2.1)));
      });
      const n = f.trail.length;
      for (let i = 0; i < n; i++) {
        const idx = f.first + f.rest.length + i;
        const wob = Math.sin(c * 2 + i * 1.7) * 0.25;
        let glow = 1;
        switch (f.state) {
          case 'sleep':
            p.copy(f.origin[i]);
            glow = 0;
            break;
          case 'home': {
            // "ぽわん ぽわん": up out of the grass, then along the true way in FIREFLY_FORK.fly s.
            const k = ease((f.t - (i / n) * 0.3) / FIREFLY_FORK.fly);
            p.lerpVectors(f.from[i], f.trail[i], k);
            p.y += Math.sin(k * Math.PI) * 2 + wob;
            break;
          }
          case 'lost': {
            // Circling over the fork, not knowing which way.
            const a = c * 1.4 + (i / n) * Math.PI * 2;
            const ring = new Vector3(Math.cos(a) * 3.2, Math.sin(c * 2 + i) * 0.6, Math.sin(a) * 3.2).add(f.centre);
            p.lerpVectors(f.from[i], ring, ease(f.t));
            break;
          }
          case 'away': {
            // On ahead and up into the sky, fading.
            p.copy(f.from[i]).addScaledVector(f.ahead, f.t * 6).addScaledVector(UP, f.t * 3);
            glow = Math.max(0, 1 - f.t / 3);
            break;
          }
        }
        put(idx, p, glow * (0.75 + 0.25 * Math.sin(c * 3 + i)));
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }
}
