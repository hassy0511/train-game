import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Fog,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Rail, RailNetwork } from '../../rail/types';
import type { StageData } from '../../stage/types';
import { TRAIN } from '../../train/params';
import type { TrainPose } from '../../train/types';
import type { SceneView } from '../SceneView';

const RAIL_HALF_GAUGE = 0.75;
const SAMPLE_STEP = 1;

/** Rough footprints for the placeholder boxes, by model name prefix. */
const BOX_SIZES: Record<string, [number, number, number]> = {
  'tree-a': [3.2, 4.2, 3.2],
  'tree-b': [3.6, 4.6, 3.6],
  rock: [2, 1.2, 1.6],
  'buffer-stop': [3.2, 1.2, 1],
};

function boxFor(model: string): [number, number, number] {
  const key = Object.keys(BOX_SIZES).find((k) => model.startsWith(k));
  return key ? BOX_SIZES[key] : [1, 1, 1];
}

/** Placeholder view: lines for rails, wireframe boxes for everything else. */
export class WireSceneView implements SceneView {
  private renderer: WebGLRenderer | null = null;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(TRAIN.cabFovDeg, 1, 0.1, 600);
  private readonly train = new Group();

  async init(container: HTMLElement, stage: StageData, network: RailNetwork): Promise<void> {
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const env = stage.file.environment;
    this.scene.background = new Color(env.sky.bottom);
    if (env.fog) this.scene.fog = new Fog(env.fog.color, env.fog.near, env.fog.far);
    if (env.ground) {
      const grid = new GridHelper(env.ground.size, env.ground.size / 10, 0x6aa060, 0x9acc90);
      grid.position.y = env.ground.y;
      this.scene.add(grid);
    }

    for (const rail of network.rails.values()) this.scene.add(this.buildRailLines(rail));

    const propMaterial = new MeshBasicMaterial({ color: 0x2f6f3f, wireframe: true });
    for (const prop of stage.props) {
      const [w, h, d] = boxFor(prop.model);
      const mesh = new Mesh(new BoxGeometry(w * prop.scale, h * prop.scale, d * prop.scale), propMaterial);
      mesh.position.copy(prop.position).y += (h * prop.scale) / 2;
      mesh.quaternion.copy(prop.quaternion);
      this.scene.add(mesh);
    }

    const sensorMaterial = new MeshBasicMaterial({ color: 0xd040c0, wireframe: true });
    for (const actor of stage.actors) {
      const mesh = new Mesh(new BoxGeometry(actor.size.x, actor.size.y, actor.size.z), sensorMaterial);
      mesh.position.copy(actor.position).y += actor.size.y / 2;
      mesh.quaternion.copy(actor.quaternion);
      this.scene.add(mesh);
    }

    const body = new Mesh(
      new BoxGeometry(TRAIN.width, TRAIN.height, TRAIN.length),
      new MeshBasicMaterial({ color: 0x3fa7d6, wireframe: true }),
    );
    body.position.y = TRAIN.height / 2;
    this.train.add(body);
    const dash = new Mesh(new BoxGeometry(2.8, 0.3, 0.6), new MeshBasicMaterial({ color: 0x23272b }));
    dash.position.set(0, 1.85, 5.6);
    this.train.add(dash);
    this.camera.position.copy(TRAIN.cabCameraOffset);
    this.camera.rotation.y = Math.PI;
    this.train.add(this.camera);
    this.scene.add(this.train);

    this.resize(container.clientWidth, container.clientHeight, window.devicePixelRatio);
  }

  private buildRailLines(rail: Rail): Group {
    const group = new Group();
    const center: Vector3[] = [];
    const left: Vector3[] = [];
    const right: Vector3[] = [];
    const flush = (): void => {
      if (center.length < 2) return;
      group.add(new Line(new BufferGeometry().setFromPoints(center), new LineBasicMaterial({ color: 0xffffff })));
      group.add(new Line(new BufferGeometry().setFromPoints(left), new LineBasicMaterial({ color: 0x555555 })));
      group.add(new Line(new BufferGeometry().setFromPoints(right), new LineBasicMaterial({ color: 0x555555 })));
      center.length = 0;
      left.length = 0;
      right.length = 0;
    };
    for (let s = 0; s <= rail.length; s += SAMPLE_STEP) {
      if (rail.gaps.some((g) => s >= g.from && s <= g.to)) {
        flush();
        continue;
      }
      const f = rail.frameAt(Math.min(s, rail.length));
      center.push(f.position);
      left.push(f.position.clone().addScaledVector(f.right, -RAIL_HALF_GAUGE));
      right.push(f.position.clone().addScaledVector(f.right, RAIL_HALF_GAUGE));
    }
    flush();

    if (rail.end.type === 'buffer') {
      const f = rail.frameAt(rail.length);
      const [w, h, d] = boxFor('buffer-stop');
      const stop = new Mesh(new BoxGeometry(w, h, d), new MeshBasicMaterial({ color: 0xd64545, wireframe: true }));
      stop.position.copy(f.position).addScaledVector(f.up, h / 2);
      stop.lookAt(stop.position.clone().add(f.tangent));
      group.add(stop);
    }
    return group;
  }

  update(_dt: number, pose: TrainPose): void {
    if (!this.renderer) return;
    this.train.position.copy(pose.position);
    this.train.quaternion.copy(pose.quaternion);
    this.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number, devicePixelRatio: number): void {
    if (!this.renderer) return;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  getStats(): { drawCalls: number; triangles: number } | null {
    if (!this.renderer) return null;
    return { drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
  }

  getScene(): Scene {
    return this.scene;
  }

  dispose(): void {
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.renderer = null;
  }
}
