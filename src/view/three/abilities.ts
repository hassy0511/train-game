import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import type { RailNetwork } from '../../rail/types';
import { resolvePlacement } from '../../stage/loader';
import type { JunctionDef, StageData } from '../../stage/types';
import type { ModelLibrary } from './models';

/** Dark "pit" strips on the ground under rail gaps, so a missing piece of rail reads as a hole. */
export function buildGapPits(network: RailNetwork, groundY: number | null): Group {
  const group = new Group();
  group.name = 'gap-pits';
  if (groundY === null) return group;
  const HALF = 4.5;
  const dark = new Color('#3a2a1c');
  for (const rail of network.rails.values()) {
    for (const gap of rail.gaps) {
      const positions: number[] = [];
      const colors: number[] = [];
      const indices: number[] = [];
      const from = gap.from - 1.5;
      const to = gap.to + 1.5;
      const steps = Math.max(2, Math.ceil((to - from) / 2));
      // Columns across the rail: soft edge, dark middle, soft edge (alpha fades to the ground).
      const across = [-HALF - 1.5, -HALF, 0, HALF, HALF + 1.5];
      const alpha = [0, 0.9, 1, 0.9, 0];
      for (let i = 0; i <= steps; i++) {
        const s = from + ((to - from) * i) / steps;
        const f = rail.frameAt(s);
        const endFade = Math.min(1, Math.min(s - from, to - s) / 1.5);
        across.forEach((x, k) => {
          const p = f.position.clone().addScaledVector(f.right, x);
          positions.push(p.x, groundY + 0.03, p.z);
          colors.push(dark.r, dark.g, dark.b, alpha[k] * endFade);
        });
      }
      const cols = across.length;
      for (let i = 0; i < steps; i++) {
        for (let k = 0; k < cols - 1; k++) {
          const a = i * cols + k;
          const b = a + cols;
          indices.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 4));
      geometry.setIndex(indices);
      const pit = new Mesh(
        geometry,
        new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide }),
      );
      pit.name = `pit:${rail.id}:${gap.from}`;
      pit.renderOrder = -1;
      group.add(pit);
    }
  }
  return group;
}

/** A flat arrow pointing +X in its local frame (width 1.2 m). */
function arrowGeometry(): ShapeGeometry {
  const shape = new Shape();
  shape.moveTo(-0.6, -0.14);
  shape.lineTo(0.1, -0.14);
  shape.lineTo(0.1, -0.36);
  shape.lineTo(0.6, 0);
  shape.lineTo(0.1, 0.36);
  shape.lineTo(0.1, 0.14);
  shape.lineTo(-0.6, 0.14);
  shape.closePath();
  return new ShapeGeometry(shape);
}

/** Arrow rotation (about the board normal) that points to `side` as seen by the driver. */
function arrowTurn(side: 'left' | 'right'): number {
  return side === 'right' ? 0 : Math.PI;
}

interface SignVisual {
  junction: JunctionDef;
  arrow: Mesh<ShapeGeometry, MeshBasicMaterial>;
  /** Target arrow angle (rad about the board normal): 0 = right, π = left. */
  turn: number;
  angle: number;
  glow: number;
}

const SIGN_BEFORE = 22;
const SIGN_LATERAL = 3.4;
const ARROW_HEIGHT = 2.55;

/**
 * Junction signs: a board by the rail before each junction with an arrow. A reversed sign points the
 * wrong way; when the light reveals it the arrow swings round and glows.
 */
export class JunctionSigns {
  readonly group = new Group();
  private readonly signs = new Map<string, SignVisual>();

  constructor(
    private readonly stage: StageData,
    private readonly models: ModelLibrary,
  ) {
    this.group.name = 'junction-signs';
  }

  async init(): Promise<void> {
    const groundY = this.stage.file.environment.ground?.y ?? null;
    const board = await this.models.load('direction-sign');
    const geometry = arrowGeometry();
    for (const junction of this.stage.file.junctions) {
      const at = Math.max(0, junction.at - SIGN_BEFORE);
      const t = resolvePlacement({ onRail: { railId: junction.railId, at, lateral: SIGN_LATERAL }, rotationY: 180 }, this.stage.network, groundY);
      const sign = new Group();
      sign.name = `sign:${junction.id}`;
      sign.position.copy(t.position);
      sign.quaternion.copy(t.quaternion);
      sign.add(board.clone(true));
      // Facing the oncoming train (the sign's +Z points back along the rail); the arrow sits on the board front.
      const arrow = new Mesh(geometry, new MeshBasicMaterial({ color: '#ffffff', side: DoubleSide }));
      arrow.position.set(0, ARROW_HEIGHT, 0.12);
      // Turned to face the train, the sign's local +X is the driver's right. It shows the default way.
      const turn = arrowTurn(junction.default);
      arrow.rotation.z = turn;
      sign.add(arrow);
      this.group.add(sign);
      this.signs.set(junction.id, { junction, arrow, turn, angle: turn, glow: 0 });
    }
  }

  /** The light found the truth: swing the arrow to the other side and make it glow. */
  reveal(junctionId: string): void {
    const sign = this.signs.get(junctionId);
    if (!sign) return;
    sign.turn = arrowTurn(sign.junction.default === 'left' ? 'right' : 'left');
    sign.glow = 1;
  }

  /** Back to the (reversed) display after a rewind. */
  reset(): void {
    for (const sign of this.signs.values()) {
      sign.turn = arrowTurn(sign.junction.default);
      sign.glow = 0;
    }
  }

  update(dt: number, time: number): void {
    for (const sign of this.signs.values()) {
      const diff = sign.turn - sign.angle;
      sign.angle += Math.sign(diff) * Math.min(Math.abs(diff), dt * 5);
      sign.arrow.rotation.z = sign.angle;
      const pulse = sign.glow > 0 ? 0.5 + 0.5 * Math.sin(time * 6) : 0;
      sign.arrow.material.color.set(sign.glow > 0 ? '#ffe066' : '#ffffff').lerp(new Color('#fff7c2'), pulse * 0.6);
      sign.arrow.scale.setScalar(1 + pulse * 0.12);
    }
  }
}

/** The headlight: a faint additive cone plus a pool of light on the track ahead, shown while the light is on. */
export function buildLightBeam(): Object3D {
  const group = new Group();
  group.name = 'light-beam';
  const length = 34;
  const cone = new ConeGeometry(6, length, 24, 1, true);
  // Apex at the lamp, opening forward (+Z) and slightly down onto the rail.
  cone.translate(0, -length / 2, 0);
  cone.rotateX(-Math.PI / 2 + 0.08);
  const beam = new Mesh(
    cone,
    new MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.05, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
  );
  beam.position.set(0, 3.3, 6.3);
  const pool = new Mesh(
    new CircleGeometry(1, 32),
    new MeshBasicMaterial({ color: '#fff0a0', transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.scale.set(4.5, 14, 1);
  pool.position.set(0, 0.25, 26);
  group.add(beam, pool);
  group.visible = false;
  return group;
}

/** The jump device on the lead car's roof (shown once the jump is learned). */
export async function buildJumpDevice(models: ModelLibrary): Promise<Object3D> {
  const device = (await models.load('jump-unit')).clone(true);
  device.name = 'jump-unit';
  device.position.set(0, 3.75, -3.0);
  return device;
}

/** Placeholder neck (until `dino-large-neck` exists): rises and reaches forward from its origin (+Z, +Y). */
export function placeholderNeck(): Object3D {
  const pivot = new Group();
  const material = new MeshLambertMaterial({ color: '#b8a46a' });
  const neck = new Mesh(new ConeGeometry(0.9, 7, 10).translate(0, 3.5, 0), material);
  neck.rotation.x = 0.85; // leaning forward from vertical
  const head = new Mesh(new ConeGeometry(0.8, 1.8, 10).rotateX(Math.PI / 2), material);
  head.position.set(0, 7 * Math.cos(0.85), 7 * Math.sin(0.85) + 0.4);
  pivot.add(neck, head);
  return pivot;
}

/** Placeholder body (until `dino-large-body` exists): four legs 5.6 m apart and a body the train passes under. */
export function placeholderLargeBody(): Object3D {
  const group = new Group();
  const material = new MeshLambertMaterial({ color: '#b8a46a' });
  const body = new Mesh(new CylinderGeometry(3, 3, 14, 12).rotateX(Math.PI / 2), material);
  body.scale.set(1.1, 0.75, 1);
  body.position.set(0, 7.9, 0);
  group.add(body);
  for (const x of [-3.3, 3.3]) {
    for (const z of [-4.5, 4.5]) {
      const leg = new Mesh(new CylinderGeometry(0.75, 0.9, 6.5, 10), material);
      leg.position.set(x, 3.25, z);
      group.add(leg);
    }
  }
  return group;
}

/** The neck's rest pose is up; this much rotation (about +X) brings the head down over the rail. */
export const NECK_UP = new Quaternion();
export const NECK_DOWN = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 1.0);
