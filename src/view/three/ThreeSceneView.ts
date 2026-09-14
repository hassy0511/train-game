import {
  BufferGeometry,
  Group,
  Material,
  Mesh,
  NoToneMapping,
  Object3D,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { StageEvent } from '../../core/stage-events';
import type { RailNetwork } from '../../rail/types';
import type { StageData } from '../../stage/types';
import { TRAIN } from '../../train/params';
import type { TrainPose } from '../../train/types';
import type { CameraFx, SceneView } from '../SceneView';
import { cameraTarget, makeCameraTarget, smoothCamera, type CameraMode } from '../camera-rig';
import { ActorLayer } from './actors';
import { addEnvironment } from './environment';
import { ModelLibrary } from './models';
import { addModelPlacements, addProps } from './props';
import { buildRailScene } from './rail-mesh';

/** Production Three.js view for the first-person train scene. */
export class ThreeSceneView implements SceneView {
  private renderer: WebGLRenderer | null = null;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(TRAIN.cabFovDeg, 1, 0.1, 600);
  private readonly train = new Group();
  private readonly cars: Group[] = [];
  private readonly models = new ModelLibrary();
  private readonly cameraPosition = new Vector3();
  private sky: Mesh | null = null;
  private cameraMode: CameraMode = 'cab';
  private cameraSnap = true;
  private readonly camTarget = makeCameraTarget();
  private readonly camCurrent = makeCameraTarget();
  private network: RailNetwork | null = null;
  private rails: Group | null = null;
  private actors: ActorLayer | null = null;

  async init(container: HTMLElement, stage: StageData, network: RailNetwork): Promise<void> {
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = NoToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.sky = addEnvironment(this.scene, stage.file.environment);

    this.network = network;
    const rails = buildRailScene(network);
    this.rails = rails.group;
    this.scene.add(rails.group);

    this.train.name = 'train';
    this.scene.add(this.train);
    this.scene.add(this.camera);
    for (let i = 1; i < TRAIN.carCount; i++) {
      const car = new Group();
      car.name = `car-${i}`;
      this.cars.push(car);
      this.scene.add(car);
    }

    const props = new Group();
    props.name = 'props';
    this.scene.add(props);

    const bufferStops = new Group();
    bufferStops.name = 'buffer-stops';
    this.scene.add(bufferStops);

    this.actors = new ActorLayer(this.models, stage.stations);
    this.scene.add(this.actors.group);

    const [trainModel, carModel] = await Promise.all([
      this.models.load('train-proto'),
      this.models.load('car-proto'),
      addProps(props, stage.props, this.models),
      addModelPlacements(bufferStops, rails.bufferStops, this.models),
      this.actors.init(stage.actors),
    ]);
    const trainInstance = trainModel.clone(true);
    trainInstance.name = 'train-proto';
    this.train.add(trainInstance);
    for (const car of this.cars) car.add(carModel.clone(true));

    this.resize(container.clientWidth, container.clientHeight, window.devicePixelRatio);
  }

  onStageEvent(event: StageEvent): void {
    if (event.type === 'rail:cut' && this.network && this.rails) {
      // Gaps were added to the rail; rebuild the track meshes without the cut piece.
      this.rails.removeFromParent();
      const rebuilt = buildRailScene(this.network);
      this.rails = rebuilt.group;
      this.scene.add(rebuilt.group);
      return;
    }
    void this.actors?.onStageEvent(event);
  }

  setCamera(mode: CameraMode, snap = false): void {
    this.cameraMode = mode;
    this.cameraSnap = this.cameraSnap || snap;
  }

  update(dt: number, pose: TrainPose, fx: CameraFx): void {
    if (!this.renderer) return;
    this.train.position.copy(pose.position);
    this.train.quaternion.copy(pose.quaternion);
    this.cars.forEach((car, i) => {
      const cp = pose.cars[i];
      if (cp) {
        car.position.copy(cp.position);
        car.quaternion.copy(cp.quaternion);
      }
    });

    cameraTarget(this.cameraMode, pose, this.camTarget);
    smoothCamera(this.camCurrent, this.camTarget, dt, this.cameraSnap || this.cameraMode === 'cab');
    this.cameraSnap = false;
    this.camera.position.copy(this.camCurrent.position);
    this.camera.up.copy(this.camCurrent.up);
    this.camera.lookAt(this.camCurrent.lookAt);
    if (this.cameraMode === 'cab') {
      this.camera.position.y -= 0.35 * fx.dip;
      if (fx.shake > 0) {
        this.camera.position.x += (Math.random() - 0.5) * 0.12 * fx.shake;
        this.camera.position.y += (Math.random() - 0.5) * 0.12 * fx.shake;
      }
    }

    this.actors?.update(dt);
    this.cameraPosition.copy(this.camera.position);
    this.sky?.position.copy(this.cameraPosition);
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
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }

  getScene(): Scene {
    return this.scene;
  }

  dispose(): void {
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    this.scene.traverse((object: Object3D) => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      if (Array.isArray(object.material)) {
        for (const material of object.material) materials.add(material);
      } else {
        materials.add(object.material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();

    this.renderer?.renderLists.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.renderer = null;
    this.sky = null;
    this.scene.clear();
  }
}
