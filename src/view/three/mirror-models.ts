import { BufferAttribute, CanvasTexture, Group, Mesh, MeshBasicMaterial, SRGBColorSpace, type Material, type Object3D } from 'three';
import { bakeModel } from './bake';

/**
 * v1.11 (5-3, ticket 0020): what the game does to two of the mirror world's built models (assets/blender/mirror.py) as
 * they load. Two records carry a picture drawn on a canvas, on a face whose glTF material is named for it:
 * - "mirror-board" (record ①, かがみの なかの かんばん): its face ("mirror-board-face") says "ようこそ" written
 *   mirror-wise (read right only in "かがみの なか"), with a pink swirl dot in the corner.
 * - "sakasa-doodle" (record ③): the paper on the easel ("sakasa-doodle-paper") is Sakasa's crayon drawing of the Wonder
 *   train's coach with her swirly hat in its window (only her hat: no face).
 * The face takes its picture unlit (as the stand-ins drew it); the rest of each model is baked into one mesh, so a
 * record draws in two calls.
 */

const CREAM = '#FFF8E6';
const PINK = '#E8579F';
const INK = '#5A4A3A';

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

/** The crayon drawing (one 256 × 205 canvas, the paper's 1 × 0.8): a cream coach on rails, a swirly pink hat in its window. */
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

const materialsOf = (mesh: Mesh): Material[] => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);

/**
 * The face of `model` whose material is `face` gets `picture` (unlit), its texture coordinates laid flat over it (left
 * to right along x, bottom to top along y: the face stands in the XY plane, +Z out); the other parts are baked into one.
 */
function paintFace(model: Group, face: string, picture: CanvasTexture | null): void {
  model.updateMatrixWorld(true);
  const plain = new Group();
  const special: Mesh[] = [];
  const meshes: Mesh[] = [];
  model.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh);
  });
  for (const mesh of meshes) {
    const name = materialsOf(mesh)[0]?.name ?? '';
    const copy = new Mesh(mesh.geometry, mesh.material);
    copy.name = name || mesh.name;
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(mesh.matrixWorld);
    if (name !== face) {
      plain.add(copy);
      continue;
    }
    const geometry = mesh.geometry.clone();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const pos = geometry.getAttribute('position');
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = (pos.getX(i) - box.min.x) / Math.max(1e-6, box.max.x - box.min.x);
      uv[i * 2 + 1] = (pos.getY(i) - box.min.y) / Math.max(1e-6, box.max.y - box.min.y);
    }
    geometry.setAttribute('uv', new BufferAttribute(uv, 2));
    copy.geometry = geometry;
    copy.material = new MeshBasicMaterial({ map: picture, color: '#ffffff' });
    copy.material.name = face;
    special.push(copy);
  }
  const baked = bakeModel(plain);
  model.clear();
  model.add(...(baked ? baked.children.map((c) => c.clone()) : plain.children), ...special);
}

/** The models this module touches, as ModelLibrary loads them. */
export function prepareMirrorModel<T extends Object3D>(name: string, model: T): T {
  if (name === 'mirror-board') paintFace(model as unknown as Group, 'mirror-board-face', mirrorWords('ようこそ'));
  if (name === 'sakasa-doodle') paintFace(model as unknown as Group, 'sakasa-doodle-paper', doodle());
  return model;
}
