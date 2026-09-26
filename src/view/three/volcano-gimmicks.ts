import {
  Box3,
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  Sphere,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import type { StageEvent } from '../../core/stage-events';
import type { StageData } from '../../stage/types';
import { ROCK_ROLL, ROCK_SPLASH_SECONDS, SLOPE } from '../../train/params';
import type { ModelLibrary } from './models';

/** Rock sizes (m): the rolling one is big and round, the dropping one small (PHASE6 §1 #8). */
const ROLL_SIZE = 2.4;
const DROP_SIZE = 1.2;
/** A dropped rock falls from this high above the rail (m) and takes this long (s). */
const DROP_HEIGHT = 14;
const DROP_SECONDS = 0.55;
/** After crossing, a rolling rock goes on this far to the side (m) and down into the sea. */
const SPLASH_SIDE = 12;
/** Where the rocket's tubes sit on the lead car (car origin: bottom centre, +Z forward). */
const ROCKET_UNIT = new Vector3(0, 3.75, -5.0);
const EXHAUST = new Vector3(0, 4.1, -6.3);
const MAX_PUFFS = 96;
/** The everyday smoke ring ("ぽふっ"): how many can be up at once, how long one lasts (s) and how high it rises (m). */
const SMALL_RINGS = 3;
const SMALL_RING_SECONDS = 3.5;
const SMALL_RING_RISE = 30;
/** A bubble column (gimmick "bubbles"): seconds for one bubble to rise its height. */
const BUBBLE_RISE_SECONDS = 2.4;

const FLAME_COLORS = [new Color('#FFE066'), new Color('#FF922B'), new Color('#FFFFFF')];
const STEAM = new Color('#FFFFFF');
const DUST = new Color('#CDBFA8');

/**
 * Soft steam: smooth-shaded and lit mostly by its own colour (so the shadow side stays a light grey, never a dark
 * facet), thinning out towards its outline and close to the camera (steam round the cab is a soft haze, not big
 * flat cut faces). With `instanced`, each instance gets its own opacity from the "instanceAlpha" attribute, to fade
 * out.
 */
function softMaterial(instanced: boolean, opacity: number): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    if (instanced) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float instanceAlpha;\nvarying float vAlpha;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = instanceAlpha;');
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${instanced ? '\nvarying float vAlpha;' : ''}`)
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.55;\n' +
          // Thinner towards the outline (no hard polygon edge) and near the camera.
          'float facing = abs(dot(normalize(vNormal), normalize(vViewPosition)));\n' +
          `diffuseColor.a *= smoothstep(0.05, 0.6, facing) * smoothstep(1.5, 9.0, length(vViewPosition))${instanced ? ' * vAlpha' : ''};`,
      );
  };
  return material;
}

interface Puff {
  alive: boolean;
  position: Vector3;
  velocity: Vector3;
  age: number;
  life: number;
  from: number;
  to: number;
}

/** Gimmick "bubbles" params (PHASE6 2-3 §9: over the seabed record, the lead-in to chapter 3). */
interface BubbleColumn {
  position: [number, number, number];
  count: number;
  height: number;
  radius: number;
}

interface RockVisual {
  kind: 'roll' | 'drop';
  object: Object3D;
  railId: string;
  at: number;
  lateral: number;
  mode: 'wait' | 'wobble' | 'roll' | 'splash' | 'float' | 'hidden' | 'fall' | 'rest';
  t: number;
  seconds: number;
  from: Vector3;
  to: Vector3;
  shadow: Mesh | null;
}

/**
 * The moving bits of 2-3 that playing needs to see: the rocket's flame puffs, sand from slipping wheels, steam
 * when a try ends, the volcano's smoke rings (the everyday "ぽふっ" and the sneeze), bubble columns in the sea, and
 * the rolling / dropping rocks. Scenery and models come from the
 * stage's props (ticket 0009); rocks use the "pumice" model and the rocket the "rocket-unit" model.
 */
export class VolcanoGimmicks {
  readonly group = new Group();
  private readonly puffs: Puff[] = Array.from({ length: MAX_PUFFS }, () => ({
    alive: false,
    position: new Vector3(),
    velocity: new Vector3(),
    age: 0,
    life: 1,
    from: 1,
    to: 1,
  }));
  private readonly puffMesh: InstancedMesh;
  private readonly puffAlpha = new InstancedBufferAttribute(new Float32Array(MAX_PUFFS), 1);
  private readonly rocks = new Map<string, RockVisual>();
  private burning = false;
  private slipLeft = 0;
  private emitClock = 0;
  private ring: { mesh: Mesh; t: number; origin: Vector3 } | null = null;
  /** Where the smoke rings come out (over the crater), or null without a volcano. */
  private readonly crater: Vector3 | null;
  private readonly smallRings: { mesh: Mesh; t: number }[] = [];
  private smallRingGeometry: TorusGeometry | null = null;
  private readonly bubbles: { mesh: InstancedMesh; alpha: InstancedBufferAttribute; column: BubbleColumn; t: number }[] = [];
  private unit: Object3D | null = null;
  private readonly matrix = new Matrix4();
  private readonly tmpQ = new Quaternion();
  private readonly tmpS = new Vector3();
  private readonly tmpV = new Vector3();
  private readonly shadowGeometry = new CircleGeometry(1, 20);
  private readonly shadowMaterial = new MeshBasicMaterial({ color: '#1b1b1b', transparent: true, opacity: 0.35, depthWrite: false });

  constructor(
    private readonly stage: StageData,
    private readonly train: Object3D,
  ) {
    this.group.name = 'volcano-gimmicks';
    // Round, soft puffs that fade out (not faceted shards).
    const geometry = new SphereGeometry(1, 16, 10);
    this.puffAlpha.setUsage(DynamicDrawUsage);
    geometry.setAttribute('instanceAlpha', this.puffAlpha);
    this.puffMesh = new InstancedMesh(geometry, softMaterial(true, 0.8), MAX_PUFFS);
    this.puffMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.puffMesh.frustumCulled = false;
    this.puffMesh.count = 0;
    for (let i = 0; i < MAX_PUFFS; i++) this.puffMesh.setColorAt(i, STEAM);
    this.group.add(this.puffMesh);
    const volcano = stage.props.find((p) => p.model === 'volcano');
    this.crater = volcano ? volcano.position.clone().add(new Vector3(0, 100 * volcano.scale + 6, 0)) : null;
    for (const g of stage.file.gimmicks) if (g.type === 'bubbles') this.addBubbles(g.params ?? {});
  }

  async init(models: ModelLibrary): Promise<void> {
    const actors = this.stage.actors.filter((a) => (a.type === 'rock-roll' || a.type === 'rock-drop') && a.onRail);
    if (actors.length === 0) return;
    const pumice = await models.load('pumice');
    const size = new Box3().setFromObject(pumice).getSize(new Vector3());
    const unit = Math.max(size.x, size.y, size.z, 0.01);
    for (const actor of actors) {
      const kind = actor.type === 'rock-roll' ? 'roll' : 'drop';
      const object = new Group();
      const body = pumice.clone(true);
      const scale = (kind === 'roll' ? ROLL_SIZE : DROP_SIZE) / unit;
      body.scale.setScalar(scale);
      // Centre the rock on its own origin so it can roll about it.
      body.position.set(0, (-size.y * scale) / 2, 0);
      object.add(body);
      this.group.add(object);
      const lateral = Number((actor.params as { lateral?: number }).lateral ?? ROCK_ROLL.lateral);
      const rock: RockVisual = {
        kind,
        object,
        railId: actor.onRail!.railId,
        at: actor.onRail!.at,
        lateral,
        mode: 'wait',
        t: 0,
        seconds: 1,
        from: new Vector3(),
        to: new Vector3(),
        shadow: null,
      };
      if (kind === 'drop') {
        const shadow = new Mesh(this.shadowGeometry, this.shadowMaterial);
        shadow.visible = false;
        this.group.add(shadow);
        rock.shadow = shadow;
      }
      this.rocks.set(actor.id, rock);
      this.resetRock(rock);
    }
  }

  /** The rocket's tubes on the roof, once the rocket is known. */
  async addRocketUnit(models: ModelLibrary): Promise<void> {
    if (this.unit) return;
    this.unit = new Object3D();
    const unit = (await models.load('rocket-unit')).clone(true);
    unit.name = 'rocket-unit';
    unit.position.copy(ROCKET_UNIT);
    this.unit = unit;
    this.train.add(unit);
  }

  onEvent(e: StageEvent): void {
    switch (e.type) {
      case 'rocket':
        this.burning = e.state === 'burn';
        if (e.state === 'puff') this.burst(this.trainPoint(EXHAUST), 6, STEAM, 0.7, 0.8, 2.2, 3);
        break;
      case 'slip':
        this.slipLeft = SLOPE.slipSeconds;
        break;
      case 'fail':
        if (e.reason === 'rock' || e.reason === 'slip' || e.reason === 'timeUp') {
          // A soft white steam puff around the lead car, in front of the cab too (never anything scary).
          this.burst(this.trainPoint(new Vector3(0, 2, 9)), 12, STEAM, 1.4, 1.2, 3.5, 3);
          this.burst(this.trainPoint(new Vector3(0, 2, -3)), 12, STEAM, 1.4, 1.5, 4.5, 4);
        }
        break;
      case 'sneeze':
        this.sneeze();
        break;
      case 'volcano:puff':
        this.puff();
        break;
      case 'rewind':
        this.burning = false;
        this.slipLeft = 0;
        for (const p of this.puffs) p.alive = false;
        break;
      case 'rock':
        this.onRock(e);
        break;
      default:
        break;
    }
  }

  update(dt: number): void {
    // Flame puffs behind the tubes while burning; sand from the wheels while slipping.
    this.emitClock += dt;
    if (this.emitClock >= 0.045) {
      this.emitClock = 0;
      if (this.burning) {
        const color = FLAME_COLORS[Math.floor(Math.random() * FLAME_COLORS.length)];
        const back = this.trainDirection(new Vector3(0, 0.1, -1)).multiplyScalar(6);
        for (const x of [-0.45, 0.45]) this.spawn(this.trainPoint(EXHAUST.clone().setX(x)), back, color, 0.55, 0.5, 1.5);
      }
      if (this.slipLeft > 0) {
        for (const x of [-1.3, 1.3]) {
          const v = this.trainDirection(new Vector3(x, 1.2, 1.5));
          this.spawn(this.trainPoint(new Vector3(x, 0.3, 3.5)), v, DUST, 0.8, 0.4, 1.4);
        }
      }
    }
    this.slipLeft = Math.max(0, this.slipLeft - dt);
    this.updatePuffs(dt);
    this.updateRing(dt);
    this.updateSmallRings(dt);
    this.updateBubbles(dt);
    for (const rock of this.rocks.values()) this.updateRock(rock, dt);
  }

  // ---- puffs ----

  private trainPoint(local: Vector3): Vector3 {
    return local.clone().applyQuaternion(this.train.quaternion).add(this.train.position);
  }

  private trainDirection(local: Vector3): Vector3 {
    return local.clone().applyQuaternion(this.train.quaternion);
  }

  private spawn(at: Vector3, velocity: Vector3, color: Color, life: number, from: number, to: number): void {
    const p = this.puffs.find((q) => !q.alive);
    if (!p) return;
    const i = this.puffs.indexOf(p);
    p.alive = true;
    p.position.copy(at);
    p.velocity.copy(velocity).add(this.tmpV.set(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5));
    p.age = 0;
    p.life = life;
    p.from = from;
    p.to = to;
    this.puffMesh.setColorAt(i, color);
    if (this.puffMesh.instanceColor) this.puffMesh.instanceColor.needsUpdate = true;
  }

  private burst(at: Vector3, count: number, color: Color, life: number, from: number, to: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const v = new Vector3(Math.cos(a) * speed, 0.8 + Math.random(), Math.sin(a) * speed);
      this.spawn(at.clone().add(new Vector3(Math.cos(a) * 1.5, Math.random(), Math.sin(a) * 1.5)), v, color, life, from, to);
    }
  }

  private updatePuffs(dt: number): void {
    // Nothing to draw or move: skip the per-frame upload.
    if (this.puffMesh.count === 0 && !this.puffs.some((p) => p.alive)) return;
    let last = -1;
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      if (p.alive) {
        p.age += dt;
        if (p.age >= p.life) p.alive = false;
        else p.position.addScaledVector(p.velocity, dt);
      }
      const k = p.alive ? p.age / p.life : 1;
      // Grow while fading in quickly and then slowly out, shrinking a little at the very end.
      const size = p.alive ? (p.from + (p.to - p.from) * Math.sqrt(k)) * Math.min(1, 0.6 + (1 - k) * 2) : 0;
      this.tmpS.setScalar(Math.max(size, 1e-4));
      this.matrix.compose(p.position, this.tmpQ, this.tmpS);
      this.puffMesh.setMatrixAt(i, this.matrix);
      this.puffAlpha.setX(i, p.alive ? Math.min(1, k * 8) * (1 - k) * (1 - k * 0.3) : 0);
      if (p.alive) last = i;
    }
    this.puffMesh.count = last + 1;
    this.puffMesh.instanceMatrix.needsUpdate = true;
    this.puffAlpha.needsUpdate = true;
  }

  // ---- the sneeze ----

  /** The big smoke ring out of the volcano's crater (a stage without a "volcano" prop shows none). */
  private sneeze(): void {
    const volcano = this.stage.props.find((p) => p.model === 'volcano');
    if (!volcano) return;
    const origin = volcano.position.clone().add(new Vector3(0, 100 * volcano.scale + 6, 0));
    this.ring?.mesh.removeFromParent();
    const mesh = new Mesh(new TorusGeometry(10, 4, 16, 40), softMaterial(false, 0.9));
    mesh.rotation.x = Math.PI / 2;
    mesh.position.copy(origin);
    this.group.add(mesh);
    this.ring = { mesh, t: 0, origin };
  }

  /** The everyday small smoke ring ("ぽふっ"): its own few slots, so it never cuts a sneeze ring short. */
  private puff(): void {
    if (!this.crater) return;
    let ring = this.smallRings.find((r) => !r.mesh.visible);
    if (!ring) {
      if (this.smallRings.length >= SMALL_RINGS) return;
      this.smallRingGeometry ??= new TorusGeometry(5, 2, 12, 32);
      const mesh = new Mesh(this.smallRingGeometry, softMaterial(false, 0.85));
      mesh.name = 'volcano-puff';
      mesh.rotation.x = Math.PI / 2;
      this.group.add(mesh);
      ring = { mesh, t: 0 };
      this.smallRings.push(ring);
    }
    ring.t = 0;
    ring.mesh.visible = true;
    ring.mesh.position.copy(this.crater);
  }

  private updateSmallRings(dt: number): void {
    if (!this.crater) return;
    for (const ring of this.smallRings) {
      if (!ring.mesh.visible) continue;
      ring.t += dt;
      const k = ring.t / SMALL_RING_SECONDS;
      ring.mesh.position.copy(this.crater).y += SMALL_RING_RISE * Math.sqrt(k);
      ring.mesh.scale.setScalar(1 + 1.5 * k);
      (ring.mesh.material as MeshLambertMaterial).opacity = 0.85 * Math.min(1, k * 6) * Math.max(0, 1 - k);
      if (k >= 1) ring.mesh.visible = false;
    }
  }

  // ---- bubble columns ----

  /** A column of bubbles rising out of the sea (visual only): small soft spheres, one instanced batch per column. */
  private addBubbles(params: Record<string, unknown>): void {
    const p = params as Partial<BubbleColumn>;
    if (!Array.isArray(p.position) || p.position.length !== 3) return;
    const column: BubbleColumn = { position: p.position, count: p.count ?? 14, height: p.height ?? 8, radius: p.radius ?? 2.5 };
    const geometry = new SphereGeometry(1, 12, 8);
    const alpha = new InstancedBufferAttribute(new Float32Array(column.count), 1);
    alpha.setUsage(DynamicDrawUsage);
    geometry.setAttribute('instanceAlpha', alpha);
    const mesh = new InstancedMesh(geometry, softMaterial(true, 0.9), column.count);
    mesh.name = 'bubbles';
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    // Fixed bounds round the whole column, so it is skipped when out of view (never recomputed per frame).
    const [x, y, z] = column.position;
    mesh.boundingSphere = new Sphere(new Vector3(x, y + column.height / 2, z), column.height / 2 + column.radius + 2);
    mesh.frustumCulled = true;
    this.group.add(mesh);
    this.bubbles.push({ mesh, alpha, column, t: 0 });
  }

  private updateBubbles(dt: number): void {
    for (const b of this.bubbles) {
      b.t += dt;
      const { position, count, height, radius } = b.column;
      for (let i = 0; i < count; i++) {
        // Each bubble has its own lane round the column and its own start; it wobbles as it rises and fades out.
        const k = (b.t / BUBBLE_RISE_SECONDS + i / count) % 1;
        const a = i * 2.39996;
        const r = radius * (0.25 + 0.75 * (((i * 37) % 11) / 10));
        const wobble = Math.sin(b.t * 3 + i) * 0.4;
        this.tmpV.set(position[0] + Math.cos(a) * r + wobble, position[1] + k * height, position[2] + Math.sin(a) * r);
        this.tmpS.setScalar((0.5 + 0.5 * (((i * 53) % 7) / 6)) * (0.6 + 0.6 * k));
        this.matrix.compose(this.tmpV, this.tmpQ, this.tmpS);
        b.mesh.setMatrixAt(i, this.matrix);
        b.alpha.setX(i, Math.min(1, k * 5) * (1 - k));
      }
      b.mesh.instanceMatrix.needsUpdate = true;
      b.alpha.needsUpdate = true;
    }
  }

  private updateRing(dt: number): void {
    const ring = this.ring;
    if (!ring) return;
    ring.t += dt;
    const k = ring.t / 2.5;
    ring.mesh.position.copy(ring.origin).y += 40 * k;
    ring.mesh.scale.setScalar(1 + 2.5 * k);
    (ring.mesh.material as MeshLambertMaterial).opacity = 0.9 * Math.max(0, 1 - k);
    if (k >= 1) {
      ring.mesh.removeFromParent();
      ring.mesh.geometry.dispose();
      (ring.mesh.material as MeshLambertMaterial).dispose();
      this.ring = null;
    }
  }

  // ---- rocks ----

  private frame(railId: string, s: number): { position: Vector3; up: Vector3; right: Vector3; tangent: Vector3 } {
    const rail = this.stage.network.getRail(railId);
    return rail.frameAt(Math.max(0, Math.min(rail.length, s)));
  }

  /** A point `lateral` m right of the rail at the rock, `lift` m above it. */
  private beside(rock: RockVisual, lateral: number, lift: number): Vector3 {
    const f = this.frame(rock.railId, rock.at);
    return f.position.clone().addScaledVector(f.right, lateral).addScaledVector(f.up, lift);
  }

  private resetRock(rock: RockVisual): void {
    rock.t = 0;
    rock.object.rotation.set(0, 0, 0);
    if (rock.kind === 'roll') {
      rock.mode = 'wait';
      rock.object.visible = true;
      rock.object.position.copy(this.beside(rock, -rock.lateral, ROLL_SIZE / 2 + 1));
    } else {
      rock.mode = 'hidden';
      rock.object.visible = false;
      if (rock.shadow) rock.shadow.visible = false;
    }
  }

  private moveRock(rock: RockVisual, mode: RockVisual['mode'], to: Vector3, seconds: number): void {
    rock.mode = mode;
    rock.t = 0;
    rock.seconds = seconds;
    rock.from.copy(rock.object.position);
    rock.to.copy(to);
  }

  private onRock(e: Extract<StageEvent, { type: 'rock' }>): void {
    const rock = this.rocks.get(e.id);
    if (!rock) return;
    switch (e.state) {
      case 'wait':
      case 'hide':
        this.resetRock(rock);
        break;
      case 'wobble':
        rock.mode = 'wobble';
        rock.t = 0;
        break;
      case 'roll':
        this.moveRock(rock, 'roll', this.beside(rock, rock.lateral, ROLL_SIZE / 2), e.seconds ?? ROCK_ROLL.crossSeconds);
        break;
      case 'shadow':
        if (rock.shadow) {
          const f = this.frame(rock.railId, rock.at);
          rock.shadow.position.copy(f.position).addScaledVector(f.up, 0.05);
          rock.shadow.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), f.up);
          rock.shadow.scale.setScalar(0.3);
          rock.shadow.visible = true;
        }
        break;
      case 'drop': {
        rock.object.visible = true;
        rock.object.position.copy(this.beside(rock, 0, DROP_HEIGHT));
        this.moveRock(rock, 'fall', this.beside(rock, 0, DROP_SIZE / 2), DROP_SECONDS);
        break;
      }
      case 'bonk': {
        // "ぽこん": the rock hops off the rail and away (into the sea below), nothing scary.
        rock.object.visible = true;
        if (rock.shadow) rock.shadow.visible = false;
        this.moveRock(rock, 'splash', this.beside(rock, rock.kind === 'roll' ? rock.lateral + SPLASH_SIDE : 8, -6), ROCK_SPLASH_SECONDS);
        break;
      }
    }
  }

  private updateRock(rock: RockVisual, dt: number): void {
    rock.t += dt;
    const k = Math.min(1, rock.t / rock.seconds);
    switch (rock.mode) {
      case 'wobble':
        rock.object.rotation.z = Math.sin(rock.t * 18) * 0.12;
        break;
      case 'roll':
        rock.object.position.lerpVectors(rock.from, rock.to, k);
        rock.object.rotation.z -= (dt * (2 * rock.lateral)) / rock.seconds / (ROLL_SIZE / 2);
        if (k >= 1) this.moveRock(rock, 'splash', this.beside(rock, rock.lateral + SPLASH_SIDE, -6), ROCK_SPLASH_SECONDS);
        break;
      case 'splash': {
        rock.object.position.lerpVectors(rock.from, rock.to, k);
        rock.object.position.y += Math.sin(k * Math.PI) * 2.5;
        rock.object.rotation.z -= dt * 3;
        if (k >= 1) {
          const ground = this.stage.file.environment.ground?.y;
          if (ground !== undefined && ground !== null) {
            rock.object.position.y = ground + 0.3;
            rock.to.copy(rock.object.position);
            rock.mode = 'float';
            rock.t = 0;
          } else {
            rock.mode = 'hidden';
            rock.object.visible = false;
          }
        }
        break;
      }
      case 'float':
        // ぷかぷか: pumice floats.
        rock.object.position.y = rock.to.y + Math.sin(rock.t * 2) * 0.2;
        break;
      case 'fall': {
        rock.object.position.lerpVectors(rock.from, rock.to, k * k);
        if (rock.shadow) rock.shadow.scale.setScalar(0.3 + 0.5 * k);
        if (k >= 1) {
          rock.mode = 'rest';
          rock.t = 0;
          if (rock.shadow) rock.shadow.visible = false;
        }
        break;
      }
      case 'rest': {
        // ぽよん: a little bounce as it lands.
        const bounce = Math.max(0, 1 - rock.t * 2.5);
        rock.object.position.copy(rock.to);
        rock.object.position.y += Math.abs(Math.sin(rock.t * 12)) * 0.6 * bounce;
        break;
      }
      default:
        if (rock.kind === 'drop' && rock.shadow?.visible) {
          const s = Math.min(0.8, rock.shadow.scale.x + dt * 0.4);
          rock.shadow.scale.setScalar(s);
        }
        break;
    }
  }
}
