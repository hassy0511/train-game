import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Sprite,
  SpriteMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type { StageEvent } from '../../core/stage-events';
import type { StageData } from '../../stage/types';
import { FESTIVAL } from '../../train/params';
import { dotTexture } from './river';

/**
 * 3-3 "ほしのうみ" in the scene (PHASE8 第 5 部 §8): the lighthouse's lamp and its turning beam (lit by the child's
 * light in the ending, `beacon`), the festival (the moon rising, glowing balls coming up from the sea and opening,
 * the lanterns on the rafts brightening) and the moon of a time-up. Five draw calls at most, most of them only after
 * the ending's festival.
 */

/** The lamp room's height on the lighthouse model (m, see harbour-placeholders.ts). */
const LAMP_HEIGHT = 20.6;
/** The beam: this long, turning once in this many seconds. */
const BEAM_LENGTH = 60;
const BEAM_TURN = 10;
/** The moon: this far from the camera (it goes with it, like the sky, inside the draw distance), this big. */
const MOON_DISTANCE = 400;
const MOON_SIZE = 70;
/** Glowing balls per burst, how high they go and how wide they open. */
const BALLS = 40;
const BALL_RISE = 12;
const BALL_OPEN = 7;
/** A festival raft's lanterns in its own frame (see harbour-placeholders.ts festivalRaft). */
const RAFT_LANTERNS: [number, number, number][] = [
  [-2.6, 2.6, -1.6],
  [-2.6, 2.6, 1.6],
  [2.6, 2.6, -1.6],
  [2.6, 2.6, 1.6],
];

export class HarbourGimmicks {
  readonly group = new Group();
  private lamp: Mesh | null = null;
  private beam: Mesh | null = null;
  private lampAt = new Vector3();
  private lit = false;
  private beamT = 0;
  private readonly moon: Sprite;
  /** Where the moon stands, seen from anywhere (unit). */
  private readonly moonDir = new Vector3();
  private moonShown = 0;
  private moonWant = 0;
  private moonRate = 1;
  /** The festival: started (−1 = not yet), and whether it is over (things stay as they end up). */
  private festivalT = -1;
  private balls: Points | null = null;
  private readonly ballBase: Float32Array;
  private lanterns: Points | null = null;
  private festivalDone = false;
  private time = 0;

  static wanted(stage: StageData): boolean {
    return stage.file.props.some((p) => p.model === 'lighthouse') || !!stage.file.environment.festival;
  }

  constructor(stage: StageData) {
    this.group.name = 'harbour-gimmicks';
    const lighthouse = stage.props.find((p) => p.model === 'lighthouse');
    if (lighthouse) {
      this.lampAt.copy(lighthouse.position).add(new Vector3(0, LAMP_HEIGHT * lighthouse.scale, 0));
      const lamp = new Mesh(new SphereGeometry(1.6, 16, 10), new MeshBasicMaterial({ color: '#fff3b0', fog: false }));
      lamp.name = 'lighthouse-lamp';
      lamp.position.copy(this.lampAt);
      lamp.visible = false;
      this.lamp = lamp;
      this.group.add(lamp);
      // The beam: a long soft cone lying on its side, pointing out from the lamp, added to the picture.
      const cone = new ConeGeometry(4, BEAM_LENGTH, 16, 1, true);
      cone.translate(0, -BEAM_LENGTH / 2, 0);
      cone.rotateZ(Math.PI / 2);
      const beam = new Mesh(
        cone,
        new MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, fog: false }),
      );
      beam.name = 'lighthouse-beam';
      beam.position.copy(this.lampAt);
      beam.visible = false;
      beam.renderOrder = 5;
      this.beam = beam;
      this.group.add(beam);
    }
    // The moon: a soft cream disc (no face) far over the sea, hidden until it comes up.
    const fest = stage.file.environment.festival;
    const az = ((fest?.moon?.azimuth ?? 100) * Math.PI) / 180;
    const el = ((fest?.moon?.elevation ?? 14) * Math.PI) / 180;
    this.moon = new Sprite(new SpriteMaterial({ map: moonTexture(), transparent: true, depthWrite: false, fog: false }));
    this.moon.name = 'moon';
    this.moon.scale.setScalar(MOON_SIZE);
    this.moonDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    this.moon.frustumCulled = false;
    this.moon.renderOrder = -1;
    this.moon.visible = false;
    this.group.add(this.moon);
    // The festival's glowing balls: BALLS per burst place.
    const bursts = fest?.bursts ?? [];
    this.ballBase = new Float32Array(bursts.length * BALLS * 3);
    bursts.forEach((b, k) => {
      for (let i = 0; i < BALLS; i++) this.ballBase.set(b, (k * BALLS + i) * 3);
    });
    if (bursts.length > 0) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(this.ballBase.slice(), 3));
      geometry.computeBoundingSphere();
      const balls = new Points(
        geometry,
        new PointsMaterial({ color: '#bff4ff', size: 1.8, map: dotTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false }),
      );
      balls.name = 'festival-balls';
      balls.frustumCulled = false;
      balls.visible = false;
      this.balls = balls;
      this.group.add(balls);
    }
    // The rafts' lanterns: dim until the festival.
    const rafts = stage.props.filter((p) => p.model === 'festival-raft');
    if (rafts.length > 0) {
      const pos = new Float32Array(rafts.length * RAFT_LANTERNS.length * 3);
      rafts.forEach((r, k) => {
        RAFT_LANTERNS.forEach((l, j) => {
          const p = new Vector3(...l).multiplyScalar(r.scale).applyQuaternion(r.quaternion).add(r.position);
          pos.set([p.x, p.y, p.z], (k * RAFT_LANTERNS.length + j) * 3);
        });
      });
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
      geometry.computeBoundingSphere();
      const lanterns = new Points(
        geometry,
        new PointsMaterial({ color: '#ffd08a', size: 2.2, map: dotTexture(), transparent: true, opacity: 0.35, depthWrite: false, blending: AdditiveBlending }),
      );
      lanterns.name = 'raft-lanterns';
      this.lanterns = lanterns;
      this.group.add(lanterns);
    }
  }

  /** Test hook: the lamp is lit. */
  get beaconOn(): boolean {
    return this.lit;
  }

  onEvent(event: StageEvent): void {
    if (event.type === 'beacon') {
      this.lit = true;
      if (this.lamp) this.lamp.visible = true;
      if (this.beam) this.beam.visible = true;
    }
    if (event.type === 'festival') {
      this.showMoon(event.instant ? 0 : FESTIVAL.moonRise);
      this.festivalT = event.instant ? FESTIVAL.seconds : 0;
      this.festivalDone = !!event.instant;
      if (this.balls) this.balls.visible = true;
      if (this.lanterns) (this.lanterns.material as PointsMaterial).opacity = event.instant ? 1 : 0.35;
    }
    if (event.type === 'timeUp' && event.icon === 'moon') this.showMoon(FESTIVAL.moonRise);
    // After a time-up the moon goes back down with the rewind (not after the festival).
    if (event.type === 'rewind' && this.festivalT < 0) {
      this.moonWant = 0;
      this.moonShown = 0;
      this.moon.visible = false;
    }
  }

  private showMoon(seconds: number): void {
    this.moonWant = 1;
    this.moonRate = seconds > 0 ? 1 / seconds : Infinity;
    if (seconds <= 0) this.moonShown = 1;
    this.moon.visible = true;
  }

  update(dt: number, camera: Vector3): void {
    this.time += dt;
    if (this.lit && this.beam) {
      this.beamT += dt;
      this.beam.rotation.y = (this.beamT / BEAM_TURN) * Math.PI * 2;
    }
    if (this.moon.visible) {
      this.moonShown = Math.min(this.moonWant, this.moonShown + dt * this.moonRate);
      // Up from behind the sea: it rises into place (and a little softer until it is there).
      const k = 1 - Math.pow(1 - this.moonShown, 2);
      this.moon.position.copy(camera).addScaledVector(this.moonDir, MOON_DISTANCE);
      this.moon.position.y -= (1 - k) * MOON_SIZE;
      this.moon.material.opacity = 0.4 + 0.6 * k;
    }
    if (this.festivalT >= 0) {
      if (!this.festivalDone) this.festivalT += dt;
      const t = Math.min(this.festivalT, FESTIVAL.seconds);
      const u = t / FESTIVAL.seconds;
      if (this.lanterns) (this.lanterns.material as PointsMaterial).opacity = 0.35 + 0.65 * Math.min(1, u * 2);
      if (this.balls) this.moveBalls(u);
      if (this.festivalT >= FESTIVAL.seconds) this.festivalDone = true;
    }
  }

  /** The balls rise from the sea (first half), then open out and hover, bobbing gently. */
  private moveBalls(u: number): void {
    if (!this.balls) return;
    const pos = this.balls.geometry.getAttribute('position');
    const arr = pos.array as Float32Array;
    const rise = Math.min(1, u * 2);
    const open = Math.max(0, u * 2 - 1);
    const n = arr.length / 3;
    for (let i = 0; i < n; i++) {
      const a = (i % BALLS) * 2.399;
      const r = BALL_OPEN * (0.3 + 0.7 * ((i * 0.618) % 1)) * open;
      const bob = Math.sin(this.time * 1.2 + i) * 0.4 * open;
      arr[i * 3] = this.ballBase[i * 3] + Math.cos(a) * r;
      arr[i * 3 + 1] = this.ballBase[i * 3 + 1] + rise * BALL_RISE + Math.sin(a * 3) * r * 0.4 + bob;
      arr[i * 3 + 2] = this.ballBase[i * 3 + 2] + Math.sin(a) * r;
    }
    pos.needsUpdate = true;
  }
}

let moonTex: CanvasTexture | null | undefined;
/** A soft cream moon with a faint glow round it and two paler patches (no face), drawn once. */
function moonTexture(): CanvasTexture | null {
  if (moonTex !== undefined) return moonTex;
  if (typeof document === 'undefined') return (moonTex = null);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  if (!g) return (moonTex = null);
  const glow = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  glow.addColorStop(0, 'rgba(255,244,214,0.6)');
  glow.addColorStop(1, 'rgba(255,244,214,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#fff4d6';
  g.beginPath();
  g.arc(64, 64, 30, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(236,222,186,0.7)';
  for (const [x, y, r] of [
    [54, 56, 7],
    [74, 72, 5],
  ] as const) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return (moonTex = new CanvasTexture(canvas));
}
