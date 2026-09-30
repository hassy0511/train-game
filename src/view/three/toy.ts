import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paradeSetup, type ParadeSetup } from '../../actors/parade';
import type { StageEvent } from '../../core/stage-events';
import { slopeZones } from '../../gimmick/slope';
import type { StageData } from '../../stage/types';
import { PARADE, SPIN } from '../../train/params';
import { bakeModel } from './bake';
import type { ModelLibrary } from './models';

const UP = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);

/** One band (a parade actor) as the view draws it: where its tail is, what it does, its members. */
interface Band {
  id: string;
  railId: string;
  setup: ParadeSetup;
  members: Object3D[];
  state: string;
  tail: number;
  speed: number;
  /** Seconds in this state. */
  t: number;
}

/** One spinning fork's flag: where it stands, where it points now and where it is turning to. */
interface SpinFlag {
  id: string;
  pivot: Object3D;
  /** The stand's own turn (the flag at angle 0 points along the rail). */
  base: Quaternion;
  flag: MeshLambertMaterial;
  angle: number;
  target: number;
  good: boolean;
}

/** A reverse-wound decoration (props[].windup): turned round when the town is wound. */
interface WindupProp {
  object: Object3D;
  model: string;
  wound: boolean;
}

/** How far a spinning fork's flag turns to point at a side (radians). */
const FLAG_TURN = 0.7;
/** The slide's pink handrails: how far out from the rail (m) and how high. */
const SLIDE_RAIL = { lateral: 1.8, height: 1.1, step: 2 } as const;
const CONFETTI = 60;
const BALLS = 40;

/**
 * v1.11 (5-2) the toy town in the scene (PHASE9_CHAPTER5_6 第 5 部 §8, the code-made part): the toy band walking on the
 * rail (backwards and leaning back while unwound, marching with a bob and a shower of paper confetti, stepping off into
 * the square and playing there), the spinning forks' turntables and pointing flags (turning, green when they point the
 * good way), the reverse-wound decorations that turn round when the town is wound, the slide's pink handrails, and the
 * coloured balls that bounce up when the train drops into a ball pit. The wind-up toys on the rail are the actor
 * layer's; the play mat is the ground's (environment.ts), the toy box the tunnels' (snow.ts), the block bases the track's.
 */
export class ToyGimmicks {
  readonly group = new Group();
  private readonly bands: Band[] = [];
  private readonly flags = new Map<string, SpinFlag>();
  private readonly windups: WindupProp[] = [];
  private models: ModelLibrary | null = null;
  private confetti: Points<BufferGeometry, PointsMaterial> | null = null;
  private confettiOn = false;
  private balls: Points<BufferGeometry, PointsMaterial> | null = null;
  private ballT = -1;
  private readonly ballVel: Vector3[] = [];
  private clock = 0;

  static wanted(stage: StageData): boolean {
    const f = stage.file;
    return (
      f.actors.some((a) => a.type === 'parade') ||
      f.junctions.some((j) => j.spin) ||
      f.props.some((p) => p.windup) ||
      f.environment.fall === 'balls' ||
      f.gimmicks.some((g) => g.type === 'slope' && (g.params as { look?: string } | undefined)?.look === 'slide')
    );
  }

  constructor(
    private readonly stage: StageData,
    private readonly train: Object3D,
  ) {
    this.group.name = 'toy-town';
  }

  async init(models: ModelLibrary): Promise<void> {
    this.models = models;
    const stage = this.stage;
    const network = stage.network;
    for (const a of stage.actors) {
      if (a.type !== 'parade' || !a.onRail) continue;
      const setup = paradeSetup(a.params, a.onRail.at);
      const members = await Promise.all(
        setup.members.map(async (name) => {
          const template = await models.load(name);
          const o = (bakeModel(template) ?? template).clone(true);
          o.name = `${a.id}:${name}`;
          this.group.add(o);
          return o;
        }),
      );
      this.bands.push({ id: a.id, railId: a.onRail.railId, setup, members, state: 'idle', tail: a.onRail.at, speed: 0, t: 0 });
    }
    // The spinning forks: a round block beside the rail (away from the loop) with a flag pointing the way it sends the train.
    const [table, arrow, star] = stage.file.junctions.some((j) => j.spin)
      ? await Promise.all([models.load('spin-turntable'), models.load('spin-arrow'), models.load('spin-star')])
      : [null, null, null];
    for (const j of stage.file.junctions) {
      if (!j.spin || !table || !arrow || !star) continue;
      const rail = network.getRail(j.railId);
      const f = rail.frameAt(j.at);
      // The loop turns off to the other side: the stand goes on the good side's shoulder, 11 m out.
      const side = j.spin.good === 'left' ? -1 : 1;
      const base = f.position.clone().addScaledVector(f.right, side * 11);
      const flat = f.tangent.clone().setY(0).normalize();
      const q = new Quaternion().setFromUnitVectors(Z, flat);
      const stand = (bakeModel(table) ?? table).clone(true);
      stand.position.copy(base);
      stand.quaternion.copy(q);
      stand.scale.setScalar(0.55);
      this.group.add(stand);
      const pivot = new Group();
      pivot.position.copy(base).addScaledVector(UP, 0.55);
      pivot.quaternion.copy(q);
      const flagObject = arrow.clone(true);
      let material = new MeshLambertMaterial({ color: '#EF6F6C' });
      flagObject.traverse((o) => {
        if ((o as Mesh).isMesh && o.name === 'spin-flag') {
          material = ((o as Mesh).material as MeshLambertMaterial).clone();
          (o as Mesh).material = material;
        }
      });
      pivot.add(flagObject);
      this.group.add(pivot);
      const other = j.spin.good === 'left' ? 'right' : 'left';
      const angle = this.sideAngle(other);
      pivot.quaternion.copy(q).multiply(new Quaternion().setFromAxisAngle(UP, angle));
      this.flags.set(j.id, { id: j.id, pivot, base: q.clone(), flag: material, angle, target: angle, good: false });
      // The star board by the good way, a little past the fork.
      const sf = rail.frameAt(Math.min(rail.length, j.at + 18));
      const s = (bakeModel(star) ?? star).clone(true);
      s.position.copy(sf.position).addScaledVector(sf.right, side * 5).setY(sf.position.y - 1);
      s.quaternion.setFromUnitVectors(Z, sf.tangent.clone().setY(0).normalize().negate());
      this.group.add(s);
    }
    // Reverse-wound decorations (props[].windup), each on its own (they turn round when the town is wound).
    for (const p of stage.props) {
      if (!p.windup) continue;
      const template = await models.load(p.model);
      const o = (bakeModel(template) ?? template).clone(true);
      o.position.copy(p.position);
      o.quaternion.copy(p.quaternion);
      o.scale.setScalar(p.scale);
      this.group.add(o);
      this.windups.push({ object: o, model: p.model, wound: false });
    }
    this.addSlideRails();
    this.confetti = this.makePoints(CONFETTI, 0.35, true);
    this.balls = this.makePoints(BALLS, 0.9, false);
    for (let i = 0; i < BALLS; i++) this.ballVel.push(new Vector3());
    this.placeBands();
  }

  /** The flag's turn (about the stand's up) that points it at `side` (the rail's left or right). */
  private sideAngle(side: 'left' | 'right'): number {
    // +Z is along the rail; the rail's right is −X of the stand (heading along +Z, right = −X): left turns towards +X.
    return side === 'left' ? FLAG_TURN : -FLAG_TURN;
  }

  /** A Points cloud, hidden until used (confetti in pastel colours, or the pit's coloured balls). */
  private makePoints(count: number, size: number, pastel: boolean): Points<BufferGeometry, PointsMaterial> {
    const g = new BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const colors = ['#EF6F6C', '#F6D365', '#7FD8BE', '#6EC6FF', '#B8A4FF', '#FF9FC8'];
    const c = new Color();
    for (let i = 0; i < count; i++) {
      c.set(colors[i % colors.length]);
      if (pastel) c.lerp(new Color('#FFFFFF'), 0.25);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    const points = new Points(g, new PointsMaterial({ size, vertexColors: true, sizeAttenuation: true }));
    points.frustumCulled = false;
    points.visible = false;
    this.group.add(points);
    return points;
  }

  /** The slide's pink handrails on both sides (one mesh for every slide). */
  private addSlideRails(): void {
    const parts: BufferGeometry[] = [];
    for (const z of slopeZones(this.stage.file.gimmicks)) {
      if ((this.stage.file.gimmicks[z.index].params as { look?: string } | undefined)?.look !== 'slide') continue;
      const rail = this.stage.network.getRail(z.railId);
      for (let s = z.from; s < z.to; s += SLIDE_RAIL.step) {
        const a = rail.frameAt(s);
        const b = rail.frameAt(Math.min(z.to, s + SLIDE_RAIL.step));
        for (const side of [-1, 1]) {
          const pa = a.position.clone().addScaledVector(a.right, side * SLIDE_RAIL.lateral).addScaledVector(a.up, SLIDE_RAIL.height);
          const pb = b.position.clone().addScaledVector(b.right, side * SLIDE_RAIL.lateral).addScaledVector(b.up, SLIDE_RAIL.height);
          const len = pa.distanceTo(pb);
          const bar = new BoxGeometry(0.22, 0.22, len + 0.05);
          bar.applyQuaternion(new Quaternion().setFromUnitVectors(Z, pb.clone().sub(pa).normalize()));
          bar.translate((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, (pa.z + pb.z) / 2);
          parts.push(bar);
          if (Math.round(s / SLIDE_RAIL.step) % 3 === 0) {
            const post = new BoxGeometry(0.14, SLIDE_RAIL.height, 0.14);
            const foot = a.position.clone().addScaledVector(a.right, side * SLIDE_RAIL.lateral).addScaledVector(a.up, SLIDE_RAIL.height / 2);
            post.translate(foot.x, foot.y, foot.z);
            parts.push(post);
          }
        }
      }
    }
    if (parts.length === 0) return;
    const geometry = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
    for (const p of parts) p.dispose();
    if (!geometry) return;
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, new MeshLambertMaterial({ color: '#FF9FC8' }));
    mesh.name = 'toy-slide-rail';
    this.group.add(mesh);
  }

  /** v1.11 (5-2): where each spinning fork points now (from the runner, every frame). */
  setSpinLooks(looks: { id: string; side: 'left' | 'right'; turning: boolean; good: boolean }[]): void {
    for (const l of looks) {
      const f = this.flags.get(l.id);
      if (!f) continue;
      f.target = this.sideAngle(l.side);
      if (f.good !== l.good) {
        f.good = l.good;
        f.flag.color.set(l.good ? '#7EE081' : '#EF6F6C');
        f.flag.emissive.set(l.good ? '#2E9A48' : '#000000');
      }
    }
  }

  onEvent(e: StageEvent): void {
    if (e.type === 'parade') {
      const b = this.bands.find((x) => x.id === e.id);
      if (!b) return;
      if (b.state !== e.state) b.t = 0;
      b.state = e.state;
      b.tail = e.tail;
      b.speed = e.speed;
      if (e.state === 'idle') this.placeBands();
    }
    if (e.type === 'windup' && e.town) void this.windTown();
    if (e.type === 'fail' && (e.reason === 'fellShort' || e.reason === 'fellNoJump') && this.stage.file.environment.fall === 'balls') this.bounceBalls();
    if (e.type === 'rewind' && this.balls) {
      this.balls.visible = false;
      this.ballT = -1;
    }
  }

  /** The town is wound: every reverse-wound decoration turns the right way round (its model without "-back"). */
  private async windTown(): Promise<void> {
    const models = this.models;
    if (!models) return;
    for (const w of this.windups) {
      if (w.wound) continue;
      w.wound = true;
      const template = await models.load(w.model.replace(/-back$/, ''));
      const o = (bakeModel(template) ?? template).clone(true);
      o.position.copy(w.object.position);
      o.quaternion.copy(w.object.quaternion);
      o.scale.copy(w.object.scale);
      w.object.removeFromParent();
      w.object = o;
      this.group.add(o);
    }
  }

  /** Into the ball pit: coloured balls bounce up round the train and fall back ("ぼよよん… ぽふっ"). */
  private bounceBalls(): void {
    const balls = this.balls;
    if (!balls) return;
    const at = this.train.getWorldPosition(new Vector3());
    const pos = balls.geometry.getAttribute('position') as Float32BufferAttribute;
    for (let i = 0; i < BALLS; i++) {
      const a = (i / BALLS) * Math.PI * 2;
      const r = 1 + (i % 5) * 0.8;
      pos.setXYZ(i, at.x + Math.cos(a) * r, at.y - 1, at.z + Math.sin(a) * r);
      this.ballVel[i].set(Math.cos(a) * (1.5 + (i % 3)), 6 + (i % 4) * 1.5, Math.sin(a) * (1.5 + (i % 3)));
    }
    pos.needsUpdate = true;
    balls.visible = true;
    this.ballT = 0;
  }

  /** Puts every band's members where their tail is now. */
  private placeBands(): void {
    for (const b of this.bands) this.placeBand(b, 0);
  }

  private placeBand(b: Band, dt: number): void {
    const rail = this.stage.network.rails.get(b.railId);
    if (!rail) return;
    const n = b.members.length;
    const exitSide = b.setup.exitSide === 'left' ? -1 : 1;
    b.members.forEach((m, i) => {
      if (b.state === 'gone') {
        // Playing in the square beside where they left the rail, facing it.
        const s = b.setup.exit - 8 + i * 3;
        const f = rail.frameAt(Math.min(rail.length, s));
        m.position.copy(f.position).addScaledVector(f.right, exitSide * 16);
        m.position.y += Math.abs(Math.sin(this.clock * 4 + i)) * 0.12;
        m.quaternion.setFromUnitVectors(Z, f.right.clone().setY(0).normalize().multiplyScalar(-exitSide));
        return;
      }
      const s = b.tail + b.setup.spacing * i;
      const f = rail.frameAt(Math.max(0, Math.min(rail.length, s)));
      m.position.copy(f.position);
      const flat = f.tangent.clone().setY(0).normalize();
      m.quaternion.setFromUnitVectors(Z, flat);
      const moving = Math.abs(b.speed) > 0.01 || b.state === 'idle' || b.state === 'wait';
      // Marching (or marking time) with a little bob; walking backwards leaning back (a funny wobble).
      if (moving) m.position.y += Math.abs(Math.sin(this.clock * (b.state === 'march' ? 7.3 : 5) + i * 0.7)) * 0.18;
      if (b.state === 'idle' || b.state === 'back') m.rotateX(-0.16);
      if (b.state === 'turn') {
        // The keys turn back and everyone hops round once ("くるりん！").
        const k = Math.min(1, b.t / PARADE.turnSeconds);
        m.position.y += Math.sin(k * Math.PI) * 0.5;
        m.rotateY(k * Math.PI * 2);
      }
      if (b.state === 'exit') {
        // One by one, the drum first, stepping off the rail into the square.
        const k = Math.min(1, Math.max(0, (b.t - (i / Math.max(1, n)) * PARADE.exitSeconds * 0.5) / (PARADE.exitSeconds * 0.5)));
        m.position.addScaledVector(f.right, exitSide * 16 * k * k);
      }
    });
    void dt;
  }

  update(dt: number): void {
    this.clock += dt;
    let marching: Band | null = null;
    for (const b of this.bands) {
      b.t += dt;
      // Between the runner's events the band goes on at its speed (it is told again on every change).
      if (b.state === 'march' || b.state === 'exit' || (b.state === 'back' && b.speed < 0)) {
        b.tail += b.speed * dt;
        if (b.state === 'back') b.tail = Math.max(b.setup.back.min, b.tail);
      }
      this.placeBand(b, dt);
      if (b.state === 'march' || b.state === 'turn') marching = b;
    }
    this.updateConfetti(marching, dt);
    for (const f of this.flags.values()) {
      if (Math.abs(f.target - f.angle) < 1e-3) continue;
      // Turning over in about SPIN.turn s.
      const step = ((2 * FLAG_TURN) / SPIN.turn) * dt;
      f.angle = f.target > f.angle ? Math.min(f.target, f.angle + step) : Math.max(f.target, f.angle - step);
      f.pivot.quaternion.copy(f.base).multiply(new Quaternion().setFromAxisAngle(UP, f.angle));
    }
    this.updateBalls(dt);
  }

  /** Paper confetti drifting down over the marching band (one Points). */
  private updateConfetti(band: Band | null, dt: number): void {
    const c = this.confetti;
    if (!c) return;
    const rail = band ? this.stage.network.rails.get(band.railId) : null;
    if (!band || !rail) {
      c.visible = false;
      this.confettiOn = false;
      return;
    }
    const centre = rail.frameAt(Math.min(rail.length, band.tail + 6)).position;
    const pos = c.geometry.getAttribute('position') as Float32BufferAttribute;
    if (!this.confettiOn) {
      for (let i = 0; i < CONFETTI; i++) pos.setXYZ(i, centre.x + (Math.random() - 0.5) * 16, centre.y + 2 + Math.random() * 10, centre.z + (Math.random() - 0.5) * 16);
      this.confettiOn = true;
    }
    for (let i = 0; i < CONFETTI; i++) {
      let y = pos.getY(i) - dt * (1.2 + (i % 5) * 0.2);
      let x = pos.getX(i) + Math.sin(this.clock * 2 + i) * dt * 0.8;
      let z = pos.getZ(i);
      if (y < centre.y || Math.abs(x - centre.x) > 12 || Math.abs(z - centre.z) > 12) {
        x = centre.x + (Math.random() - 0.5) * 16;
        z = centre.z + (Math.random() - 0.5) * 16;
        y = centre.y + 8 + Math.random() * 4;
      }
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    c.visible = true;
  }

  private updateBalls(dt: number): void {
    const b = this.balls;
    if (!b || this.ballT < 0) return;
    this.ballT += dt;
    const pos = b.geometry.getAttribute('position') as Float32BufferAttribute;
    for (let i = 0; i < BALLS; i++) {
      const v = this.ballVel[i];
      v.y -= 12 * dt;
      pos.setXYZ(i, pos.getX(i) + v.x * dt, pos.getY(i) + v.y * dt, pos.getZ(i) + v.z * dt);
    }
    pos.needsUpdate = true;
    if (this.ballT > 1.6) {
      b.visible = false;
      this.ballT = -1;
    }
  }
}
