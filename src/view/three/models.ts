import { Box3, BoxGeometry, BufferAttribute, Group, Mesh, MeshLambertMaterial, Quaternion, Raycaster, SphereGeometry, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { placeholderSize } from '../placeholder-sizes';
import { buildForestPlaceholder } from './forest-placeholders';
import { buildHarbourPlaceholder } from './harbour-placeholders';
import { buildIcePlaceholder } from './ice-placeholders';
import { buildVillagePlaceholder } from './village-placeholders';
import { buildMeadowPlaceholder } from './meadow-placeholders';
import { addHandLantern, buildNightPlaceholder } from './night-placeholders';
import { buildRecordPlaceholder } from './record-placeholders';
import { buildRiverPlaceholder } from './river-placeholders';
import { buildSeaPlaceholder } from './sea-placeholders';
import { buildSkyPlaceholder } from './sky-placeholders';
import { buildSnowPlaceholder } from './snow-placeholders';
import { buildToyPlaceholder } from './toy-placeholders';
import { buildMagnetPlaceholder } from './magnet-placeholders';
import { buildMirrorPlaceholder } from './mirror-placeholders';
import { buildReversePlaceholder } from './reverse-placeholders';
import { buildVolcanoPlaceholder } from './volcano-placeholders';
import { buildEndingPlaceholder } from './ending-placeholders';

const PLACEHOLDER_COLORS: Record<string, number> = {
  tree: 0x4f9f5a,
  house: 0xe8c9a0,
  cat: 0xf4a261,
  passenger: 0x4f7fb0,
  amanojaku: 0xb4a7d6,
  platform: 0xbfb8aa,
  'stop-line': 0xffffff,
  'stop-board': 0xd64545,
  'car-proto': 0x3fa7d6,
};

function placeholderColor(name: string): number {
  const key = Object.keys(PLACEHOLDER_COLORS).find((k) => name.startsWith(k));
  return key ? PLACEHOLDER_COLORS[key] : 0xbbbbbb;
}

/** Loads each glTF model once and shares its immutable geometry and materials. */
export class ModelLibrary {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<Group>>();
  private readonly available = new Set<string>(__MODEL_MANIFEST__);

  /** True when a .glb for this name exists in the build. */
  has(name: string): boolean {
    return this.available.has(name);
  }

  load(name: string): Promise<Group> {
    const cached = this.cache.get(name);
    if (cached) return cached;

    // v1.10 (4-3): Sakasa blushing (pink cheeks on the built model), until ticket 0017 builds one of its own.
    if (name === 'amanojaku-blush' && !this.available.has(name)) {
      const blush = this.load('amanojaku').then(addBlush);
      this.cache.set(name, blush);
      return blush;
    }

    // v1.11 (5-1): Sakasa with 4-2's paper lantern (lit, or out), made from the built amanojaku (ticket 0018).
    if ((name === 'amanojaku-lantern' || name === 'amanojaku-lantern-off') && !this.available.has(name)) {
      const held = this.load('amanojaku').then((m) => {
        const { posed, grip, along } = holdStick(m);
        return addHandLantern(posed, name === 'amanojaku-lantern', grip, along);
      });
      this.cache.set(name, held);
      return held;
    }

    // v1.11 (5-3): the mirror Sakasa waving, and shy (hands together, head a little on one side), posed from the built
    // amanojaku until ticket 0020 builds them.
    if ((name === 'amanojaku-wave' || name === 'amanojaku-shy') && !this.available.has(name)) {
      const posed = this.load('amanojaku').then((m) => poseAmanojaku(m, name));
      this.cache.set(name, posed);
      return posed;
    }

    // v1.11 (6-1, PR8b): Sakasa sitting (the bench, the friends' seat behind the driver), posed from the built amanojaku
    // until ticket 0021 builds it.
    if (name === 'amanojaku-sit' && !this.available.has(name)) {
      const sat = this.load('amanojaku').then(sitAmanojaku);
      this.cache.set(name, sat);
      return sat;
    }

    // Models that are not built yet (pending Blender tickets) get a flat box of the right size,
    // so stages stay playable and no 404 requests are made.
    if (!this.available.has(name)) {
      const drawn =
        buildSkyPlaceholder(name) ??
        buildForestPlaceholder(name) ??
        buildMeadowPlaceholder(name) ??
        buildVolcanoPlaceholder(name) ??
        buildSeaPlaceholder(name) ??
        buildIcePlaceholder(name) ??
        buildRiverPlaceholder(name) ??
        buildHarbourPlaceholder(name) ??
        buildVillagePlaceholder(name) ??
        buildSnowPlaceholder(name) ??
        buildNightPlaceholder(name) ??
        buildToyPlaceholder(name) ??
        buildMagnetPlaceholder(name) ??
        buildMirrorPlaceholder(name) ??
        buildReversePlaceholder(name) ??
        buildEndingPlaceholder(name) ??
        buildRecordPlaceholder(name);
      if (!drawn) console.warn(`[models] "${name}.glb" is not built yet; using a placeholder box`);
      const placeholder = Promise.resolve(drawn ?? makePlaceholder(name));
      this.cache.set(name, placeholder);
      return placeholder;
    }

    const url = `${import.meta.env.BASE_URL}models/${name}.glb`;
    const loading = this.loader.loadAsync(url).then((gltf) => gltf.scene);
    this.cache.set(name, loading);
    return loading;
  }
}

/**
 * A copy of Sakasa with two round pink cheeks (#F7A1B5) on the face, below the eyes: two rays cast from in front at
 * cheek height find the skin, so they sit on it.
 */
function addBlush(model: Group): Group {
  const out = model.clone(true);
  out.name = 'amanojaku-blush';
  out.updateMatrixWorld(true);
  const box = new Box3().setFromObject(out);
  // The face (model metres, assets/blender/amanojaku.py): the eyes at y 1.040, x ±0.047; the cheeks a little lower
  // and further out.
  const y = box.min.y + 0.992;
  const material = new MeshLambertMaterial({ color: '#F7A1B5', emissive: '#F7A1B5', emissiveIntensity: 0.25 });
  const ray = new Raycaster();
  for (const side of [-1, 1]) {
    const x = side * 0.078;
    ray.set(new Vector3(x, y, box.max.z + 1), new Vector3(0, 0, -1));
    const hit = ray.intersectObject(out, true)[0];
    const z = hit ? hit.point.z : box.max.z;
    const cheek = new Mesh(new SphereGeometry(0.024, 10, 6), material);
    cheek.scale.set(1.25, 0.8, 0.35);
    cheek.position.set(x, y, z + 0.002);
    out.add(cheek);
  }
  return out;
}

/**
 * v1.11 (5-3): Sakasa posed without bones (the built model is one clay mesh): the vertices of an arm (away from the
 * torso, between hip and shoulder) turn about the shoulder, blended in near it so nothing tears. "amanojaku-wave": her
 * right arm raised, bent at the elbow so the hand is up by her head (bendArm: upper arm and forearm turn separately,
 * so the elbow bends the way an elbow does; the view sways her as she waves); "amanojaku-shy": both hands brought together in front and her
 * head (hair and hat with it) tilted 10°. Model metres (assets/blender/amanojaku.py): shoulders at (±0.08, 0.866) from
 * the body's axis, which the export puts a few centimetres off the origin (it centres the bounding box), so it is
 * measured on the waist (bodyAxis). Only the clay (the skin texture: body, arms, cuffs) turns with an arm; the cape,
 * collar and hat (their own flat materials) stay where they are, so the cape keeps hanging behind the arms and never
 * follows a hand.
 */
function poseAmanojaku(model: Group, name: 'amanojaku-wave' | 'amanojaku-shy'): Group {
  const out = model.clone(true);
  out.name = name;
  const smooth = (a: number, b: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const Z = new Vector3(0, 0, 1);
  const X = new Vector3(1, 0, 0);
  const q = new Quaternion();
  const v = new Vector3();
  const pivot = new Vector3();
  const turnAbout = (at: Vector3, rot: Quaternion, w: number): void => {
    if (w <= 0) return;
    const moved = v.clone().sub(pivot).applyQuaternion(rot).add(pivot);
    v.lerp(moved, w);
    at.copy(v);
  };
  const axis = bodyAxis(out);
  // The wave: upper arm out to the side, a little above the shoulder and forward (clear of the hair's flicks); the
  // forearm bends up at the elbow, towards the head, the hand above the elbow with the palm to the front.
  const wave = armPose(axis, -1, new Vector3(-0.92, 0.25, 0.3), new Vector3(0.12, 1, 0.08));
  out.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry = mesh.geometry.clone();
    const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
    const at = new Vector3();
    const clay = isClay(mesh);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      at.copy(v);
      // The arms: clay only (the cape hangs behind them and stays).
      for (const side of clay ? [-1, 1] : []) {
        const armW = armWeight(v, side, axis.x);
        if (armW <= 0) continue;
        pivot.set(axis.x + side * 0.08, 0.866, axis.z);
        if (name === 'amanojaku-wave' && side === -1) {
          v.copy(bendArm(v, armW, wave));
          at.copy(v);
        } else if (name === 'amanojaku-shy') {
          q.setFromAxisAngle(X, -0.9).multiply(new Quaternion().setFromAxisAngle(Z, -side * 0.35));
          turnAbout(at, q, armW);
        }
      }
      if (name === 'amanojaku-shy') {
        const headW = smooth(0.9, 0.97, v.y);
        if (headW > 0) {
          pivot.set(axis.x, 0.93, axis.z);
          q.setFromAxisAngle(Z, 0.17);
          turnAbout(at, q, headW);
        }
      }
      pos.setXYZ(i, at.x, at.y, at.z);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
  });
  return out;
}

/**
 * v1.11 (6-1): "amanojaku-sit": Sakasa sitting, posed without bones from the built amanojaku (one clay mesh): the legs
 * (the clay below the hip) turn forward about the hip, what hangs behind (the cape's hem) gathers at the seat, and
 * the whole figure comes down so the seat (her bottom) is the origin. Model metres (assets/blender/amanojaku.py): the
 * hip at y 0.44. About 1.0 m tall sitting, legs 0.4 m out in front (+Z).
 */
function sitAmanojaku(model: Group): Group {
  const out = model.clone(true);
  out.name = 'amanojaku-sit';
  const HIP = 0.44;
  const smooth = (a: number, b: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const X = new Vector3(1, 0, 0);
  const q = new Quaternion();
  // 5.5 cm behind the body's axis: the legs' underside comes out level with the seat.
  const axis = bodyAxis(out);
  const pivot = new Vector3(0, HIP, axis.z - 0.055);
  const v = new Vector3();
  out.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry = mesh.geometry.clone();
    const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
    const clay = isClay(mesh);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const below = 1 - smooth(HIP - 0.06, HIP + 0.06, v.y);
      if (below > 0) {
        if (clay) {
          // The legs, whole down to the boot heels (the hands hang further out, |x| > 0.22, and stay). In the blend
          // the turn is partial (not a straight line to the turned place), so the knee bends round instead of folding.
          const leg = below * (1 - smooth(0.19, 0.21, Math.abs(v.x - axis.x)));
          if (leg > 0) v.sub(pivot).applyQuaternion(q.setFromAxisAngle(X, (-Math.PI / 2) * leg)).add(pivot);
        } else {
          // What hangs behind (the cape's point) gathers under her at the seat.
          v.y = v.y + (HIP + (v.y - HIP) * 0.08 - v.y) * below;
        }
      }
      pos.setXYZ(i, v.x, v.y - HIP, v.z);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
  });
  return out;
}

/**
 * v1.11 (5-1): Sakasa's right arm (-X; the clay only, blended in at the shoulder as in poseAmanojaku) holding a stick
 * out in front: the upper arm hangs a little forward, the elbow bends the forearm forward, and the forearm turns so the
 * palm faces in (bendArm); the fingers curl into a fist. Returns the posed copy, the middle of the fist and the stick's
 * direction out of it: across the fist, forward and up 40°, so the stick lies in the closed hand between thumb and
 * fingers rather than through the palm.
 */
function holdStick(model: Group): { posed: Group; grip: Vector3; along: Vector3 } {
  const SIDE = -1;
  const out = model.clone(true);
  const axis = bodyAxis(out);
  // Palm and fingertips as built (model metres, assets/blender/amanojaku.py: palm at y 0.52, fingertips at 0.46).
  const palm = new Vector3();
  const tips = new Vector3();
  let nPalm = 0;
  let nTips = 0;
  const p = new Vector3();
  out.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !isClay(mesh)) return;
    const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      if (SIDE * (p.x - axis.x) < 0.24) continue;
      if (p.y > 0.5 && p.y < 0.56) {
        palm.add(p);
        nPalm++;
      } else if (p.y < 0.48) {
        tips.add(p);
        nTips++;
      }
    }
  });
  palm.divideScalar(Math.max(1, nPalm));
  tips.divideScalar(Math.max(1, nTips));
  const pose = armPose(axis, SIDE, new Vector3(SIDE * 0.35, -1, 0.25), new Vector3(SIDE * 0.1, -0.3, 1), 'in');
  // The fingers (below the knuckles, y 0.49) curl towards the palm side (+Z as built) into a fist, more the further
  // down, so they wrap round the stick, which runs across the hand just inside them.
  const KNUCKLE = 0.49;
  const knuckle = new Vector3(0, KNUCKLE, palm.z);
  const curl = new Quaternion();
  const smooth = (a: number, b: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const v = new Vector3();
  out.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !isClay(mesh)) return;
    mesh.geometry = mesh.geometry.clone();
    const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const w = armWeight(v, SIDE, axis.x);
      if (w <= 0) continue;
      if (SIDE * (v.x - axis.x) > 0.22 && v.y < KNUCKLE + 0.005) {
        knuckle.x = v.x;
        curl.setFromAxisAngle(new Vector3(1, 0, 0), -2.5 * smooth(KNUCKLE + 0.005, KNUCKLE - 0.03, v.y));
        v.sub(knuckle).applyQuaternion(curl).add(knuckle);
      }
      v.copy(bendArm(v, w, pose));
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
  });
  const grip = bendArm(new Vector3(palm.x, KNUCKLE, palm.z + 0.012), 1, pose);
  const fingers = bendArm(tips, 1, pose).sub(bendArm(palm, 1, pose)).normalize();
  const across = new Vector3(1, 0, 0).applyQuaternion(pose.hand);
  across.addScaledVector(fingers, -across.dot(fingers)).normalize();
  // The stick lies in the plane of across and fingers: of the directions there, the one rising 40° that reaches
  // furthest forward.
  const rise = Math.sin((40 * Math.PI) / 180);
  let along = across.clone();
  let best = -Infinity;
  for (let a = 0; a < Math.PI * 2; a += 0.005) {
    const d = across.clone().multiplyScalar(Math.cos(a)).addScaledVector(fingers, Math.sin(a));
    const score = d.z - 20 * Math.abs(d.y - rise);
    if (score > best) {
      best = score;
      along = d;
    }
  }
  return { posed: out, grip, along: along.normalize() };
}

/**
 * Sakasa's arm on `side` as built (model metres, assets/blender/amanojaku.py scaled 0.98 to 1.40 m): shoulder, elbow
 * and wrist on the arm's own line, and how to turn it: the upper arm to point along `upper`, the forearm along
 * `fore` (both as posed, model axes), and for `palm` 'in' the forearm turned about its length until the palm faces
 * her body. `hand` is the whole rotation the hand gets (for directions in it).
 */
interface ArmPose {
  shoulder: Vector3;
  elbow: Vector3;
  wrist: Vector3;
  upperLen: number;
  foreAxis: Vector3;
  turnShoulder: Quaternion;
  turnElbow: Quaternion;
  twist: Quaternion;
  hand: Quaternion;
}

function armPose(axis: { x: number; z: number }, side: number, upper: Vector3, fore: Vector3, palm?: 'in'): ArmPose {
  const S = 0.98;
  const shoulder = new Vector3(axis.x + side * 0.082 * S, 0.866 * S, axis.z);
  const elbow = new Vector3(axis.x + side * 0.18 * S, 0.735 * S, axis.z + 0.012 * S);
  const wrist = new Vector3(axis.x + side * 0.27 * S, 0.565 * S, axis.z + 0.025 * S);
  const u0 = elbow.clone().sub(shoulder);
  const upperLen = u0.length();
  u0.normalize();
  const f0 = wrist.clone().sub(elbow).normalize();
  const turnShoulder = new Quaternion().setFromUnitVectors(u0, upper.clone().normalize());
  // The elbow turn is made as built (before the shoulder's), so the forearm ends up along `fore`.
  const foreBuilt = fore.clone().normalize().applyQuaternion(turnShoulder.clone().invert());
  const turnElbow = new Quaternion().setFromUnitVectors(f0, foreBuilt);
  let twist = new Quaternion();
  if (palm === 'in') {
    // Of the turns about the forearm, the one that leaves the palm (+Z as built) facing her body the most.
    let best = -Infinity;
    for (let a = -Math.PI; a < Math.PI; a += 0.02) {
      const t = new Quaternion().setFromAxisAngle(f0, a);
      const n = new Vector3(0, 0, 1).applyQuaternion(t).applyQuaternion(turnElbow).applyQuaternion(turnShoulder);
      const score = -side * n.x;
      if (score > best) {
        best = score;
        twist = t;
      }
    }
  }
  const hand = turnShoulder.clone().multiply(turnElbow).multiply(twist);
  return { shoulder, elbow, wrist, upperLen, foreAxis: f0, turnShoulder, turnElbow, twist, hand };
}

/**
 * A point of Sakasa's arm as posed (`w`: its weight at the shoulder, armWeight). The forearm and hand (past the elbow
 * along the upper arm's line, blended over ±15% of its length) first turn about the forearm (spread along it, as a
 * forearm turns) and bend at the elbow; then the whole arm turns at the shoulder. Each turn is by a share of its
 * angle in the blends, so the arm bends round at both joints instead of folding or shrinking.
 */
function bendArm(p: Vector3, w: number, pose: ArmPose): Vector3 {
  const smooth = (a: number, b: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const share = (q: Quaternion, k: number): Quaternion => new Quaternion().slerp(q, k);
  const out = p.clone();
  const along = out.clone().sub(pose.shoulder).dot(pose.elbow.clone().sub(pose.shoulder)) / pose.upperLen ** 2;
  const fore = smooth(0.85, 1.15, along);
  if (fore > 0) {
    const down = out.clone().sub(pose.elbow).dot(pose.foreAxis) / pose.wrist.distanceTo(pose.elbow);
    const twist = fore * smooth(0, 0.9, down);
    out.sub(pose.elbow);
    if (twist > 0) out.applyQuaternion(share(pose.twist, twist));
    out.applyQuaternion(share(pose.turnElbow, fore)).add(pose.elbow);
  }
  return out.sub(pose.shoulder).applyQuaternion(share(pose.turnShoulder, w)).add(pose.shoulder);
}

/** How much a vertex of Sakasa's clay moves with the arm on `side` (shared by her arm poses). */
function armWeight(v: Vector3, side: number, axisX: number): number {
  const smooth = (a: number, b: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  // Whole hand down to the fingertips (y 0.45); below the hip a little further out, clear of the legs (x < 0.113).
  const inner = 0.1 + 0.015 * (1 - smooth(0.6, 0.66, v.y));
  return smooth(inner, inner + 0.04, side * (v.x - axisX)) * smooth(0.36, 0.4, v.y) * (1 - smooth(0.86, 0.9, v.y));
}

/** Where Sakasa's body axis stands (x, z): the middle of her waist (y 0.70–0.76, |x| < 0.1: the arms come to 0.11). */
function bodyAxis(model: Group): { x: number; z: number } {
  const lo = new Vector3(Infinity, 0, Infinity);
  const hi = new Vector3(-Infinity, 0, -Infinity);
  const p = new Vector3();
  model.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !isClay(mesh)) return;
    const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      if (p.y < 0.7 || p.y > 0.76 || Math.abs(p.x) > 0.1) continue;
      lo.min(p);
      hi.max(p);
    }
  });
  return Number.isFinite(lo.x) ? { x: (lo.x + hi.x) / 2, z: (lo.z + hi.z) / 2 } : { x: 0, z: 0 };
}

/** Sakasa's clay body (one baked skin texture) as against her solids (cape, collar, hat, brooch) and face decals. */
function isClay(mesh: Mesh): boolean {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some((m) => m.name.endsWith(' skin'));
}

function makePlaceholder(name: string): Group {
  const [w, h, d] = placeholderSize(name);
  const group = new Group();
  group.name = `${name}-placeholder`;
  const mesh = new Mesh(new BoxGeometry(w, h, d), new MeshLambertMaterial({ color: placeholderColor(name) }));
  mesh.position.y = h / 2;
  group.add(mesh);
  return group;
}
