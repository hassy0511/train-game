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
import type { StageEvent } from '../../core/stage-events';
import type { Rail, RailNetwork } from '../../rail/types';
import type { StageData } from '../../stage/types';
import { TRAIN } from '../../train/params';
import type { TrainPose } from '../../train/types';
import type { CameraFx, SceneView } from '../SceneView';

const RAIL_HALF_GAUGE = 0.75;
const SAMPLE_STEP = 1;

import { placeholderSize as boxFor } from '../placeholder-sizes';

interface MovingBox {
  mesh: Mesh;
  from: Vector3;
  to: Vector3;
  t: number;
  seconds: number;
}

/** Placeholder view: lines for rails, wireframe boxes for everything else. */
export class WireSceneView implements SceneView {
  private renderer: WebGLRenderer | null = null;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(TRAIN.cabFovDeg, 1, 0.1, 600);
  private readonly train = new Group();
  private network: RailNetwork | null = null;
  private stage: StageData | null = null;
  private readonly railGroups = new Map<string, Group>();
  private readonly actorBoxes = new Map<string, Mesh>();
  private readonly moving: MovingBox[] = [];
  private goal: Mesh | null = null;
  private goalSpin = 0;
  private readonly actorMaterial = new MeshBasicMaterial({ color: 0xd08a20, wireframe: true });

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

    this.network = network;
    this.stage = stage;
    for (const rail of network.rails.values()) {
      const g = this.buildRailLines(rail);
      this.railGroups.set(rail.id, g);
      this.scene.add(g);
    }

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
      if (actor.type === 'trigger') {
        const mesh = new Mesh(new BoxGeometry(actor.size.x, actor.size.y, actor.size.z), sensorMaterial);
        mesh.position.copy(actor.position).y += actor.size.y / 2;
        mesh.quaternion.copy(actor.quaternion);
        this.scene.add(mesh);
      } else {
        this.addActorBox(actor.id, actor.type, actor.position);
      }
    }

    const platformMaterial = new MeshBasicMaterial({ color: 0xbfb8aa, wireframe: true });
    for (const st of stage.stations) {
      const side = st.def.platformSide === 'right' ? 1 : -1;
      const frame = network.getRail(st.def.railId).frameAt(st.def.at);
      const mesh = new Mesh(new BoxGeometry(4, 1, 30), platformMaterial);
      mesh.position.copy(frame.position).addScaledVector(frame.right, side * (1.7 + 2)).addScaledVector(frame.up, 0.5);
      mesh.quaternion.copy(st.quaternion);
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

  private addActorBox(id: string, model: string, position: Vector3): Mesh {
    const [w, h, d] = boxFor(model);
    const mesh = new Mesh(new BoxGeometry(w, h, d), this.actorMaterial);
    mesh.position.copy(position).y += h / 2;
    this.scene.add(mesh);
    this.actorBoxes.set(id, mesh);
    return mesh;
  }

  private moveActor(id: string, to: Vector3, seconds: number): void {
    const mesh = this.actorBoxes.get(id);
    if (!mesh) return;
    const half = (mesh.geometry as BoxGeometry).parameters.height / 2;
    const target = to.clone();
    target.y += half;
    if (seconds <= 0) {
      mesh.position.copy(target);
      return;
    }
    this.moving.push({ mesh, from: mesh.position.clone(), to: target, t: 0, seconds });
  }

  onStageEvent(event: StageEvent): void {
    switch (event.type) {
      case 'actor:spawn':
        this.actorBoxes.get(event.id)?.removeFromParent();
        this.addActorBox(event.id, event.model, event.position);
        break;
      case 'actor:move':
        this.moveActor(event.id, event.position, event.seconds);
        break;
      case 'actor:state':
        if (event.position) this.moveActor(event.id, event.position, event.seconds ?? 0);
        break;
      case 'actor:remove':
        this.actorBoxes.get(event.id)?.removeFromParent();
        this.actorBoxes.delete(event.id);
        break;
      case 'rail:cut': {
        const rail = this.network?.getRail(event.railId);
        const old = this.railGroups.get(event.railId);
        if (rail && old) {
          old.removeFromParent();
          const g = this.buildRailLines(rail);
          this.railGroups.set(rail.id, g);
          this.scene.add(g);
        }
        break;
      }
      case 'goal': {
        this.goal?.removeFromParent();
        this.goal = null;
        if (event.stationId && this.stage) {
          const st = this.stage.stations.find((s) => s.def.id === event.stationId);
          if (st) {
            this.goal = new Mesh(new BoxGeometry(1.6, 2.4, 0.2), new MeshBasicMaterial({ color: 0xe9573f, wireframe: true }));
            this.goal.position.copy(st.position).y += 8;
            this.scene.add(this.goal);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  update(dt: number, pose: TrainPose, fx: CameraFx): void {
    if (!this.renderer) return;
    this.train.position.copy(pose.position);
    this.train.quaternion.copy(pose.quaternion);
    this.camera.position.copy(TRAIN.cabCameraOffset);
    this.camera.position.y -= 0.35 * fx.dip;
    if (fx.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * 0.12 * fx.shake;
      this.camera.position.y += (Math.random() - 0.5) * 0.12 * fx.shake;
    }
    for (let i = this.moving.length - 1; i >= 0; i--) {
      const m = this.moving[i];
      m.t = Math.min(m.t + dt / m.seconds, 1);
      m.mesh.position.lerpVectors(m.from, m.to, m.t);
      if (m.t >= 1) this.moving.splice(i, 1);
    }
    if (this.goal) {
      this.goalSpin += dt * 2;
      this.goal.rotation.y = this.goalSpin;
    }
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
