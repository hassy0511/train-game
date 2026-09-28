import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { StageEvent } from '../../core/stage-events';
import { plowSpans } from '../../gimmick/plow';
import { resolvePlacement } from '../../stage/loader';
import type { PlowSpan, StageData } from '../../stage/types';
import { PLOW } from '../../train/params';
import type { ModelLibrary } from './models';

/**
 * The snowplow of chapter 4 in the scene (docs/PHASE8_CHAPTER3_4.md 第 6 部 §A10): the round yellow scoop on the
 * train's nose (folded up under the headlight, lowered with a quick swing), the snow walls (with the train's dent
 * after a "ぽすっ", gone once burst), the snow over the buried stretches (one mesh each, cleared from its start as the
 * snowplow goes: only the part still buried is drawn) with banks of thrown snow left on both sides, the snow flying
 * off the scoop in two arcs, and the lumps of a burst wall tumbling away. White and pale blue, never grey.
 */

/** The buried snow's cross-section: this many points across, half width (m), height over the rail (m). */
const COVER_POINTS = 9;
const COVER_HALF_WIDTH = 3.4;
const COVER_HEIGHT = 1.3;
/** Over a buried platform the snow reaches this far to its side, this high (m). */
const PLATFORM_COVER_WIDTH = 6.4;
const PLATFORM_COVER_HEIGHT = 2.6;
/** The cover starts this far behind the wall's face (m), sections every COVER_STEP m. */
const COVER_STEP = 1;
/** Banks of thrown snow: this far out (m), this high. */
const BANK_LATERAL = 4.3;
const BANK_HEIGHT = 0.8;
const BANK_WIDTH = 1.4;
const SNOW_TOP = new Color('#FBFDFF');
const SNOW_LOW = new Color('#D6E2F0');
const DENT_COLOR = '#B8C7DD';
const SPRAY_COUNT = 320;
const BALLS = 40;
/** Where the scoop sits on the lead car (m, car frame: +Z forward): down, and folded up under the headlight. */
const BLADE_DOWN = { y: 0.08, z: 6.45, tilt: 0, scale: 1 };
const BLADE_UP = { y: 0.95, z: 6.1, tilt: -1.15, scale: 0.8 };

interface WallVisual {
  span: PlowSpan;
  wall: Object3D | null;
  dent: Mesh | null;
  cover: Mesh | null;
  banks: Mesh | null;
  /** The face of the snow where the snowplow is cutting through it (one fan per section; the one at the cut is drawn). */
  caps: Mesh | null;
  /** The cover's s of each section, and the index count of one section's triangles. */
  coverFrom: number;
  sections: number;
  state: 'whole' | 'dented' | 'burst';
  cleared: number;
  center: Vector3;
}

/** A soft round dot for the flying snow, drawn once. */
function dotTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}

export class PlowGimmicks {
  readonly group = new Group();
  private readonly spans: PlowSpan[];
  private readonly walls = new Map<number, WallVisual>();
  private models: ModelLibrary | null = null;
  private blade: Object3D | null = null;
  private bladeLoading = false;
  private bladeDown = false;
  /** 0 = folded up, 1 = down (eased). */
  private bladeK = 0;
  private spraying = false;
  private sprayCarry = 0;
  private spray: Points<BufferGeometry, PointsMaterial> | null = null;
  private readonly sprayPos = new Float32Array(SPRAY_COUNT * 3);
  private readonly sprayVel = new Float32Array(SPRAY_COUNT * 3);
  private readonly sprayLife = new Float32Array(SPRAY_COUNT);
  private sprayNext = 0;
  private balls: InstancedMesh | null = null;
  private readonly ballPos: Vector3[] = [];
  private readonly ballVel: Vector3[] = [];
  private ballTime = Infinity;
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly matrix = new Matrix4();
  private readonly quat = new Quaternion();
  private readonly scale = new Vector3();
  /** The train's speed (m/s), set every frame by the scene. */
  trainSpeed = 0;

  constructor(
    private readonly stage: StageData,
    private readonly train: Object3D,
  ) {
    this.group.name = 'plow';
    this.spans = plowSpans(stage.file.gimmicks);
  }

  async init(models: ModelLibrary): Promise<void> {
    this.models = models;
    if (this.spans.length === 0) return;
    const coverMaterial = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide, emissive: new Color('#DDE6F2'), emissiveIntensity: 0.35 });
    const dentMaterial = new MeshLambertMaterial({ color: DENT_COLOR });
    const wallMaterial = new MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: new Color('#DDE6F2'), emissiveIntensity: 0.45 });
    const dentGeometry = new SphereGeometry(1, 12, 6);
    for (const span of this.spans) {
      const t = resolvePlacement({ onRail: { railId: span.railId, at: span.from + PLOW.wallDepth / 2, heightFromRail: -0.6 }, rotationY: 180 }, this.stage.network, null);
      const wall = (await models.load('snow-wall')).clone(true);
      // Snow in the wall's own shade stays white (a little light of its own, like the snowy ground).
      wall.traverse((o) => {
        if (o instanceof Mesh) o.material = wallMaterial;
      });
      wall.position.copy(t.position);
      wall.quaternion.copy(t.quaternion);
      wall.scale.set(span.width / 8, span.height / 5, 1);
      wall.name = `snow-wall-${span.index}`;
      this.group.add(wall);
      // The train's shape pressed into the face (only after a "ぽすっ").
      const dent = new Mesh(dentGeometry, dentMaterial);
      dent.name = `snow-dent-${span.index}`;
      dent.position.set(0, 2.4, 2.02);
      dent.scale.set(1.55 / (span.width / 8), 1.8 / (span.height / 5), 0.1);
      dent.visible = false;
      wall.add(dent);
      const hasStretch = span.to - span.from > PLOW.wallDepth + 2;
      const coverFrom = span.from + PLOW.wallDepth / 2;
      const built = hasStretch ? this.buildCover(span, coverFrom, coverMaterial) : null;
      if (built) this.group.add(built.cover, built.banks, built.caps);
      const center = t.position.clone().add(new Vector3(0, 2.4, 0));
      this.walls.set(span.index, {
        span,
        wall,
        dent,
        cover: built?.cover ?? null,
        banks: built?.banks ?? null,
        caps: built?.caps ?? null,
        coverFrom,
        sections: built?.sections ?? 0,
        state: 'whole',
        cleared: span.from,
        center,
      });
      this.applyCleared(this.walls.get(span.index) as WallVisual);
    }
    // The flying snow (one Points), and the lumps of a burst wall (one InstancedMesh).
    const geometry = new BufferGeometry();
    for (let i = 0; i < SPRAY_COUNT; i++) this.sprayPos[i * 3 + 1] = -9999;
    const attr = new Float32BufferAttribute(this.sprayPos, 3);
    attr.setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', attr);
    this.spray = new Points(
      geometry,
      // Not additive: white on the white snow would vanish. A light blue-white that reads against both sky and snow.
      new PointsMaterial({ color: '#E6EEF8', size: 0.85, map: dotTexture(), transparent: true, depthWrite: false, opacity: 0.95 }),
    );
    this.spray.name = 'plow-spray';
    this.spray.frustumCulled = false;
    this.group.add(this.spray);
    const balls = new InstancedMesh(new IcosahedronGeometry(0.42, 0), new MeshLambertMaterial({ color: '#FBFDFF', emissive: new Color('#E4ECF6'), emissiveIntensity: 0.7 }), BALLS);
    balls.name = 'plow-balls';
    balls.frustumCulled = false;
    balls.visible = false;
    for (let i = 0; i < BALLS; i++) {
      this.ballPos.push(new Vector3());
      this.ballVel.push(new Vector3());
    }
    this.balls = balls;
    this.group.add(balls);
  }

  /**
   * The snow over one buried stretch: arch-shaped sections every COVER_STEP m (wider and higher over a buried
   * platform), and the two banks the snowplow leaves. Both are ordered along the rail, so the cleared part is simply
   * not drawn (the cover's draw range starts after it, the banks' ends there).
   */
  private buildCover(span: PlowSpan, from: number, material: MeshLambertMaterial): { cover: Mesh; banks: Mesh; caps: Mesh; sections: number } | null {
    const rail = this.stage.network.getRail(span.railId);
    const count = Math.max(2, Math.floor((span.to - from) / COVER_STEP) + 1);
    // Buried platforms in this stretch: the snow reaches over them.
    const platforms = this.stage.file.stations
      .filter((st) => st.buried && st.railId === span.railId && st.at >= span.from && st.at <= span.to)
      // (It tapers off by the stop line, so a train standing there looks out over the track, not into a heap.)
      .map((st) => ({ from: st.at - 44, to: st.at - 2, side: st.platformSide === 'left' ? -1 : 1 }));
    const platformK = (s: number, side: number): number => {
      let k = 0;
      for (const p of platforms) {
        if (p.side !== side) continue;
        const edge = Math.min(s - p.from, p.to - s);
        k = Math.max(k, Math.min(1, Math.max(0, edge / 4)));
      }
      return k;
    };
    const positions: number[] = [];
    const colors: number[] = [];
    const bankPositions: number[] = [];
    const capPositions: number[] = [];
    const capColors: number[] = [];
    const c = new Color();
    for (let i = 0; i < count; i++) {
      const s = Math.min(span.to, from + i * COVER_STEP);
      const f = rail.frameAt(s);
      const kl = platformK(s, -1);
      const kr = platformK(s, 1);
      const height = COVER_HEIGHT + (PLATFORM_COVER_HEIGHT - COVER_HEIGHT) * Math.max(kl, kr);
      for (let j = 0; j < COVER_POINTS; j++) {
        const u = (j / (COVER_POINTS - 1)) * 2 - 1;
        const half = u < 0 ? COVER_HALF_WIDTH + (PLATFORM_COVER_WIDTH - COVER_HALF_WIDTH) * kl : COVER_HALF_WIDTH + (PLATFORM_COVER_WIDTH - COVER_HALF_WIDTH) * kr;
        const lumps = 1 + 0.08 * Math.sin(s * 0.9 + j * 1.7);
        const y = -0.6 + (height + 0.6) * Math.pow(Math.max(0, 1 - u * u), 0.55) * lumps;
        const p = this.tmp.copy(f.position).addScaledVector(f.right, u * half).addScaledVector(f.up, y);
        positions.push(p.x, p.y, p.z);
        c.copy(SNOW_LOW).lerp(SNOW_TOP, Math.min(1, Math.max(0, (y + 0.6) / (height + 0.6))));
        colors.push(c.r, c.g, c.b);
        capPositions.push(p.x, p.y, p.z);
        // The cut face is packed snow: a little bluer inside.
        c.lerp(SNOW_LOW, 0.4);
        capColors.push(c.r, c.g, c.b);
      }
      // The fan's middle, on the ground under the rail.
      const m = this.tmp.copy(f.position).addScaledVector(f.up, -0.6);
      capPositions.push(m.x, m.y, m.z);
      capColors.push(SNOW_LOW.r, SNOW_LOW.g, SNOW_LOW.b);
      // The banks: a low ridge on each side (none over a platform).
      for (const side of [-1, 1]) {
        const k = side < 0 ? kl : kr;
        const h = BANK_HEIGHT * (1 - k) * (1 + 0.15 * Math.sin(s * 0.7 + side));
        for (const [lat, up] of [
          [BANK_LATERAL - BANK_WIDTH, -0.5],
          [BANK_LATERAL, h - 0.3],
          [BANK_LATERAL + BANK_WIDTH, -0.5],
        ] as const) {
          const p = this.tmp.copy(f.position).addScaledVector(f.right, side * lat).addScaledVector(f.up, up);
          bankPositions.push(p.x, p.y, p.z);
        }
      }
    }
    const index: number[] = [];
    for (let i = 0; i + 1 < count; i++) {
      for (let j = 0; j + 1 < COVER_POINTS; j++) {
        const a = i * COVER_POINTS + j;
        const b = a + 1;
        const d = a + COVER_POINTS;
        const e = d + 1;
        index.push(a, d, b, b, d, e);
      }
    }
    const cover = new BufferGeometry();
    cover.setAttribute('position', new Float32BufferAttribute(positions, 3));
    cover.setAttribute('color', new Float32BufferAttribute(colors, 3));
    cover.setIndex(index);
    cover.computeVertexNormals();
    const bankIndex: number[] = [];
    for (let i = 0; i + 1 < count; i++) {
      for (let side = 0; side < 2; side++) {
        const base = i * 6 + side * 3;
        const next = base + 6;
        bankIndex.push(base, next, base + 1, base + 1, next, next + 1, base + 1, next + 1, base + 2, base + 2, next + 1, next + 2);
      }
    }
    const banks = new BufferGeometry();
    banks.setAttribute('position', new Float32BufferAttribute(bankPositions, 3));
    const bankColors = new Float32Array(bankPositions.length);
    for (let i = 0; i < bankColors.length; i += 3) {
      const top = (i / 3) % 3 === 1;
      c.copy(top ? SNOW_TOP : SNOW_LOW);
      bankColors.set([c.r, c.g, c.b], i);
    }
    banks.setAttribute('color', new Float32BufferAttribute(bankColors, 3));
    banks.setIndex(bankIndex);
    banks.computeVertexNormals();
    const capIndex: number[] = [];
    for (let i = 0; i < count; i++) {
      const base = i * (COVER_POINTS + 1);
      for (let j = 0; j + 1 < COVER_POINTS; j++) capIndex.push(base + COVER_POINTS, base + j, base + j + 1);
    }
    const caps = new BufferGeometry();
    caps.setAttribute('position', new Float32BufferAttribute(capPositions, 3));
    caps.setAttribute('color', new Float32BufferAttribute(capColors, 3));
    caps.setIndex(capIndex);
    caps.computeVertexNormals();
    // The cut face is lit by nothing but itself: bright packed snow, never a dark hole.
    const capMesh = new Mesh(caps, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }));
    capMesh.name = `snow-cut-${span.index}`;
    const coverMesh = new Mesh(cover, material);
    coverMesh.name = `snow-cover-${span.index}`;
    const bankMesh = new Mesh(banks, material);
    bankMesh.name = `snow-banks-${span.index}`;
    return { cover: coverMesh, banks: bankMesh, caps: capMesh, sections: count };
  }

  /** Only the part of a stretch still buried is drawn; the banks reach as far as it is cleared. */
  private applyCleared(w: WallVisual): void {
    if (!w.cover || !w.banks) return;
    const perSection = (COVER_POINTS - 1) * 6;
    const done = w.state === 'burst' ? Math.min(w.sections - 1, Math.max(0, Math.floor((w.cleared - w.coverFrom) / COVER_STEP))) : 0;
    const total = (w.sections - 1) * perSection;
    const start = done * perSection;
    w.cover.geometry.setDrawRange(start, total - start);
    w.cover.visible = start < total;
    const bankCount = done * 12;
    w.banks.geometry.setDrawRange(0, bankCount);
    w.banks.visible = bankCount > 0;
    if (w.caps) {
      const fan = (COVER_POINTS - 1) * 3;
      w.caps.geometry.setDrawRange(done * fan, fan);
      w.caps.visible = done > 0 && start < total;
    }
  }

  onEvent(e: StageEvent): void {
    if (e.type === 'ability' && e.id === 'plow') this.attachBlade();
    if (e.type === 'plow:blade') {
      this.bladeDown = e.down;
      this.attachBlade();
      if (e.instant) this.bladeK = e.down ? 1 : 0;
    }
    if (e.type === 'plow:wall') {
      const w = this.walls.get(e.index);
      if (!w) return;
      w.state = e.state;
      w.cleared = e.cleared;
      if (w.wall) w.wall.visible = e.state !== 'burst';
      if (w.dent) w.dent.visible = e.state === 'dented';
      this.applyCleared(w);
    }
    if (e.type === 'plow:burst') {
      const w = this.walls.get(e.index);
      if (w) this.burst(w.center, e.boosted);
    }
    if (e.type === 'plow:bump') {
      // A little puff of snow off the nose.
      this.emit(24, 3);
    }
    if (e.type === 'plow:spray') this.spraying = e.on;
  }

  /** The scoop goes on the train's nose once the snowplow is known (folded up until lowered). */
  private attachBlade(): void {
    if (this.blade || this.bladeLoading || !this.models) return;
    this.bladeLoading = true;
    void this.models.load('plow-blade').then((model) => {
      const blade = model.clone(true);
      blade.name = 'plow-blade';
      this.blade = blade;
      this.train.add(blade);
      this.placeBlade();
    });
  }

  private placeBlade(): void {
    const b = this.blade;
    if (!b) return;
    const k = this.bladeK;
    const lerp = (a: number, c: number): number => a + (c - a) * k;
    b.position.set(0, lerp(BLADE_UP.y, BLADE_DOWN.y), lerp(BLADE_UP.z, BLADE_DOWN.z));
    b.rotation.set(lerp(BLADE_UP.tilt, BLADE_DOWN.tilt), 0, 0);
    b.scale.setScalar(lerp(BLADE_UP.scale, BLADE_DOWN.scale));
  }

  /** "ずぼーん！": the wall's lumps fly out and tumble, and a cloud of powder with them (twice as much with the rocket). */
  private burst(center: Vector3, boosted: boolean): void {
    this.emit(boosted ? 160 : 90, boosted ? 9 : 6, center);
    if (!this.balls) return;
    const forward = this.tmp2.set(0, 0, 1).applyQuaternion(this.train.quaternion);
    const push = boosted ? 1.6 : 1;
    for (let i = 0; i < BALLS; i++) {
      const a = (i / BALLS) * Math.PI * 2 + Math.random() * 0.3;
      this.ballPos[i].copy(center).add(new Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.3) * 3, (Math.random() - 0.5) * 2));
      this.ballVel[i]
        .set(Math.cos(a) * (4 + Math.random() * 5), 4 + Math.random() * 6, Math.sin(a) * (2 + Math.random() * 3))
        .multiplyScalar(push)
        .addScaledVector(forward, 3 + this.trainSpeed * 0.5);
    }
    this.ballTime = 0;
    this.balls.visible = true;
  }

  /** Sends `n` bits of powder out from `at` (default: the scoop's two ends), `speed` m/s. */
  private emit(n: number, speed: number, at?: Vector3): void {
    if (!this.spray) return;
    const right = new Vector3(1, 0, 0).applyQuaternion(this.train.quaternion);
    const up = new Vector3(0, 1, 0).applyQuaternion(this.train.quaternion);
    const forward = new Vector3(0, 0, 1).applyQuaternion(this.train.quaternion);
    for (let k = 0; k < n; k++) {
      const i = this.sprayNext;
      this.sprayNext = (this.sprayNext + 1) % SPRAY_COUNT;
      const side = Math.random() < 0.5 ? -1 : 1;
      const origin = at ?? this.train.localToWorld(this.tmp.set(side * 1.8, 0.7, 6.6));
      this.sprayPos.set([origin.x + (Math.random() - 0.5), origin.y + Math.random(), origin.z + (Math.random() - 0.5)], i * 3);
      const v = this.tmp2
        .copy(right)
        .multiplyScalar(side * speed * (0.6 + Math.random() * 0.8))
        .addScaledVector(up, speed * (0.5 + Math.random() * 0.7))
        // Thrown aside, the snow keeps the train's speed for a while (it flies beside the cab, not behind it).
        .addScaledVector(forward, this.trainSpeed * (at ? Math.random() : 0.95 + 0.3 * Math.random()));
      this.sprayVel.set([v.x, v.y, v.z], i * 3);
      this.sprayLife[i] = 0.8 + Math.random() * 0.6;
    }
  }

  update(dt: number): void {
    // The scoop swings down in PLOW.dropSeconds and folds up in PLOW.riseSeconds.
    const target = this.bladeDown ? 1 : 0;
    if (this.bladeK !== target) {
      const step = dt / (this.bladeDown ? PLOW.dropSeconds : PLOW.riseSeconds);
      this.bladeK = this.bladeDown ? Math.min(1, this.bladeK + step) : Math.max(0, this.bladeK - step);
    }
    this.placeBlade();
    if (!this.spray) return;
    // Snow thrown off both ends of the scoop in two arcs, more and higher the faster the train goes.
    if (this.spraying && this.bladeK > 0.5) {
      this.sprayCarry += dt * (70 + this.trainSpeed * 14);
      const n = Math.floor(this.sprayCarry);
      this.sprayCarry -= n;
      this.emit(n, 4 + this.trainSpeed * 0.35);
    } else this.sprayCarry = 0;
    let alive = false;
    for (let i = 0; i < SPRAY_COUNT; i++) {
      if (this.sprayLife[i] <= 0) continue;
      this.sprayLife[i] -= dt;
      if (this.sprayLife[i] <= 0) {
        this.sprayPos[i * 3 + 1] = -9999;
        continue;
      }
      alive = true;
      this.sprayVel[i * 3 + 1] -= 9.8 * dt;
      for (let a = 0; a < 3; a++) this.sprayPos[i * 3 + a] += this.sprayVel[i * 3 + a] * dt;
    }
    this.spray.visible = alive;
    if (alive) (this.spray.geometry.getAttribute('position') as Float32BufferAttribute).needsUpdate = true;
    // The lumps of a burst wall: they fly and tumble, and melt away after 1.5 s.
    if (this.balls && this.ballTime < 1.5) {
      this.ballTime += dt;
      const shrink = Math.max(0, 1 - Math.max(0, this.ballTime - 1) / 0.5);
      for (let i = 0; i < BALLS; i++) {
        const p = this.ballPos[i];
        const v = this.ballVel[i];
        v.y -= 9.8 * dt;
        p.addScaledVector(v, dt);
        this.scale.setScalar(shrink * (0.7 + (i % 4) * 0.2));
        this.quat.setFromAxisAngle(this.tmp.set(1, 0, 0), this.ballTime * (3 + (i % 5)));
        this.matrix.compose(p, this.quat, this.scale);
        this.balls.setMatrixAt(i, this.matrix);
      }
      this.balls.instanceMatrix.needsUpdate = true;
      if (this.ballTime >= 1.5) this.balls.visible = false;
    }
  }
}
