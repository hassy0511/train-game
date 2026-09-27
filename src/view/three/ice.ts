import {
  AdditiveBlending,
  AlwaysDepth,
  AlwaysStencilFunc,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  EqualStencilFunc,
  HemisphereLight,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  KeepStencilOp,
  Light,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Path,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  ReplaceStencilOp,
  Scene,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  BoxGeometry,
  type StencilFunc,
  type StencilOp,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { StageEvent } from '../../core/stage-events';
import { thinIceZones, type ThinIceZone } from '../../gimmick/ice';
import { activeMirror, inFront, MIRROR_PLINTH, mirrorDefs, type MirrorDef } from '../../gimmick/mirror';
import type { RailNetwork } from '../../rail/types';
import type { SnowDef, StageData } from '../../stage/types';
import { areaOutline, holeArea } from '../../stage/water';
import { MIRROR, ROCK_ROLL, THIN_ICE, TRAIN } from '../../train/params';
import type { ModelLibrary } from './models';
import { buildTrack } from './rail-mesh';

/**
 * The frozen lake of 4-1 in the scene (PHASE8 第 7 部 §8): flat ice sheets, thin ice that breaks into floes behind a
 * rocket-fast train (and under a slow one, "ぽちゃん", the cars bobbing like a toy boat while a seal peeks out),
 * sparkling ice dust from braking wheels, falling snow, rows of snowbirds crossing the track, and ice mirrors.
 *
 * A mirror shows the train (and the track, the true-way sign and a cutscene's figures near it) folded over its glass,
 * drawn in a second, small pass limited by the stencil to the glass that is seen (no second full render of the
 * scene; only the nearest mirror). Nothing here is dark or cold-looking: white, pale blue and soft lilac.
 */

/** Layer of the things drawn only in a mirror's pass (and of the lights, which that pass needs too). */
export const REFLECT_LAYER = 5;

const ICE_SHEET_COLOR = '#CFEAF6';
const CRACK_COLOR = '#F4FBFF';
const RIM_COLOR = '#FBFDFF';
const THIN_COLOR = '#8CC3E0';
const OPEN_WATER = '#6CC3E6';
const FLOE_COLOR = '#EAF7FD';
const MIRROR_FRAME = '#D8F0FB';
const MIRROR_FRAME_DEEP = '#AFDBF0';
const MIRROR_TOP = '#9FD3F2';
const MIRROR_BOTTOM = '#F4F9FD';
const FLOES = 12;
/** The ground seen in a mirror. */
const GHOST_GROUND = '#E4EFF6';
/** A snowy stage's light from below (the hemisphere light's ground colour). */
const SNOW_BOUNCE = '#DCE8F2';
/** Thin ice drawn this far each side of the rail (m). */
const THIN_HALF_WIDTH = 5;
const SPARKLES = 48;
const BIRDS_PER_ROW = 5;
const BIRD_SPACING = 1.3;

/** Reflection across a vertical plane through `point` with unit normal `n`. */
function reflection(n: Vector3, point: Vector3): Matrix4 {
  const d = point.dot(n);
  const { x, y, z } = n;
  return new Matrix4().set(
    1 - 2 * x * x, -2 * x * y, -2 * x * z, 2 * d * x,
    -2 * x * y, 1 - 2 * y * y, -2 * y * z, 2 * d * y,
    -2 * x * z, -2 * y * z, 1 - 2 * z * z, 2 * d * z,
    0, 0, 0, 1,
  );
}

/** A soft round dot (snow, sparkles), drawn once. */
function dotTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}

/** A four-pointed star with a soft glow ("きらーん"), drawn once. */
function starTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  const glow = g.createRadialGradient(64, 64, 0, 64, 64, 60);
  glow.addColorStop(0, 'rgba(255,255,240,1)');
  glow.addColorStop(0.25, 'rgba(255,248,200,0.6)');
  glow.addColorStop(1, 'rgba(255,248,200,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
  ]) {
    g.beginPath();
    g.moveTo(64 - dx * 62, 64 - dy * 62);
    g.lineTo(64 + dy * 6, 64 + dx * 6);
    g.lineTo(64 + dx * 62, 64 + dy * 62);
    g.lineTo(64 - dy * 6, 64 - dx * 6);
    g.closePath();
    g.fill();
  }
  return new CanvasTexture(c);
}

/** Paints a geometry one colour (a `color` attribute), non-indexed, without uv. */
function paint(geometry: BufferGeometry, color: string | Color): BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  const c = new Color(color);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

function mergeAll(parts: BufferGeometry[]): BufferGeometry | null {
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  merged?.computeBoundingSphere();
  return merged;
}

/** A steady pseudo-random number in [0, 1) for `i`. */
function hash(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** A thin flat quad from a to b (world x, z) at height y, `w` wide, facing up. */
function flatBar(a: [number, number], b: [number, number], w: number, y: number): number[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = (-(b[1] - a[1]) / len) * (w / 2);
  const nz = ((b[0] - a[0]) / len) * (w / 2);
  const p = [
    [a[0] + nx, a[1] + nz],
    [b[0] + nx, b[1] + nz],
    [b[0] - nx, b[1] - nz],
    [a[0] - nx, a[1] - nz],
  ];
  // Wound to face up (counter-clockwise seen from above is x → −z here, so pick by the cross product).
  const tri = (i: number, j: number, k: number): number[] => {
    const [p0, p1, p2] = [p[i], p[j], p[k]];
    const cross = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
    const [q, r] = cross <= 0 ? [p1, p2] : [p2, p1];
    return [p0[0], y, p0[1], q[0], y, q[1], r[0], y, r[1]];
  };
  return [...tri(0, 1, 2), ...tri(0, 2, 3)];
}

/** One stretch of thin ice as drawn: its overlay, what has broken of it, and the time since the train got across. */
interface ThinVisual {
  zone: ThinIceZone;
  overlay: Mesh;
  material: MeshLambertMaterial;
  broken: { value: [number, number] };
  /** Seconds since the last bogie got across (−1 = not across); at THIN_ICE.refreeze it freezes again. */
  clearT: number;
  /** Frozen again after a crossing: it stays whole until the train is put back before it. */
  refrozen: boolean;
  /** Broken from / to (m along the rail); from > to = whole. */
  from: number;
  to: number;
}

/** A row of snowbirds (a "rock-roll" actor with look "snowbird"). */
interface BirdRow {
  id: string;
  railId: string;
  at: number;
  lateral: number;
  mode: 'wait' | 'wobble' | 'walk' | 'done' | 'flap';
  t: number;
  seconds: number;
  slot: number;
}

/** What one mirror has in the scene. */
interface MirrorVisual {
  def: MirrorDef;
  /** Its glass's plane (a little in front of the frame) and the reflection across it. */
  reflect: Matrix4;
  /** Seen from afar (not reflecting): a plain icy glass. */
  far: Mesh;
  mask: Mesh;
  backdrop: Mesh;
  /** Drawn in the mirror pass, over the reflection: the pale blue glass and its sparkling band. */
  tint: Mesh;
  tintMaterial: ShaderMaterial;
  /** Things near it, already folded over the glass (built the first time it reflects). */
  ghosts: Group | null;
}

const backdropVertex = `
varying float vH;
void main() {
  vH = uv.y;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // As far away as can be: the reflection is drawn over it with the usual depth rule.
  p.z = p.w * 0.99999;
  gl_Position = p;
}
`;
const backdropFragment = `
uniform vec3 topColor;
uniform vec3 bottomColor;
varying float vH;
void main() {
  gl_FragColor = vec4(mix(bottomColor, topColor, smoothstep(0.1, 0.9, vH)), 1.0);
}
`;
const tintVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const tintFragment = `
uniform float tint;
uniform float time;
uniform float wave;
varying vec2 vUv;
void main() {
  // A slanted band of light sliding across now and then, and a brighter wave when the true way was found.
  float d = vUv.x + vUv.y * 0.6;
  float band = smoothstep(0.08, 0.0, abs(fract(d * 0.5 - time * 0.12) - 0.5) - 0.02) * 0.18;
  float w = wave > 0.0 ? smoothstep(0.12, 0.0, abs(d - (1.0 - wave) * 1.8 + 0.1)) * 0.6 * wave : 0.0;
  gl_FragColor = vec4(vec3(0.82, 0.94, 1.0), tint + band + w);
}
`;

export class IceGimmicks {
  readonly group = new Group();
  private readonly thin: ThinVisual[] = [];
  private floes: InstancedMesh | null = null;
  private readonly floeState: { x: number; z: number; y: number; turn: number; size: number; phase: number }[] = [];
  private openWater: Mesh | null = null;
  private snow: Points | null = null;
  private snowDef: SnowDef | null = null;
  private snowSpeed: Float32Array | null = null;
  private sparkles: Points | null = null;
  private readonly sparkleLife = new Float32Array(SPARKLES);
  private readonly sparkleVel: Vector3[] = Array.from({ length: SPARKLES }, () => new Vector3());
  private sparkling = false;
  private sparkleClock = 0;
  private birds: InstancedMesh | null = null;
  private readonly rows: BirdRow[] = [];
  private readonly mirrors: MirrorVisual[] = [];
  private active: MirrorVisual | null = null;
  private star: Sprite | null = null;
  private starFlash = 0;
  private lightOn = false;
  private readonly revealWave = new Map<number, number>();
  private lightsLayered = false;
  /** "ぽちゃん": seconds since it broke under the train (−1 = not now), the place, and the seal peeking out. */
  private crackT = -1;
  private readonly crackAt = new Vector3();
  private seal: Object3D | null = null;
  private ring: Mesh | null = null;
  private time = 0;
  private readonly m = new Matrix4();
  private readonly v = new Vector3();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();

  constructor(
    private readonly stage: StageData,
    private readonly train: Object3D,
  ) {
    this.group.name = 'ice-gimmicks';
    const file = stage.file;
    for (const g of file.gimmicks) if (g.type === 'ice-sheet') this.addSheet(g.params ?? {});
    for (const z of thinIceZones(file.gimmicks)) this.addThin(z);
    if (this.thin.length > 0) this.addFloes();
    if (file.environment.snow && file.environment.snow.count > 0) this.addSnow(file.environment.snow);
    for (const m of mirrorDefs(file.gimmicks)) this.addMirror(m);
    this.addSparkles();
  }

  async init(models: ModelLibrary): Promise<void> {
    const rows = this.stage.actors.filter((a) => a.type === 'rock-roll' && a.onRail && (a.params as { look?: string }).look === 'snowbird');
    if (rows.length > 0) {
      const bird = await models.load('snowbird');
      const mesh = bird.getObjectByProperty('isMesh', true) as Mesh | undefined;
      if (mesh) {
        this.birds = new InstancedMesh(mesh.geometry, mesh.material as Material, rows.length * BIRDS_PER_ROW);
        this.birds.name = 'snowbirds';
        this.birds.instanceMatrix.setUsage(DynamicDrawUsage);
        this.birds.frustumCulled = false;
        this.group.add(this.birds);
        rows.forEach((a, slot) => {
          const lateral = Number((a.params as { lateral?: number }).lateral ?? ROCK_ROLL.lateral);
          this.rows.push({ id: a.id, railId: a.onRail!.railId, at: a.onRail!.at, lateral, mode: 'wait', t: 0, seconds: 1, slot });
        });
      }
    }
    if (this.thin.length > 0) {
      const seal = (await models.load('seal')).clone(true);
      seal.name = 'crack-seal';
      seal.visible = false;
      this.seal = seal;
      this.group.add(seal);
    }
  }

  // ---- building ----

  /** A flat sheet of ice (gimmick "ice-sheet"), with holes where an ice-covered water is (it draws its own ice). */
  private addSheet(p: Record<string, unknown>): void {
    const outline = p.outline as [number, number][] | undefined;
    if (!outline || outline.length < 3) return;
    const y = typeof p.y === 'number' ? p.y : 0.02;
    const color = typeof p.color === 'string' ? p.color : ICE_SHEET_COLOR;
    // Shapes are drawn in (x, −z), which seen from above keeps their winding.
    const shape = new Shape(outline.map(([x, z]) => new Vector2(x, -z)));
    for (const w of this.stage.file.environment.water ?? []) {
      if (w.look === 'ice' && w.holes?.length && w.area) shape.holes.push(new Path(areaOutline(w.area).map(([x, z]) => new Vector2(x, -z))));
    }
    const geometry = new ShapeGeometry(shape);
    const pos = geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i), y, -pos.getY(i));
    geometry.deleteAttribute('uv');
    geometry.deleteAttribute('normal');
    geometry.computeVertexNormals();
    const parts: BufferGeometry[] = [paint(geometry, color)];
    // Faint cracks: short zig-zag white lines scattered over the sheet (inside its outline).
    const xs = outline.map((q) => q[0]);
    const zs = outline.map((q) => q[1]);
    const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const inside = (x: number, z: number): boolean => {
      let c = false;
      for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
        const [xi, zi] = outline[i];
        const [xj, zj] = outline[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
      }
      return c;
    };
    const cracks: number[] = [];
    for (let i = 0; i < 160; i++) {
      let x = minX + hash(i * 3.1) * (maxX - minX);
      let z = minZ + hash(i * 7.7 + 1) * (maxZ - minZ);
      if (!inside(x, z)) continue;
      let a = hash(i * 1.3) * Math.PI * 2;
      for (let k = 0; k < 3; k++) {
        const len = 6 + hash(i * 5 + k) * 10;
        const nx = x + Math.cos(a) * len;
        const nz = z + Math.sin(a) * len;
        if (!inside(nx, nz)) break;
        cracks.push(...flatBar([x, z], [nx, nz], 0.18, y + 0.01));
        x = nx;
        z = nz;
        a += (hash(i * 11 + k) - 0.5) * 1.6;
      }
    }
    if (cracks.length) {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(cracks, 3));
      parts.push(paint(g, CRACK_COLOR));
    }
    // A snowy rim along the shore.
    const rim: number[] = [];
    for (let i = 0; i < outline.length; i++) rim.push(...flatBar(outline[i], outline[(i + 1) % outline.length], 3, y + 0.03));
    const rg = new BufferGeometry();
    rg.setAttribute('position', new Float32BufferAttribute(rim, 3));
    parts.push(paint(rg, RIM_COLOR));
    const merged = mergeAll(parts);
    if (!merged) return;
    // Both sides: from under the water (a dive through a hole) the ice is a bright ceiling.
    // Lit a little from within, so the ice stays a bright pale blue in any light (never a cold grey).
    const mesh = new Mesh(
      merged,
      new MeshLambertMaterial({ vertexColors: true, side: DoubleSide, emissive: new Color(color).multiplyScalar(0.35), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    );
    mesh.name = 'ice-sheet';
    this.group.add(mesh);
  }

  /** The deeper blue band of a thin-ice stretch, with white cracks; a shader hides what has broken. */
  private addThin(zone: ThinIceZone): void {
    const rail = this.stage.network.getRail(zone.railId);
    const positions: number[] = [];
    const colors: number[] = [];
    const along: number[] = [];
    const base = new Color(THIN_COLOR);
    const crack = new Color(CRACK_COLOR);
    const step = 2;
    const from = zone.from - 1;
    const to = zone.to + 1;
    const point = (s: number, lateral: number): Vector3 => {
      const f = rail.frameAt(s);
      return f.position.clone().addScaledVector(f.right, lateral).setY(f.position.y - 0.46);
    };
    const quad = (a: Vector3, b: Vector3, c: Vector3, d: Vector3, sa: number, sb: number, color: Color): void => {
      // a, b at sa (left, right), c, d at sb (right, left): wound to face up.
      for (const [p, sv] of [
        [a, sa],
        [d, sb],
        [b, sa],
        [b, sa],
        [d, sb],
        [c, sb],
      ] as [Vector3, number][]) {
        positions.push(p.x, p.y, p.z);
        colors.push(color.r, color.g, color.b);
        along.push(sv);
      }
    };
    for (let s = from; s < to - 1e-6; s += step) {
      const e = Math.min(to, s + step);
      quad(point(s, -THIN_HALF_WIDTH), point(s, THIN_HALF_WIDTH), point(e, THIN_HALF_WIDTH), point(e, -THIN_HALF_WIDTH), s, e, base);
    }
    // White cracks: zig-zags along and across the band, a little above it.
    for (let k = 0; k < Math.ceil((to - from) / 5); k++) {
      const s0 = from + k * 5 + hash(k * 3 + zone.index) * 3;
      const l0 = (hash(k * 7 + zone.index) - 0.5) * THIN_HALF_WIDTH * 1.6;
      const s1 = Math.min(to, s0 + 3 + hash(k) * 3);
      const l1 = l0 + (hash(k * 13) - 0.5) * 3;
      const a = point(s0, l0).setY(point(s0, l0).y + 0.01);
      const b = point(s1, l1).setY(point(s1, l1).y + 0.01);
      const dir = b.clone().sub(a).normalize();
      const side = new Vector3(-dir.z, 0, dir.x).multiplyScalar(0.09);
      quad(a.clone().sub(side), a.clone().add(side), b.clone().add(side), b.clone().sub(side), s0, s1, crack);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    g.setAttribute('along', new Float32BufferAttribute(along, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const broken = { value: [1, 0] as [number, number] };
    const material = new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.broken = broken;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float along;\nvarying float vAlong;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlong = along;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec2 broken;\nvarying float vAlong;')
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vAlong >= broken.x && vAlong <= broken.y) discard;');
    };
    const overlay = new Mesh(g, material);
    overlay.name = `thin-ice:${zone.index}`;
    overlay.renderOrder = 1;
    this.group.add(overlay);
    this.thin.push({ zone, overlay, material, broken, clearT: -1, refrozen: false, from: 1, to: 0 });
  }

  /** Twelve floes (shared by the stretch breaking now) and the open water under a broken stretch. */
  private addFloes(): void {
    const floe = paint(new BoxGeometry(1, 0.35, 1), FLOE_COLOR);
    this.floes = new InstancedMesh(floe, new MeshLambertMaterial({ vertexColors: true }), FLOES);
    this.floes.name = 'ice-floes';
    this.floes.instanceMatrix.setUsage(DynamicDrawUsage);
    this.floes.frustumCulled = false;
    this.floes.count = 0;
    this.group.add(this.floes);
    for (let i = 0; i < FLOES; i++) this.floeState.push({ x: 0, z: 0, y: 0, turn: hash(i * 3) * Math.PI, size: 1.6 + hash(i * 5) * 1.6, phase: hash(i * 9) * 6 });
    const water = new Mesh(new PlaneGeometry(1, 1), new MeshLambertMaterial({ color: OPEN_WATER, transparent: true, opacity: 0.92, depthWrite: false }));
    water.name = 'thin-ice-water';
    water.rotation.x = -Math.PI / 2;
    water.visible = false;
    water.renderOrder = 0;
    this.openWater = water;
    this.group.add(water);
    const ring = new Mesh(new TorusGeometry(1, 0.25, 6, 24), new MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.9, depthWrite: false }));
    ring.name = 'splash-ring';
    ring.rotation.x = Math.PI / 2;
    ring.visible = false;
    this.ring = ring;
    this.group.add(ring);
  }

  private addSnow(def: SnowDef): void {
    this.snowDef = def;
    const radius = def.radius ?? 60;
    const pos = new Float32Array(def.count * 3);
    this.snowSpeed = new Float32Array(def.count);
    for (let i = 0; i < def.count; i++) {
      pos[i * 3] = (hash(i * 3) - 0.5) * 2 * radius;
      pos[i * 3 + 1] = hash(i * 3 + 1) * radius;
      pos[i * 3 + 2] = (hash(i * 3 + 2) - 0.5) * 2 * radius;
      this.snowSpeed[i] = 0.7 + hash(i * 7) * 0.6;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    (g.getAttribute('position') as Float32BufferAttribute).setUsage(DynamicDrawUsage);
    this.snow = new Points(g, new PointsMaterial({ color: '#FFFFFF', size: 0.35, map: dotTexture(), transparent: true, opacity: 0.9, depthWrite: false }));
    this.snow.name = 'snowfall';
    this.snow.frustumCulled = false;
    this.group.add(this.snow);
  }

  private addSparkles(): void {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(SPARKLES * 3), 3));
    (g.getAttribute('position') as Float32BufferAttribute).setUsage(DynamicDrawUsage);
    this.sparkles = new Points(
      g,
      new PointsMaterial({ color: '#E8F8FF', size: 0.3, map: dotTexture(), transparent: true, opacity: 0.95, depthWrite: false, blending: AdditiveBlending }),
    );
    this.sparkles.name = 'ice-sparkles';
    this.sparkles.frustumCulled = false;
    this.sparkles.visible = false;
    this.group.add(this.sparkles);
  }

  /** An ice mirror: its frame (in the scene), the glass seen from afar, and the stencil window with its backdrop. */
  private addMirror(def: MirrorDef): void {
    const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (def.rotationY * Math.PI) / 180);
    const base = def.position;
    const W = def.width;
    const H = def.height;
    const place = (g: BufferGeometry, x: number, y: number, z: number): BufferGeometry => {
      g.applyMatrix4(new Matrix4().compose(new Vector3(x, y, z).applyQuaternion(turn).add(base), turn, new Vector3(1, 1, 1)));
      return g;
    };
    const B = 1.2;
    const frame = [
      place(paint(new BoxGeometry(W + 2 * B, B, 2.2), MIRROR_FRAME), 0, MIRROR_PLINTH + H + B / 2, -0.9),
      place(paint(new BoxGeometry(B, H, 2.2), MIRROR_FRAME), -(W + B) / 2, MIRROR_PLINTH + H / 2, -0.9),
      place(paint(new BoxGeometry(B, H, 2.2), MIRROR_FRAME), (W + B) / 2, MIRROR_PLINTH + H / 2, -0.9),
      place(paint(new BoxGeometry(W + 2 * B + 1.6, MIRROR_PLINTH, 3.4), RIM_COLOR), 0, MIRROR_PLINTH / 2, -0.6),
      place(paint(new BoxGeometry(W, H, 1.6), MIRROR_FRAME_DEEP), 0, MIRROR_PLINTH + H / 2, -1.0),
    ];
    const frameMesh = new Mesh(mergeAll(frame) ?? new BufferGeometry(), new MeshLambertMaterial({ vertexColors: true, emissive: new Color('#5E7C8C') }));
    frameMesh.name = `mirror-frame:${def.index}`;
    this.group.add(frameMesh);
    const glassAt = new Vector3(0, MIRROR_PLINTH + H / 2, 0.05).applyQuaternion(turn).add(base);
    const glass = (): PlaneGeometry => {
      const g = new PlaneGeometry(W, H);
      g.applyMatrix4(new Matrix4().compose(glassAt, turn, new Vector3(1, 1, 1)));
      return g;
    };
    // From afar: sky over snow in a pale sheen (vertex colours top to bottom).
    const farGeometry = glass();
    const pos = farGeometry.getAttribute('position');
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const k = (pos.getY(i) - (glassAt.y - H / 2)) / H;
      const c = new Color(MIRROR_BOTTOM).lerp(new Color(MIRROR_TOP), k);
      cols.set([c.r, c.g, c.b], i * 3);
    }
    farGeometry.setAttribute('color', new Float32BufferAttribute(cols, 3));
    const far = new Mesh(farGeometry, new MeshBasicMaterial({ vertexColors: true }));
    far.name = `mirror-glass:${def.index}`;
    this.group.add(far);
    // The stencil window: where the glass is seen, mark 1 (nothing drawn)...
    const mask = new Mesh(
      glass(),
      new MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
        transparent: true,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: AlwaysStencilFunc,
        stencilZPass: ReplaceStencilOp,
      }),
    );
    mask.name = `mirror-mask:${def.index}`;
    mask.renderOrder = 900;
    mask.visible = false;
    this.group.add(mask);
    // ...then paint the world behind it there (sky over snow), pushing the depth right back.
    const backdrop = new Mesh(
      glass(),
      new ShaderMaterial({
        uniforms: { topColor: { value: new Color(MIRROR_TOP) }, bottomColor: { value: new Color(MIRROR_BOTTOM) } },
        vertexShader: backdropVertex,
        fragmentShader: backdropFragment,
        transparent: true,
        depthFunc: AlwaysDepth,
        depthWrite: true,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: EqualStencilFunc,
        stencilZPass: KeepStencilOp,
        fog: false,
      }),
    );
    backdrop.name = `mirror-backdrop:${def.index}`;
    backdrop.renderOrder = 901;
    backdrop.visible = false;
    this.group.add(backdrop);
    const tintMaterial = new ShaderMaterial({
      uniforms: { tint: { value: MIRROR.tint }, time: { value: 0 }, wave: { value: 0 } },
      vertexShader: tintVertex,
      fragmentShader: tintFragment,
      transparent: true,
      depthWrite: false,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: EqualStencilFunc,
      stencilZPass: KeepStencilOp,
    });
    const tint = new Mesh(glass(), tintMaterial);
    tint.name = `mirror-tint:${def.index}`;
    tint.renderOrder = 950;
    tint.layers.set(REFLECT_LAYER);
    this.group.add(tint);
    this.mirrors.push({ def, reflect: reflection(def.normal, glassAt), far, mask, backdrop, tint, tintMaterial, ghosts: null });
  }

  /**
   * The things a mirror shows besides the train, folded over its glass once: the track near it (within its
   * reflectRadius and in front of it), and at a mirror junction the sign as it really points ("かがみの中の やじるしは
   * ほんとうの むき").
   */
  private buildGhosts(mv: MirrorVisual, network: RailNetwork): Group {
    const group = new Group();
    group.name = `mirror-ghosts:${mv.def.index}`;
    const def = mv.def;
    const parts: BufferGeometry[] = [];
    for (const rail of network.rails.values()) {
      let from: number | null = null;
      const flush = (to: number): void => {
        if (from === null) return;
        const g = to - from > 2 ? buildTrack(rail, from, to) : null;
        if (g) parts.push(g.applyMatrix4(mv.reflect));
        from = null;
      };
      for (let s = 0; s <= rail.length; s += 5) {
        const p = rail.frameAt(s).position;
        const near = p.distanceTo(def.position) <= def.reflectRadius && inFront(def, p) > 1;
        if (near && from === null) from = s;
        if (!near) flush(s);
      }
      flush(rail.length);
    }
    // The ground in the mirror (a level plane folds onto itself): snow round the reflected place, ice over the lake.
    {
      const r = def.reflectRadius * 1.5;
      const centre = def.position.clone().addScaledVector(def.normal, -r * 0.8);
      const ground = new PlaneGeometry(2 * r, 2 * r);
      ground.rotateX(-Math.PI / 2);
      ground.translate(centre.x, (this.stage.file.environment.ground?.y ?? 0) + 0.02, centre.z);
      const mesh = new Mesh(ground, stencilled(new MeshLambertMaterial({ color: GHOST_GROUND, emissive: new Color(GHOST_GROUND).multiplyScalar(0.3) })));
      mesh.name = 'ghost-ground';
      group.add(mesh);
    }
    const trackGeometry = mergeAll(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
    if (trackGeometry) {
      // A reflection turns the faces inside out: flip them back.
      flipWinding(trackGeometry);
      const mesh = new Mesh(trackGeometry, stencilled(new MeshLambertMaterial({ vertexColors: true })));
      mesh.name = 'ghost-track';
      group.add(mesh);
    }
    // The junction's sign, pointing the true way, standing where its reflection would.
    const j = def.junction ? this.stage.file.junctions.find((x) => x.id === def.junction) : undefined;
    if (j) {
      const rail = network.getRail(j.railId);
      const f = rail.frameAt(Math.max(0, j.at - 12));
      const at = f.position.clone().addScaledVector(f.right, -3.4).applyMatrix4(mv.reflect);
      const truth = j.default === 'left' ? 'right' : 'left';
      const sign = trueSign(truth);
      // Facing the way the train comes from (the reflection of a sign facing the mirror).
      const look = f.tangent.clone().setY(0).normalize().negate();
      sign.position.copy(at);
      sign.position.y = f.position.y - 0.5;
      sign.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), look);
      group.add(sign);
    }
    group.traverse((o) => o.layers.set(REFLECT_LAYER));
    return group;
  }

  // ---- events ----

  onEvent(e: StageEvent): void {
    switch (e.type) {
      case 'ice':
        this.sparkling = e.sparkle;
        break;
      case 'thin': {
        const t = this.thin.find((x) => x.zone.index === e.index);
        if (!t) break;
        if (e.state === 'clear') t.clearT = 0;
        if (e.state === 'crack') this.startCrack(t);
        break;
      }
      case 'mirror':
        this.starFlash = 1.6;
        break;
      case 'light':
        this.lightOn = e.on;
        break;
      case 'sign:reveal': {
        const mv = this.mirrors.find((m) => m.def.junction === e.junctionId);
        if (mv) this.revealWave.set(mv.def.index, 1);
        break;
      }
      case 'rewind':
        this.crackT = -1;
        if (this.seal) this.seal.visible = false;
        if (this.ring) this.ring.visible = false;
        if (this.openWater) this.openWater.visible = false;
        for (const t of this.thin) {
          t.from = 1;
          t.to = 0;
          t.clearT = -1;
          t.refrozen = false;
          t.broken.value = [1, 0];
        }
        if (this.floes) this.floes.count = 0;
        this.sparkling = false;
        break;
      case 'rock':
        this.onBirds(e);
        break;
      default:
        break;
    }
  }

  private startCrack(t: ThinVisual): void {
    this.crackT = 0;
    this.crackAt.copy(this.train.position);
    // The ice under the whole train breaks at once.
    const rail = this.stage.network.getRail(t.zone.railId);
    let best = t.zone.from;
    let bestD = Infinity;
    for (let s = t.zone.from - 20; s <= t.zone.to + 40; s += 1) {
      const d = rail.frameAt(s).position.distanceTo(this.train.position);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    const front = best + TRAIN.length / 2;
    t.from = Math.max(t.zone.from - 1, front - THIN_ICE.rear - 6);
    t.to = Math.min(t.zone.to + 1, front + 4);
    t.broken.value = [t.from, t.to];
    this.placeFloes(t);
    const f = rail.frameAt((t.from + t.to) / 2);
    if (this.seal) {
      this.seal.visible = true;
      this.seal.position.copy(f.position).addScaledVector(f.right, 5.5);
      this.seal.position.y = f.position.y - 2.2;
      this.seal.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), f.right.clone().negate().setY(0).normalize());
    }
    if (this.ring) {
      this.ring.visible = true;
      this.ring.position.copy(this.train.position).setY(f.position.y - 0.3);
    }
  }

  /** Floes and open water over the broken part of `t`. */
  private placeFloes(t: ThinVisual): void {
    const water = this.openWater;
    const floes = this.floes;
    if (!water || !floes || t.from > t.to) return;
    const rail = this.stage.network.getRail(t.zone.railId);
    const a = rail.frameAt(t.from).position;
    const b = rail.frameAt(t.to).position;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b) + 1;
    water.visible = true;
    water.position.set(mid.x, mid.y - 0.49, mid.z);
    water.rotation.set(-Math.PI / 2, 0, -Math.atan2(b.z - a.z, b.x - a.x));
    water.scale.set(len, THIN_HALF_WIDTH * 2, 1);
    floes.count = FLOES;
    for (let i = 0; i < FLOES; i++) {
      const s = t.from + ((i + 0.5) / FLOES) * (t.to - t.from);
      const f = rail.frameAt(s);
      const lateral = (i % 2 ? 1 : -1) * (1.6 + hash(i * 17) * (THIN_HALF_WIDTH - 2));
      const p = f.position.clone().addScaledVector(f.right, lateral);
      const st = this.floeState[i];
      st.x = p.x;
      st.z = p.z;
      st.y = f.position.y - 0.45;
    }
  }

  // ---- snowbirds ----

  private onBirds(e: Extract<StageEvent, { type: 'rock' }>): void {
    const row = this.rows.find((r) => r.id === e.id);
    if (!row) return;
    row.t = 0;
    if (e.state === 'wait') row.mode = 'wait';
    else if (e.state === 'wobble') row.mode = 'wobble';
    else if (e.state === 'roll') {
      row.mode = 'walk';
      row.seconds = e.seconds ?? ROCK_ROLL.crossSeconds;
    } else if (e.state === 'bonk') row.mode = 'flap';
  }

  private updateBirds(dt: number): void {
    const mesh = this.birds;
    if (!mesh) return;
    for (const row of this.rows) {
      row.t += dt;
      const f = this.stage.network.getRail(row.railId).frameAt(row.at);
      const across = f.right.clone().setY(0).normalize();
      const walk = (2 * row.lateral + (BIRDS_PER_ROW - 1) * BIRD_SPACING) / Math.max(0.5, row.seconds);
      for (let i = 0; i < BIRDS_PER_ROW; i++) {
        const start = -row.lateral - i * BIRD_SPACING;
        let x = start;
        let hop = 0;
        let facing = across;
        switch (row.mode) {
          case 'wait':
            hop = Math.max(0, Math.sin(this.time * 2 + i)) * 0.05;
            break;
          case 'wobble':
            hop = Math.abs(Math.sin(this.time * 7 + i * 1.3)) * 0.25;
            break;
          case 'walk':
          case 'done':
          case 'flap': {
            const end = row.lateral + (BIRDS_PER_ROW - 1 - i) * BIRD_SPACING;
            x = Math.min(end, start + walk * row.t);
            if (row.mode === 'walk') hop = Math.abs(Math.sin(this.time * 9 + i)) * 0.18;
            if (row.mode === 'walk' && x >= end && i === 0 && row.t > row.seconds) row.mode = 'done';
            // Across: they stop on the snow and turn to watch the train go by.
            if (x >= end) facing = f.tangent.clone().setY(0).normalize().negate();
            if (row.mode === 'flap') hop = Math.max(0, Math.sin(row.t * 10 + i)) * 0.9 * Math.max(0, 1 - row.t / 2.5);
            break;
          }
        }
        this.v.copy(f.position).addScaledVector(across, x);
        this.v.y = f.position.y - 0.5 + hop;
        this.q.setFromUnitVectors(new Vector3(0, 0, 1), facing);
        if (row.mode === 'walk') this.q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.sin(this.time * 9 + i) * 0.12));
        this.s.setScalar(1);
        this.m.compose(this.v, this.q, this.s);
        mesh.setMatrixAt(row.slot * BIRDS_PER_ROW + i, this.m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // ---- per frame ----

  /** "ぽちゃん": the cars sink half-way, bob back up and rock like a toy boat (after the pose, before the camera). */
  rideSink(cars: Object3D[]): void {
    if (this.crackT < 0) return;
    const t = this.crackT;
    let y: number;
    if (t < 0.5) y = -THIN_ICE.sink * Math.sin((t / 0.5) * (Math.PI / 2));
    else if (t < 1.1) y = -THIN_ICE.sink + (THIN_ICE.sink - THIN_ICE.bob) * Math.sin(((t - 0.5) / 0.6) * (Math.PI / 2));
    else y = -THIN_ICE.bob + Math.sin((t - 1.1) * 3.2) * 0.08;
    const roll = t < 0.5 ? 0 : Math.sin((t - 0.5) * 3) * 0.035;
    cars.forEach((car, i) => {
      car.position.y += y + (i === 1 ? 0.04 : 0);
      car.rotateZ(roll * (i % 2 ? -1 : 1));
    });
  }

  update(dt: number, camera: PerspectiveCamera): void {
    this.time += dt;
    this.updateThin(dt);
    this.updateSnow(dt, camera);
    this.updateSparkles(dt);
    this.updateBirds(dt);
    this.updateCrack(dt);
    this.updateMirrors(dt);
  }

  private updateThin(dt: number): void {
    const railId = this.trainRail;
    for (const t of this.thin) {
      if (this.crackT >= 0) continue;
      if (t.clearT >= 0) {
        t.clearT += dt;
        if (t.clearT >= THIN_ICE.refreeze) {
          // "ぴきーん": frozen again.
          t.clearT = -1;
          t.refrozen = true;
          t.from = 1;
          t.to = 0;
          t.broken.value = [1, 0];
          if (this.floes) this.floes.count = 0;
          if (this.openWater) this.openWater.visible = false;
          continue;
        }
      }
      // Behind the last bogie (THIN_ICE.breakAfter s later) the ice breaks into floes.
      if (railId !== t.zone.railId || t.refrozen || t.clearT >= 0) continue;
      const rear = this.trainFront - THIN_ICE.rear - this.trainSpeed * THIN_ICE.breakAfter;
      if (rear > t.zone.from && rear < t.zone.to + 40 && this.trainFront >= t.zone.from && (this.trainSpeed > 20 || t.from <= t.to)) {
        t.from = t.zone.from - 1;
        t.to = Math.min(t.zone.to + 1, rear);
        t.broken.value = [t.from, t.to];
        this.placeFloes(t);
      }
    }
    // The floes bob.
    const floes = this.floes;
    if (floes && floes.count > 0) {
      for (let i = 0; i < floes.count; i++) {
        const st = this.floeState[i];
        this.v.set(st.x, st.y + Math.sin(this.time * 2 + st.phase) * 0.08, st.z);
        this.q.setFromAxisAngle(new Vector3(0, 1, 0), st.turn).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.sin(this.time * 1.7 + st.phase) * 0.06));
        this.s.set(st.size, 1, st.size * 0.8);
        this.m.compose(this.v, this.q, this.s);
        floes.setMatrixAt(i, this.m);
      }
      floes.instanceMatrix.needsUpdate = true;
    }
  }

  private updateCrack(dt: number): void {
    if (this.crackT < 0) return;
    this.crackT += dt;
    const t = this.crackT;
    if (this.seal) {
      // A seal pops its head out beside the train ("きゅっ"), friendly.
      const k = Math.min(1, Math.max(0, (t - 0.7) / 0.6));
      const base = this.crackAt.y - 2.2;
      this.seal.position.y = base + k * 1.9 + Math.sin(t * 3) * 0.05 * k;
    }
    if (this.ring) {
      const k = Math.min(1, t / 1.2);
      this.ring.scale.setScalar(2.5 + k * 5.5);
      (this.ring.material as MeshBasicMaterial).opacity = 0.9 * (1 - k);
      if (k >= 1) this.ring.visible = false;
    }
  }

  private updateSnow(dt: number, camera: PerspectiveCamera): void {
    const snow = this.snow;
    const def = this.snowDef;
    if (!snow || !def || !this.snowSpeed) return;
    const radius = def.radius ?? 60;
    const fall = def.fall ?? 1.2;
    const attr = snow.geometry.getAttribute('position') as Float32BufferAttribute;
    const arr = attr.array as Float32Array;
    const c = camera.position;
    for (let i = 0; i < def.count; i++) {
      let x = arr[i * 3];
      let y = arr[i * 3 + 1] - fall * this.snowSpeed[i] * dt;
      let z = arr[i * 3 + 2];
      x += Math.sin(this.time * 0.7 + i) * 0.3 * dt;
      // Keep each flake in the box round the camera (wrapping), falling from above it.
      const wrap = (v: number, centre: number): number => {
        const d = v - centre;
        return d > radius ? v - 2 * radius : d < -radius ? v + 2 * radius : v;
      };
      x = wrap(x, c.x);
      z = wrap(z, c.z);
      if (y < c.y - radius * 0.4) y += radius;
      if (y > c.y + radius * 0.6) y -= radius;
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z;
    }
    attr.needsUpdate = true;
  }

  private updateSparkles(dt: number): void {
    const pts = this.sparkles;
    if (!pts) return;
    const attr = pts.geometry.getAttribute('position') as Float32BufferAttribute;
    const arr = attr.array as Float32Array;
    this.sparkleClock += dt;
    if (this.sparkling && this.sparkleClock > 0.03) {
      this.sparkleClock = 0;
      // Out from the lead car's wheels, forwards and up a little.
      for (let k = 0; k < 3; k++) {
        const i = this.sparkleLife.findIndex((l) => l <= 0);
        if (i < 0) break;
        const side = k % 2 ? 1.3 : -1.3;
        const along = [3.5, -3.5, 3.5][k];
        this.v.set(side, 0.35, along).applyQuaternion(this.train.quaternion).add(this.train.position);
        arr.set([this.v.x, this.v.y, this.v.z], i * 3);
        this.sparkleVel[i].set(side * 0.6 + (hash(this.time + i) - 0.5), 0.8 + hash(i + this.time * 3), 1.5).applyQuaternion(this.train.quaternion);
        this.sparkleLife[i] = 0.6 + hash(i * 7 + this.time) * 0.5;
      }
    }
    let any = false;
    for (let i = 0; i < SPARKLES; i++) {
      if (this.sparkleLife[i] <= 0) {
        arr[i * 3 + 1] = -1000;
        continue;
      }
      any = true;
      this.sparkleLife[i] -= dt;
      arr[i * 3] += this.sparkleVel[i].x * dt;
      arr[i * 3 + 1] += this.sparkleVel[i].y * dt;
      arr[i * 3 + 2] += this.sparkleVel[i].z * dt;
      this.sparkleVel[i].y -= 2.5 * dt;
    }
    pts.visible = any;
    if (any) attr.needsUpdate = true;
  }

  private updateMirrors(dt: number): void {
    if (this.mirrors.length === 0) return;
    const def = activeMirror(
      this.mirrors.map((m) => m.def),
      this.train.position,
    );
    const next = def ? (this.mirrors.find((m) => m.def === def) ?? null) : null;
    if (next !== this.active) {
      if (this.active) {
        this.active.far.visible = true;
        this.active.mask.visible = false;
        this.active.backdrop.visible = false;
        if (this.active.ghosts) this.active.ghosts.visible = false;
      }
      this.active = next;
      if (next) {
        next.far.visible = false;
        next.mask.visible = true;
        next.backdrop.visible = true;
        if (!next.ghosts) {
          next.ghosts = this.buildGhosts(next, this.stage.network);
          this.group.add(next.ghosts);
        }
        next.ghosts.visible = true;
      }
    }
    for (const mv of this.mirrors) {
      mv.tintMaterial.uniforms.time.value = this.time;
      const w = this.revealWave.get(mv.def.index) ?? 0;
      if (w > 0) this.revealWave.set(mv.def.index, Math.max(0, w - dt / 1.6));
      mv.tintMaterial.uniforms.wave.value = w > 0 ? w : 0;
      mv.tint.visible = mv === this.active;
    }
    this.starFlash = Math.max(0, this.starFlash - dt);
  }

  // ---- the mirror pass ----

  /**
   * Draws what the active mirror shows, after the main render: the train and the cars (and a cutscene's figures,
   * for a mirror that shows them) folded over the glass, the prepared reflections, and the glass's tint, only where
   * the glass was seen (stencil 1). Returns false when no mirror is reflecting.
   */
  renderReflection(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, cars: Object3D[], figures: Object3D[]): boolean {
    const mv = this.active;
    if (!mv) return false;
    const dynamic: Object3D[] = [];
    if (mv.def.reflectTrain) dynamic.push(...cars);
    if (mv.def.reflectCutscene) dynamic.push(...figures);
    // The star where the lamp's reflection is (bigger just after "きらーん").
    const star = this.ensureStar();
    const lamp = new Vector3(0, 3.3, 6.3).applyQuaternion(this.train.quaternion).add(this.train.position);
    star.visible = mv.def.reflectTrain && this.lightOn && inFront(mv.def, lamp) > 0;
    if (star.visible) {
      star.position.copy(lamp).applyMatrix4(mv.reflect);
      const pulse = 1 + Math.sin(this.time * 6) * 0.08;
      star.scale.setScalar((3 + (this.starFlash > 0 ? 7 * Math.sin((this.starFlash / 1.6) * Math.PI) : 0)) * pulse);
    }
    // Everything drawn in this pass: its meshes' world matrices folded over the glass for now, stencil-limited.
    const touched: { mesh: Mesh; matrix: Matrix4 }[] = [];
    const materials = new Map<Material, { write: boolean; func: StencilFunc; ref: number; zpass: StencilOp; mask: number }>();
    const hold = (material: Material): void => {
      if (materials.has(material)) return;
      materials.set(material, { write: material.stencilWrite, func: material.stencilFunc, ref: material.stencilRef, zpass: material.stencilZPass, mask: material.stencilWriteMask });
      material.stencilWrite = true;
      material.stencilFunc = EqualStencilFunc;
      material.stencilRef = 1;
      material.stencilZPass = KeepStencilOp;
      material.stencilWriteMask = 0;
    };
    for (const root of dynamic) {
      root.traverseVisible((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        mesh.layers.enable(REFLECT_LAYER);
        touched.push({ mesh, matrix: mesh.matrixWorld.clone() });
        mesh.matrixWorld.premultiply(mv.reflect);
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) hold(m);
      });
    }
    if (!this.lightsLayered) {
      this.lightsLayered = true;
      scene.traverse((o) => {
        if ((o as Light).isLight) o.layers.enable(REFLECT_LAYER);
      });
    }
    const background = scene.background;
    const autoUpdate = scene.matrixWorldAutoUpdate;
    const autoClear = renderer.autoClear;
    const layers = camera.layers.mask;
    scene.background = null;
    scene.matrixWorldAutoUpdate = false;
    renderer.autoClear = false;
    camera.layers.set(REFLECT_LAYER);
    try {
      renderer.render(scene, camera);
    } finally {
      camera.layers.mask = layers;
      renderer.autoClear = autoClear;
      scene.matrixWorldAutoUpdate = autoUpdate;
      scene.background = background;
      for (const { mesh, matrix } of touched) {
        mesh.matrixWorld.copy(matrix);
        mesh.layers.disable(REFLECT_LAYER);
      }
      for (const [material, st] of materials) {
        material.stencilWrite = st.write;
        material.stencilFunc = st.func;
        material.stencilRef = st.ref;
        material.stencilZPass = st.zpass;
        material.stencilWriteMask = st.mask;
      }
    }
    return true;
  }

  private ensureStar(): Sprite {
    if (!this.star) {
      const star = new Sprite(
        stencilled(new SpriteMaterial({ map: starTexture(), color: '#FFFFFF', transparent: true, depthWrite: false, blending: AdditiveBlending })),
      );
      star.name = 'mirror-star';
      star.renderOrder = 960;
      star.layers.set(REFLECT_LAYER);
      star.visible = false;
      this.star = star;
      this.group.add(star);
    }
    return this.star;
  }

  /** A snowy stage's ground: a little light of its own, so the snow is white rather than grey. */
  static brightenSnow(scene: Scene): void {
    const ground = scene.getObjectByName('ground') as Mesh | undefined;
    const material = ground?.material as MeshLambertMaterial | undefined;
    if (material?.isMeshLambertMaterial) material.emissive.copy(material.color).multiplyScalar(0.3);
    // Light bouncing off snow is white, not the grass green of the other islands (ice walls stay icy blue).
    scene.traverse((o) => {
      if ((o as HemisphereLight).isHemisphereLight) (o as HemisphereLight).groundColor.set(SNOW_BOUNCE);
    });
  }

  /** The mirror reflecting now (test hook): its gimmicks[] index, or −1. */
  get activeIndex(): number {
    return this.active?.def.index ?? -1;
  }

  // The train's place on its rail, from its pose (set by the scene view every frame).
  trainRail = '';
  trainFront = 0;
  trainSpeed = 0;
}

/** A material for things drawn only inside a mirror's window (stencil 1). */
function stencilled<T extends Material>(material: T): T {
  material.stencilWrite = true;
  material.stencilFunc = EqualStencilFunc;
  material.stencilRef = 1;
  material.stencilZPass = KeepStencilOp;
  material.stencilWriteMask = 0;
  return material;
}

/** Swaps two corners of every triangle (a non-indexed geometry): its faces point the other way. */
function flipWinding(g: BufferGeometry): void {
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name);
    const size = a.itemSize;
    const arr = a.array as Float32Array;
    for (let t = 0; t + 2 < a.count; t += 3) {
      for (let k = 0; k < size; k++) {
        const i1 = (t + 1) * size + k;
        const i2 = (t + 2) * size + k;
        const tmp = arr[i1];
        arr[i1] = arr[i2];
        arr[i2] = tmp;
      }
    }
    a.needsUpdate = true;
  }
  g.computeVertexNormals();
}

/** A direction sign whose arrow points `side` (as the driver sees it), for a mirror's reflection. */
function trueSign(side: 'left' | 'right'): Group {
  const g = new Group();
  g.name = 'ghost-sign';
  const post = new Mesh(new BoxGeometry(0.16, 2.6, 0.16), stencilled(new MeshLambertMaterial({ color: '#8A8F96' })));
  post.position.y = 1.3;
  const board = new Mesh(new BoxGeometry(1.6, 1.0, 0.12), stencilled(new MeshLambertMaterial({ color: '#2F7D4F' })));
  board.position.y = 2.9;
  // An arrow: shaft and head, white, on the board's front (+Z faces the train). The driver's right is the sign's −X.
  const dir = side === 'right' ? 1 : -1;
  const arrowMaterial = stencilled(new MeshBasicMaterial({ color: '#FFFFFF', side: DoubleSide }));
  const shaft = new Mesh(new BoxGeometry(0.8, 0.18, 0.02), arrowMaterial);
  shaft.position.set(-dir * 0.1, 2.9, 0.08);
  const headGeometry = new BufferGeometry();
  headGeometry.setAttribute('position', new Float32BufferAttribute([0.3 * dir, 0, 0, 0, 0.32, 0, 0, -0.32, 0], 3));
  headGeometry.computeVertexNormals();
  const head = new Mesh(headGeometry, arrowMaterial);
  head.position.set(dir * 0.3, 2.9, 0.08);
  g.add(post, board, shaft, head);
  return g;
}
