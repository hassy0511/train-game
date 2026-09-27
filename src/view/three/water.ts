import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  FrontSide,
  Group,
  InstancedMesh,
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
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EnvironmentDef, FloaterDef, FloaterLook, StageData, WaterDef, WaterLook } from '../../stage/types';
import { areaOutline, holeArea, inArea, WATER_FLOOR, WATER_UNDER } from '../../stage/water';
import { FLOATER, TRAIN } from '../../train/params';

/**
 * v1.10 water in the scene (PHASE8 part 2 §2.7): the surfaces, the floors and pond walls, the floaters and dive-fork
 * rings, the bubbles drifting round the camera under water, and the bubble dome on the cars. Five draw calls at
 * most (the ground with its holes replaces the plain ground). Under water (the camera below a surface, inside its
 * area) the scene's fog and background turn to the water's colour; ThreeSceneView applies that.
 */

/** The surface seen from above, by look (a sea without an area takes the ground's colour). */
const SURFACE_COLOR: Record<WaterLook, string> = { sea: '#3aa0d8', lake: '#4fb3dc', puddle: '#7cc7d0', ice: '#dff4fb' };
/** v1.10 (4-1): open water in the holes of an ice-covered water, and the ice plate round them. */
const OPEN_WATER_COLOR = '#6CC3E6';
const ICE_PLATE_COLOR = '#CFEAF6';
/** The surface seen from under the water: a bright ceiling. */
const CEILING_COLOR = '#bfe9ff';
/** The dome's size around a car (m): half across, half up, half along. */
const DOME_RADII = new Vector3(2.3, 2.6, 7.1);
const DOME_LIFT = 1.8;
/** Seconds for the dome to swell, and to pop. */
const DOME_IN = 0.6;
const DOME_OUT = 0.25;
/** Bubbles drifting round the camera under water: how many, in a cube this many metres across. */
const MOTES = 200;
const MOTE_SPAN = 30;
/** Shafts of light slanting down from the surface round the camera under water (PHASE8 part 2 §2.7). */
const SHAFTS = 8;
const SHAFT_LENGTH = 26;

/** The pond wall and floor get a little darker than the floor colour. */
const WALL_SHADE = 0.8;

/** The ground plane for a stage with water: holes where waters with an area are, none at all over a sea. */
export function buildWaterGround(environment: EnvironmentDef): Mesh | null {
  const ground = environment.ground;
  if (!ground) return null;
  const waters = environment.water ?? [];
  if (waters.some((w) => !w.area)) return null;
  const shape = square(ground.size);
  for (const w of waters) {
    if (!w.area) continue;
    shape.holes.push(new Path(areaOutline(w.area).map(([x, z]) => xz(x, z))));
  }
  const geometry = flatShape(new ShapeGeometry(shape), ground.y);
  const mesh = new Mesh(geometry, new MeshLambertMaterial({ color: ground.color }));
  mesh.name = 'ground';
  return mesh;
}

/** A shape point for world (x, z): shapes are drawn in (x, −z), which seen from above keeps their winding. */
const xz = (x: number, z: number): Vector2 => new Vector2(x, -z);

/** A ShapeGeometry (drawn in x, −z) laid flat at height `y`, facing up. */
function flatShape(geometry: BufferGeometry, y: number): BufferGeometry {
  const pos = geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i), y, -pos.getY(i));
  pos.needsUpdate = true;
  const normals = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) normals[i * 3 + 1] = 1;
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.deleteAttribute('uv');
  geometry.computeBoundingSphere();
  return geometry;
}

/** Paints every vertex of `geometry` one colour (a `color` attribute), for merging with others. */
function paint(geometry: BufferGeometry, color: string): BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  g.deleteAttribute('uv');
  const c = new Color(color);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return g;
}

function mergeAll(parts: BufferGeometry[]): BufferGeometry | null {
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  merged?.computeBoundingSphere();
  return merged;
}

/** A floater's shape (placeholder, drawn in code) in its own frame: x across the rail, z along it, y up from the surface. */
function floaterParts(look: FloaterLook, length: number): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const add = (g: BufferGeometry, color: string, m: Matrix4): void => {
    g.applyMatrix4(m);
    out.push(paint(g, color));
  };
  const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Matrix4 =>
    new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(rx, ry, rz)), new Vector3(1, 1, 1));
  switch (look) {
    case 'log': {
      // Logs lying across the track, side by side, half in the water.
      const r = 0.55;
      const count = Math.max(1, Math.floor(length / (2 * r + 0.1)));
      for (let i = 0; i < count; i++) {
        const z = (i - (count - 1) / 2) * (2 * r + 0.1);
        add(new CylinderGeometry(r, r, 6, 10), i % 2 ? '#8a5a2b' : '#7a4e25', at(0, 0.1, z, 0, 0, Math.PI / 2));
        for (const x of [-3.01, 3.01]) add(new CylinderGeometry(r * 0.8, r * 0.8, 0.04, 10), '#d9b27a', at(x, 0.1, z, 0, 0, Math.PI / 2));
      }
      break;
    }
    case 'raft':
      for (let i = 0; i < Math.max(2, Math.round(length / 0.9)); i++) {
        const n = Math.max(2, Math.round(length / 0.9));
        const z = (i - (n - 1) / 2) * (length / n);
        add(new CylinderGeometry(0.4, 0.4, 6.4, 8), i % 2 ? '#a4743e' : '#936632', at(0, 0.15, z, 0, 0, Math.PI / 2));
      }
      add(new BoxGeometry(0.3, 0.3, length), '#6b4a26', at(-2.4, 0.6, 0));
      add(new BoxGeometry(0.3, 0.3, length), '#6b4a26', at(2.4, 0.6, 0));
      break;
    case 'lily':
      add(new CylinderGeometry(length / 2, length / 2, 0.12, 16), '#5fae4a', at(0, 0.08, 0));
      add(new SphereGeometry(0.45, 8, 6), '#f4a6c8', at(0.6, 0.35, 0.3));
      break;
    case 'wave':
      add(new CylinderGeometry(length / 2, length / 2, 7, 12, 1, false, 0, Math.PI), '#e8f7ff', at(0, -0.4, 0, 0, 0, Math.PI / 2));
      break;
    case 'ice':
      add(new BoxGeometry(6, 0.8, length), '#eef9ff', at(0, 0.1, 0));
      add(new BoxGeometry(2.2, 0.5, length * 0.6), '#d4efff', at(1.2, 0.6, 0.2));
      break;
  }
  return out;
}

/** The red-and-white ring on the water at a dive fork ("わっか"), lying flat round the track. */
function ringParts(): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const segments = 8;
  for (let i = 0; i < segments; i++) {
    const g = new TorusGeometry(3.4, 0.38, 8, 6, (Math.PI * 2) / segments);
    g.rotateZ((i * Math.PI * 2) / segments);
    g.rotateX(-Math.PI / 2);
    out.push(paint(g, i % 2 ? '#ffffff' : '#e8483c'));
  }
  return out;
}

const domeVertex = `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelViewMatrix * instanceMatrix) * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const domeFragment = `
uniform float opacity;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
  float a = 0.06 + pow(rim, 2.2) * 0.75;
  gl_FragColor = vec4(mix(vec3(0.78, 0.94, 1.0), vec3(1.0), rim), a * opacity);
}
`;

/** The water layer of a stage (none when the stage has no water). */
export class WaterLayer {
  readonly group = new Group();
  private readonly waters: WaterDef[];
  private readonly surfaceMaterial: MeshLambertMaterial;
  private readonly surfaceColor: Color;
  private readonly ceilingColor = new Color(CEILING_COLOR);
  private readonly ceilingGlow = new Color('#6fb6d8');
  private readonly noGlow = new Color('#000000');
  private readonly things: Mesh | null = null;
  private readonly motes: Points;
  private readonly shafts: InstancedMesh;
  private readonly dome: InstancedMesh;
  private readonly domeMaterial: ShaderMaterial;
  /** 0 = gone … 1 = full; `domeWant` is where it is going. */
  private domeScale = 0;
  private domeWant = 0;
  private time = 0;
  private under: { water: WaterDef; index: number } | null = null;
  /** How far the camera is being held under the surface (0..1, eased). */
  private hold = 0;
  private submerged = false;
  private readonly m = new Matrix4();
  private readonly v = new Vector3();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();

  constructor(stage: StageData) {
    this.group.name = 'water';
    const env = stage.file.environment;
    this.waters = env.water ?? [];
    const first = this.waters[0];
    // Surfaces (all waters in one mesh; one colour: the first water's look, or the ground's for a sea).
    const iced = (w: WaterDef | undefined): boolean => !!w && w.look === 'ice' && (w.holes?.length ?? 0) > 0;
    const seaColor = first && !first.area && env.ground ? env.ground.color : iced(first) ? OPEN_WATER_COLOR : SURFACE_COLOR[first?.look ?? 'sea'];
    this.surfaceColor = new Color(seaColor);
    this.surfaceMaterial = new MeshLambertMaterial({
      color: this.surfaceColor.clone(),
      transparent: true,
      opacity: 0.78,
      side: DoubleSide,
      depthWrite: false,
    });
    const size = env.ground?.size ?? 1200;
    const surfaces: BufferGeometry[] = [];
    const bowls: BufferGeometry[] = [];
    const plates: BufferGeometry[] = [];
    for (const w of this.waters) {
      const look = w.look ?? 'sea';
      const floorColor = WATER_FLOOR[look];
      if (!w.area) {
        surfaces.push(flatShape(new ShapeGeometry(square(size)), w.y));
        bowls.push(paint(flatShape(new ShapeGeometry(square(size)), w.floor), floorColor));
        continue;
      }
      const outline = areaOutline(w.area);
      const shape = new Shape(outline.map(([x, z]) => xz(x, z)));
      if (iced(w)) {
        // v1.10 (4-1): the water is open only in its holes; the rest is a plate of ice (a bright ceiling from below).
        for (const h of w.holes ?? []) {
          const hole = areaOutline(holeArea(h)).map(([x, z]) => xz(x, z));
          surfaces.push(flatShape(new ShapeGeometry(new Shape(hole)), w.y));
          shape.holes.push(new Path(hole));
        }
        plates.push(flatShape(new ShapeGeometry(shape), w.y + 0.02));
      } else surfaces.push(flatShape(new ShapeGeometry(shape), w.y));
      bowls.push(paint(flatShape(new ShapeGeometry(shape), w.floor), floorColor));
      // The pond's wall, from the ground (or the surface) down to the floor.
      const top = Math.max(env.ground?.y ?? w.y, w.y);
      const wall: number[] = [];
      for (let i = 0; i < outline.length; i++) {
        const [ax, az] = outline[i];
        const [bx, bz] = outline[(i + 1) % outline.length];
        wall.push(ax, top, az, bx, top, bz, bx, w.floor, bz, ax, top, az, bx, w.floor, bz, ax, w.floor, az);
      }
      const wg = new BufferGeometry();
      wg.setAttribute('position', new Float32BufferAttribute(wall, 3));
      wg.computeVertexNormals();
      bowls.push(paint(wg, '#' + new Color(floorColor).multiplyScalar(WALL_SHADE).getHexString()));
    }
    const surfaceGeometry = mergeAll(surfaces.map((g) => stripTo(g, ['position', 'normal'])));
    if (surfaceGeometry) {
      const surface = new Mesh(surfaceGeometry, this.surfaceMaterial);
      surface.name = 'water-surface';
      surface.renderOrder = 2;
      this.group.add(surface);
    }
    const plateGeometry = mergeAll(plates.map((g) => stripTo(g, ['position', 'normal'])));
    if (plateGeometry) {
      const plate = new Mesh(plateGeometry, new MeshLambertMaterial({ color: ICE_PLATE_COLOR, side: DoubleSide }));
      plate.name = 'water-ice';
      this.group.add(plate);
    }
    const bowlGeometry = mergeAll(bowls.map((g) => stripTo(g, ['position', 'normal', 'color'])));
    if (bowlGeometry) {
      const bowl = new Mesh(bowlGeometry, new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }));
      bowl.name = 'water-floor';
      this.group.add(bowl);
    }
    // Floaters and dive-fork rings, one mesh (it bobs gently as a whole).
    const parts: BufferGeometry[] = [];
    for (const f of stage.file.floaters ?? []) parts.push(...this.placeFloater(stage, f));
    for (const j of stage.file.junctions) {
      if (!j.dive) continue;
      const rail = stage.network.getRail(j.railId);
      const frame = rail.frameAt(Math.max(0, j.at - 2));
      const water = this.waterAt(frame.position.x, frame.position.z);
      const y = water ? water.y + 0.15 : frame.position.y;
      for (const g of ringParts()) {
        g.translate(frame.position.x, y, frame.position.z);
        parts.push(g);
      }
    }
    const thingsGeometry = mergeAll(parts.map((g) => stripTo(g, ['position', 'normal', 'color'])));
    if (thingsGeometry) {
      this.things = new Mesh(thingsGeometry, new MeshLambertMaterial({ vertexColors: true, side: FrontSide }));
      this.things.name = 'water-things';
      this.group.add(this.things);
    }
    // Bubbles round the camera under water.
    const motes = new Float32Array(MOTES * 3);
    for (let i = 0; i < MOTES; i++) {
      motes[i * 3] = (hash(i * 3) - 0.5) * MOTE_SPAN;
      motes[i * 3 + 1] = (hash(i * 3 + 1) - 0.5) * MOTE_SPAN;
      motes[i * 3 + 2] = (hash(i * 3 + 2) - 0.5) * MOTE_SPAN;
    }
    const moteGeometry = new BufferGeometry();
    moteGeometry.setAttribute('position', new Float32BufferAttribute(motes, 3));
    this.motes = new Points(
      moteGeometry,
      new PointsMaterial({ color: '#f2fbff', size: 0.18, map: bubbleTexture(), transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.motes.name = 'water-motes';
    this.motes.visible = false;
    this.motes.frustumCulled = false;
    this.group.add(this.motes);
    // Light shafts: long soft planes, brightest at the top, added to the picture (one batch).
    const shaft = new PlaneGeometry(2.6, SHAFT_LENGTH);
    shaft.translate(0, -SHAFT_LENGTH / 2, 0);
    this.shafts = new InstancedMesh(
      shaft,
      new MeshBasicMaterial({ map: shaftTexture(), transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }),
      SHAFTS,
    );
    this.shafts.name = 'water-shafts';
    this.shafts.visible = false;
    this.shafts.frustumCulled = false;
    this.group.add(this.shafts);
    // The bubble dome: one stretched sphere per car, drawn together; a light rim, nearly clear in the middle.
    this.domeMaterial = new ShaderMaterial({
      uniforms: { opacity: { value: 1 } },
      vertexShader: domeVertex,
      fragmentShader: domeFragment,
      transparent: true,
      depthWrite: false,
      side: FrontSide,
    });
    this.dome = new InstancedMesh(new SphereGeometry(1, 16, 12), this.domeMaterial, TRAIN.carCount);
    this.dome.name = 'bubble-dome';
    this.dome.visible = false;
    this.dome.frustumCulled = false;
    this.dome.renderOrder = 3;
    this.group.add(this.dome);
  }

  /** A floater's parts placed on its rail, floating on its water. */
  private placeFloater(stage: StageData, f: FloaterDef): BufferGeometry[] {
    const look = f.look ?? 'log';
    const length = f.length ?? FLOATER[look].length;
    const frame = stage.network.getRail(f.railId).frameAt(f.at);
    const water = this.waterAt(frame.position.x, frame.position.z);
    const y = water ? water.y : frame.position.y;
    const x = new Vector3().crossVectors(new Vector3(0, 1, 0), frame.tangent).normalize();
    const z = new Vector3().crossVectors(x, new Vector3(0, 1, 0)).normalize();
    const basis = new Matrix4().makeBasis(x, new Vector3(0, 1, 0), z).setPosition(frame.position.x, y, frame.position.z);
    const parts = floaterParts(look, length);
    for (const g of parts) g.applyMatrix4(basis);
    return parts;
  }

  private waterAt(x: number, z: number): WaterDef | null {
    for (const w of this.waters) if (inArea(w.area, x, z)) return w;
    return null;
  }

  /** The water the camera is under, or null. */
  get underWater(): WaterDef | null {
    return this.under?.water ?? null;
  }

  /** The colour and seeing distance under the water the camera is in. */
  get underLook(): { color: string; far: number } | null {
    const w = this.under?.water;
    if (!w) return null;
    const base = WATER_UNDER[w.look ?? 'sea'];
    return { color: w.under?.color ?? base.color, far: w.under?.far ?? base.far };
  }

  /** The dome going on (swelling, or at once) or off (a quick pop); the train is under water on a long stretch. */
  setDome(on: boolean, instant: boolean): void {
    this.domeWant = on ? 1 : 0;
    if (instant) this.domeScale = this.domeWant;
  }

  setSubmerged(on: boolean): void {
    this.submerged = on;
  }

  /** The train runs under water on a long stretch (set by setSubmerged). */
  get isSubmerged(): boolean {
    return this.submerged;
  }

  /**
   * Per frame, after the camera is placed: holds a camera outside the cab under the surface while the train runs
   * under water, works out whether the camera is under water, moves the bubbles and the dome. Returns whether the
   * camera is under water.
   */
  update(dt: number, camera: PerspectiveCamera, cab: boolean, cars: Object3D[]): boolean {
    this.time += dt;
    // Under a long stretch of water the camera behind, beside or over the train stays under the surface too (a
    // train seen from above the water would be lost under it).
    const lead = cars[0];
    const leadWater = lead ? this.waterAt(lead.position.x, lead.position.z) : null;
    const want = !cab && this.submerged && leadWater !== null ? 1 : 0;
    this.hold += (want - this.hold) * Math.min(1, dt * 3);
    if (this.hold > 0.001 && leadWater && this.waterAt(camera.position.x, camera.position.z) === leadWater) {
      const limit = leadWater.y - 0.8;
      if (camera.position.y > limit) camera.position.y += (limit - camera.position.y) * this.hold;
    }
    // Is the camera under a surface?
    const p = camera.position;
    this.under = null;
    for (let i = 0; i < this.waters.length; i++) {
      const w = this.waters[i];
      if (p.y < w.y && p.y > w.floor - 2 && inArea(w.area, p.x, p.z)) {
        this.under = { water: w, index: i };
        break;
      }
    }
    const under = this.under !== null;
    this.surfaceMaterial.color.copy(under ? this.ceilingColor : this.surfaceColor);
    this.surfaceMaterial.opacity = under ? 0.7 : 0.78;
    // Seen from below the surface faces away from the sun: it glows a little itself, a bright ceiling (not a dark lid).
    this.surfaceMaterial.emissive.copy(under ? this.ceilingGlow : this.noGlow);
    this.motes.visible = under;
    if (under) {
      // The cube of bubbles follows the camera in whole steps, drifting up slowly.
      const step = MOTE_SPAN / 3;
      this.motes.position.set(Math.round(p.x / step) * step, Math.round(p.y / step) * step + ((this.time * 0.4) % step), Math.round(p.z / step) * step);
    }
    this.shafts.visible = under;
    if (under && this.under) this.placeShafts(p, this.under.water);
    if (this.things) this.things.position.y = Math.sin(this.time * 1.3) * 0.08;
    this.updateDome(dt, cars);
    return under;
  }

  /** The shafts stand round the camera in a loose ring, tilted a little, from the surface down, swaying slowly. */
  private placeShafts(camera: Vector3, water: WaterDef): void {
    for (let i = 0; i < SHAFTS; i++) {
      const a = (i / SHAFTS) * Math.PI * 2 + i * 0.7;
      const r = 7 + 14 * hash(i * 5 + 1);
      this.v.set(camera.x + Math.cos(a) * r, water.y - 0.2, camera.z + Math.sin(a) * r);
      this.q.setFromEuler(new Euler(0.22 + Math.sin(this.time * 0.3 + i) * 0.04, a * 0.5 + i, 0.18, 'YXZ'));
      this.s.set(0.7 + hash(i * 3) * 0.8, 1, 1);
      this.m.compose(this.v, this.q, this.s);
      this.shafts.setMatrixAt(i, this.m);
    }
    this.shafts.instanceMatrix.needsUpdate = true;
  }

  private updateDome(dt: number, cars: Object3D[]): void {
    const rate = this.domeWant > this.domeScale ? dt / DOME_IN : dt / DOME_OUT;
    this.domeScale = this.domeWant > this.domeScale ? Math.min(1, this.domeScale + rate) : Math.max(0, this.domeScale - rate);
    this.dome.visible = this.domeScale > 0.01;
    if (!this.dome.visible) return;
    // Swelling overshoots a little ("ぷくっ"); popping shrinks fast and fades.
    const k = this.domeWant > 0 ? 1 - Math.pow(1 - this.domeScale, 3) * Math.cos(this.domeScale * 3) : this.domeScale;
    this.domeMaterial.uniforms.opacity.value = this.domeWant > 0 ? 1 : this.domeScale;
    cars.forEach((car, i) => {
      if (i >= TRAIN.carCount) return;
      this.v.set(0, DOME_LIFT, 0).applyQuaternion(car.quaternion).add(car.position);
      this.s.copy(DOME_RADII).multiplyScalar(Math.max(0.05, k));
      this.m.compose(this.v, car.quaternion, this.s);
      this.dome.setMatrixAt(i, this.m);
    });
    this.dome.instanceMatrix.needsUpdate = true;
  }
}

/** A square shape `size` across round the origin. */
function square(size: number): Shape {
  const h = size / 2;
  return new Shape([xz(-h, h), xz(h, h), xz(h, -h), xz(-h, -h)]);
}

/** Keeps only `names` among a geometry's attributes (so they merge). */
function stripTo(g: BufferGeometry, names: string[]): BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  for (const name of Object.keys(out.attributes)) if (!names.includes(name)) out.deleteAttribute(name);
  return out;
}

/** A light shaft's picture: white fading down its length and out to its sides (drawn once). */
function shaftTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (!g) return null;
  for (let y = 0; y < 128; y++) {
    const down = 1 - y / 128;
    const grad = g.createLinearGradient(0, 0, 32, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, `rgba(235,250,255,${(down * down).toFixed(3)})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, y, 32, 1);
  }
  return new CanvasTexture(canvas);
}

/** A small round bubble (a light ring with a bright spot) for the drifting bubbles, drawn once. */
function bubbleTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(16, 16, 12, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.arc(11, 11, 3, 0, Math.PI * 2);
  g.fill();
  return new CanvasTexture(canvas);
}

/** A steady pseudo-random number in [0, 1) for `i`. */
function hash(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
