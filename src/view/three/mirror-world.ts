import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { StageEvent } from '../../core/stage-events';
import { flipSections, type FlipSection } from '../../gimmick/mirror-flip';
import { phantomsOf, type Phantom } from '../../gimmick/phantom';
import type { Rail } from '../../rail/types';
import { resolvePlacement } from '../../stage/loader';
import type { LetterSignParams, StageData } from '../../stage/types';
import { MIRROR_WORLD, TRAIN } from '../../train/params';
import type { ModelLibrary } from './models';
import { buildTrack, type TrackSkip } from './rail-mesh';

/**
 * v1.11 (5-3) the mirror world in the scene (PHASE9_CHAPTER5_6 第 6 部 §8, ticket 0020's 5-3 section; drawn in code):
 * the mirror gates (a silver and lavender arch over the rail with rippling glass; a shut whistle gate is frosted),
 * Sakasa's phantoms (a false way's pink rail and a false bridge over a gap, pink sparkles rising off them; they pop into
 * pink bubbles, "ぽわん", and come back after a rewind), the glass stretches (see-through rails with sparkles running
 * along), the letter signs (kana on a cream board, mirror-wise when asked, a pink swirl in the corner) and the lavender
 * cushions at the end of the false ways. The reflections themselves are the mirrors' (ice.ts): phantoms are never in
 * them, glass is plain rail there. Nothing dark, nothing that shivers or breaks.
 */

const PINK = new Color('#ffc6e4');
const PINK_SPARK = '#ff9fd2';
const GLASS = '#e9f6ff';
const SILVER = '#d9d6ea';
const LAVENDER = '#b9a8ec';
const SIGN_CREAM = '#fff8e6';
const SIGN_INK = '#5a4a3a';
const SIGN_PINK = '#e8579f';
/** Sparkles over a phantom (Points each). */
const PHANTOM_SPARKS = 40;
const GLASS_SPARKS = 20;

const gateVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
/** The gate's glass: pale blue with soft rings (a water-like wobble); frosted it is a milky lavender. */
const gateFragment = `
uniform float time;
uniform float frost;
uniform float ripple;
varying vec2 vUv;
void main() {
  vec2 c = vUv - vec2(0.5, 0.45);
  float d = length(c * vec2(1.4, 1.0));
  float rings = 0.5 + 0.5 * sin(d * 38.0 - time * (2.0 + ripple * 6.0));
  float band = smoothstep(0.06, 0.0, abs(fract(vUv.x * 0.7 + vUv.y * 0.4 - time * 0.1) - 0.5) - 0.02);
  vec3 glass = mix(vec3(0.92, 0.96, 1.0), vec3(0.97, 0.94, 1.0), vUv.y);
  vec3 col = glass + vec3(0.04) * rings * (0.4 + ripple) + vec3(0.06) * band;
  float a = mix(0.42 + 0.08 * rings * (0.5 + ripple), 0.86, frost);
  gl_FragColor = vec4(mix(col, vec3(0.95, 0.93, 1.0), frost * 0.7), a);
}
`;

interface GateVisual {
  section: FlipSection;
  entry: boolean;
  glass: ShaderMaterial;
  /** Seconds of the "ぽわわん" wobble left. */
  wobble: number;
}

interface PhantomVisual {
  phantom: Phantom;
  group: Group;
  materials: MeshLambertMaterial[];
  opacities: number[];
  sparks: Points;
  sparkBase: Float32Array;
  /** −1: whole; 0…1: popping (gone at 1). */
  pop: number;
  bubbles: Points | null;
}

export class MirrorWorldGimmicks {
  readonly group = new Group();
  private readonly gates: GateVisual[] = [];
  private readonly phantoms: PhantomVisual[] = [];
  private readonly glassSparks: { points: Points; rail: Rail; from: number; to: number; phase: Float32Array }[] = [];
  private time = 0;

  /** A stage with any of it. */
  static wanted(stage: StageData): boolean {
    const f = stage.file;
    return (
      flipSections(f.gimmicks).length > 0 ||
      phantomsOf(f).length > 0 ||
      f.rails.some((r) => r.glass?.length) ||
      f.gimmicks.some((g) => g.type === 'letter-sign')
    );
  }

  /** The track this layer draws itself (left out of the usual track): the phantom rails and the glass stretches. */
  static trackSkips(stage: StageData): TrackSkip[] {
    const out: TrackSkip[] = [];
    for (const p of phantomsOf(stage.file)) {
      if (p.kind === 'way') out.push({ railId: p.railId, from: -1, to: stage.network.getRail(p.railId).length + 2 });
    }
    for (const r of stage.file.rails) for (const k of r.glass ?? []) out.push({ railId: r.id, from: k.from, to: k.to });
    return out;
  }

  /** The rails whose end buffer this layer draws as a cushion (the false ways). */
  static cushionRails(stage: StageData): string[] {
    return phantomsOf(stage.file)
      .filter((p) => p.kind === 'way')
      .map((p) => p.railId);
  }

  constructor(private readonly stage: StageData) {
    this.group.name = 'mirror-world';
    const file = stage.file;
    for (const sec of flipSections(file.gimmicks)) {
      this.addGate(sec, true);
      this.addGate(sec, false);
    }
    for (const p of phantomsOf(file)) this.addPhantom(p);
    for (const r of file.rails) for (const k of r.glass ?? []) this.addGlass(stage.network.getRail(r.id), k.from, k.to);
    for (const g of file.gimmicks) if (g.type === 'letter-sign') this.addLetterSign(g.params as unknown as LetterSignParams);
  }

  /** The cushions at the end of the false ways (model "mirror-cushion"). */
  async init(models: ModelLibrary): Promise<void> {
    const rails = MirrorWorldGimmicks.cushionRails(this.stage);
    if (rails.length === 0) return;
    const cushion = await models.load('mirror-cushion');
    for (const id of rails) {
      const rail = this.stage.network.getRail(id);
      const f = rail.frameAt(rail.length);
      const c = cushion.clone(true);
      c.name = `cushion:${id}`;
      c.position.copy(f.position);
      const basis = new Matrix4().makeBasis(new Vector3().crossVectors(f.up, f.tangent).normalize(), f.up, f.tangent);
      c.quaternion.setFromRotationMatrix(basis);
      this.group.add(c);
    }
  }

  // ---- gates ----

  private addGate(sec: FlipSection, entry: boolean): void {
    const rail = this.stage.network.getRail(sec.railId);
    const f = rail.frameAt(entry ? sec.from : sec.to);
    const W = sec.width;
    const H = sec.height;
    const P = 1.2;
    const arch = new Group();
    arch.name = `mirror-gate:${sec.id}:${entry ? 'in' : 'out'}`;
    arch.position.copy(f.position);
    // +Z along the rail (the way the train goes); the glass faces back (−Z), towards the train coming up to it.
    const basis = new Matrix4().makeBasis(new Vector3().crossVectors(f.up, f.tangent).normalize(), f.up, f.tangent);
    arch.quaternion.setFromRotationMatrix(basis);
    const paint = (g: BufferGeometry, color: string): BufferGeometry => {
      const n = g.index ? g.toNonIndexed() : g;
      if (n !== g) g.dispose();
      if (n.getAttribute('uv')) n.deleteAttribute('uv');
      const c = new Color(color);
      const cols = new Float32Array(n.getAttribute('position').count * 3);
      for (let i = 0; i < cols.length; i += 3) cols.set([c.r, c.g, c.b], i);
      n.setAttribute('color', new Float32BufferAttribute(cols, 3));
      return n;
    };
    const parts = [
      paint(new BoxGeometry(P, H + P, P), SILVER).translate(-(W + P) / 2, (H + P) / 2, 0),
      paint(new BoxGeometry(P, H + P, P), SILVER).translate((W + P) / 2, (H + P) / 2, 0),
      paint(new BoxGeometry(W + 2 * P, P, P), SILVER).translate(0, H + P / 2, 0),
      // Lavender caps and a rim round the glass.
      paint(new BoxGeometry(P * 1.5, 0.5, P * 1.5), LAVENDER).translate(-(W + P) / 2, H + P + 0.25, 0),
      paint(new BoxGeometry(P * 1.5, 0.5, P * 1.5), LAVENDER).translate((W + P) / 2, H + P + 0.25, 0),
      paint(new BoxGeometry(W + 0.3, 0.25, 0.3), LAVENDER).translate(0, H - 0.1, 0),
      paint(new BoxGeometry(P * 1.6, 0.4, P * 1.6), LAVENDER).translate(-(W + P) / 2, 0.2, 0),
      paint(new BoxGeometry(P * 1.6, 0.4, P * 1.6), LAVENDER).translate((W + P) / 2, 0.2, 0),
    ];
    const archMesh = new Mesh(mergeGeometries(parts) ?? new BufferGeometry(), new MeshLambertMaterial({ vertexColors: true, emissive: new Color('#4E4A66') }));
    for (const p of parts) p.dispose();
    arch.add(archMesh);
    const material = new ShaderMaterial({
      uniforms: { time: { value: 0 }, frost: { value: entry && sec.gate === 'whistle' ? 1 : 0 }, ripple: { value: 0 } },
      vertexShader: gateVertex,
      fragmentShader: gateFragment,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    const glass = new Mesh(new PlaneGeometry(W, H).translate(0, H / 2, 0), material);
    glass.name = `mirror-gate-glass:${sec.id}:${entry ? 'in' : 'out'}`;
    glass.rotation.y = Math.PI;
    arch.add(glass);
    this.group.add(arch);
    this.gates.push({ section: sec, entry, glass: material, wobble: 0 });
  }

  // ---- phantoms ----

  private addPhantom(p: Phantom): void {
    const rail = this.stage.network.getRail(p.railId);
    const group = new Group();
    group.name = `phantom:${p.id}`;
    const materials: MeshLambertMaterial[] = [];
    const opacities: number[] = [];
    const add = (geometry: BufferGeometry | null, opacity: number): void => {
      if (!geometry) return;
      const material = new MeshLambertMaterial({ vertexColors: true, color: PINK, emissive: PINK, emissiveIntensity: 0.25, transparent: true, opacity, depthWrite: false });
      materials.push(material);
      opacities.push(opacity);
      group.add(new Mesh(geometry, material));
    };
    let from = 0;
    let to = rail.length;
    if (p.kind === 'way') {
      // The last MIRROR_WORLD.phantomFade m thin out to sparkles (it never shivers: nothing is about to fall).
      const fade = Math.max(0, rail.length - MIRROR_WORLD.phantomFade);
      add(buildTrack(rail, 0, fade), 0.82);
      add(buildTrack(rail, fade, rail.length), 0.38);
    } else if (p.gap) {
      // A false bridge: planks and rails over the gap, a metre onto each side.
      from = p.gap.from - 1;
      to = p.gap.to + 1;
      add(falseBridge(rail, from, to), 0.85);
    }
    // Pink sparkles drifting up off it.
    const base = new Float32Array(PHANTOM_SPARKS * 3);
    for (let i = 0; i < PHANTOM_SPARKS; i++) {
      const s = from + ((i + 0.5) / PHANTOM_SPARKS) * (to - from);
      const fr = rail.frameAt(s);
      const side = ((i * 7) % 5) / 2 - 1;
      base.set([fr.position.x + fr.right.x * side * 1.2, fr.position.y + 0.3, fr.position.z + fr.right.z * side * 1.2], i * 3);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(base.slice(), 3));
    const sparks = new Points(geometry, new PointsMaterial({ color: PINK_SPARK, map: dotTexture(), size: 0.7, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    sparks.name = `phantom-sparks:${p.id}`;
    sparks.frustumCulled = false;
    group.add(sparks);
    this.group.add(group);
    this.phantoms.push({ phantom: p, group, materials, opacities, sparks, sparkBase: base, pop: -1, bubbles: null });
  }

  /** Pink bubbles puffing up where a phantom popped ("ぽわん"). */
  private popBubbles(v: PhantomVisual): void {
    const rail = this.stage.network.getRail(v.phantom.railId);
    const from = v.phantom.gap ? v.phantom.gap.from : 0;
    const to = v.phantom.gap ? v.phantom.gap.to : rail.length;
    const n = 24;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const fr = rail.frameAt(from + ((i + 0.5) / n) * (to - from));
      pos.set([fr.position.x + (((i * 5) % 7) / 3 - 1), fr.position.y + 0.5, fr.position.z + (((i * 3) % 5) / 2 - 1)], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    v.bubbles?.removeFromParent();
    v.bubbles = new Points(g, new PointsMaterial({ color: '#ffd6ee', map: dotTexture(), size: 1.4, transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
    v.bubbles.frustumCulled = false;
    this.group.add(v.bubbles);
  }

  // ---- glass ----

  private addGlass(rail: Rail, from: number, to: number): void {
    const geometry = buildTrack(rail, from, to);
    if (geometry) {
      const mesh = new Mesh(
        geometry,
        new MeshLambertMaterial({ color: GLASS, emissive: new Color('#bfe6ff'), emissiveIntensity: 0.35, transparent: true, opacity: MIRROR_WORLD.glassOpacity, depthWrite: false }),
      );
      mesh.name = `glass:${rail.id}:${from}`;
      this.group.add(mesh);
    }
    // Two white edges, faintly lit (the rails' tops).
    const edges: BufferGeometry[] = [];
    for (let s = from; s < to; s += 2) {
      const a = rail.frameAt(s);
      for (const side of [-0.75, 0.75]) {
        const box = new BoxGeometry(0.08, 0.06, 2).translate(0, 0, 1);
        const m = new Matrix4().makeBasis(a.right, a.up, a.tangent).setPosition(a.position.clone().addScaledVector(a.right, side).addScaledVector(a.up, 0.2));
        edges.push(box.applyMatrix4(m));
      }
    }
    const merged = edges.length ? mergeGeometries(edges) : null;
    for (const e of edges) e.dispose();
    if (merged) {
      const rim = new Mesh(merged, new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false }));
      rim.name = `glass-rim:${rail.id}:${from}`;
      this.group.add(rim);
    }
    const pos = new Float32Array(GLASS_SPARKS * 3);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    const points = new Points(g, new PointsMaterial({ color: '#ffffff', map: dotTexture(), size: 0.5, transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending }));
    points.frustumCulled = false;
    this.group.add(points);
    const phase = new Float32Array(GLASS_SPARKS);
    for (let i = 0; i < GLASS_SPARKS; i++) phase[i] = i / GLASS_SPARKS;
    this.glassSparks.push({ points, rail, from, to, phase });
  }

  // ---- letter signs ----

  private addLetterSign(p: LetterSignParams): void {
    const t = resolvePlacement(p, this.stage.network, this.stage.file.environment.ground?.y ?? null);
    const sign = new Group();
    sign.name = `letter-sign:${p.text}`;
    sign.position.copy(t.position);
    sign.quaternion.copy(t.quaternion);
    const legs = new Mesh(
      mergeGeometries([new BoxGeometry(0.16, 1.2, 0.16).translate(-1.4, 0.6, 0), new BoxGeometry(0.16, 1.2, 0.16).translate(1.4, 0.6, 0)]) ?? new BufferGeometry(),
      new MeshLambertMaterial({ color: SILVER }),
    );
    const board = new Mesh(new BoxGeometry(4.2, 1.8, 0.14).translate(0, 2.1, -0.02), new MeshLambertMaterial({ color: SIGN_PINK }));
    const face = new Mesh(new PlaneGeometry(4, 1.6).translate(0, 2.1, 0.06), new MeshBasicMaterial({ map: letterTexture(p.text, p.mirror === true), color: '#ffffff' }));
    face.name = 'letter-sign-face';
    sign.add(legs, board, face);
    this.group.add(sign);
  }

  // ---- events and frames ----

  onEvent(e: StageEvent): void {
    if (e.type === 'flip:gate' && e.state === 'open') {
      for (const g of this.gates) {
        if (g.section.id !== e.id || !g.entry) continue;
        g.glass.uniforms.frost.value = 0;
        g.wobble = e.instant ? 0 : 0.5;
      }
    }
    if (e.type === 'phantom') {
      const v = this.phantoms.find((x) => x.phantom.id === e.id);
      if (!v) return;
      if (e.state === 'solid') {
        v.pop = -1;
        v.group.visible = true;
        v.group.scale.set(1, 1, 1);
        v.materials.forEach((m, i) => (m.opacity = v.opacities[i]));
        v.bubbles?.removeFromParent();
        v.bubbles = null;
      } else if (v.pop < 0) {
        v.pop = 0;
        this.popBubbles(v);
      }
    }
  }

  update(dt: number, trainFront: { railId: string; s: number }): void {
    this.time += dt;
    for (const g of this.gates) {
      g.glass.uniforms.time.value = this.time;
      // An open gate ripples as the train comes up to it (the whistle's wobble on top).
      const at = g.entry ? g.section.from : g.section.to;
      const d = trainFront.railId === g.section.railId ? at - trainFront.s : Infinity;
      const near = d > -2 && d < MIRROR_WORLD.openRipple ? 1 - Math.max(0, d) / MIRROR_WORLD.openRipple : 0;
      g.wobble = Math.max(0, g.wobble - dt);
      g.glass.uniforms.ripple.value = g.glass.uniforms.frost.value > 0 ? 0 : Math.max(near, g.wobble * 2);
    }
    for (const v of this.phantoms) {
      if (v.pop >= 0 && v.pop < 1) {
        v.pop = Math.min(1, v.pop + dt / MIRROR_WORLD.phantomPop);
        v.materials.forEach((m, i) => (m.opacity = v.opacities[i] * (1 - v.pop)));
        v.group.scale.y = 1 - 0.6 * v.pop;
        if (v.pop >= 1) v.group.visible = false;
      }
      if (v.bubbles) {
        const attr = v.bubbles.geometry.getAttribute('position') as Float32BufferAttribute;
        for (let i = 0; i < attr.count; i++) attr.setY(i, attr.getY(i) + dt * (1.2 + (i % 3) * 0.4));
        attr.needsUpdate = true;
        const m = v.bubbles.material as PointsMaterial;
        m.opacity = Math.max(0, m.opacity - dt * 0.9);
        if (m.opacity <= 0) {
          v.bubbles.removeFromParent();
          v.bubbles = null;
        }
      }
      if (!v.group.visible) continue;
      const attr = v.sparks.geometry.getAttribute('position') as Float32BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        const rise = ((this.time * 0.35 + i * 0.137) % 1) * 2.2;
        attr.setY(i, v.sparkBase[i * 3 + 1] + rise);
      }
      attr.needsUpdate = true;
    }
    for (const gs of this.glassSparks) {
      const attr = gs.points.geometry.getAttribute('position') as Float32BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        const k = (gs.phase[i] + this.time * 0.12) % 1;
        const f = gs.rail.frameAt(gs.from + k * (gs.to - gs.from));
        const side = i % 2 ? 0.75 : -0.75;
        attr.setXYZ(i, f.position.x + f.right.x * side, f.position.y + 0.25 + f.up.y * 0.05, f.position.z + f.right.z * side);
      }
      attr.needsUpdate = true;
    }
  }
}

let dot: CanvasTexture | null = null;
/** A soft round dot for the sparkles and bubbles (drawn once). */
function dotTexture(): CanvasTexture | null {
  if (dot || typeof document === 'undefined') return dot;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  dot = new CanvasTexture(c);
  return dot;
}

/** A false bridge from `from` to `to` on `rail`: rails over planks, as one vertex-coloured geometry (tinted pink). */
function falseBridge(rail: Rail, from: number, to: number): BufferGeometry | null {
  const parts: BufferGeometry[] = [];
  const white = new Color('#ffffff');
  const paint = (g: BufferGeometry): BufferGeometry => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    if (n.getAttribute('uv')) n.deleteAttribute('uv');
    const cols = new Float32Array(n.getAttribute('position').count * 3);
    for (let i = 0; i < cols.length; i += 3) cols.set([white.r, white.g, white.b], i);
    n.setAttribute('color', new Float32BufferAttribute(cols, 3));
    return n;
  };
  for (let s = from; s <= to; s += 0.8) {
    const f = rail.frameAt(s);
    const m = new Matrix4().makeBasis(f.right, f.up, f.tangent).setPosition(f.position.clone().addScaledVector(f.up, -0.1));
    parts.push(paint(new BoxGeometry(2.6, 0.12, 0.5)).applyMatrix4(m));
  }
  const f0 = rail.frameAt((from + to) / 2);
  for (const side of [-0.75, 0.75]) {
    const m = new Matrix4().makeBasis(f0.right, f0.up, f0.tangent).setPosition(f0.position.clone().addScaledVector(f0.right, side).addScaledVector(f0.up, 0.1));
    parts.push(paint(new BoxGeometry(0.12, 0.16, to - from)).applyMatrix4(m));
  }
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * A letter sign's face: `text` in big round brown letters on cream with a pink rim and Sakasa's swirl in the corner,
 * written mirror-wise when `mirror` (read right only in a mirror, or in "かがみの なか"). One 256 × 128 canvas.
 */
function letterTexture(text: string, mirror: boolean): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = SIGN_CREAM;
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = SIGN_PINK;
  g.lineWidth = 8;
  g.strokeRect(4, 4, 248, 120);
  g.save();
  if (mirror) {
    g.translate(256, 0);
    g.scale(-1, 1);
  }
  g.fillStyle = SIGN_INK;
  const size = Math.min(64, Math.floor(220 / Math.max(1, [...text].length)));
  g.font = `bold ${size}px "Hiragino Maru Gothic ProN", "Rounded Mplus 1c", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 66);
  g.restore();
  // The swirl (Sakasa's mark), bottom right as seen.
  g.strokeStyle = SIGN_PINK;
  g.lineWidth = 3;
  g.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 4.4;
    const r = 2 + (i / 40) * 12;
    const x = 226 + Math.cos(a) * r;
    const y = 100 + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  const texture = new CanvasTexture(c);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Keeps the train-front helper in one place (the scene view passes the pose's rail and front). */
export function trainFrontOf(pose: { railId: string; s: number }): { railId: string; s: number } {
  return { railId: pose.railId, s: pose.s + TRAIN.length / 2 };
}
