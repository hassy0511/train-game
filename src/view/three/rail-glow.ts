import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three';
import type { RailNetwork } from '../../rail/types';
import type { StageData } from '../../stage/types';

/**
 * v1.12 (the opening, 2026-10-08): gimmick "rail-glow" (looks only): the stretch `from`–`to` of `railId` glows a soft
 * gold, the World Rail's own light, and brighter waves of light run along it the way the rail goes (towards `to`).
 * `params.strength` (0.1–1, default 1): how bright; `params.speed` (m/s, default 12) and `params.spacing` (m between
 * the waves, default 36). A stretch over a whole ring glows all round (no fading ends). One mesh a stretch, one draw
 * call; additive and unlit, it never hides the track under it.
 */
const COLOR = '#FFD36B';
/** The glow's width across the track (m) and how high over the rail top it lies. */
const WIDTH = 2.6;
const LIFT = 0.16;
/** The sampling step along the rail (m), and the ends where the glow fades in (m). */
const STEP = 1;
const TAPER = 6;
const SPEED = 12;
const SPACING = 36;

export class RailGlowGimmicks {
  readonly group = new Group();
  private readonly materials: { uniforms: { time: { value: number } } }[] = [];
  private time = 0;

  static wanted(stage: StageData): boolean {
    return stage.file.gimmicks.some((g) => g.type === 'rail-glow');
  }

  constructor(stage: StageData, network: RailNetwork) {
    this.group.name = 'rail-glow';
    for (const g of stage.file.gimmicks) {
      if (g.type !== 'rail-glow' || g.railId === undefined || g.from === undefined || g.to === undefined) continue;
      const p = (g.params ?? {}) as { strength?: number; speed?: number; spacing?: number };
      const strength = p.strength ?? 1;
      const uniforms = { time: { value: 0 } };
      const material = new MeshBasicMaterial({
        color: new Color(COLOR),
        vertexColors: true,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        // Flat and additive: one pass is enough (a see-through two-sided material would draw twice).
        forceSinglePass: true,
      });
      // The waves: brighter where (along − time × speed) comes round to a wave, a soft hump spacing m apart.
      material.onBeforeCompile = (shader) => {
        shader.uniforms.glowTime = uniforms.time;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float along;\nvarying float vAlong;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlong = along;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\nuniform float glowTime;\nvarying float vAlong;`)
          .replace(
            '#include <dithering_fragment>',
            `#include <dithering_fragment>
float glowPhase = fract((vAlong - glowTime * ${(p.speed ?? SPEED).toFixed(2)}) / ${(p.spacing ?? SPACING).toFixed(2)});
float glowWave = exp(-pow((glowPhase - 0.5) * 7.0, 2.0));
gl_FragColor.rgb *= ${(0.45 * strength).toFixed(3)} + ${(1.1 * strength).toFixed(3)} * glowWave;`,
          );
      };
      material.customProgramCacheKey = () => `rail-glow-${strength}-${p.speed ?? SPEED}-${p.spacing ?? SPACING}`;
      this.materials.push({ uniforms });
      const mesh = new Mesh(ribbon(network.getRail(g.railId), g.from, g.to), material);
      mesh.name = 'rail-glow-band';
      mesh.renderOrder = 2;
      this.group.add(mesh);
    }
  }

  update(dt: number): void {
    this.time += dt;
    for (const m of this.materials) m.uniforms.time.value = this.time;
  }
}

/** A flat band over the track: bright along its middle, fading to nothing at its sides and its two ends. */
function ribbon(rail: ReturnType<RailNetwork['getRail']>, from: number, stretchTo: number): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const along: number[] = [];
  // A stretch over the whole rail (a ring) glows all round: no fading ends where it closes.
  const whole = from <= 0.01 && stretchTo >= rail.length - 1;
  const to = whole ? rail.length : stretchTo;
  const length = to - from;
  const steps = Math.max(1, Math.ceil(length / STEP));
  // Three lines across: the left edge (dark), the middle (bright), the right edge (dark).
  const across = [-1, 0, 1];
  const rows: { p: [number, number, number]; k: number; s: number }[][] = [];
  for (let i = 0; i <= steps; i++) {
    const s = from + (length * i) / steps;
    const f = rail.frameAt(s);
    const end = whole ? 1 : Math.max(0, Math.min(1, (s - from) / TAPER, (to - s) / TAPER));
    rows.push(
      across.map((a) => {
        const x = f.position.x + f.up.x * LIFT + f.right.x * a * (WIDTH / 2);
        const y = f.position.y + f.up.y * LIFT + f.right.y * a * (WIDTH / 2);
        const z = f.position.z + f.up.z * LIFT + f.right.z * a * (WIDTH / 2);
        return { p: [x, y, z], k: a === 0 ? end : 0, s };
      }),
    );
  }
  const push = (v: { p: [number, number, number]; k: number; s: number }): void => {
    positions.push(...v.p);
    colors.push(v.k, v.k, v.k);
    along.push(v.s);
  };
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < across.length - 1; j++) {
      const a = rows[i][j];
      const b = rows[i][j + 1];
      const c = rows[i + 1][j];
      const d = rows[i + 1][j + 1];
      push(a);
      push(c);
      push(b);
      push(b);
      push(c);
      push(d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.setAttribute('along', new Float32BufferAttribute(along, 1));
  g.computeBoundingSphere();
  return g;
}
