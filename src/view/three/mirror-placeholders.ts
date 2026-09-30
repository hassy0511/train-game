import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
} from 'three';
import { framedMirrorGeometry } from './ice';
import { glowMaterial, hash, part, solid } from './placeholder-kit';

/**
 * Stand-ins drawn in code for the mirror world (ticket 0020「かがみの せかい」, the 5-3 section, PHASE9_CHAPTER5_6 第 6 部 §8)
 * until their models are built: the lavender cushion at the end of a false way, the little mirror-written sign (the
 * record in the mirror world), the glass trees and sparkly rocks, the mirror pillar, and for the model page the framed
 * mirror and the turned-away mirror's iron back. Origin at the bottom centre, +Z forward; one merged mesh per model
 * (the glass trees and rocks glow a little). Nothing has a face: no eyes on the cushion, the trees or the frames.
 * (PR6b adds the stage's own: the shelf, the hand mirror, the doodle, the notes and the small platform mirror.)
 */
const LAVENDER = '#CDB8F2';
const LAVENDER_DEEP = '#B9A8EC';
const MINT = '#A8E6D8';
const SILVER = '#D9D6EA';
const CREAM = '#FFF8E6';
const PINK = '#E8579F';
const INK = '#5A4A3A';

/**
 * "mirror-cushion", 6 × 3 × 2 m: a round lavender cushion with a white rim; the train comes to it from −Z and it sits
 * just past the rail's end (its origin), so a stopped train rests against its soft front. It glows a little: soft, never
 * a dark wall.
 */
function mirrorCushion(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new SphereGeometry(1, 14, 8), LAVENDER, { at: [0, 1.5, 1.2], scale: [3, 1.5, 1] }));
  parts.push(part(new CylinderGeometry(1, 1, 0.3, 14), '#FFFFFF', { at: [0, 1.5, 0.35], rot: [Math.PI / 2, 0, 0], scale: [3.05, 1, 1.55] }));
  return solid('mirror-cushion', parts, glowMaterial());
}

/**
 * "mirror-board", 1.2 × 0.8 m on a 0.9 m leg: a little cream sign with "ようこそ" written mirror-wise (read right only in
 * "かがみの なか"), a pink rim and Sakasa's swirl dot.
 */
function mirrorBoard(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new BoxGeometry(0.1, 0.9, 0.1), SILVER, { at: [0, 0.45, 0] }));
  parts.push(part(new BoxGeometry(1.3, 0.9, 0.08), PINK, { at: [0, 1.3, -0.02] }));
  const g = solid('mirror-board', parts);
  const face = new Mesh(new PlaneGeometry(1.2, 0.8).translate(0, 1.3, 0.03), new MeshBasicMaterial({ map: mirrorWords('ようこそ'), color: '#ffffff' }));
  face.name = 'mirror-board-face';
  g.add(face);
  return g;
}

/** Kana on cream, written mirror-wise, with a pink swirl in the corner (one 128 × 64 canvas). */
function mirrorWords(text: string): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = CREAM;
  g.fillRect(0, 0, 128, 64);
  g.save();
  g.translate(128, 0);
  g.scale(-1, 1);
  g.fillStyle = INK;
  g.font = 'bold 26px "Hiragino Maru Gothic ProN", "Rounded Mplus 1c", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 34);
  g.restore();
  g.fillStyle = PINK;
  g.beginPath();
  g.arc(116, 54, 4, 0, Math.PI * 2);
  g.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** "crystal-tree-a" (4 m) / "crystal-tree-b" (7 m): a glass tree, a lavender or mint crystal crown on a pale trunk. */
function crystalTree(name: string, h: number, crown: string): () => Group {
  return () => {
    const parts: BufferGeometry[] = [];
    parts.push(part(new CylinderGeometry(0.12 * h * 0.25, 0.2 * h * 0.25, h * 0.4, 6), '#E8E4F4', { at: [0, h * 0.2, 0] }));
    parts.push(part(new OctahedronGeometry(h * 0.28, 0), crown, { at: [0, h * 0.62, 0], scale: [1, 1.5, 1] }));
    parts.push(part(new OctahedronGeometry(h * 0.14, 0), '#FFFFFF', { at: [h * 0.12, h * 0.8, 0.05], scale: [1, 1.4, 1] }));
    return solid(name, parts, glowMaterial());
  };
}

/** "crystal-rock", 2 m: a cluster of sparkly lavender crystals. */
function crystalRock(): Group {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7;
    const s = 0.5 + hash(i, 1, 2) * 0.5;
    parts.push(part(new IcosahedronGeometry(s, 0), i % 2 ? LAVENDER_DEEP : '#D6CCF5', { at: [Math.cos(a) * 0.5, s * 0.8, Math.sin(a) * 0.5], scale: [0.8, 1.6, 0.8] }));
  }
  return solid('crystal-rock', parts, glowMaterial());
}

/** "mirror-pillar", 1.2 × 8 × 1.2 m: a silver pillar with a lavender ball on top (shiny, it reflects nothing). */
function mirrorPillar(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new CylinderGeometry(0.5, 0.6, 7, 8), SILVER, { at: [0, 3.5, 0] }));
  parts.push(part(new CylinderGeometry(0.7, 0.7, 0.3, 8), LAVENDER_DEEP, { at: [0, 0.15, 0] }));
  parts.push(part(new SphereGeometry(0.6, 10, 7), LAVENDER, { at: [0, 7.5, 0] }));
  return solid('mirror-pillar', parts);
}

/** A framed mirror for the model page ("mirror-frame" 20 × 13, "turn-mirror" 12 × 9 with its swirl back): the glass lavender. */
function framedMirror(name: string, W: number, H: number): () => Group {
  return () => {
    const g = new Group();
    const frame = new Mesh(framedMirrorGeometry(W, H, 'swirl'), new MeshLambertMaterial({ vertexColors: true, emissive: new Color('#4E4A66') }));
    frame.name = name;
    const glass = new Mesh(new BoxGeometry(W, H, 0.02).translate(0, 1.2 + H / 2, 0.05), new MeshLambertMaterial({ color: '#EAF4FF', emissive: new Color('#CFC6F2'), emissiveIntensity: 0.4 }));
    g.add(frame, glass);
    return g;
  };
}

const BUILDERS: Record<string, () => Group> = {
  'mirror-cushion': mirrorCushion,
  'mirror-board': mirrorBoard,
  'crystal-tree-a': crystalTree('crystal-tree-a', 4, LAVENDER_DEEP),
  'crystal-tree-b': crystalTree('crystal-tree-b', 7, MINT),
  'crystal-rock': crystalRock,
  'mirror-pillar': mirrorPillar,
  'mirror-frame': framedMirror('mirror-frame', 20, 13),
  'turn-mirror': framedMirror('turn-mirror', 12, 9),
};

/** A stand-in for a mirror-world model, or null when `name` is not one of them. */
export function buildMirrorPlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}
