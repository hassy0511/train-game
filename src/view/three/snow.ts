import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  Group,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
} from 'three';
import type { StageEvent } from '../../core/stage-events';
import type { CameraTarget } from '../camera-rig';
import type { TrainPose } from '../../train/types';
import { tunnelZones, type TunnelZone } from '../../gimmick/tunnel';
import type { StageData } from '../../stage/types';
import { MAGNET, SNOW_WAVE, TRAIN, TUNNEL } from '../../train/params';
import { bakeModel } from './bake';
import type { EnvironmentState } from './environment-state';
import { hash, mix } from './placeholder-kit';
import type { ModelLibrary } from './models';
import { setFakeExitGlow } from './snow-placeholders';

const UP = new Vector3(0, 1, 0);
/** The tube's floor under the rail top (m). */
const FLOOR = -0.8;
/** The wave's front is this far ahead of its model's origin (m, the model's balls reach this far along +Z). */
const WAVE_NOSE = 8;

/** Where the snow wave is, as main.ts hands it over every frame. */
export interface SnowWaveInfo {
  railId: string;
  s: number;
  speed: number;
  state: string;
}

/**
 * The snowy mountain of 4-3 in the scene (docs/PHASE8_CHAPTER3_4.md 第 8 部 §4.1–4.2, §8): the tunnels (an arched tube
 * of pale ice and rock round the track, stone mouths with icicles, the daylight at the far end), the dark inside them
 * (the fog and the light ease to the tunnel's; the light lets the train see further; the falling snow stops), the snow
 * wave rolling along behind the train (one round white heap, no face; it settles into a low heap at the fence), and
 * the false exit's swirl lighting up once the light has seen through it.
 */
export class SnowGimmicks {
  readonly group = new Group();
  private readonly zones: TunnelZone[];
  private inside: TunnelZone | null = null;
  /** 0 outside, 1 all the way into a tunnel's dark. */
  private dark = 0;
  private lightOn = false;
  /** v1.11 (PR5): the light button is in the magnet step. */
  private magnetOn = false;
  private readonly tint = new Color();
  private wave: Object3D | null = null;
  private powder: Points<BufferGeometry, PointsMaterial> | null = null;
  private waveInfo: SnowWaveInfo | null = null;
  private waveS: number | null = null;
  private waveClock = 0;
  private settle = 0;
  /** The middle of the snow wave while it chases (the side and back cameras take it into the picture), or null. */
  waveFocus: Vector3 | null = null;
  private readonly focus = new Vector3();
  private reveal = 0;
  private revealTarget = 0;
  private readonly revealIds: Set<string>;

  static wanted(stage: StageData): boolean {
    return (
      tunnelZones(stage.file.gimmicks).length > 0 ||
      stage.file.missions.some((m) => m.steps.some((s) => s.chase)) ||
      stage.file.props.some((p) => p.reveal)
    );
  }

  constructor(
    private readonly stage: StageData,
    private readonly scene: Scene,
    /** The look (PHASE9 B6.1): the fog's colour and the lights as it sets them, read every frame (it may change). */
    private readonly look: EnvironmentState,
  ) {
    this.group.name = 'snow-mountain';
    this.zones = tunnelZones(stage.file.gimmicks);
    this.revealIds = new Set(stage.file.props.flatMap((p) => (p.reveal ? [p.reveal] : [])));
    setFakeExitGlow(0);
  }

  async init(models: ModelLibrary): Promise<void> {
    const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide });
    for (const z of this.zones) {
      for (const [from, to] of this.tubeStretches(z)) {
        const tube = z.look === 'toybox' ? this.buildBox(z.railId, from, to) : this.buildTube(z.railId, from, to);
        if (!tube) continue;
        const mesh = new Mesh(tube, material);
        mesh.name = `tunnel:${z.index}:${Math.round(from)}`;
        this.group.add(mesh);
      }
    }
    this.addStickers();
    const portal = this.zones.some((z) => z.portal && z.look === 'ice') ? await models.load('tunnel-portal') : null;
    // v1.11 (5-2): the toy box's mouth is its open lid.
    const lid = this.zones.some((z) => z.portal && z.look === 'toybox') ? await models.load('toybox-lid') : null;
    const glow = this.zones.some((z) => z.portal) ? await models.load('exit-glow') : null;
    for (const z of this.zones) {
      const mouth = z.look === 'toybox' ? lid : portal;
      if (!z.portal || !mouth || !glow) continue;
      // The mouths: their outside faces away from the tunnel (+Z of the model).
      this.place(mouth, z.railId, z.from, -1, 0);
      this.place(mouth, z.railId, z.to, 1, 0);
      // The daylight at the far end, facing in (only seen from inside).
      this.place(glow, z.railId, z.to + 2.5, -1, 0);
    }
    if (this.stage.file.missions.some((m) => m.steps.some((s) => s.chase))) {
      const model = await models.load('snow-wave');
      this.wave = (bakeModel(model) ?? model).clone(true);
      this.wave.name = 'snow-wave';
      this.wave.visible = false;
      this.group.add(this.wave);
      this.powder = buildPowder();
      this.powder.visible = false;
      this.group.add(this.powder);
    }
  }

  /** The stretches of a tunnel that get a tube: all of it but its ice hall. */
  private tubeStretches(z: TunnelZone): [number, number][] {
    if (z.hall === 'all') return [];
    if (!z.hall) return [[z.from, z.to]];
    return [
      [z.from, z.hall.from],
      [z.hall.to, z.to],
    ].filter(([a, b]) => b - a > 1) as [number, number][];
  }

  /**
   * The arched tube along `railId` from `from` to `to`: a flat snowy floor, straight walls and a round roof (TUNNEL.width
   * × TUNNEL.height), a ring every TUNNEL.ring m of TUNNEL.segments pieces, level (not tipped with the track).
   */
  private buildTube(railId: string, from: number, to: number): BufferGeometry | null {
    const rail = this.stage.network.rails.get(railId);
    if (!rail) return null;
    const half = TUNNEL.width / 2;
    const spring = TUNNEL.height + FLOOR - half;
    // The cross-section (x across, y up), floor first: left corner, up the wall, over the roof, down, back across.
    const profile: [number, number][] = [[-half, FLOOR], [-half, spring]];
    const arc = TUNNEL.segments - 4;
    for (let i = 1; i < arc; i++) {
      const a = Math.PI - (Math.PI * i) / arc;
      profile.push([Math.cos(a) * half, spring + Math.sin(a) * half]);
    }
    profile.push([half, spring], [half, FLOOR], [-half, FLOOR]);
    const rings: Vector3[][] = [];
    const right = new Vector3();
    const steps = Math.max(1, Math.ceil((to - from) / TUNNEL.ring));
    for (let i = 0; i <= steps; i++) {
      const s = from + ((to - from) * i) / steps;
      const f = rail.frameAt(s);
      right.crossVectors(f.tangent, UP).normalize();
      rings.push(profile.map(([x, y]) => f.position.clone().addScaledVector(right, x).addScaledVector(UP, y)));
    }
    const pos: number[] = [];
    const col: number[] = [];
    const paint = (k: number, j: number, p: Vector3): Color => {
      const [, y] = profile[j];
      if (j === profile.length - 2 || j === profile.length - 1 || (y <= FLOOR + 0.01 && profile[j + 1]?.[1] <= FLOOR + 0.01)) {
        return mix('#EEF3F8', '#C9DBEA', 0.3 + 0.4 * hash(k, j, 1));
      }
      // Walls and roof: pale blue ice with grey rock patches.
      const rock = hash(Math.round(p.x / 3), Math.round(p.y / 2), Math.round(p.z / 3)) > 0.86;
      return rock ? mix('#9AA3AE', '#848E9A', hash(k, j, 2)) : mix('#D2ECF8', '#8DB1CE', 0.2 + 0.45 * (1 - Math.min(1, (y - FLOOR) / TUNNEL.height)));
    };
    for (let k = 0; k + 1 < rings.length; k++) {
      for (let j = 0; j + 1 < profile.length; j++) {
        const a = rings[k][j];
        const b = rings[k][j + 1];
        const c = rings[k + 1][j + 1];
        const d = rings[k + 1][j];
        const color = paint(k, j, a);
        for (const v of [a, b, c, a, c, d]) {
          pos.push(v.x, v.y, v.z);
          col.push(color.r, color.g, color.b);
        }
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  /**
   * v1.11 (5-2): the inside of the big toy box along `railId` from `from` to `to`: a flat floor, straight cream walls
   * with soft stripes and a flat lid over it (TUNNEL.width × TUNNEL.height + 1), and little star stickers on the walls
   * that glow faintly in the dark (a Points of their own, one draw).
   */
  private buildBox(railId: string, from: number, to: number): BufferGeometry | null {
    const rail = this.stage.network.rails.get(railId);
    if (!rail) return null;
    const half = TUNNEL.width / 2 + 0.5;
    const top = TUNNEL.height + 1 + FLOOR;
    const profile: [number, number][] = [
      [-half, FLOOR],
      [-half, top],
      [half, top],
      [half, FLOOR],
      [-half, FLOOR],
    ];
    const pos: number[] = [];
    const col: number[] = [];
    const right = new Vector3();
    const steps = Math.max(1, Math.ceil((to - from) / TUNNEL.ring));
    const rings: Vector3[][] = [];
    for (let i = 0; i <= steps; i++) {
      const f = rail.frameAt(from + ((to - from) * i) / steps);
      right.crossVectors(f.tangent, UP).normalize();
      rings.push(profile.map(([x, y]) => f.position.clone().addScaledVector(right, x).addScaledVector(UP, y)));
    }
    for (let k = 0; k + 1 < rings.length; k++) {
      for (let j = 0; j + 1 < profile.length; j++) {
        const [a, b, c, d] = [rings[k][j], rings[k][j + 1], rings[k + 1][j + 1], rings[k + 1][j]];
        const floor = j === profile.length - 2;
        const color = floor ? mix('#C9B8A0', '#B7A58C', hash(k, j, 3)) : j === 1 ? mix('#F4E6CF', '#EBD9BC', hash(k, 1, 4)) : k % 2 ? mix('#FFF1D6', '#F6E3C2', 0.3) : mix('#FCE3EC', '#F7D4E1', 0.3);
        for (const v of [a, b, c, a, c, d]) {
          pos.push(v.x, v.y, v.z);
          col.push(color.r, color.g, color.b);
        }
      }
      // Star stickers on the walls every few rings.
      if (k % 3 === 1) {
        const f = rail.frameAt(from + ((to - from) * (k + 0.5)) / steps);
        right.crossVectors(f.tangent, UP).normalize();
        for (const side of [-1, 1]) this.stickers.push(f.position.clone().addScaledVector(right, side * (half - 0.1)).addScaledVector(UP, 2.5 + hash(k, side, 5) * 4));
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  /** v1.11 (5-2): the toy box's star stickers (glowing dots, one Points). */
  private readonly stickers: Vector3[] = [];

  private addStickers(): void {
    if (this.stickers.length === 0) return;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.stickers.flatMap((v) => [v.x, v.y, v.z]), 3));
    const points = new Points(g, new PointsMaterial({ color: '#FFF3A0', size: 0.9, sizeAttenuation: true, fog: false }));
    points.name = 'toybox-stars';
    this.group.add(points);
  }

  /** A copy of `template` on the floor at `s` on `railId`, its +Z along the rail (`dir` 1) or against it (−1). */
  private place(template: Object3D, railId: string, s: number, dir: 1 | -1, lift: number): void {
    const rail = this.stage.network.rails.get(railId);
    if (!rail) return;
    const f = rail.frameAt(s);
    const o = (bakeModel(template as Group) ?? template).clone(true);
    o.position.copy(f.position).addScaledVector(UP, FLOOR + lift);
    const flat = f.tangent.clone().setY(0).normalize().multiplyScalar(dir);
    o.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), flat);
    this.group.add(o);
  }

  onEvent(e: StageEvent): void {
    if (e.type === 'light') this.lightOn = e.on;
    // v1.11 (PR5): the magnet step's thin green beam sees half as much further as the light does.
    if (e.type === 'light:mode') this.magnetOn = e.mode === 'magnet';
    if (e.type === 'tunnel') this.inside = e.index === null ? null : (this.zones.find((z) => z.index === e.index) ?? null);
    if (e.type === 'sign:reveal' && this.revealIds.has(e.junctionId)) this.revealTarget = 1;
    if (e.type === 'rewind') {
      this.revealTarget = 0;
      this.settle = 0;
    }
  }

  /** Every frame from main.ts (through the scene view): where the snow wave is. */
  setWave(info: SnowWaveInfo | null): void {
    this.waveInfo = info;
  }

  /** Per frame, after the other fog stretches have set the fog: the tunnel's dark, the wave, the swirl. */
  update(dt: number): void {
    this.updateDark(dt);
    this.updateWave(dt);
    if (this.reveal !== this.revealTarget) {
      const step = dt / 0.4;
      this.reveal = this.revealTarget > this.reveal ? Math.min(1, this.reveal + step) : Math.max(0, this.reveal - step);
      setFakeExitGlow(this.reveal);
    }
  }

  /** v1.10 (4-3): true while the train is in a tunnel's dark (the test hook, and the falling snow stops). */
  get inTunnel(): boolean {
    return this.dark > 0.5;
  }

  private updateDark(dt: number): void {
    const target = this.inside ? 1 : 0;
    if (target === 0 && this.dark === 0) return;
    this.dark += (target - this.dark) * (1 - Math.exp(-dt / (TUNNEL.fade * 0.6)));
    if (Math.abs(target - this.dark) < 0.002) this.dark = target;
    const z = this.inside ?? this.lastZone;
    if (this.inside) this.lastZone = this.inside;
    const k = this.dark;
    // The dark eases from the fog's colour and the lights as the look sets them outside (read now: it may change).
    const fog = this.scene.fog as Fog | null;
    const baseFogColor = this.look.baseFogColor;
    if (fog && z && baseFogColor) {
      fog.color.copy(baseFogColor).lerp(this.tint.set(z.fogColor), k);
      fog.near += (z.near - fog.near) * k;
      const far = this.lightOn ? z.lightFar : this.magnetOn ? z.far + (z.lightFar - z.far) * MAGNET.beamRange : z.far;
      fog.far += (far - fog.far) * k;
    }
    const lights = this.look.lights;
    if (lights) {
      const dim = 1 - (1 - (z?.dim ?? TUNNEL.dim)) * k;
      lights.hemisphere.intensity = this.look.lightLevels.hemisphere * dim;
      lights.sun.intensity = this.look.lightLevels.sun * dim;
    }
    const snow = this.scene.getObjectByName('snowfall');
    if (snow) snow.visible = k < 0.5;
  }

  private lastZone: TunnelZone | null = null;

  private updateWave(dt: number): void {
    const wave = this.wave;
    const info = this.waveInfo;
    if (!wave) return;
    this.waveFocus = null;
    if (!info) {
      wave.visible = false;
      if (this.powder) this.powder.visible = false;
      this.waveS = null;
      this.settle = 0;
      return;
    }
    const rail = this.stage.network.rails.get(info.railId);
    if (!rail) return;
    this.waveClock += dt;
    // Eased along (it never jumps, but a rewind puts it at its new place at once).
    if (this.waveS === null || Math.abs(info.s - this.waveS) > 25) this.waveS = info.s;
    else this.waveS += (info.s - this.waveS) * Math.min(1, dt * 6);
    const s = this.waveS - WAVE_NOSE;
    const f = rail.frameAt(Math.max(0, s));
    const flat = f.tangent.clone().setY(0).normalize();
    wave.visible = true;
    wave.position.copy(f.position).addScaledVector(UP, -0.6);
    wave.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), flat);
    // "もこもこ": it heaves and wobbles as it rolls; once at the fence it settles into a low heap.
    if (info.state === 'safe') this.settle = Math.min(1, this.settle + dt / SNOW_WAVE.settleSeconds);
    const puff = Math.sin(this.waveClock * 5.2) * 0.05 * (1 - this.settle);
    wave.scale.set(1 + puff * 0.5 + this.settle * 0.15, (1 + puff) * (1 - 0.62 * this.settle), 1 + this.settle * 0.1);
    wave.rotateY(Math.sin(this.waveClock * 1.7) * 0.03 * (1 - this.settle));
    if (info.state === 'run' || info.state === 'wait' || info.state === 'caught') {
      this.waveFocus = this.focus.copy(f.position).addScaledVector(UP, 4);
    }
    if (this.powder) {
      this.powder.visible = this.settle < 1;
      this.powder.position.copy(wave.position);
      this.powder.quaternion.copy(wave.quaternion);
      animatePowder(this.powder, this.waveClock, 1 - this.settle);
    }
  }
}

/** A soft round dot for the powder (a square point otherwise). */
function roundDot(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  }
  return new CanvasTexture(c);
}

/** Soft snow powder blowing off the wave's front (60 dots, one draw call). */
function buildPowder(): Points<BufferGeometry, PointsMaterial> {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(new Float32Array(60 * 3), 3));
  const p = new Points(g, new PointsMaterial({ color: '#FFFFFF', size: 0.9, map: roundDot(), transparent: true, opacity: 0.85, depthWrite: false }));
  p.name = 'snow-wave-powder';
  p.frustumCulled = false;
  return p;
}

function animatePowder(p: Points<BufferGeometry, PointsMaterial>, t: number, strength: number): void {
  const attr = p.geometry.getAttribute('position') as Float32BufferAttribute;
  const arr = attr.array as Float32Array;
  for (let i = 0; i < 60; i++) {
    const phase = (t * 0.8 + hash(i, 3, 9)) % 1;
    const x = (hash(i, 1, 2) - 0.5) * 34;
    arr[i * 3] = x;
    arr[i * 3 + 1] = 2 + phase * 9 * strength;
    arr[i * 3 + 2] = 7 + phase * 6;
  }
  attr.needsUpdate = true;
  p.material.opacity = 0.85 * strength;
}

const FWD = new Vector3();
const LEFT = new Vector3();
const MID = new Vector3();
const TRAIN_MID = new Vector3();

/**
 * v1.10 (4-3): the snow wave comes from behind, where the cab never looks: while it chases, the side camera ("よこから")
 * steps back to take the train and the wave in one picture, and the back camera ("うしろから") looks over the wave at the
 * train. Leaves the camera as it is when the wave is far behind.
 */
export function frameWave(mode: 'side' | 'chase', pose: TrainPose, wave: Vector3, out: CameraTarget): void {
  FWD.set(0, 0, 1).applyQuaternion(pose.quaternion).setY(0).normalize();
  LEFT.set(1, 0, 0).applyQuaternion(pose.quaternion).setY(0).normalize();
  const consist = TRAIN.carSpacing * (TRAIN.carCount - 1);
  TRAIN_MID.copy(pose.position).addScaledVector(FWD, -consist / 2);
  const dist = Math.hypot(TRAIN_MID.x - wave.x, TRAIN_MID.z - wave.z);
  if (dist > 110) return;
  if (mode === 'side') {
    MID.lerpVectors(TRAIN_MID, wave, 0.45);
    const away = Math.max(22, dist * 0.75 + 10);
    out.position.copy(MID).addScaledVector(LEFT, away).addScaledVector(UP, 5 + dist * 0.1);
    out.lookAt.copy(MID).addScaledVector(UP, 1.5);
  } else {
    out.position.copy(wave).addScaledVector(FWD, -20).addScaledVector(UP, 15).addScaledVector(LEFT, 5);
    out.lookAt.copy(TRAIN_MID).addScaledVector(UP, 2);
  }
  out.up.set(0, 1, 0);
}
