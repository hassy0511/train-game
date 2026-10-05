import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three';
import type { RailNetwork } from '../../rail/types';
import type { StageData } from '../../stage/types';

/**
 * v1.12 (えんしゅつ): gimmick "rainbow" (looks only): the stretch `from`–`to` of `railId` rides on a rainbow, six soft
 * bands of colour hanging under the track like the arch's side (seen from the side it is a rainbow with the train on
 * top). One mesh, one draw call; unlit so the colours stay bright and pastel. Not a real railway's or a show's sign.
 */
const BANDS = ['#ff8c8c', '#ffb36b', '#ffe27a', '#8fe08a', '#7cc4ff', '#b79cff'];
/** Each band's height (m), the gap under the rail bed before the first, and the sampling step along the rail (m). */
const BAND = 0.55;
const TOP = 0.45;
const STEP = 1;
/** Over this many metres at each end the bands grow from nothing (the rainbow rises out of the island). */
const TAPER = 14;

export class RainbowGimmicks {
  readonly group = new Group();

  static wanted(stage: StageData): boolean {
    return stage.file.gimmicks.some((g) => g.type === 'rainbow');
  }

  constructor(stage: StageData, network: RailNetwork) {
    this.group.name = 'rainbow';
    const material = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide });
    for (const g of stage.file.gimmicks) {
      if (g.type !== 'rainbow' || g.railId === undefined || g.from === undefined || g.to === undefined) continue;
      const rail = network.getRail(g.railId);
      const mesh = new Mesh(bands(rail, g.from, g.to), material);
      mesh.name = 'rainbow-bands';
      this.group.add(mesh);
    }
  }

  update(_dt: number): void {
    // Still for now (a shimmer could go here).
  }
}

function bands(rail: ReturnType<RailNetwork['getRail']>, from: number, to: number): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const length = to - from;
  const steps = Math.max(1, Math.ceil(length / STEP));
  const color = BANDS.map((c) => new Color(c));
  const edge = (s: number, depth: number): [number, number, number] => {
    const f = rail.frameAt(s);
    return [f.position.x - f.up.x * depth, f.position.y - f.up.y * depth, f.position.z - f.up.z * depth];
  };
  for (let i = 0; i < steps; i++) {
    const s0 = from + (length * i) / steps;
    const s1 = from + (length * (i + 1)) / steps;
    const grow = (s: number): number => Math.min(1, (s - from) / TAPER, (to - s) / TAPER);
    for (let b = 0; b < BANDS.length; b++) {
      const k0 = Math.max(0, grow(s0));
      const k1 = Math.max(0, grow(s1));
      const a0 = edge(s0, TOP + b * BAND * k0);
      const a1 = edge(s1, TOP + b * BAND * k1);
      const b0 = edge(s0, TOP + (b + 1) * BAND * k0);
      const b1 = edge(s1, TOP + (b + 1) * BAND * k1);
      positions.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
      for (let v = 0; v < 6; v++) colors.push(color[b].r, color[b].g, color[b].b);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.computeBoundingSphere();
  return g;
}
