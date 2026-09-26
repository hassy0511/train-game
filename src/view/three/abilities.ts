import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Quaternion,
  Shape,
  ShapeGeometry,
  Sphere,
  Vector3,
} from 'three';
import type { StageEvent } from '../../core/stage-events';
import { param, zoneAt } from '../../gimmick/zones';
import type { RailNetwork } from '../../rail/types';
import { resolvePlacement } from '../../stage/loader';
import type { GapDef, JunctionDef, StageData } from '../../stage/types';
import { buildAbilitySign } from './ability-picture';
import type { ModelLibrary } from './models';
import { addModelPlacements, sourceMeshes, type ModelPlacement, type SourceMesh } from './props';

/** Dark "pit" strips on the ground under rail gaps, so a missing piece of rail reads as a hole. */
export function buildGapPits(network: RailNetwork, groundY: number | null): Group {
  const group = new Group();
  group.name = 'gap-pits';
  if (groundY === null) return group;
  const HALF = 4.5;
  const dark = new Color('#3a2a1c');
  for (const rail of network.rails.values()) {
    for (const gap of rail.gaps as GapDef[]) {
      // Over water (a puddle, a stream under a flower bridge) there is no dark hole.
      if (gap.pit === false) continue;
      const positions: number[] = [];
      const colors: number[] = [];
      const indices: number[] = [];
      const from = gap.from - 1.5;
      const to = gap.to + 1.5;
      const steps = Math.max(2, Math.ceil((to - from) / 2));
      // Columns across the rail: soft edge, dark middle, soft edge (alpha fades to the ground).
      const across = [-HALF - 1.5, -HALF, 0, HALF, HALF + 1.5];
      const alpha = [0, 0.9, 1, 0.9, 0];
      for (let i = 0; i <= steps; i++) {
        const s = from + ((to - from) * i) / steps;
        const f = rail.frameAt(s);
        const endFade = Math.min(1, Math.min(s - from, to - s) / 1.5);
        across.forEach((x, k) => {
          const p = f.position.clone().addScaledVector(f.right, x);
          positions.push(p.x, groundY + 0.03, p.z);
          colors.push(dark.r, dark.g, dark.b, alpha[k] * endFade);
        });
      }
      const cols = across.length;
      for (let i = 0; i < steps; i++) {
        for (let k = 0; k < cols - 1; k++) {
          const a = i * cols + k;
          const b = a + cols;
          indices.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 4));
      geometry.setIndex(indices);
      const pit = new Mesh(
        geometry,
        new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide }),
      );
      pit.name = `pit:${rail.id}:${gap.from}`;
      pit.renderOrder = -1;
      group.add(pit);
    }
  }
  return group;
}

/** A flat arrow pointing +X in its local frame (width 1.2 m). */
function arrowGeometry(): ShapeGeometry {
  const shape = new Shape();
  shape.moveTo(-0.6, -0.14);
  shape.lineTo(0.1, -0.14);
  shape.lineTo(0.1, -0.36);
  shape.lineTo(0.6, 0);
  shape.lineTo(0.1, 0.36);
  shape.lineTo(0.1, 0.14);
  shape.lineTo(-0.6, 0.14);
  shape.closePath();
  return new ShapeGeometry(shape);
}

/** Arrow rotation (about the board normal) that points to `side` as seen by the driver. */
function arrowTurn(side: 'left' | 'right'): number {
  return side === 'right' ? 0 : Math.PI;
}

interface SignVisual {
  junction: JunctionDef;
  arrow: Mesh<ShapeGeometry, MeshBasicMaterial>;
  /** Target arrow angle (rad about the board normal): 0 = right, π = left. */
  turn: number;
  angle: number;
  glow: number;
}

const SIGN_BEFORE = 22;
const SIGN_LATERAL = 3.4;
const ARROW_HEIGHT = 2.55;

/**
 * Junction signs: a board by the rail before each junction with an arrow. A reversed sign points the
 * wrong way; when the light reveals it the arrow swings round and glows.
 */
export class JunctionSigns {
  readonly group = new Group();
  private readonly signs = new Map<string, SignVisual>();

  constructor(
    private readonly stage: StageData,
    private readonly models: ModelLibrary,
  ) {
    this.group.name = 'junction-signs';
  }

  async init(): Promise<void> {
    const groundY = this.stage.file.environment.ground?.y ?? null;
    const board = await this.models.load('direction-sign');
    const geometry = arrowGeometry();
    for (const junction of this.stage.file.junctions) {
      const at = Math.max(0, junction.at - SIGN_BEFORE);
      // On a raised line (2-2's silk 12 m up) the sign stands at the rail's height, not down on the ground.
      const railY = this.stage.network.getRail(junction.railId).frameAt(at).position.y;
      const standY = groundY !== null && railY - groundY >= 2 ? null : groundY;
      const t = resolvePlacement({ onRail: { railId: junction.railId, at, lateral: SIGN_LATERAL }, rotationY: 180 }, this.stage.network, standY);
      const sign = new Group();
      sign.name = `sign:${junction.id}`;
      sign.position.copy(t.position);
      sign.quaternion.copy(t.quaternion);
      sign.add(board.clone(true));
      // Facing the oncoming train (the sign's +Z points back along the rail); the arrow sits on the board front.
      const arrow = new Mesh(geometry, new MeshBasicMaterial({ color: '#ffffff', side: DoubleSide }));
      arrow.position.set(0, ARROW_HEIGHT, 0.12);
      // Turned to face the train, the sign's local +X is the driver's right. It shows the default way.
      const turn = arrowTurn(junction.default);
      arrow.rotation.z = turn;
      sign.add(arrow);
      // v1.8: the side way needs an ability: a small round sign with its picture above the board, on that side.
      if (junction.needs) {
        const plate = buildAbilitySign(junction.needs, 0.42);
        if (plate) {
          const side = junction.default === 'left' ? 1 : -1;
          plate.position.set(side * 0.4, 3.5, 0.02);
          // Seen from both sides of the pole: a copy facing back.
          const back = plate.clone(true);
          back.rotation.y = Math.PI;
          back.position.z = -0.02;
          sign.add(plate, back);
        }
      }
      this.group.add(sign);
      this.signs.set(junction.id, { junction, arrow, turn, angle: turn, glow: 0 });
    }
  }

  /** The light found the truth: swing the arrow to the other side and make it glow. */
  reveal(junctionId: string): void {
    const sign = this.signs.get(junctionId);
    if (!sign) return;
    sign.turn = arrowTurn(sign.junction.default === 'left' ? 'right' : 'left');
    sign.glow = 1;
  }

  /** Back to the (reversed) display after a rewind, or for one junction once the train has passed it. */
  reset(junctionId?: string): void {
    for (const sign of this.signs.values()) {
      if (junctionId !== undefined && sign.junction.id !== junctionId) continue;
      sign.turn = arrowTurn(sign.junction.default);
      sign.glow = 0;
    }
  }

  update(dt: number, time: number): void {
    for (const sign of this.signs.values()) {
      const diff = sign.turn - sign.angle;
      sign.angle += Math.sign(diff) * Math.min(Math.abs(diff), dt * 5);
      sign.arrow.rotation.z = sign.angle;
      const pulse = sign.glow > 0 ? 0.5 + 0.5 * Math.sin(time * 6) : 0;
      sign.arrow.material.color.set(sign.glow > 0 ? '#ffe066' : '#ffffff').lerp(new Color('#fff7c2'), pulse * 0.6);
      sign.arrow.scale.setScalar(1 + pulse * 0.12);
    }
  }
}

/** The headlight: a faint additive cone plus a pool of light on the track ahead, shown while the light is on. */
export function buildLightBeam(): Object3D {
  const group = new Group();
  group.name = 'light-beam';
  const length = 34;
  const cone = new ConeGeometry(6, length, 24, 1, true);
  // Apex at the lamp, opening forward (+Z) and slightly down onto the rail.
  cone.translate(0, -length / 2, 0);
  cone.rotateX(-Math.PI / 2 + 0.08);
  const beam = new Mesh(
    cone,
    new MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.05, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
  );
  beam.position.set(0, 3.3, 6.3);
  const pool = new Mesh(
    new CircleGeometry(1, 32),
    new MeshBasicMaterial({ color: '#fff0a0', transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.scale.set(4.5, 14, 1);
  pool.position.set(0, 0.25, 26);
  group.add(beam, pool);
  group.visible = false;
  return group;
}

/** The jump device on the lead car's roof (shown once the jump is learned). */
export async function buildJumpDevice(models: ModelLibrary): Promise<Object3D> {
  const device = (await models.load('jump-unit')).clone(true);
  device.name = 'jump-unit';
  device.position.set(0, 3.75, -3.0);
  return device;
}

/**
 * The neck model's rest pose is up (head about 12 m above the rail). Swinging it this far about +X brings
 * the head down to about 4.3 m over the rail, some 10 m in front of the body: the train cannot pass.
 */
export const NECK_UP = new Quaternion();
export const NECK_DOWN = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 1.33);

interface FlockParams {
  model: string;
  count: number;
  center: [number, number, number];
  radius: number;
  /** rad/s around the circle; negative flies the other way. */
  speed: number;
}

/** Birds fly in lanes -LANES … LANES around the circle, each lane wider and higher than the next. */
const LANES = 4;
const LANE_WIDTH = 3;
const LANE_RISE = 1.5;
/** How far a bird bobs up and down (m), and the largest bird scale. */
const BOB = 1.2;
const MAX_SCALE = 1.25;

/** A fixed sphere around everywhere a flock can be: the whole circle, every lane, the bobbing, the widest bird. */
function flockBounds(flock: FlockParams, parts: SourceMesh[]): Sphere {
  let bird = 0;
  for (const part of parts) {
    const geometry = part.mesh.geometry as BufferGeometry;
    geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere?.clone().applyMatrix4(part.matrix);
    if (sphere) bird = Math.max(bird, sphere.center.length() + sphere.radius);
  }
  const across = flock.radius + LANES * LANE_WIDTH;
  const up = LANES * LANE_RISE + BOB;
  return new Sphere(new Vector3(...flock.center), Math.hypot(across, up) + bird * MAX_SCALE);
}

/** Flyers circling over the stage (`gimmicks[].type === 'flock'`). Visual only. */
export class Flocks {
  readonly group = new Group();
  /** Each bird is a pose; a flock draws as one instanced batch per model part. */
  private readonly birds: { object: Object3D; flock: FlockParams; phase: number; lane: number; batch: number; slot: number }[] = [];
  private readonly batches: { meshes: { mesh: InstancedMesh; matrix: Matrix4 }[] }[] = [];
  private readonly scratch = new Matrix4();
  private time = 0;

  constructor(private readonly stage: StageData) {
    this.group.name = 'flocks';
  }

  async init(models: ModelLibrary): Promise<void> {
    for (const gimmick of this.stage.file.gimmicks) {
      if (gimmick.type !== 'flock') continue;
      const flock = gimmick.params as unknown as FlockParams;
      const template = await models.load(flock.model);
      const batch = this.batches.length;
      const sources = sourceMeshes(template);
      const bounds = flockBounds(flock, sources);
      const meshes = sources.map((source) => {
        const mesh = new InstancedMesh(source.mesh.geometry, source.mesh.material as Material, flock.count);
        mesh.name = `flock:${flock.model}`;
        // Bounds fixed around the whole circle (never recomputed per frame), so a flock behind the camera is skipped.
        mesh.boundingSphere = bounds;
        mesh.frustumCulled = true;
        this.group.add(mesh);
        return { mesh, matrix: source.matrix };
      });
      this.batches.push({ meshes });
      for (let i = 0; i < flock.count; i++) {
        const object = new Object3D();
        object.scale.setScalar(0.8 + (((i * 37) % 10) / 9) * (MAX_SCALE - 0.8));
        const lane = ((i * 53) % (2 * LANES + 1)) - LANES;
        this.birds.push({ object, flock, phase: (i / flock.count) * Math.PI * 2 * 0.35 + i * 0.13, lane, batch, slot: i });
      }
    }
  }

  update(dt: number): void {
    this.time += dt;
    for (const bird of this.birds) {
      const { center, radius, speed } = bird.flock;
      const a = this.time * speed + bird.phase;
      const r = radius + bird.lane * LANE_WIDTH;
      bird.object.position.set(
        center[0] + Math.cos(a) * r,
        center[1] + bird.lane * LANE_RISE + Math.sin(this.time * 0.9 + bird.phase * 3) * BOB,
        center[2] + Math.sin(a) * r,
      );
      // Face along the circle, banking into the turn.
      const dir = Math.sign(speed) || 1;
      bird.object.rotation.set(0, Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir), -0.25 * dir, 'YXZ');
      bird.object.updateMatrix();
      for (const part of this.batches[bird.batch].meshes) {
        part.mesh.setMatrixAt(bird.slot, this.scratch.multiplyMatrices(bird.object.matrix, part.matrix));
      }
    }
    for (const batch of this.batches) for (const part of batch.meshes) part.mesh.instanceMatrix.needsUpdate = true;
  }
}

interface PadVisual {
  pad: Object3D;
  sparkle: Points<BufferGeometry, PointsMaterial>;
  left: number;
}

/**
 * Sky-stage gimmicks drawn from stage data: jump pads (a faint sparkle while hidden, the pad for a few
 * seconds after a whistle, blinking before it goes), hoops along updraft stretches, and fog stretches.
 */
export class SkyGimmicks {
  readonly group = new Group();
  private readonly pads = new Map<number, PadVisual>();
  private time = 0;
  private lightOn = false;
  private fogNear = 0;
  private fogFar = 0;

  constructor(private readonly stage: StageData) {
    this.group.name = 'sky-gimmicks';
  }

  async init(models: ModelLibrary): Promise<void> {
    const gimmicks = this.stage.file.gimmicks;
    const rings: ModelPlacement[] = [];
    for (const [index, g] of gimmicks.entries()) {
      if (g.railId === undefined || g.from === undefined) continue;
      if (g.type === 'jump-pad') {
        const t = resolvePlacement({ onRail: { railId: g.railId, at: g.from, heightFromRail: 0 } }, this.stage.network, null);
        const pad = (await models.load('jump-pad')).clone(true);
        pad.position.copy(t.position);
        pad.quaternion.copy(t.quaternion);
        pad.visible = false;
        const sparkle = makeSparkle();
        sparkle.position.copy(t.position);
        sparkle.quaternion.copy(t.quaternion);
        this.group.add(pad, sparkle);
        this.pads.set(index, { pad, sparkle, left: 0 });
      }
      if (g.type === 'updraft' && g.to !== undefined) {
        for (let s = g.from + 6; s <= g.to; s += 14) {
          const t = resolvePlacement({ onRail: { railId: g.railId, at: s, heightFromRail: 0 } }, this.stage.network, null);
          rings.push({ model: 'updraft-ring', position: t.position, quaternion: t.quaternion, scale: 1 });
        }
      }
    }
    if (rings.length) {
      const holder = new Group();
      holder.name = 'updraft-rings';
      this.group.add(holder);
      await addModelPlacements(holder, rings, models);
    }
  }

  onStageEvent(event: StageEvent): void {
    if (event.type === 'light') this.lightOn = event.on;
    if (event.type !== 'pad') return;
    const pad = this.pads.get(event.index);
    if (!pad) return;
    pad.left = event.visible ? (event.seconds ?? 8) : 0;
  }

  /** How white the sky is right now (0 = clear, 1 = inside a thick fog stretch). */
  mist = 0;

  /** Per frame: pad state, and the fog for where the train is (fog stretches thicken it; the light thins it). */
  update(dt: number, railId: string, frontS: number, fog: Fog | null, baseFog: { near: number; far: number } | null): void {
    this.time += dt;
    for (const p of this.pads.values()) {
      if (p.left > 0) p.left = Math.max(0, p.left - dt);
      const shown = p.left > 0;
      // Blink during the last two seconds.
      p.pad.visible = shown && (p.left > 2 || Math.sin(this.time * 18) > -0.2);
      p.sparkle.visible = !shown;
      if (!shown) p.sparkle.material.opacity = 0.45 + 0.35 * Math.sin(this.time * 5);
    }
    if (!fog || !baseFog) return;
    let near = baseFog.near;
    let far = baseFog.far;
    const zone = zoneAt(this.stage.file.gimmicks, 'fog', railId, frontS);
    if (zone) {
      near = param(zone, 'near', 2);
      far = this.lightOn ? param(zone, 'lightFar', 70) : param(zone, 'far', 22);
    }
    const k = 1 - Math.exp(-dt * 2.5);
    this.mist += ((zone ? (this.lightOn ? 0.75 : 1) : 0) - this.mist) * k;
    this.fogNear = this.fogNear === 0 ? near : this.fogNear + (near - this.fogNear) * k;
    this.fogFar = this.fogFar === 0 ? far : this.fogFar + (far - this.fogFar) * k;
    fog.near = this.fogNear;
    fog.far = this.fogFar;
  }
}

function makeSparkle(): Points<BufferGeometry, PointsMaterial> {
  const positions: number[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    positions.push(Math.cos(a) * (1.2 + (i % 3) * 0.5), 0.3 + (i % 4) * 0.35, Math.sin(a) * 2.2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return new Points(geometry, new PointsMaterial({ color: '#FFE38A', size: 0.45, transparent: true, depthWrite: false }));
}
