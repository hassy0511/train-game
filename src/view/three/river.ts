import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  RepeatWrapping,
  Vector3,
} from 'three';
import type { StageEvent } from '../../core/stage-events';
import { curtainOut, waterfalls, type Waterfall } from '../../gimmick/waterfall';
import type { StageData } from '../../stage/types';
import { WATERFALL } from '../../train/params';

/**
 * 3-2 "たきのかわ" in the scene (PHASE8 第 4 部 §8): the waterfalls. Each one is a curtain of water (one curved sheet
 * with white streaks running down it), foam where it lands, a drifting spray and, when asked for, a rainbow in front.
 * Four draw calls per waterfall at most; all see-through things draw last without writing depth.
 */

/** The curtain's columns across (one every this many metres) and its rows down. */
const COLUMN_STEP = 4;
const ROWS = 8;
/** Foam and spray points per waterfall. */
const FOAM = 300;
const SPRAY = 150;
/** How fast the streaks run down (texture repeats per second). */
const STREAK_SPEED = 0.9;

interface FallVisual {
  fall: Waterfall;
  sheet: Mesh;
  texture: CanvasTexture | null;
  foam: Points;
  spray: Points;
  foamBase: Float32Array;
  sprayBase: Float32Array;
}

export class RiverGimmicks {
  readonly group = new Group();
  private readonly falls: FallVisual[] = [];
  private time = 0;
  private shower = false;

  static wanted(stage: StageData): boolean {
    return stage.file.gimmicks.some((g) => g.type === 'waterfall');
  }

  constructor(stage: StageData) {
    this.group.name = 'river-gimmicks';
    for (const fall of waterfalls(stage.file.gimmicks, stage.file.environment.water ?? [])) this.addFall(fall);
  }

  private addFall(fall: Waterfall): void {
    // The curtain: columns along the lip, rows down its fall, bending out as it falls.
    const cols = Math.max(2, Math.ceil(fall.length / COLUMN_STEP));
    const pos: number[] = [];
    const uv: number[] = [];
    const index: number[] = [];
    for (let r = 0; r <= ROWS; r++) {
      const v = r / ROWS;
      const y = fall.top - (fall.top - fall.bottom) * v;
      const out = curtainOut(fall, y);
      for (let c = 0; c <= cols; c++) {
        const t = (c / cols) * fall.length;
        const p = fall.a.clone().addScaledVector(fall.along, t).addScaledVector(fall.out, out).setY(y);
        pos.push(p.x, p.y, p.z);
        uv.push((t / 6) % 1e6, 1 - v);
      }
    }
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * (cols + 1) + c;
        index.push(i, i + cols + 1, i + 1, i + 1, i + cols + 1, i + cols + 2);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const texture = streakTexture();
    if (texture) {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.repeat.set(1, 1.5);
    }
    const sheet = new Mesh(
      geometry,
      new MeshBasicMaterial({ color: '#f4fbff', map: texture, transparent: true, opacity: WATERFALL.sheetOpacity + 0.2, side: DoubleSide, depthWrite: false }),
    );
    sheet.name = 'waterfall-curtain';
    sheet.renderOrder = 4;
    this.group.add(sheet);

    // Foam where the water lands, and a spray drifting over it.
    const foamBase = new Float32Array(FOAM * 3);
    for (let i = 0; i < FOAM; i++) {
      const t = hash(i) * fall.length;
      // v1.11 (6-1): an upward fall's foam is at its top, where the water "lands".
      const p = fall.a.clone().addScaledVector(fall.along, t).addScaledVector(fall.out, fall.throw + (hash(i + 900) - 0.3) * 4).setY(fall.up ? fall.top : fall.bottom + 0.2);
      foamBase.set([p.x, p.y, p.z], i * 3);
    }
    const foam = points(foamBase, '#ffffff', 0.9, 0.9);
    foam.name = 'waterfall-foam';
    this.group.add(foam);
    const sprayBase = new Float32Array(SPRAY * 3);
    for (let i = 0; i < SPRAY; i++) {
      const t = hash(i + 50) * fall.length;
      const p = fall.a.clone().addScaledVector(fall.along, t).addScaledVector(fall.out, fall.throw + hash(i + 400) * 10).setY(fall.up ? fall.top + hash(i + 700) * 5 : fall.bottom + hash(i + 700) * 5);
      sprayBase.set([p.x, p.y, p.z], i * 3);
    }
    const spray = points(sprayBase, '#eaf6ff', 2.4, 0.35);
    spray.name = 'waterfall-spray';
    this.group.add(spray);
    this.falls.push({ fall, sheet, texture, foam, spray, foamBase, sprayBase });

    if (fall.rainbow) this.group.add(rainbow(fall));
  }

  onEvent(event: StageEvent): void {
    if (event.type === 'shower') this.shower = event.on;
  }

  /** True while the train is under a waterfall (test hook for the view). */
  get showering(): boolean {
    return this.shower;
  }

  update(dt: number): void {
    this.time += dt;
    for (const f of this.falls) {
      // v1.11 (6-1): an upward fall's streaks run up.
      if (f.texture) f.texture.offset.y = ((f.fall.up ? -1 : 1) * this.time * STREAK_SPEED) % 1;
      jiggle(f.foam, f.foamBase, this.time, 0.6, 1.6);
      jiggle(f.spray, f.sprayBase, this.time * 0.4, 2.5, 1.2);
    }
  }
}

/** A cloud of soft round points (additive where `glow`). */
function points(base: Float32Array, color: string, size: number, opacity: number): Points {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(base.slice(), 3));
  geometry.computeBoundingSphere();
  const p = new Points(geometry, new PointsMaterial({ color, size, map: dotTexture(), transparent: true, opacity, depthWrite: false }));
  p.renderOrder = 4;
  return p;
}

/** Moves each point a little round where it belongs (up and down more than sideways): foam boiling, spray drifting. */
function jiggle(p: Points, base: Float32Array, t: number, side: number, up: number): void {
  const pos = p.geometry.getAttribute('position');
  const arr = pos.array as Float32Array;
  for (let i = 0; i < arr.length; i += 3) {
    const k = i / 3;
    arr[i] = base[i] + Math.sin(t * 1.7 + k) * side * 0.3;
    arr[i + 1] = base[i + 1] + Math.abs(Math.sin(t * 2.3 + k * 1.3)) * up;
    arr[i + 2] = base[i + 2] + Math.cos(t * 1.3 + k * 0.7) * side * 0.3;
  }
  pos.needsUpdate = true;
}

/** A rainbow standing in the spray in front of the falls: a half ring of soft colour bands, added to the picture. */
function rainbow(fall: Waterfall): Mesh {
  const bands = ['#ff8c8c', '#ffc46b', '#fff27a', '#8fe38f', '#7fc8ff', '#b79cff'];
  const inner = fall.length * 0.22;
  const width = 1.4;
  const pos: number[] = [];
  const col: number[] = [];
  const segments = 32;
  const centre = fall.a.clone().addScaledVector(fall.along, fall.length * 0.55).addScaledVector(fall.out, fall.throw + 14).setY(fall.bottom);
  bands.forEach((hex, b) => {
    const c = new Color(hex);
    const r0 = inner + b * width;
    const r1 = r0 + width;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI;
      const a1 = ((i + 1) / segments) * Math.PI;
      const at = (r: number, a: number): Vector3 => centre.clone().addScaledVector(fall.along, Math.cos(a) * r).setY(centre.y + Math.sin(a) * r * 0.6);
      const quad = [at(r0, a0), at(r1, a0), at(r1, a1), at(r0, a0), at(r1, a1), at(r0, a1)];
      for (const p of quad) {
        pos.push(p.x, p.y, p.z);
        col.push(c.r, c.g, c.b);
      }
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(col, 3));
  geometry.computeBoundingSphere();
  const mesh = new Mesh(
    geometry,
    new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }),
  );
  mesh.name = 'waterfall-rainbow';
  mesh.renderOrder = 5;
  return mesh;
}

let streaks: CanvasTexture | null | undefined;
/** White streaks of falling water, of different widths and brightness, see-through between them (drawn once). */
function streakTexture(): CanvasTexture | null {
  if (streaks !== undefined) return streaks;
  if (typeof document === 'undefined') return (streaks = null);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (!g) return (streaks = null);
  g.fillStyle = 'rgba(210,235,250,0.35)';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    const x = hash(i) * 128;
    const w = 1 + hash(i + 7) * 4;
    const y = hash(i + 13) * 128;
    const len = 30 + hash(i + 29) * 90;
    const grad = g.createLinearGradient(0, y, 0, y + len);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, `rgba(255,255,255,${(0.6 + hash(i + 3) * 0.4).toFixed(2)})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(x, y, w, len);
    // Wrap round so the texture tiles.
    if (y + len > 128) g.fillRect(x, y - 128, w, len);
  }
  return (streaks = new CanvasTexture(canvas));
}

let dot: CanvasTexture | null | undefined;
/** A soft round dot (bright middle, fading edge), drawn once. */
function dotTexture(): CanvasTexture | null {
  if (dot !== undefined) return dot;
  if (typeof document === 'undefined') return (dot = null);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const g = canvas.getContext('2d');
  if (!g) return (dot = null);
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return (dot = new CanvasTexture(canvas));
}

/** A steady pseudo-random number in [0, 1) for `i`. */
function hash(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export { dotTexture };
