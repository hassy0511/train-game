import { Color, Group, Mesh, MeshLambertMaterial, SphereGeometry } from 'three';

/**
 * Stand-in drawn in code for the one model of the sky set (ticket 0006) that is not built: `cloud-wall`, the wall of
 * cloud of a no-sight stretch (nothing places it yet; the fog stretches are drawn by the sky gimmicks). Same name,
 * size and origin as the ticket (bottom centre, +Z forward). The rest of the set is built (assets/blender/sky.py).
 */
const CLOUD = '#FFFFFF';
const CLOUD_SHADE = '#DCE9F5';

const materials = new Map<string, MeshLambertMaterial>();
function mat(color: string, emissive: number): MeshLambertMaterial {
  const key = `${color}|${emissive}`;
  let m = materials.get(key);
  if (!m) {
    m = new MeshLambertMaterial({ color, flatShading: true });
    m.emissive = new Color(color).multiplyScalar(emissive);
    materials.set(key, m);
  }
  return m;
}

function cloud(w: number, h: number, d: number, puffs: number, seed: number): Group {
  const g = new Group();
  for (let i = 0; i < puffs; i++) {
    const t = puffs === 1 ? 0 : i / (puffs - 1) - 0.5;
    const r = h * (0.55 + 0.35 * Math.abs(Math.sin(seed + i * 1.7)));
    // Clouds glow a little so their shaded side stays white instead of turning grey.
    const p = new Mesh(new SphereGeometry(r, 10, 7), mat(i % 3 === 2 ? CLOUD_SHADE : CLOUD, 0.55));
    p.position.set(t * (w - r * 1.6), r * 0.75, Math.sin(seed * 3 + i) * d * 0.2);
    p.scale.set(1, 0.8, d / w + 0.6);
    g.add(p);
  }
  return g;
}

const BUILDERS: Record<string, () => Group> = {
  'cloud-wall': () => cloud(20, 12, 6, 7, 4),
};

/** A code-built stand-in for a sky-set model, or null when there is none for this name. */
export function buildSkyPlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}
