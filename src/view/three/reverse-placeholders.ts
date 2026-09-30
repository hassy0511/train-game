import { BoxGeometry, BufferGeometry, CylinderGeometry, Group } from 'three';
import { part, solid } from './placeholder-kit';

/**
 * v1.11 (PR8a, PHASE9_CHAPTER5_6 第 3 部 A8.3, ticket 0021): stand-ins drawn in code for うしろむき's things until their
 * models are built: the swirl post ("reverse-post") the loader stands by each back junction's point, 3.2 m out on the
 * side away from its siding: a round sign on a pole with a pink swirl on both faces (a hint: "a way to reverse into is
 * here", nothing to press). "reverse-post-off" is the same post in grey (shown until うしろむき is learned). About
 * 0.9 × 2.4 × 0.2 m, origin at the bottom centre, the sign's faces towards ±Z (along the rail both ways). One merged
 * mesh in the shared vertex-coloured material. No faces, no letters.
 */

const WHITE = '#FFFFFF';
const POLE = '#E8E2D6';
const PINK = '#E75BA0';
const GREY = '#B6BDC7';
const GREY_POLE = '#D3D6DB';
const BASE = '#8C95A1';

function post(name: string, swirl: string, pole: string): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new CylinderGeometry(0.22, 0.26, 0.12, 8), BASE, { at: [0, 0.06, 0] }));
  parts.push(part(new CylinderGeometry(0.06, 0.07, 2.0, 8), pole, { at: [0, 1.0, 0] }));
  // The round sign, its faces towards ±Z (the train coming along the rail either way sees them).
  const centre = 1.95;
  parts.push(part(new CylinderGeometry(0.45, 0.45, 0.06, 20), WHITE, { at: [0, centre, 0], rot: [Math.PI / 2, 0, 0] }));
  parts.push(part(new CylinderGeometry(0.47, 0.47, 0.04, 20), swirl, { at: [0, centre, 0], rot: [Math.PI / 2, 0, 0] }));
  // The swirl: small bars along a spiral from the middle out (through the sign, so both faces show it).
  const turns = 1.8;
  const steps = 22;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const r = 0.05 + t * 0.34;
    const x = Math.cos(a) * r;
    const y = centre + Math.sin(a) * r;
    parts.push(part(new BoxGeometry(0.07 + t * 0.04, 0.07, 0.1), swirl, { at: [x, y, 0], rot: [0, 0, a] }));
  }
  return solid(name, parts);
}

const BUILDERS: Record<string, () => Group> = {
  'reverse-post': () => post('reverse-post', PINK, POLE),
  'reverse-post-off': () => post('reverse-post-off', GREY, GREY_POLE),
};

/** うしろむき's stand-in for `name`, or null when it is not one of them. */
export function buildReversePlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}

/** Every model drawn here (assets/models.json "_pending"). */
export const REVERSE_PLACEHOLDERS = Object.keys(BUILDERS);
