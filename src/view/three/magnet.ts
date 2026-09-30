import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Quaternion,
  RingGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import type { StageEvent } from '../../core/stage-events';
import type { MagnetTarget, StageData } from '../../stage/types';
import { MAGNET, TRAIN } from '../../train/params';
import type { ActorLayer } from './actors';
import type { ModelLibrary } from './models';

/**
 * v1.11 (PR5): the magnet light in the scene (PHASE9_CHAPTER5_6 第 2 部 M12): the iron targets (a little star or bell,
 * the loose rail piece beside its gap with a soap film before it, the iron gate with its round cushion, the mirror
 * looking away), their white glint every MAGNET.glint s (green while the light button glows for one), the soft green
 * rings flowing from the lamp to what is pulled, the flight (a fetched thing stops before the lamp, pops into sparkles
 * and floats back home), the piece dropping into its gap, the gate sliding aside, the mirror turning round; on the
 * train, once the magnet light is learned, the U magnet on the roof and the ring round the lamp; the light's beam in
 * pale green in the magnet step. Never a beam, a bolt or a zap; nothing flies into the train.
 */

const RING_COUNT = 6;
const RING_EVERY = 0.35;
const RING_SPEED = 30;
const RING_COLOR = new Color('#9ff2d2');
const SPARKS = 64;
/** The lamp on the lead car (car frame, +Z forward), as the light's beam has it. */
const LAMP = new Vector3(0, 3.3, 6.3);
const BEAM_GREEN = new Color('#b8ffe6');
const FILM_SHOW = 100;
const FILM_RADIUS = 3;
const FILM_HEIGHT = 3;
const SHAKE = 0.3;
const TURN_SECONDS = 0.6;
const GATE_SECONDS = 0.6;

interface TargetVisual {
  target: MagnetTarget;
  /** The thing itself (a pick's model, a record's figure, the loose piece, the gate, the mirror). */
  object: Object3D | null;
  home: Vector3;
  homeQuat: Quaternion;
  /** Where a glint shows (world). */
  glintAt: Vector3;
  film: Mesh | null;
  /** 'idle' | 'shake' | 'fly' | 'gone' | 'back' | 'open' | 'opening' */
  state: string;
  t: number;
  seconds: number;
  /** The piece's place in the gap (bridge); the gate's slid-aside offset. */
  goal: Vector3;
  goalQuat: Quaternion;
  bump: number;
}

export class MagnetGimmicks {
  readonly group = new Group();
  private readonly visuals = new Map<string, TargetVisual>();
  private models: ModelLibrary | null = null;
  private learned = false;
  private mode: 'off' | 'light' | 'magnet' = 'off';
  private hintId: string | null = null;
  private pulling: { id: string; t: number; seconds: number } | null = null;
  private fetching: { id: string; t: number; seconds: number; from: Vector3 } | null = null;
  private clock = 0;
  private rings: InstancedMesh | null = null;
  private readonly ringAge = new Float32Array(RING_COUNT).fill(-1);
  private ringNext = 0;
  private glints: Points<BufferGeometry, PointsMaterial> | null = null;
  private readonly glintIds: string[] = [];
  private sparks: Points<BufferGeometry, PointsMaterial> | null = null;
  private readonly sparkPos = new Float32Array(SPARKS * 3);
  private readonly sparkVel = new Float32Array(SPARKS * 3);
  private sparkLife = 0;
  private roofMark: Object3D | null = null;
  private lampRim: Mesh<TorusGeometry, MeshBasicMaterial> | null = null;
  private readonly beamColors = new Map<Material, Color>();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly lamp = new Vector3();
  private readonly matrix = new Matrix4();
  private readonly quat = new Quaternion();
  private readonly scaleV = new Vector3();
  private readonly zPlus = new Vector3(0, 0, 1);
  /** The train's speed (m/s), set every frame by the scene. */
  trainSpeed = 0;

  constructor(
    private readonly stage: StageData,
    private readonly train: Object3D,
    private readonly actors: ActorLayer,
    private readonly beam: Object3D,
    private readonly trackPiece: (railId: string, from: number, to: number) => BufferGeometry | null,
  ) {
    this.group.name = 'magnet';
  }

  /** The stretches of track the gaps leave out (the piece is drawn here, and flies into place). */
  static trackSkips(stage: StageData): { railId: string; from: number; to: number }[] {
    return stage.magnets.filter((t) => t.kind === 'bridge').map((t) => ({ railId: t.railId, from: t.at, to: t.end }));
  }

  static wanted(stage: StageData): boolean {
    return stage.magnets.length > 0 || stage.ironProps.length > 0;
  }

  async init(models: ModelLibrary): Promise<void> {
    this.models = models;
    const network = this.stage.network;
    await Promise.all(
      this.stage.magnets.map(async (t) => {
        const rail = network.getRail(t.railId);
        const frame = rail.frameAt(t.at);
        const basis = new Matrix4().makeBasis(frame.right, frame.up, frame.tangent);
        const railQuat = new Quaternion().setFromRotationMatrix(basis);
        const v: TargetVisual = {
          target: t,
          object: null,
          home: frame.position.clone().addScaledVector(frame.right, t.offset.lateral).addScaledVector(frame.up, t.offset.height),
          homeQuat: railQuat.clone(),
          glintAt: new Vector3(),
          film: null,
          state: 'idle',
          t: 0,
          seconds: 0,
          goal: new Vector3(),
          goalQuat: new Quaternion(),
          bump: 0,
        };
        if (t.recordId) {
          // The record's own figure (the actor layer draws it; the flight moves it).
          v.object = this.actors.figure(`record:${t.recordId}`);
          if (v.object) {
            v.home.copy(v.object.position);
            v.homeQuat.copy(v.object.quaternion);
          }
          v.glintAt.copy(v.home).y += 0.6;
        } else if (t.kind === 'bridge') {
          const mid = (t.at + t.end) / 2;
          const midFrame = rail.frameAt(mid);
          const geometry = this.trackPiece(t.railId, t.at, t.end);
          if (geometry) {
            geometry.translate(-midFrame.position.x, -midFrame.position.y, -midFrame.position.z);
            const piece = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true }));
            piece.name = `magnet-piece:${t.id}`;
            v.goal.copy(midFrame.position);
            v.goalQuat.identity();
            const p = t.piece ?? { lateral: -9, height: 0, rotationY: 60 };
            v.home.copy(midFrame.position).addScaledVector(midFrame.right, p.lateral).addScaledVector(midFrame.up, p.height + 0.1);
            v.homeQuat.setFromAxisAngle(new Vector3(0, 1, 0), (p.rotationY * Math.PI) / 180);
            piece.position.copy(v.home);
            piece.quaternion.copy(v.homeQuat);
            v.object = piece;
            this.group.add(piece);
          }
          v.glintAt.copy(v.home).y += 0.8;
          v.film = this.makeFilm(frame.position, frame.tangent, frame.up);
          this.group.add(v.film);
        } else {
          const model = (await models.load(t.model)).clone(true);
          model.name = `magnet:${t.id}`;
          model.position.copy(v.home);
          // A pick faces the coming train; a gate stands across the line; the mirror looks away (its back to the rail).
          model.quaternion.copy(railQuat);
          if (t.kind === 'pick') model.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI));
          if (t.kind === 'turn') model.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.sign(t.offset.lateral || 1) * (Math.PI / 2)));
          v.homeQuat.copy(model.quaternion);
          if (t.kind === 'gate') v.goal.copy(frame.right).multiplyScalar(7.5);
          v.object = model;
          this.group.add(model);
          v.glintAt.copy(v.home).y += t.kind === 'gate' ? 5.5 : t.kind === 'turn' ? 4.5 : 0.4;
        }
        this.visuals.set(t.id, v);
      }),
    );
    this.buildGlints();
    this.buildRings();
    this.buildSparks();
  }

  /** The soap film before a gap: a pale disc with a rainbow rim, facing the coming train. */
  private makeFilm(at: Vector3, tangent: Vector3, up: Vector3): Mesh {
    const disc = new CircleGeometry(FILM_RADIUS, 20);
    const rim = new RingGeometry(FILM_RADIUS * 0.9, FILM_RADIUS, 20);
    const colors: number[] = [];
    const c = new Color();
    for (let i = 0; i < disc.getAttribute('position').count; i++) colors.push(0.55, 0.6, 0.7);
    const rp = rim.getAttribute('position');
    for (let i = 0; i < rp.count; i++) {
      c.setHSL((Math.atan2(rp.getY(i), rp.getX(i)) / (Math.PI * 2) + 1) % 1, 0.8, 0.7);
      colors.push(c.r, c.g, c.b);
    }
    const merged = new BufferGeometry();
    const pos = [...disc.getAttribute('position').array, ...rp.array];
    merged.setAttribute('position', new Float32BufferAttribute(pos, 3));
    merged.setAttribute('color', new Float32BufferAttribute(colors, 3));
    const di = disc.getIndex();
    const ri = rim.getIndex();
    const offset = disc.getAttribute('position').count;
    merged.setIndex([...(di ? Array.from(di.array) : []), ...(ri ? Array.from(ri.array).map((n) => n + offset) : [])]);
    disc.dispose();
    rim.dispose();
    const film = new Mesh(
      merged,
      new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    );
    film.name = 'magnet-film';
    film.position.copy(at).addScaledVector(up, FILM_HEIGHT);
    film.quaternion.setFromUnitVectors(this.zPlus, tangent);
    film.visible = false;
    return film;
  }

  private buildGlints(): void {
    const ids = [...this.visuals.keys()];
    this.glintIds.push(...ids);
    if (ids.length === 0) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(ids.length * 3), 3).setUsage(DynamicDrawUsage));
    geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(ids.length * 3), 3).setUsage(DynamicDrawUsage));
    this.glints = new Points(
      geometry,
      new PointsMaterial({ size: 1.4, vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, sizeAttenuation: true }),
    );
    this.glints.name = 'magnet-glints';
    this.glints.frustumCulled = false;
    this.group.add(this.glints);
  }

  private buildRings(): void {
    const ring = new RingGeometry(0.8, 1, 18);
    const mesh = new InstancedMesh(
      ring,
      new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
      RING_COUNT,
    );
    mesh.name = 'magnet-rings';
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    for (let i = 0; i < RING_COUNT; i++) {
      mesh.setColorAt(i, RING_COLOR);
      this.matrix.makeScale(0, 0, 0);
      mesh.setMatrixAt(i, this.matrix);
    }
    mesh.visible = false;
    this.rings = mesh;
    this.group.add(mesh);
  }

  private buildSparks(): void {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.sparkPos, 3).setUsage(DynamicDrawUsage));
    this.sparks = new Points(geometry, new PointsMaterial({ size: 0.35, color: '#e9fff6', transparent: true, blending: AdditiveBlending, depthWrite: false }));
    this.sparks.name = 'magnet-sparks';
    this.sparks.frustumCulled = false;
    this.sparks.visible = false;
    this.group.add(this.sparks);
  }

  /** A burst of little sparkles at `at` (a fetched thing popping, a joint closing). */
  private burst(at: Vector3): void {
    for (let i = 0; i < SPARKS; i++) {
      this.sparkPos[i * 3] = at.x;
      this.sparkPos[i * 3 + 1] = at.y;
      this.sparkPos[i * 3 + 2] = at.z;
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const s = 1.5 + Math.random() * 2.5;
      this.sparkVel[i * 3] = Math.cos(a) * Math.cos(b) * s;
      this.sparkVel[i * 3 + 1] = Math.sin(b) * s + 1;
      this.sparkVel[i * 3 + 2] = Math.sin(a) * Math.cos(b) * s;
    }
    this.sparkLife = 0.7;
    if (this.sparks) this.sparks.visible = true;
  }

  /** The train's own magnet things, once the magnet light is learned: the U magnet on the roof, the lamp's ring. */
  private async addTrainParts(): Promise<void> {
    if (this.roofMark || !this.models) return;
    this.roofMark = new Object3D();
    const mark = (await this.models.load('magnet-mark')).clone(true);
    mark.name = 'magnet-mark';
    mark.position.set(0, TRAIN.height + 0.02, TRAIN.length / 2 - 2.2);
    this.roofMark = mark;
    this.train.add(mark);
    const rim = new Mesh(
      new TorusGeometry(0.5, 0.05, 6, 24),
      new MeshBasicMaterial({ color: '#7ff0c8', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
    );
    rim.name = 'magnet-lamp-rim';
    rim.position.copy(LAMP);
    rim.visible = false;
    this.lampRim = rim;
    this.train.add(rim);
  }

  /** The light's beam in pale green in the magnet step (its own colours back otherwise). */
  private tintBeam(): void {
    this.beam.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const m = o.material as MeshBasicMaterial;
      if (!this.beamColors.has(m)) this.beamColors.set(m, m.color.clone());
      const own = this.beamColors.get(m) as Color;
      m.color.copy(this.mode === 'magnet' ? BEAM_GREEN : own);
    });
  }

  onEvent(e: StageEvent): void {
    if (e.type === 'ability' && e.id === 'magnetLight') {
      this.learned = true;
      void this.addTrainParts();
    }
    if (e.type === 'light:mode') {
      this.mode = e.mode;
      this.tintBeam();
    }
    if (e.type === 'magnet:hint') this.hintId = e.id;
    if (e.type === 'magnet:pull') this.startPull(e.id, e.seconds, e.distance);
    if (e.type === 'magnet:caught') this.caught(e.id, e.instant);
    if (e.type === 'magnet:open') this.opened(e.id, e.instant);
    if (e.type === 'magnet:bump') {
      const v = this.visuals.get(e.id);
      if (v) v.bump = 0.5;
    }
    if (e.type === 'magnet:fetch') {
      const figure = this.actors.figure(e.id);
      if (figure) this.fetching = { id: e.id, t: 0, seconds: e.seconds, from: figure.position.clone() };
      this.pulling = { id: e.id, t: 0, seconds: e.seconds };
      this.ringNext = 0;
    }
    if (e.type === 'rewind') {
      // A rewind lands anything still flying; picks are back home (open gaps and gates stay so).
      this.pulling = null;
      this.fetching = null;
      for (const v of this.visuals.values()) {
        if (v.target.kind === 'pick' && v.state !== 'idle') this.homeAgain(v);
        v.bump = 0;
      }
    }
  }

  private startPull(id: string, seconds: number, distance: number): void {
    const v = this.visuals.get(id);
    this.pulling = { id, t: 0, seconds };
    this.ringNext = 0;
    if (!v) return;
    v.t = 0;
    if (v.target.kind === 'pick') {
      v.state = 'shake';
      v.seconds = seconds;
    } else {
      // A gap closes, a gate opens, a mirror turns: sped up to be done before the train gets there (at least 0.08 s).
      const time = this.trainSpeed > 0.5 ? distance / this.trainSpeed : Infinity;
      v.seconds = Math.max(0.08, Math.min(v.target.kind === 'bridge' ? seconds : v.target.kind === 'gate' ? GATE_SECONDS : TURN_SECONDS, time * 0.8));
      v.state = 'opening';
    }
  }

  private caught(id: string, instant: boolean): void {
    if (this.pulling?.id === id) this.pulling = null;
    const v = this.visuals.get(id);
    if (!v) return;
    if (v.target.kind === 'pick') {
      if (v.object) this.burst(v.object.position);
      if (instant) this.homeAgain(v);
      else {
        v.state = 'back';
        v.t = 0;
        if (v.object) v.object.scale.setScalar(0.001);
      }
    } else if (v.state === 'opening') this.finishOpen(v, instant);
    if (v.target.kind === 'bridge' && !instant) this.burst(v.goal);
  }

  private opened(id: string, instant: boolean): void {
    const v = this.visuals.get(id);
    if (!v) return;
    if (instant) this.finishOpen(v, true);
  }

  private finishOpen(v: TargetVisual, _instant: boolean): void {
    v.state = 'open';
    const o = v.object;
    if (o) {
      if (v.target.kind === 'bridge') {
        o.position.copy(v.goal);
        o.quaternion.copy(v.goalQuat);
      } else if (v.target.kind === 'gate') {
        o.position.copy(v.home).add(v.goal);
      } else if (v.target.kind === 'turn') {
        o.quaternion.copy(v.homeQuat).multiply(this.quat.setFromAxisAngle(this.tmp.set(0, 1, 0), Math.PI));
      }
    }
    if (v.film) v.film.visible = false;
  }

  private homeAgain(v: TargetVisual): void {
    v.state = 'idle';
    v.t = 0;
    const o = v.object;
    if (!o) return;
    o.position.copy(v.home);
    o.quaternion.copy(v.homeQuat);
    o.scale.setScalar(1);
  }

  update(dt: number): void {
    this.clock += dt;
    this.train.updateMatrixWorld();
    this.lamp.copy(LAMP);
    this.train.localToWorld(this.lamp);
    const trainPos = this.train.position;
    for (const v of this.visuals.values()) this.updateTarget(v, dt, trainPos);
    this.updateFetch(dt);
    this.updateGlints();
    this.updateRings(dt);
    this.updateSparks(dt);
    if (this.pulling) {
      this.pulling.t += dt;
      if (this.pulling.t > this.pulling.seconds + 0.5) this.pulling = null;
    }
    if (this.lampRim) {
      const want = this.pulling ? 0.9 : this.mode === 'magnet' ? 0.35 : 0;
      const m = this.lampRim.material;
      m.opacity += (want - m.opacity) * Math.min(1, dt * 6);
      this.lampRim.visible = m.opacity > 0.02;
    }
  }

  /** Where a fetched thing stops: MAGNET.catchGap m before the lamp. */
  private catchPoint(out: Vector3): Vector3 {
    out.set(0, 0, 1).applyQuaternion(this.train.quaternion).multiplyScalar(MAGNET.catchGap).add(this.lamp);
    return out;
  }

  private updateTarget(v: TargetVisual, dt: number, trainPos: Vector3): void {
    const o = v.object;
    if (v.film) {
      const shut = v.state === 'idle';
      v.film.visible = shut && v.home.distanceToSquared(trainPos) < FILM_SHOW * FILM_SHOW + 400;
      if (v.film.visible) {
        const wobble = v.bump > 0 ? Math.sin(v.bump * 40) * v.bump * 0.4 : 0;
        v.film.scale.set(1 + wobble, 1 - wobble, 1);
        const m = v.film.material as MeshBasicMaterial;
        m.opacity = 0.3 + 0.08 * Math.sin(this.clock * 3);
      }
    }
    if (v.bump > 0) {
      v.bump = Math.max(0, v.bump - dt);
      if (o && v.target.kind === 'gate' && v.state === 'idle') o.position.copy(v.home).addScaledVector(this.tmp.set(0, 0, 1).applyQuaternion(v.homeQuat), Math.sin(v.bump * 30) * v.bump * 0.3);
    }
    if (!o) return;
    v.t += dt;
    switch (v.state) {
      case 'shake': {
        // "ぷるぷる" where it is, then it flies.
        const s = Math.min(SHAKE, v.seconds * 0.25);
        o.position.copy(v.home);
        o.position.x += Math.sin(v.t * 70) * 0.06;
        o.position.y += Math.sin(v.t * 55) * 0.04;
        if (v.t >= s) {
          v.state = 'fly';
          v.t = 0;
          v.seconds = Math.max(0.2, v.seconds - s);
        }
        break;
      }
      case 'fly': {
        const u = Math.min(1, v.t / v.seconds);
        const k = u * u * (3 - 2 * u);
        this.catchPoint(this.tmp);
        o.position.lerpVectors(v.home, this.tmp, k);
        o.position.y += Math.sin(Math.PI * u) * 2;
        o.scale.setScalar(u > 0.85 ? Math.max(0.05, 1 - (u - 0.85) / 0.15) : 1);
        break;
      }
      case 'back': {
        // Home again, growing back softly ("ふわっと もとの 場所へ").
        o.position.copy(v.home);
        const u = Math.min(1, v.t / MAGNET.returnSeconds);
        o.scale.setScalar(Math.max(0.001, u * u * (3 - 2 * u)));
        if (u >= 1) this.homeAgain(v);
        break;
      }
      case 'opening': {
        const u = Math.min(1, v.t / v.seconds);
        const k = u * u * (3 - 2 * u);
        if (v.target.kind === 'bridge') {
          o.position.lerpVectors(v.home, v.goal, k);
          o.position.y += Math.sin(Math.PI * u) * 3;
          o.quaternion.slerpQuaternions(v.homeQuat, v.goalQuat, k);
        } else if (v.target.kind === 'gate') {
          o.position.copy(v.home).addScaledVector(v.goal, k);
        } else if (v.target.kind === 'turn') {
          o.quaternion.copy(v.homeQuat).multiply(this.quat.setFromAxisAngle(this.tmp.set(0, 1, 0), Math.PI * k));
        }
        if (v.film) v.film.visible = false;
        if (u >= 1) this.finishOpen(v, false);
        break;
      }
      default:
        break;
    }
  }

  /** A cutscene figure flying to the train (5-3's little star); the cutscene takes it off once it has arrived. */
  private updateFetch(dt: number): void {
    const f = this.fetching;
    if (!f) return;
    f.t += dt;
    const figure = this.actors.figure(f.id);
    if (!figure) {
      this.fetching = null;
      return;
    }
    const u = Math.min(1, f.t / f.seconds);
    const k = u * u * (3 - 2 * u);
    this.catchPoint(this.tmp);
    figure.position.lerpVectors(f.from, this.tmp, k);
    figure.position.y += Math.sin(Math.PI * u) * 1.5;
    figure.scale.setScalar(u > 0.85 ? Math.max(0.05, 1 - (u - 0.85) / 0.15) : 1);
    if (u >= 1) {
      this.burst(figure.position);
      this.fetching = null;
    }
  }

  private updateGlints(): void {
    const g = this.glints;
    if (!g) return;
    const pos = g.geometry.getAttribute('position') as Float32BufferAttribute;
    const col = g.geometry.getAttribute('color') as Float32BufferAttribute;
    this.glintIds.forEach((id, i) => {
      const v = this.visuals.get(id) as TargetVisual;
      // A record's glint waits for the magnet light (the stages before 5-3 look as they always did).
      const shown = (this.learned || !v.target.recordId) && (v.state === 'idle');
      const at = v.glintAt;
      pos.setXYZ(i, at.x, at.y, at.z);
      if (!shown) {
        col.setXYZ(i, 0, 0, 0);
        return;
      }
      if (id === this.hintId) {
        const k = 0.6 + 0.4 * Math.sin(this.clock * 8);
        col.setXYZ(i, 0.45 * k, 1 * k, 0.75 * k);
        return;
      }
      const phase = (this.clock + i * 0.37) % MAGNET.glint;
      const k = phase < 0.3 ? Math.sin((phase / 0.3) * Math.PI) : 0;
      col.setXYZ(i, k, k, k);
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  private updateRings(dt: number): void {
    const mesh = this.rings;
    if (!mesh) return;
    const pull = this.pulling;
    const target = pull ? (this.visuals.get(pull.id)?.object ?? this.actors.figure(pull.id)) : null;
    const goal = target ? this.tmp2.copy(target.position) : null;
    if (pull && pull.t < pull.seconds) {
      this.ringNext -= dt;
      if (this.ringNext <= 0) {
        this.ringNext = RING_EVERY;
        const free = this.ringAge.findIndex((a) => a < 0);
        if (free >= 0) this.ringAge[free] = 0;
      }
    }
    let any = false;
    for (let i = 0; i < RING_COUNT; i++) {
      if (this.ringAge[i] < 0) continue;
      this.ringAge[i] += dt;
      const dist = goal ? goal.distanceTo(this.lamp) : 0;
      const travelled = this.ringAge[i] * RING_SPEED;
      if (!goal || travelled >= dist || dist < 0.5) {
        this.ringAge[i] = -1;
        this.matrix.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, this.matrix);
        continue;
      }
      any = true;
      const dir = this.tmp.subVectors(goal, this.lamp).normalize();
      const u = travelled / dist;
      const p = new Vector3().copy(this.lamp).addScaledVector(dir, travelled);
      this.quat.setFromUnitVectors(this.zPlus, dir);
      const s = 0.6 + 1.4 * u;
      this.scaleV.set(s, s, s);
      this.matrix.compose(p, this.quat, this.scaleV);
      mesh.setMatrixAt(i, this.matrix);
      mesh.setColorAt(i, new Color().copy(RING_COLOR).multiplyScalar(1 - u));
    }
    mesh.visible = any;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private updateSparks(dt: number): void {
    const p = this.sparks;
    if (!p || this.sparkLife <= 0) return;
    this.sparkLife -= dt;
    for (let i = 0; i < SPARKS; i++) {
      this.sparkPos[i * 3] += this.sparkVel[i * 3] * dt;
      this.sparkPos[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt;
      this.sparkPos[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt;
    }
    (p.geometry.getAttribute('position') as Float32BufferAttribute).needsUpdate = true;
    p.material.opacity = Math.max(0, this.sparkLife / 0.7);
    if (this.sparkLife <= 0) p.visible = false;
  }
}
