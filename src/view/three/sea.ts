import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Quaternion,
  Sphere,
  SphereGeometry,
  Vector3,
} from 'three';
import type { StageEvent } from '../../core/stage-events';
import type { RailFrame } from '../../rail/types';
import type { JunctionDef, StageData, WhaleParams } from '../../stage/types';
import { TRAIN, WHALE } from '../../train/params';
import type { ModelLibrary } from './models';
import { sourceMeshes } from './props';
import { SEA_TIME, WHALE_BLOWHOLE, WHALE_TAIL_ROOT, whaleBodyGeometry, whaleTailGeometry } from './sea-placeholders';

/**
 * v1.10 (3-1) the sea's moving things (PHASE8 part 3 §8, drawn in code): the whale that swims along after the whistle,
 * the whale whose back and spout are a jump pad, the current's bubble rings and streams, the columns of a bubble fork
 * (real bubbles rising, Sakasa's pink swirly ones sinking; the light makes the swirls glow), the glowing motes of the
 * deep place, and a big bubble popping in a cutscene. The sways of the kelp read the clock this ticks.
 */

/** Whale colours (their own material each, so one can fade away without touching anything else). */
function whaleMaterial(): MeshLambertMaterial {
  return new MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 1 });
}

interface WhaleVisual {
  id: string;
  root: Group;
  tail: Group;
  material: MeshLambertMaterial;
  params: Required<Omit<WhaleParams, 'until'>>;
  home: Vector3;
  homeQuat: Quaternion;
  state: 'idle' | 'sing' | 'follow' | 'trail' | 'away';
  /** Seconds in the current state. */
  t: number;
  notesLeft: number;
}

interface WhalePad {
  index: number;
  root: Group;
  tail: Group;
  /** Where it waits deep down, and where its back is up at the surface. */
  deep: Vector3;
  up: Vector3;
  /** Where the spout rises (the pad on the rail). */
  spout: Vector3;
  left: number;
  railId: string;
  at: number;
}

interface Current {
  index: number;
  whale: string | null;
  rings: InstancedMesh;
  ringMaterial: MeshLambertMaterial;
  stream: Points;
  frames: RailFrame[];
  /** 0 = waiting (faint, still), 1 = pushing. */
  on: number;
  want: number;
  offset: number;
}

interface BubbleColumn {
  /** Sea-floor point it stands on. */
  base: Vector3;
  kind: 'rise' | 'sink';
  fork: string;
}

/** Bubbles per column, and how high a column reaches (m). */
const COLUMN_BUBBLES = 14;
const COLUMN_HEIGHT = 11;
/** Round the lateral of a fork's columns from their track (m, to the outside of the turn). */
const COLUMN_LATERAL = 5;
/** Current streams: bubbles drifting along a current, and how fast (m/s). */
const STREAM_POINTS = 160;
const STREAM_SPEED = 14;
/** A popping bubble's spray. */
const SPRAY = 28;
const SPRAY_SECONDS = 1.1;
/** The spout's column of spray. */
const SPOUT = 24;
const SPOUT_SECONDS = 1.6;
/** Glowing motes in the deep place (a fog stretch with its own colour). */
const MOTES = 150;

/** A soft round bubble picture with a bright spot (canvas, made once). */
function bubbleTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(16, 16, 2, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.6, 'rgba(210,245,255,0.5)');
  grad.addColorStop(1, 'rgba(210,245,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(16, 16, 15, 0, Math.PI * 2);
  g.fill();
  return new CanvasTexture(canvas);
}

/** Sakasa's pink bubbles carry a white swirl (the picture wraps round each ball). */
function swirlTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 64);
  // A light swirl on the pink (it shows a little; lit by the light it glows).
  g.strokeStyle = '#e07ab8';
  g.lineWidth = 7;
  for (let k = 0; k < 2; k++) {
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = i * 0.45;
      const r = 3 + i * 0.6;
      const x = 32 + k * 64 + Math.cos(a) * r;
      const y = 32 + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  return new CanvasTexture(canvas);
}

const Y_AXIS = new Vector3(0, 1, 0);

const hash = (i: number): number => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export class SeaGimmicks {
  readonly group = new Group();
  private time = 0;
  private readonly whales = new Map<string, WhaleVisual>();
  private readonly pads = new Map<number, WhalePad>();
  private readonly currents: Current[] = [];
  private readonly columns: BubbleColumn[] = [];
  private rise: InstancedMesh | null = null;
  private readonly sinks = new Map<string, { mesh: InstancedMesh; columns: BubbleColumn[]; material: MeshLambertMaterial }>();
  private readonly spray: InstancedMesh;
  private sprayT = -1;
  private readonly sprayAt = new Vector3();
  private readonly spout: InstancedMesh;
  private spoutT = -1;
  private readonly spoutAt = new Vector3();
  private notes: InstancedMesh | null = null;
  private readonly noteState: { at: Vector3; t: number }[] = [];
  private readonly m = new Matrix4();
  private readonly v = new Vector3();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly bubble = bubbleTexture();
  private floorY: number;

  constructor(
    private readonly stage: StageData,
    private readonly train: Object3D,
    /** Where a cutscene figure is now (for a pop). */
    private readonly figureAt: (id: string) => Vector3 | null,
  ) {
    this.group.name = 'sea';
    const water = stage.file.environment.water?.[0];
    this.floorY = water?.floor ?? stage.file.environment.ground?.y ?? 0;
    const soft = new SphereGeometry(1, 8, 6);
    // Spray of a popping bubble and of the whale's spout: small white balls, drawn only while they fly.
    this.spray = new InstancedMesh(soft, new MeshLambertMaterial({ color: '#f4fbff', transparent: true, opacity: 0.85, depthWrite: false }), SPRAY);
    this.spray.name = 'pop-spray';
    this.spray.visible = false;
    this.spray.frustumCulled = false;
    this.spray.instanceMatrix.setUsage(DynamicDrawUsage);
    // Water, not smoke: unlit white-blue spray.
    this.spout = new InstancedMesh(soft, new MeshBasicMaterial({ color: '#eaf8ff', transparent: true, opacity: 0.75, depthWrite: false }), SPOUT);
    this.spout.name = 'whale-spout';
    this.spout.visible = false;
    this.spout.frustumCulled = false;
    this.spout.instanceMatrix.setUsage(DynamicDrawUsage);
    this.group.add(this.spray, this.spout);
  }

  /** The stage has something for this layer (or the kelp needs its clock). */
  static wanted(stage: StageData): boolean {
    const f = stage.file;
    return (
      f.actors.some((a) => a.type === 'whale') ||
      f.junctions.some((j) => j.bubbles) ||
      f.gimmicks.some((g) => (g.params as { look?: string } | undefined)?.look === 'whale' || (g.params as { look?: string } | undefined)?.look === 'current') ||
      f.props.some((p) => p.model === 'kelp')
    );
  }

  async init(models: ModelLibrary): Promise<void> {
    const f = this.stage.file;
    for (const actor of this.stage.actors) {
      if (actor.type !== 'whale') continue;
      const p = actor.params as Partial<WhaleParams>;
      const visual = this.makeWhale(actor.id);
      visual.home.copy(actor.position);
      visual.homeQuat.copy(actor.quaternion);
      visual.params = {
        callRange: p.callRange ?? WHALE.callRange,
        lead: p.lead ?? WHALE.lead,
        lateral: p.lateral ?? WHALE.lateral,
        height: p.height ?? WHALE.height,
        trail: p.trail ?? WHALE.trail,
      };
      visual.root.position.copy(actor.position);
      visual.root.quaternion.copy(actor.quaternion);
      this.whales.set(actor.id, visual);
    }
    f.gimmicks.forEach((g, index) => {
      const look = (g.params as { look?: string } | undefined)?.look;
      if (g.type === 'jump-pad' && look === 'whale' && g.railId !== undefined && g.from !== undefined) this.addPad(index, g.railId, g.from);
      if (g.type === 'updraft' && look === 'current' && g.railId !== undefined && g.from !== undefined && g.to !== undefined) {
        this.addCurrent(index, g.railId, g.from, g.to, (g.params as { whale?: string }).whale ?? null, models);
      }
      if (g.type === 'fog' && typeof (g.params as { color?: string } | undefined)?.color === 'string' && g.railId !== undefined && g.from !== undefined && g.to !== undefined) {
        this.addMotes(g.railId, g.from, g.to);
      }
    });
    for (const j of f.junctions) if (j.bubbles) this.addFork(j);
    this.buildColumns();
    if (this.whales.size > 0) {
      const notes = new InstancedMesh(new SphereGeometry(1, 8, 6), new MeshLambertMaterial({ color: '#eaf8ff', emissive: new Color('#6fc3ea'), transparent: true, opacity: 0.8 }), 9);
      notes.name = 'whale-song';
      notes.frustumCulled = false;
      notes.visible = false;
      notes.instanceMatrix.setUsage(DynamicDrawUsage);
      this.notes = notes;
      this.group.add(notes);
    }
    await Promise.resolve();
  }

  // ---- whales ----

  private makeWhale(id: string): WhaleVisual {
    const material = whaleMaterial();
    const root = new Group();
    root.name = `whale:${id}`;
    const body = new Mesh(whaleBodyGeometry(), material);
    body.name = 'whale-body';
    const tail = new Group();
    tail.position.copy(WHALE_TAIL_ROOT);
    const tailMesh = new Mesh(whaleTailGeometry(), material);
    tailMesh.name = 'whale-tail';
    tail.add(tailMesh);
    root.add(body, tail);
    this.group.add(root);
    return {
      id,
      root,
      tail,
      material,
      params: { callRange: WHALE.callRange, lead: WHALE.lead, lateral: WHALE.lateral, height: WHALE.height, trail: WHALE.trail },
      home: new Vector3(),
      homeQuat: new Quaternion(),
      state: 'idle',
      t: 0,
      notesLeft: 0,
    };
  }

  private updateWhale(w: WhaleVisual, dt: number): void {
    w.t += dt;
    const root = w.root;
    // The tail beats slowly all the time; a little faster when it swims along.
    const beat = w.state === 'follow' || w.state === 'trail' || w.state === 'away' ? 1.3 : 0.8;
    w.tail.rotation.x = Math.sin(this.time * beat * Math.PI * 2 * 0.5) * 0.28;
    const target = new Vector3();
    const facing = new Quaternion();
    let speed = 3;
    switch (w.state) {
      case 'idle':
      case 'sing': {
        // Round and round a little where it lives (still while it sings).
        const a = w.state === 'sing' ? 0 : this.time * 0.25;
        target.set(Math.cos(a) * 3, Math.sin(this.time * 0.6) * 0.4, Math.sin(a) * 3).applyQuaternion(w.homeQuat).add(w.home);
        facing.copy(w.homeQuat);
        break;
      }
      case 'follow':
      case 'trail': {
        const lead = w.state === 'follow' ? w.params.lead : -w.params.trail;
        // The train's own frame: +X is its left, +Z ahead.
        target.set(-w.params.lateral, w.params.height + Math.sin(this.time * 0.7) * 0.4, lead + TRAIN.length / 2).applyQuaternion(this.train.quaternion).add(this.train.position);
        facing.copy(this.train.quaternion);
        speed = 40;
        break;
      }
      case 'away': {
        target.set(0, 0.6, 30).applyQuaternion(root.quaternion).add(root.position);
        facing.copy(root.quaternion);
        speed = 10;
        w.material.opacity = Math.max(0, 1 - w.t / 3);
        root.visible = w.material.opacity > 0.01;
        break;
      }
    }
    const step = target.sub(root.position);
    const d = step.length();
    const max = speed * dt;
    if (d > max) step.multiplyScalar(max / d);
    // Ease in: a big whale does not jerk.
    root.position.addScaledVector(step, w.state === 'away' ? 1 : Math.min(1, dt * 3 + 0.2));
    root.quaternion.slerp(facing, Math.min(1, dt * 1.5));
    if (w.state === 'sing') root.position.y += Math.sin(w.t * 6) * 0.02;
    if (w.notesLeft > 0) {
      w.notesLeft = Math.max(0, w.notesLeft - dt);
      if (Math.floor((w.notesLeft + dt) * 2) !== Math.floor(w.notesLeft * 2)) {
        this.noteState.push({ at: WHALE_BLOWHOLE.clone().applyQuaternion(root.quaternion).add(root.position), t: 0 });
      }
    }
  }

  private setWhale(id: string, state: WhaleVisual['state']): void {
    const w = this.whales.get(id);
    if (!w) return;
    if (w.state === state) return;
    const was = w.state;
    w.state = state;
    w.t = 0;
    if (state === 'sing') w.notesLeft = 1.6;
    if (state !== 'away') {
      w.material.opacity = 1;
      w.root.visible = true;
    }
    // Put back home at once after a rewind (idle from away/follow), or beside the train (follow from idle/away).
    if (state === 'idle' && was !== 'sing') {
      w.root.position.copy(w.home);
      w.root.quaternion.copy(w.homeQuat);
    }
    for (const c of this.currents) if (c.whale === id) c.want = state === 'follow' || state === 'sing' ? 1 : 0;
  }

  // ---- the spouting whale (a jump pad) ----

  private addPad(index: number, railId: string, at: number): void {
    const rail = this.stage.network.getRail(railId);
    const f = rail.frameAt(at);
    // It waits in the water just past the pad, facing back along the track, its blowhole a little past the pad.
    const ahead = rail.frameAt(Math.min(rail.length, at + 16));
    const water = this.stage.file.environment.water?.[0]?.y ?? f.position.y - 2;
    const facing = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), ahead.tangent.clone().setY(0).normalize().negate());
    const up = new Vector3(ahead.position.x, water - 4.2, ahead.position.z);
    const deep = up.clone().add(new Vector3(0, -7, 0));
    const w = this.makeWhale(`pad-${index}`);
    w.root.position.copy(deep);
    w.root.quaternion.copy(facing);
    this.pads.set(index, { index, root: w.root, tail: w.tail, deep, up, spout: f.position.clone(), left: 0, railId, at });
  }

  // ---- the current ----

  private addCurrent(index: number, railId: string, from: number, to: number, whale: string | null, models: ModelLibrary): void {
    const rail = this.stage.network.getRail(railId);
    const frames: RailFrame[] = [];
    for (let s = from; s <= to; s += 1) frames.push(rail.frameAt(s));
    const ringMaterial = new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false });
    const ringSpots = frames.filter((_, i) => i % 14 === 6);
    const rings = new InstancedMesh(new BufferGeometry(), ringMaterial, ringSpots.length);
    rings.name = 'current-rings';
    void models.load('current-ring').then((template) => {
      const src = sourceMeshes(template)[0];
      if (!src) return;
      rings.geometry = src.mesh.geometry;
      const basis = new Matrix4();
      ringSpots.forEach((fr, i) => {
        basis.makeBasis(fr.right.clone().negate(), fr.up, fr.tangent).setPosition(fr.position);
        rings.setMatrixAt(i, basis.multiply(src.matrix));
      });
      rings.instanceMatrix.needsUpdate = true;
      rings.computeBoundingSphere();
    });
    const positions = new Float32Array(STREAM_POINTS * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const stream = new Points(
      geometry,
      new PointsMaterial({ color: '#e8f8ff', size: 0.5, map: this.bubble, transparent: true, depthWrite: false, opacity: 0 }),
    );
    stream.name = 'current-stream';
    stream.frustumCulled = false;
    const a = frames[0].position;
    const b = frames[frames.length - 1].position;
    geometry.boundingSphere = new Sphere(a.clone().add(b).multiplyScalar(0.5), a.distanceTo(b) / 2 + 60);
    this.group.add(rings, stream);
    this.currents.push({ index, whale, rings, ringMaterial, stream, frames, on: whale ? 0 : 1, want: whale ? 0 : 1, offset: 0 });
  }

  private updateCurrent(c: Current, dt: number): void {
    c.on += (c.want - c.on) * Math.min(1, dt * 2);
    c.ringMaterial.opacity = 0.3 + 0.6 * c.on;
    const material = c.stream.material as PointsMaterial;
    material.opacity = 0.9 * c.on;
    c.stream.visible = c.on > 0.02;
    if (!c.stream.visible) return;
    c.offset = (c.offset + dt * STREAM_SPEED * c.on) % c.frames.length;
    const pos = c.stream.geometry.getAttribute('position') as Float32BufferAttribute;
    const n = c.frames.length;
    for (let i = 0; i < STREAM_POINTS; i++) {
      const k = Math.floor((hash(i) * n + c.offset) % n);
      const fr = c.frames[k];
      const lateral = (hash(i + 500) - 0.5) * 5;
      const up = 0.6 + hash(i + 900) * 4.2 + Math.sin(this.time * 2 + i) * 0.15;
      this.v.copy(fr.position).addScaledVector(fr.right, lateral).addScaledVector(fr.up, up);
      pos.setXYZ(i, this.v.x, this.v.y, this.v.z);
    }
    pos.needsUpdate = true;
  }

  // ---- bubble forks ----

  private addFork(j: JunctionDef): void {
    const b = j.bubbles;
    if (!b || !j.left || !j.right) return;
    const net = this.stage.network;
    const main = net.getRail(j.railId);
    // Which way the side track turns (its 28 m point from the main line's 28 m point, across the main line).
    const branchSide: 'left' | 'right' = j.left === j.railId ? 'right' : 'left';
    const branch = net.getRail(j[branchSide] as string);
    const pm = main.frameAt(Math.min(main.length, j.at + 28));
    const pb = branch.frameAt(Math.min(branch.length, 28)).position;
    const turn = Math.sign(pb.clone().sub(pm.position).dot(pm.right)) || 1;
    for (const d of [12, 28]) {
      const fm = main.frameAt(Math.min(main.length, j.at + d));
      const fb = branch.frameAt(Math.min(branch.length, d));
      const onMain = fm.position.clone().addScaledVector(fm.right, -turn * COLUMN_LATERAL);
      const onBranch = fb.position.clone().addScaledVector(fb.right, turn * COLUMN_LATERAL);
      const mainSide: 'left' | 'right' = branchSide === 'left' ? 'right' : 'left';
      this.columns.push({ base: onMain.setY(this.floorY), kind: b[mainSide], fork: j.id });
      this.columns.push({ base: onBranch.setY(this.floorY), kind: b[branchSide], fork: j.id });
    }
  }

  private buildColumns(): void {
    const rising = this.columns.filter((c) => c.kind === 'rise');
    if (rising.length > 0) {
      const mesh = new InstancedMesh(
        new SphereGeometry(1, 10, 7),
        new MeshLambertMaterial({ color: '#ffffff', emissive: new Color('#9fdcf2'), emissiveIntensity: 0.35, transparent: true, opacity: 0.85 }),
        rising.length * COLUMN_BUBBLES,
      );
      mesh.name = 'bubbles-rise';
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      const white = new Color('#ffffff');
      const blue = new Color('#9fddf5');
      for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, i % 3 === 0 ? blue : white);
      mesh.boundingSphere = this.boundsOf(rising);
      this.rise = mesh;
      this.group.add(mesh);
    }
    const swirl = swirlTexture();
    for (const fork of new Set(this.columns.filter((c) => c.kind === 'sink').map((c) => c.fork))) {
      const cols = this.columns.filter((c) => c.kind === 'sink' && c.fork === fork);
      const material = new MeshLambertMaterial({ color: '#f7a8d8', map: swirl, emissive: new Color('#000000'), emissiveMap: swirl, transparent: true, opacity: 0.9 });
      const mesh = new InstancedMesh(new SphereGeometry(1, 10, 6), material, cols.length * COLUMN_BUBBLES);
      mesh.name = `bubbles-sink:${fork}`;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.boundingSphere = this.boundsOf(cols);
      this.sinks.set(fork, { mesh, columns: cols, material });
      this.group.add(mesh);
    }
  }

  private boundsOf(cols: BubbleColumn[]): Sphere {
    const c = new Vector3();
    for (const col of cols) c.add(col.base);
    c.multiplyScalar(1 / cols.length);
    let r = 0;
    for (const col of cols) r = Math.max(r, c.distanceTo(col.base));
    c.y += COLUMN_HEIGHT / 2;
    return new Sphere(c, r + COLUMN_HEIGHT);
  }

  private updateColumns(): void {
    const place = (mesh: InstancedMesh, cols: BubbleColumn[], sink: boolean): void => {
      let n = 0;
      cols.forEach((col, ci) => {
        for (let i = 0; i < COLUMN_BUBBLES; i++) {
          // Each bubble on its own lane round the column, its own start; rising ones speed up a little, sinking ones
          // drift down slowly and squash into the sand ("ぽすっ").
          const k = (this.time / (sink ? 7 : 4.5) + i / COLUMN_BUBBLES + ci * 0.37) % 1;
          const a = i * 2.39996 + ci;
          const r = 0.4 + 0.9 * hash(i * 7 + ci);
          const y = sink ? COLUMN_HEIGHT * (1 - k) : COLUMN_HEIGHT * (k * (0.7 + 0.3 * k));
          const wobble = Math.sin(this.time * 2.2 + i) * 0.25;
          this.v.set(col.base.x + Math.cos(a) * r + wobble, col.base.y + 0.3 + y, col.base.z + Math.sin(a) * r);
          const size = sink ? 0.55 + 0.25 * hash(i + ci * 13) : (0.22 + 0.3 * hash(i + ci * 11)) * (0.7 + 0.6 * k);
          const squash = sink && k > 0.93 ? 1 - (k - 0.93) / 0.07 : 1;
          const fade = sink ? Math.min(1, k * 8) : Math.min(1, k * 8) * Math.min(1, (1 - k) * 6);
          // The sinking ones turn slowly, so their swirl goes round.
          this.q.setFromAxisAngle(Y_AXIS, sink ? this.time * 1.2 + i : 0);
          this.s.set(size * fade, size * fade * squash, size * fade);
          this.m.compose(this.v, this.q, this.s);
          mesh.setMatrixAt(n++, this.m);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    if (this.rise) place(this.rise, this.columns.filter((c) => c.kind === 'rise'), false);
    for (const sink of this.sinks.values()) place(sink.mesh, sink.columns, true);
  }

  private reveal(fork: string | null): void {
    for (const [id, sink] of this.sinks) {
      const on = id === fork;
      sink.material.emissive.set(on ? '#ff4fb4' : '#000000');
      sink.material.color.set(on ? '#ffc8ea' : '#f7a8d8');
    }
  }

  // ---- the deep place's motes ----

  private addMotes(railId: string, from: number, to: number): void {
    const rail = this.stage.network.getRail(railId);
    const positions = new Float32Array(MOTES * 3);
    for (let i = 0; i < MOTES; i++) {
      const f = rail.frameAt(from + hash(i) * (to - from));
      const p = f.position.clone().addScaledVector(f.right, (hash(i + 300) - 0.5) * 50);
      positions.set([p.x, this.floorY + 1 + hash(i + 600) * 11, p.z], i * 3);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();
    const motes = new Points(
      geometry,
      new PointsMaterial({ color: '#9fe8ff', size: 0.35, map: this.bubble, transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false }),
    );
    motes.name = 'deep-motes';
    this.group.add(motes);
  }

  // ---- events and the frame ----

  onEvent(event: StageEvent): void {
    if (event.type === 'whale') this.setWhale(event.id, event.state);
    if (event.type === 'bubbles:reveal') this.reveal(event.junctionId);
    if (event.type === 'bubbles:reset') this.reveal(null);
    if (event.type === 'pad') {
      const pad = this.pads.get(event.index);
      if (pad) pad.left = event.visible ? (event.seconds ?? 8) : 0;
    }
    if (event.type === 'jump') {
      // The train leaves a whale's back: the spout goes up under it.
      for (const pad of this.pads.values()) {
        if (pad.left <= 0 || this.train.position.distanceTo(pad.spout) > 16) continue;
        this.spoutT = 0;
        this.spoutAt.copy(pad.spout);
      }
    }
    if (event.type === 'pop') {
      const at = (event.id ? this.figureAt(event.id) : null) ?? null;
      if (!at) return;
      this.sprayAt.copy(at);
      this.sprayT = 0;
    }
  }

  update(dt: number): void {
    this.time += dt;
    SEA_TIME.value = this.time;
    for (const w of this.whales.values()) this.updateWhale(w, dt);
    for (const pad of this.pads.values()) {
      if (pad.left > 0) pad.left = Math.max(0, pad.left - dt);
      // Up while shown (sinking slowly in its last two seconds), down again after.
      const k = pad.left <= 0 ? 0 : Math.min(1, pad.left / 2);
      const target = pad.deep.clone().lerp(pad.up, k);
      pad.root.position.lerp(target, Math.min(1, dt * (pad.left > 2 ? 2.5 : 1)));
      pad.tail.rotation.x = Math.sin(this.time * 1.4) * 0.22;
    }
    for (const c of this.currents) this.updateCurrent(c, dt);
    if (this.rise || this.sinks.size > 0) this.updateColumns();
    this.updateSpray(dt);
    this.updateSpout(dt);
    this.updateNotes(dt);
  }

  private updateSpray(dt: number): void {
    if (this.sprayT < 0) return;
    this.sprayT += dt;
    const k = this.sprayT / SPRAY_SECONDS;
    this.spray.visible = k < 1;
    if (k >= 1) {
      this.sprayT = -1;
      return;
    }
    for (let i = 0; i < SPRAY; i++) {
      const dir = new Vector3(hash(i) - 0.5, hash(i + 40) - 0.3, hash(i + 80) - 0.5).normalize();
      this.v.copy(this.sprayAt).addScaledVector(dir, 1.5 + 4 * Math.sqrt(k)).add(new Vector3(0, 2.5 + k * 1.5, 0));
      this.s.setScalar((0.15 + 0.2 * hash(i + 120)) * (1 - k));
      this.m.compose(this.v, this.q.identity(), this.s);
      this.spray.setMatrixAt(i, this.m);
    }
    this.spray.instanceMatrix.needsUpdate = true;
  }

  private updateSpout(dt: number): void {
    if (this.spoutT < 0) return;
    this.spoutT += dt;
    const k = this.spoutT / SPOUT_SECONDS;
    this.spout.visible = k < 1;
    if (k >= 1) {
      this.spoutT = -1;
      return;
    }
    for (let i = 0; i < SPOUT; i++) {
      const u = (i / SPOUT + k * 1.5) % 1;
      const a = i * 2.4;
      this.v.set(this.spoutAt.x + Math.cos(a) * (0.6 + u * 2.2), this.spoutAt.y - 1 + u * 10, this.spoutAt.z + Math.sin(a) * (0.6 + u * 2.2));
      this.s.setScalar((0.9 + u * 0.9) * (1 - k * 0.6));
      this.m.compose(this.v, this.q.identity(), this.s);
      this.spout.setMatrixAt(i, this.m);
    }
    this.spout.instanceMatrix.needsUpdate = true;
  }

  /** The whale's song: round glowing bubbles floating up from its blowhole. */
  private updateNotes(dt: number): void {
    const notes = this.notes;
    if (!notes) return;
    for (const n of this.noteState) n.t += dt;
    while (this.noteState.length > 0 && this.noteState[0].t > 3) this.noteState.shift();
    notes.visible = this.noteState.length > 0;
    if (!notes.visible) return;
    notes.count = Math.min(9, this.noteState.length);
    for (let i = 0; i < notes.count; i++) {
      const n = this.noteState[this.noteState.length - 1 - i];
      this.v.copy(n.at).add(new Vector3(Math.sin(n.t * 2 + i) * 0.6, n.t * 2.2, 0));
      this.s.setScalar(0.45 * Math.min(1, n.t * 3) * Math.max(0, 1 - n.t / 3));
      this.m.compose(this.v, this.q.identity(), this.s);
      notes.setMatrixAt(i, this.m);
    }
    notes.instanceMatrix.needsUpdate = true;
  }
}
