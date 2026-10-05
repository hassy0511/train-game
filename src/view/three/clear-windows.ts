import { BackSide, BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakeModel } from './bake';

/**
 * v1.12 (えんしゅつ): a car of the Wonder train with see-through windows, for a cutscene figure riding in it (Sakasa
 * waving from the second car's window). The built car's glass is a dark opaque pane (the inside is never seen in the
 * game); here the panes turn into faint tinted glass and a plain inside is drawn behind them: cream walls, a pale
 * ceiling, a wooden floor (one box seen from inside), so a figure at a window has a room around it. Looks only.
 * Draw calls: the baked body (as before), the glass and the inside.
 */
/**
 * The side windows' glass as built (assets/blender/train-proto.py, car-proto.py, vehicle_common.py side_window): the
 * middle (m along the car) and width of each, between y 2.05 and 3.0. The body shell runs on behind the glass (the
 * game never looks in), so here the shell is cut away inside them (a few cm inside the frame, which stays).
 */
const WINDOWS = {
  lead: [[4.15, 0.7], [-4.8, 1.05], [-3.3, 1.05], [-1.75, 1.05], [1.75, 1.05], [3.05, 1.05]],
  car: [[-4.6, 1.05], [-3.1, 1.05], [-1.65, 1.05], [1.65, 1.05], [3.1, 1.05], [4.6, 1.05]],
} as const;
const WINDOW_Y = [2.05, 3.0] as const;

export function clearWindowCar(template: Group, lead = false): Group {
  const source = template.clone(true);
  source.updateMatrixWorld(true);
  const panes: BufferGeometry[] = [];
  const glass: Object3D[] = [];
  source.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[];
    if (!materials.some((m) => m.name.toLowerCase().includes('glass'))) return;
    panes.push((mesh.geometry as BufferGeometry).clone().applyMatrix4(mesh.matrixWorld));
    glass.push(mesh);
  });
  for (const o of glass) o.removeFromParent();
  const out = new Group();
  out.name = 'clear-window-car';
  const body = (bakeModel(source) ?? source).clone(true);
  // Its own materials (the baked ones are shared by every model): the shell cut away inside the windows.
  const cut = windowCut(lead ? WINDOWS.lead : WINDOWS.car);
  body.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.material = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(cut)[0];
  });
  out.add(body);
  const merged = panes.length > 0 ? mergeGeometries(panes.map(plain)) : null;
  if (merged) {
    const pane = new Mesh(merged, new MeshLambertMaterial({ color: '#9fd0ec', transparent: true, opacity: 0.22, depthWrite: false }));
    pane.name = 'clear-glass';
    pane.renderOrder = 2;
    out.add(pane);
  }
  out.add(insideBox());
  return out;
}

/** Only the position and normal (the panes come with different extra attributes). */
function plain(g: BufferGeometry): BufferGeometry {
  const out = new BufferGeometry();
  const source = g.index ? g.toNonIndexed() : g;
  out.setAttribute('position', source.getAttribute('position'));
  const normal = source.getAttribute('normal');
  if (normal) out.setAttribute('normal', normal);
  else out.computeVertexNormals();
  return out;
}

/**
 * The car's inside as one box seen from within (vehicle_common.py: the body is 3 m wide, the floor at y 1.0, the roof
 * from 3.1 m; the ends at z ±6): just inside the shell, so from outside only the windows show it.
 */
function insideBox(): Mesh {
  const g = new BoxGeometry(2.86, 2.16, 11.7).toNonIndexed();
  g.translate(0, 1.0 + 1.08, 0);
  const normals = g.getAttribute('normal');
  const colors: number[] = [];
  // Unlit (the sun does not reach in): soft indoor colours.
  const wall = new Color('#e6d3b0');
  const floor = new Color('#a27a52');
  const ceiling = new Color('#f2ebde');
  const end = new Color('#d8c098');
  for (let i = 0; i < normals.count; i++) {
    const ny = normals.getY(i);
    const nz = normals.getZ(i);
    // The box's own normals point out: the floor is the face whose normal points down.
    const c = ny < -0.5 ? floor : ny > 0.5 ? ceiling : Math.abs(nz) > 0.5 ? end : wall;
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const mesh = new Mesh(g, new MeshBasicMaterial({ vertexColors: true, side: BackSide }));
  mesh.name = 'car-inside';
  return mesh;
}

/** A copy of `material` that draws nothing on the car's sides inside the windows (car space: the geometry's own). */
function windowCut(windows: readonly (readonly [number, number])[]): (material: Material) => Material {
  const inset = 0.03;
  const tests = windows
    .map(([z, w]) => `(abs(vCarPos.z - ${z.toFixed(3)}) < ${(w / 2 - inset).toFixed(3)})`)
    .join(' || ');
  const glsl = `if (abs(vCarPos.x) > 1.3 && vCarPos.y > ${(WINDOW_Y[0] + inset).toFixed(3)} && vCarPos.y < ${(WINDOW_Y[1] - inset).toFixed(3)} && (${tests})) discard;`;
  return (material) => {
    const copy = material.clone();
    const before = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    copy.onBeforeCompile = (shader, renderer) => {
      before.call(material, shader, renderer);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCarPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCarPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCarPos;')
        .replace('void main() {', `void main() {\n  ${glsl}`);
    };
    copy.customProgramCacheKey = () => `${key}|window-cut:${windows.length}`;
    return copy;
  };
}
