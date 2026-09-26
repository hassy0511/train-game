import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { StageEvent } from '../../core/stage-events';
import { param } from '../../gimmick/zones';
import type { RailFrame } from '../../rail/types';
import { FLOWER_BRIDGE } from '../../train/params';
import { resolvePlacement } from '../../stage/loader';
import type { GimmickDef, StageData } from '../../stage/types';
import type { ModelLibrary } from './models';
import { buildSilkBridge, buildTrack, type TrackLook } from './rail-mesh';

/** Where a riding grasshopper sits, in the lead car's frame: body on the roof, head peeking over the windscreen. */
const ROOF = new Vector3(0.3, 3.15, 6.2);
/** Head tipped down over the windscreen edge (rad about X). */
const ROOF_PITCH = 0.3;
/** Hopping on or off the roof (s) and the height of the hop (m). */
const HOP_SECONDS = 0.6;
const HOP_ARC = 3;
/** Where it hops off to, in the lead car's frame (the train's local −X is the driver's right). */
const HOP_OFF = new Vector3(-7, 0.4, 4);
/**
 * Seen from the cab the rider is only its head, hanging upside down over the top of the windscreen and looking
 * in: big eyes and dangling feelers at the top of the view, right of the speed label (the body on the roof is out
 * of sight there).
 */
const PEEK = new Vector3(-0.85, 3.6, 7.0);
const PEEK_SCALE = 0.6;

const PETAL = new Color('#F4A7C0');
const PETAL_LIGHT = new Color('#FBD3E0');
const STEM = new Color('#6BA84F');
const CENTRE = new Color('#FFD95A');
/** The petal bridge is this wide (m) and lies this far under the rail top, so the track rests on it. */
const BRIDGE_HALF_WIDTH = 3.5;
const BRIDGE_DEPTH = 0.32;

interface HopperVisual {
  id: string;
  object: Object3D;
  head: Object3D | null;
  antennae: Object3D[];
  /** The upside-down head shown instead of the rider in the cab view. */
  peek: Object3D | null;
  legs: Object3D[];
  home: { position: Vector3; quaternion: Quaternion };
  /** Its landing leaf after its gap (stage params.off), or null: then beside the train, on the ground. */
  landing: { position: Vector3; quaternion: Quaternion } | null;
  mode: 'sit' | 'hop-on' | 'ride' | 'hop-off' | 'off';
  t: number;
  from: Vector3;
  fromQ: Quaternion;
  to: Vector3;
  toQ: Quaternion;
  /** Seconds left of a leg kick (jump) or of waving the antennae (after hopping off). */
  kick: number;
  wave: number;
}

interface ButterflyVisual {
  index: number;
  railId: string;
  object: Object3D;
  wings: [Object3D | null, Object3D | null];
  /** Where it waits (on its little flower) and where it lands (on the bud). */
  perch: Vector3;
  bud: Vector3;
  height: number;
  lateral: number;
  state: 'wait' | 'follow' | 'hover' | 'land' | 'open';
  s: number;
  flustered: boolean;
  /** Current sideways offset while flying: from the flower's side in to the middle of the track. */
  lateralNow: number;
  phase: number;
}

interface BridgeVisual {
  index: number;
  railId: string;
  from: number;
  to: number;
  look: TrackLook;
  petals: Object3D[];
  ribbon: Mesh;
  ribbonCount: number;
  track: Mesh | null;
  /** Seconds since it started to open, or -1 while closed. */
  t: number;
  bloom: number;
}

interface SilkVisual {
  geometry: BufferGeometry;
  base: Float32Array;
  u: Float32Array;
  down: Vector3;
  state: 'calm' | 'shake' | 'boing';
  t: number;
  /** The span's chord (start, unit direction, length) and its current sag at mid-span (m). */
  start: Vector3;
  along: Vector3;
  length: number;
  amp: number;
}

/**
 * The meadow's moving parts (2-2): grasshoppers that hop onto the roof, butterflies that follow the light to
 * their bud, flowers that open into bridges over the streams, and hanging silk bridges that sway. Driven by stage
 * events; animated on the view's clock.
 */
export class MeadowGimmicks {
  readonly group = new Group();
  private readonly hoppers = new Map<string, HopperVisual>();
  private readonly butterflies = new Map<number, ButterflyVisual>();
  private readonly bridges = new Map<number, BridgeVisual>();
  private readonly silks = new Map<number, SilkVisual>();
  private readonly material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private clock = 0;

  constructor(
    private readonly stage: StageData,
    private readonly train: Object3D,
  ) {
    this.group.name = 'meadow-gimmicks';
  }

  /** Stretches of track this layer draws itself (the hanging silk bridges). */
  static trackSkips(stage: StageData): { railId: string; from: number; to: number }[] {
    return stage.file.gimmicks.flatMap((g) =>
      g.type === 'fragile' && g.railId !== undefined && g.from !== undefined && g.to !== undefined ? [{ railId: g.railId, from: g.from, to: g.to }] : [],
    );
  }

  private look(railId: string): TrackLook {
    return this.stage.file.rails.find((r) => r.id === railId)?.look ?? 'rail';
  }

  private frame(railId: string, s: number): RailFrame {
    const rail = this.stage.network.getRail(railId);
    return rail.frameAt(Math.max(0, Math.min(rail.length, s)));
  }

  async init(models: ModelLibrary): Promise<void> {
    const hopperModel = this.stage.actors.some((a) => a.type === 'grasshopper') ? await models.load('grasshopper') : null;
    for (const actor of this.stage.actors) {
      if (actor.type !== 'grasshopper' || !actor.onRail || !hopperModel) continue;
      const object = hopperModel.clone(true);
      object.name = `hopper:${actor.id}`;
      object.position.copy(actor.position);
      // Sitting on its leaf facing along the line, towards where the train goes.
      object.quaternion.copy(actor.quaternion);
      this.group.add(object);
      const find = (name: string) => object.getObjectByName(name) ?? null;
      const head = find('head');
      const peek = head ? head.clone(true) : null;
      if (peek) {
        peek.name = `hopper-peek:${actor.id}`;
        peek.position.copy(PEEK);
        peek.rotation.set(Math.PI, 0, 0);
        peek.scale.setScalar(PEEK_SCALE);
        peek.visible = false;
        this.train.add(peek);
      }
      const feelers = (o: Object3D | null) =>
        [o?.getObjectByName('antenna-left'), o?.getObjectByName('antenna-right')].filter((x): x is Object3D => !!x);
      this.hoppers.set(actor.id, {
        id: actor.id,
        object,
        head,
        antennae: [...feelers(object), ...feelers(peek)],
        peek,
        legs: [find('leg-left'), find('leg-right')].filter((o): o is Object3D => o !== null),
        home: { position: actor.position.clone(), quaternion: actor.quaternion.clone() },
        landing: this.landing(actor.onRail.railId, actor.params),
        mode: 'sit',
        t: 0,
        from: new Vector3(),
        fromQ: new Quaternion(),
        to: new Vector3(),
        toQ: new Quaternion(),
        kick: 0,
        wave: 0,
      });
    }

    const gimmicks = this.stage.file.gimmicks;
    const butterflyModel = gimmicks.some((g) => g.type === 'flower-bridge') ? await models.load('butterfly') : null;
    const flowerModel = butterflyModel ? await models.load('meadow-flower') : null;
    for (const [index, g] of gimmicks.entries()) {
      if (g.railId === undefined || g.from === undefined || g.to === undefined) continue;
      if (g.type === 'flower-bridge' && butterflyModel && flowerModel) this.addFlowerBridge(index, g, butterflyModel, flowerModel);
      if (g.type === 'fragile') this.addSilkBridge(index, g);
    }
  }

  private addFlowerBridge(index: number, g: GimmickDef, butterflyModel: Object3D, flowerModel: Object3D): void {
    const railId = g.railId as string;
    const from = g.from as number;
    const to = g.to as number;
    const butterflyAt = param(g, 'butterflyAt', from - 100);
    const lateral = param(g, 'butterflyLateral', -5);
    const height = param(g, 'butterflyHeight', 4);
    const size = param(g, 'size', 1);
    const bud = param(g, 'bud', FLOWER_BRIDGE.bud);
    const budLateral = param(g, 'budLateral', 4);
    const groundY = this.stage.file.environment.ground?.y ?? null;

    // The butterfly's little flower (a meadow flower scaled down, its head at the butterfly's height).
    const f = this.frame(railId, butterflyAt);
    const flowerBase = f.position.clone().addScaledVector(f.right, lateral);
    const railY = flowerBase.y;
    if (groundY !== null) flowerBase.y = groundY;
    const flower = flowerModel.clone(true);
    flower.name = `butterfly-flower:${index}`;
    flower.position.copy(flowerBase);
    // meadow-flower is 30 m tall: scale it so its head is at the perch.
    flower.scale.setScalar(Math.max(0.05, (railY + height - flowerBase.y) / 30));
    this.group.add(flower);
    const perch = f.position.clone().addScaledVector(f.right, lateral).addScaledVector(f.up, height + 0.25);

    const object = butterflyModel.clone(true);
    object.name = `butterfly:${index}`;
    object.position.copy(perch);
    object.quaternion.copy(frameQuaternion(f));
    this.group.add(object);

    // The bud on its stem, before the stream.
    const bf = this.frame(railId, from - bud);
    const budHead = bf.position.clone().addScaledVector(bf.right, budLateral).addScaledVector(bf.up, 2.5 * size);
    const budGroup = new Group();
    budGroup.name = `bud:${index}`;
    budGroup.position.copy(budHead);
    budGroup.quaternion.copy(frameQuaternion(bf));
    const stemLength = groundY !== null ? Math.max(1, budHead.y - groundY) : 3 * size;
    const stem = new Mesh(painted(new CylinderGeometry(0.22 * size, 0.32 * size, stemLength, 6), STEM), this.material);
    stem.position.y = -stemLength / 2;
    budGroup.add(stem);
    const centre = new Mesh(painted(new SphereGeometry(0.55 * size, 8, 6), CENTRE), this.material);
    centre.position.y = 0.3 * size;
    budGroup.add(centre);
    const petals: Object3D[] = [];
    for (let k = 0; k < 5; k++) {
      // Each petal: a spoke turned round the stem, and a hinge on it that folds the petal up (closed) or out.
      const spoke = new Group();
      spoke.rotation.y = (k / 5) * Math.PI * 2;
      const hinge = new Group();
      const petal = new Mesh(painted(new SphereGeometry(1, 8, 5), k % 2 ? PETAL_LIGHT : PETAL), this.material);
      // Open, a petal reaches about 2.3 m × size out: clear of the train (1.52 m half-width) for buds 4 m out.
      petal.scale.set(0.9 * size, 0.25 * size, 1.3 * size);
      petal.position.set(0, 0, 1.1 * size);
      hinge.add(petal);
      hinge.rotation.x = -1.25;
      spoke.add(hinge);
      budGroup.add(spoke);
      petals.push(hinge);
    }
    this.group.add(budGroup);

    const ribbon = buildPetalRibbon(this.stage.network.getRail(railId), from, to);
    const ribbonMesh = new Mesh(ribbon.geometry, new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }));
    ribbonMesh.name = `petal-bridge:${index}`;
    ribbon.geometry.setDrawRange(0, 0);
    ribbonMesh.visible = false;
    ribbonMesh.frustumCulled = false;
    this.group.add(ribbonMesh);

    this.bridges.set(index, {
      index,
      railId,
      from,
      to,
      look: this.look(railId),
      petals,
      ribbon: ribbonMesh,
      ribbonCount: ribbon.count,
      track: null,
      t: -1,
      bloom: param(g, 'bloomSeconds', FLOWER_BRIDGE.bloomSeconds),
    });
    const budPerch = budHead.clone().addScaledVector(bf.up, 1.2 * size);
    this.butterflies.set(index, {
      index,
      railId,
      object,
      wings: [object.getObjectByName('wing-left') ?? null, object.getObjectByName('wing-right') ?? null],
      perch,
      bud: budPerch,
      height,
      lateral,
      state: 'wait',
      s: butterflyAt,
      flustered: false,
      lateralNow: lateral,
      phase: index * 1.7,
    });
  }

  private addSilkBridge(index: number, g: GimmickDef): void {
    const railId = g.railId as string;
    const built = buildSilkBridge(this.stage.network.getRail(railId), g.from as number, g.to as number);
    if (!built) return;
    const mesh = new Mesh(built.geometry, new MeshLambertMaterial({ vertexColors: true }));
    mesh.name = `silk-bridge:${index}`;
    // Its vertices move a little every frame: keep it drawn rather than recomputing bounds.
    mesh.frustumCulled = false;
    this.group.add(mesh);
    const pos = built.geometry.getAttribute('position') as BufferAttribute;
    const start = this.frame(railId, g.from as number).position.clone();
    const chord = this.frame(railId, g.to as number).position.clone().sub(start);
    this.silks.set(index, {
      geometry: built.geometry,
      base: new Float32Array(pos.array as Float32Array),
      u: built.u,
      down: this.frame(railId, g.from as number).up.clone().negate(),
      state: 'calm',
      t: 0,
      start,
      along: chord.clone().normalize(),
      length: chord.length(),
      amp: 0,
    });
  }

  onEvent(e: StageEvent): void {
    if (e.type === 'hopper') {
      const h = this.hoppers.get(e.id);
      if (!h) return;
      if (e.state === 'board') this.hopOn(h);
      else if (e.state === 'off') this.hopOff(h);
      else this.sit(h);
      return;
    }
    if (e.type === 'jump') {
      for (const h of this.hoppers.values()) if (h.mode === 'ride') h.kick = 0.45;
      return;
    }
    if (e.type === 'butterfly') {
      const b = this.butterflies.get(e.index);
      if (!b) return;
      b.state = e.state;
      b.s = e.s;
      b.flustered = e.flustered;
      return;
    }
    if (e.type === 'bridge' && e.open) {
      const bridge = this.bridges.get(e.index);
      if (bridge && bridge.t < 0) bridge.t = 0;
      return;
    }
    if (e.type === 'fragile') {
      const silk = this.silks.get(e.index);
      if (!silk) return;
      if (e.state === 'calm' && silk.state === 'boing' && silk.t < 1.4) return;
      silk.state = e.state;
      silk.t = 0;
    }
  }

  private hopOn(h: HopperVisual): void {
    if (h.object.parent !== this.group) this.group.attach(h.object);
    h.from.copy(h.object.position);
    h.fromQ.copy(h.object.quaternion);
    h.mode = 'hop-on';
    h.t = 0;
  }

  /** The leaf a grasshopper hops off onto (params.off: at, lateral, heightFromRail on its own rail). */
  private landing(railId: string, params: Record<string, unknown>): { position: Vector3; quaternion: Quaternion } | null {
    const off = params.off as { at?: number; lateral?: number; heightFromRail?: number } | undefined;
    if (!off || typeof off.at !== 'number') return null;
    const onRail = { railId, at: off.at, lateral: off.lateral ?? 0, heightFromRail: off.heightFromRail ?? 0 };
    return resolvePlacement({ onRail }, this.stage.network, null);
  }

  private hopOff(h: HopperVisual): void {
    this.train.updateMatrixWorld();
    this.group.attach(h.object);
    h.from.copy(h.object.position);
    h.fromQ.copy(h.object.quaternion);
    if (h.landing) {
      h.to.copy(h.landing.position);
      h.toQ.copy(h.landing.quaternion);
    } else {
      h.to.copy(this.train.localToWorld(HOP_OFF.clone()));
      const groundY = this.stage.file.environment.ground?.y;
      if (groundY !== undefined) h.to.y = groundY;
      h.toQ.copy(this.train.quaternion);
    }
    h.mode = 'hop-off';
    h.t = 0;
  }

  private sit(h: HopperVisual): void {
    if (h.object.parent !== this.group) this.group.attach(h.object);
    h.object.position.copy(h.home.position);
    h.object.quaternion.copy(h.home.quaternion);
    h.mode = 'sit';
    h.kick = 0;
    h.wave = 0;
  }

  /** `cab`: the camera is in the driver's seat (a riding grasshopper then shows as its peeking head). */
  update(dt: number, cab = false): void {
    this.clock += dt;
    const time = this.clock;
    this.train.updateMatrixWorld();
    for (const h of this.hoppers.values()) {
      this.updateHopper(h, dt, time);
      const peeking = cab && h.mode === 'ride';
      h.object.visible = !peeking;
      if (h.peek) h.peek.visible = peeking;
    }
    for (const b of this.butterflies.values()) this.updateButterfly(b, dt, time);
    for (const bridge of this.bridges.values()) this.updateBridge(bridge, dt);
    for (const silk of this.silks.values()) this.updateSilk(silk, dt, time);
  }

  private updateHopper(h: HopperVisual, dt: number, time: number): void {
    if (h.mode === 'hop-on' || h.mode === 'hop-off') {
      h.t += dt;
      const k = Math.min(1, h.t / HOP_SECONDS);
      const target = h.mode === 'hop-on' ? this.train.localToWorld(ROOF.clone()) : h.to;
      const q = h.mode === 'hop-on' ? this.train.quaternion : h.toQ;
      h.object.position.lerpVectors(h.from, target, k);
      h.object.position.y += Math.sin(k * Math.PI) * HOP_ARC;
      h.object.quaternion.slerpQuaternions(h.fromQ, q, k);
      for (const leg of h.legs) leg.rotation.x = k < 0.3 ? -1.1 * (1 - k / 0.3) : 0;
      if (k >= 1) {
        if (h.mode === 'hop-on') {
          this.train.add(h.object);
          h.object.position.copy(ROOF);
          h.object.quaternion.identity();
          h.object.rotateX(ROOF_PITCH);
          h.mode = 'ride';
        } else {
          h.mode = 'off';
          h.wave = 2;
        }
      }
    }
    if (h.kick > 0) {
      h.kick = Math.max(0, h.kick - dt);
      const k = h.kick / 0.45;
      for (const leg of h.legs) leg.rotation.x = -1.2 * Math.sin(k * Math.PI);
    }
    h.wave = Math.max(0, h.wave - dt);
    const sway = h.wave > 0 ? 0.45 * Math.sin(time * 12) : 0.15 * Math.sin(time * 2.2);
    h.antennae.forEach((a, i) => {
      // [body left, body right, peek left, peek right]: left and right sway mirrored.
      a.rotation.z = (i % 2 === 0 ? 1 : -1) * sway;
    });
    if (h.head) h.head.rotation.x = 0.06 * Math.sin(time * 1.7);
  }

  private updateButterfly(b: ButterflyVisual, dt: number, time: number): void {
    const target = new Vector3();
    let facing: Quaternion;
    if (b.state === 'follow' || b.state === 'hover') {
      // Flying: in from the flower's side to the middle of the line, weaving a little.
      b.lateralNow += (0 - b.lateralNow) * Math.min(1, dt * 1.5);
      const f = this.frame(b.railId, b.s);
      const weave = Math.sin(time * 1.3 + b.phase) * 0.8;
      const bob = Math.sin(time * (b.state === 'hover' ? 2.2 : 3.1) + b.phase) * 0.35;
      target.copy(f.position).addScaledVector(f.right, b.lateralNow + weave).addScaledVector(f.up, b.height + bob);
      facing = frameQuaternion(f);
    } else if (b.state === 'wait') {
      b.lateralNow = b.lateral;
      target.copy(b.perch);
      facing = frameQuaternion(this.frame(b.railId, b.s));
    } else {
      target.copy(b.bud);
      facing = b.object.quaternion.clone();
    }
    // Ease to the target (its takeoff and landing are gentle), but keep up when following a fast train.
    const rate = b.state === 'follow' ? 14 : 5;
    b.object.position.lerp(target, Math.min(1, dt * rate));
    b.object.quaternion.slerp(facing, Math.min(1, dt * 4));
    const perched = b.state === 'wait' || b.state === 'land' || b.state === 'open';
    const freq = perched ? 2 : b.flustered ? 14 : 7;
    const amp = perched ? 0.35 : 0.9;
    const flap = (perched ? 0.45 : 0) + Math.sin(time * freq + b.phase) * amp;
    const [left, right] = b.wings;
    if (left) left.rotation.z = flap;
    if (right) right.rotation.z = -flap;
  }

  private updateBridge(bridge: BridgeVisual, dt: number): void {
    if (bridge.t < 0 || bridge.t > bridge.bloom + 1) return;
    bridge.t += dt;
    const T = bridge.bloom;
    // Petals open (first half), the petal band grows across the stream, then the track fades in on it.
    const open = smooth(bridge.t / (T * 0.55));
    for (const pivot of bridge.petals) pivot.rotation.x = -1.25 + 1.55 * open;
    const grow = smooth((bridge.t - T * 0.2) / (T * 0.6));
    if (grow > 0) {
      bridge.ribbon.visible = true;
      const tris = Math.floor((bridge.ribbonCount / 3) * grow);
      bridge.ribbon.geometry.setDrawRange(0, tris * 3);
    }
    const fade = smooth((bridge.t - T * 0.7) / (T * 0.3));
    if (fade > 0 && !bridge.track) {
      const geometry = buildTrack(this.stage.network.getRail(bridge.railId), bridge.from, bridge.to, bridge.look);
      if (geometry) {
        bridge.track = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0 }));
        bridge.track.name = `bridge-track:${bridge.index}`;
        this.group.add(bridge.track);
      }
    }
    if (bridge.track) {
      const m = bridge.track.material as MeshLambertMaterial;
      m.opacity = fade;
      if (fade >= 1 && m.transparent) {
        m.transparent = false;
        m.needsUpdate = true;
      }
    }
  }

  /**
   * The train rides the swaying silk: moves each car down by the silk's sag under it (view only; the game keeps
   * the rail's own height). Call right after the cars are put on their poses.
   */
  rideSilk(cars: Object3D[]): void {
    for (const silk of this.silks.values()) {
      if (silk.amp === 0) continue;
      for (const car of cars) {
        const rel = car.position.clone().sub(silk.start);
        const along = rel.dot(silk.along);
        if (along < 0 || along > silk.length) continue;
        // On this span (not on a line passing near it): close to the chord sideways.
        if (rel.addScaledVector(silk.along, -along).lengthSq() > 16) continue;
        car.position.addScaledVector(silk.down, silk.amp * Math.sin((Math.PI * along) / silk.length));
      }
    }
  }

  private updateSilk(silk: SilkVisual, dt: number, time: number): void {
    silk.t += dt;
    let amp: number;
    if (silk.state === 'boing') {
      amp = silk.t < 1.6 ? 1.3 * Math.exp(-2.2 * silk.t) * Math.sin(silk.t * 10) : 0;
      if (silk.t >= 1.6) silk.state = 'calm';
    } else if (silk.state === 'shake') {
      amp = 0.22 * Math.sin(time * 19);
    } else {
      amp = 0.05 * Math.sin(time * 1.4);
    }
    silk.amp = amp;
    const pos = silk.geometry.getAttribute('position') as BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < silk.u.length; i++) {
      const k = amp * Math.sin(Math.PI * silk.u[i]);
      arr[i * 3] = silk.base[i * 3] + silk.down.x * k;
      arr[i * 3 + 1] = silk.base[i * 3 + 1] + silk.down.y * k;
      arr[i * 3 + 2] = silk.base[i * 3 + 2] + silk.down.z * k;
    }
    pos.needsUpdate = true;
  }
}

function smooth(x: number): number {
  const u = Math.max(0, Math.min(1, x));
  return u * u * (3 - 2 * u);
}

/** Rotation that puts a model's +Z along the rail and +Y up (its +X is then the driver's left). */
function frameQuaternion(f: RailFrame): Quaternion {
  const basis = new Object3D();
  basis.up.copy(f.up);
  basis.lookAt(f.tangent.clone());
  return basis.quaternion.clone();
}

function painted(geometry: BufferGeometry, color: Color): BufferGeometry {
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

/**
 * The petal band over a stream: 7 m wide along the rail from `from` to `to`, scalloped at the edges, pink with a
 * lighter middle. Its triangles run from the near end, so a growing draw range lays it across the water.
 */
function buildPetalRibbon(rail: { frameAt(s: number): RailFrame }, from: number, to: number): { geometry: BufferGeometry; count: number } {
  const across = [-1, -0.45, 0, 0.45, 1];
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const a = from - 1.5;
  const b = to + 1.5;
  const steps = Math.max(4, Math.ceil(b - a));
  for (let i = 0; i <= steps; i++) {
    const s = a + ((b - a) * i) / steps;
    const f = rail.frameAt(s);
    // Scalloped edge: one petal every ~2.4 m.
    const edge = BRIDGE_HALF_WIDTH + 0.45 * Math.abs(Math.sin((s - a) * 1.3));
    for (const x of across) {
      const lift = (1 - x * x) * 0.12;
      const p = f.position.clone().addScaledVector(f.right, x * edge).addScaledVector(f.up, -BRIDGE_DEPTH + lift);
      positions.push(p.x, p.y, p.z);
      const c = Math.abs(x) < 0.5 ? PETAL_LIGHT : PETAL;
      colors.push(c.r, c.g, c.b);
    }
  }
  const cols = across.length;
  for (let i = 0; i < steps; i++) {
    for (let k = 0; k < cols - 1; k++) {
      const p = i * cols + k;
      const q = p + cols;
      indices.push(p, q, p + 1, p + 1, q, q + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, count: indices.length };
}
