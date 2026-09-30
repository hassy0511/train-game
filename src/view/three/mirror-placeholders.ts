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
 * PR6b adds 5-3's own: the mirror shelf, the iron hand mirror (record ②), Sakasa's doodle on an easel (record ③), the
 * partner's two pink notes and the small platform mirror.
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

/**
 * "mirror-shelf": a silver post 1 × 3 m with a cream board 2 × 0.3 × 1.2 m on top (its front +Z, turned towards the
 * rail); `scale` makes it taller (5-3's 9 m shelf for the hand mirror).
 */
function mirrorShelf(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new CylinderGeometry(0.35, 0.45, 3, 8), SILVER, { at: [0, 1.5, 0] }));
  parts.push(part(new CylinderGeometry(0.6, 0.6, 0.2, 8), LAVENDER_DEEP, { at: [0, 0.1, 0] }));
  parts.push(part(new BoxGeometry(2, 0.3, 1.2), '#FFF3D6', { at: [0, 3.05, 0.2] }));
  parts.push(part(new BoxGeometry(2.1, 0.08, 1.3), LAVENDER, { at: [0, 2.88, 0.2] }));
  return solid('mirror-shelf', parts);
}

/** "hand-mirror", 0.4 × 0.7 × 0.08 m (record ②): an iron hand mirror, a round pale glass, Sakasa's swirl on the back. */
function handMirror(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new CylinderGeometry(0.2, 0.2, 0.06, 18), '#7A8CA3', { at: [0, 0.5, 0], rot: [Math.PI / 2, 0, 0] }));
  parts.push(part(new CylinderGeometry(0.16, 0.16, 0.02, 18), '#EAF4FF', { at: [0, 0.5, 0.035], rot: [Math.PI / 2, 0, 0] }));
  parts.push(part(new CylinderGeometry(0.04, 0.035, 0.32, 6), '#7A8CA3', { at: [0, 0.17, 0] }));
  parts.push(part(new SphereGeometry(0.045, 8, 6), PINK, { at: [0, 0.5, -0.04] }));
  parts.push(part(new SphereGeometry(0.03, 6, 4), '#FFFFFF', { at: [0.07, 0.56, 0.05] }));
  return solid('hand-mirror', parts, glowMaterial());
}

/**
 * "sakasa-doodle", 1.2 × 1.5 m (record ③): a little wooden easel with a crayon drawing, the Wonder train's coach with a
 * swirly hat in its window (Sakasa riding it, drawn like 3-2's boat sail).
 */
function sakasaDoodle(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new BoxGeometry(0.07, 1.5, 0.07), '#C89B6A', { at: [-0.45, 0.72, -0.12], rot: [0.12, 0, 0.1] }));
  parts.push(part(new BoxGeometry(0.07, 1.5, 0.07), '#C89B6A', { at: [0.45, 0.72, -0.12], rot: [0.12, 0, -0.1] }));
  parts.push(part(new BoxGeometry(0.07, 1.45, 0.07), '#C89B6A', { at: [0, 0.7, -0.35], rot: [-0.3, 0, 0] }));
  parts.push(part(new BoxGeometry(1.1, 0.06, 0.12), '#C89B6A', { at: [0, 0.5, -0.05] }));
  const g = solid('sakasa-doodle', parts);
  const paper = new Mesh(new PlaneGeometry(1, 0.8).translate(0, 0.95, -0.02).rotateX(-0.12), new MeshBasicMaterial({ map: doodle(), color: '#ffffff' }));
  paper.name = 'sakasa-doodle-paper';
  g.add(paper);
  return g;
}

/** The crayon drawing (one 256 × 256 canvas, the top 80 %): a cream coach on rails, a swirly pink hat in its window. */
function doodle(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 205;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#FFFAF0';
  g.fillRect(0, 0, 256, 205);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // Rails.
  g.strokeStyle = '#8A6A4A';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(14, 170);
  g.lineTo(242, 170);
  g.stroke();
  // The coach (wobbly crayon lines), its wheels and window.
  g.fillStyle = '#9FD3F4';
  g.strokeStyle = '#3A6A9A';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(40, 150);
  g.lineTo(44, 70);
  g.lineTo(212, 66);
  g.lineTo(216, 150);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#5A4A3A';
  for (const x of [72, 184]) {
    g.beginPath();
    g.arc(x, 158, 13, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#FFFFFF';
  g.fillRect(96, 84, 70, 46);
  // The swirly hat in the window (Sakasa, only her hat: no face).
  g.strokeStyle = PINK;
  g.lineWidth = 5;
  g.beginPath();
  for (let a = 0; a < Math.PI * 5; a += 0.2) {
    const r = 3 + a * 2.2;
    const x = 131 + Math.cos(a) * r;
    const y = 104 + Math.sin(a) * r * 0.7;
    if (a === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  // A little heart above.
  g.fillStyle = PINK;
  g.beginPath();
  g.moveTo(128, 40);
  g.bezierCurveTo(128, 30, 112, 28, 112, 40);
  g.bezierCurveTo(112, 50, 128, 56, 128, 62);
  g.bezierCurveTo(128, 56, 144, 50, 144, 40);
  g.bezierCurveTo(144, 28, 128, 30, 128, 40);
  g.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** "note-pink", two cream notes 0.3 × 0.4 m side by side (what the partner holds up to a mirror), each with a pink swirl. */
function notePink(): Group {
  const parts: BufferGeometry[] = [];
  for (const [x, r] of [
    [-0.18, 0.12],
    [0.18, -0.1],
  ] as const) {
    parts.push(part(new BoxGeometry(0.3, 0.4, 0.01), CREAM, { at: [x, 0.2, 0], rot: [0, 0, r] }));
    parts.push(part(new CylinderGeometry(0.05, 0.05, 0.012, 10), PINK, { at: [x + 0.06, 0.3, 0.008], rot: [Math.PI / 2, 0, r] }));
    parts.push(part(new BoxGeometry(0.18, 0.02, 0.012), INK, { at: [x, 0.16, 0.008], rot: [0, 0, r] }));
    parts.push(part(new BoxGeometry(0.14, 0.02, 0.012), INK, { at: [x, 0.1, 0.008], rot: [0, 0, r] }));
  }
  return solid('note-pink', parts);
}

/** "mirror-stand-small", 1.2 × 2 m: the platform's little silver mirror on a stand, its glass +Z. */
function mirrorStandSmall(): Group {
  const parts: BufferGeometry[] = [];
  parts.push(part(new CylinderGeometry(0.35, 0.45, 0.12, 10), SILVER, { at: [0, 0.06, 0] }));
  parts.push(part(new CylinderGeometry(0.05, 0.05, 0.7, 6), SILVER, { at: [0, 0.4, 0] }));
  parts.push(part(new BoxGeometry(1.2, 1.3, 0.1), LAVENDER_DEEP, { at: [0, 1.35, -0.02] }));
  parts.push(part(new BoxGeometry(1.05, 1.15, 0.02), '#EAF4FF', { at: [0, 1.35, 0.04] }));
  return solid('mirror-stand-small', parts, glowMaterial());
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
  'mirror-shelf': mirrorShelf,
  'hand-mirror': handMirror,
  'sakasa-doodle': sakasaDoodle,
  'note-pink': notePink,
  'mirror-stand-small': mirrorStandSmall,
};

/** A stand-in for a mirror-world model, or null when `name` is not one of them. */
export function buildMirrorPlaceholder(name: string): Group | null {
  const build = BUILDERS[name];
  if (!build) return null;
  const g = build();
  g.name = `${name}-placeholder`;
  return g;
}
