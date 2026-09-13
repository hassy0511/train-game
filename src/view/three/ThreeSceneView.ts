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
import type { RailNetwork } from '../../rail/types';
import type { StageData } from '../../stage/types';
import { TRAIN } from '../../train/params';
import type { TrainPose } from '../../train/types';
import type { SceneView } from '../SceneView';
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
  private readonly models = new ModelLibrary();
  private readonly cameraPosition = new Vector3();
  private sky: Mesh | null = null;

  async init(container: HTMLElement, stage: StageData, network: RailNetwork): Promise<void> {
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = NoToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.sky = addEnvironment(this.scene, stage.file.environment);

    const rails = buildRailScene(network);
    this.scene.add(rails.group);

    this.train.name = 'train';
    this.camera.position.copy(TRAIN.cabCameraOffset);
    this.camera.rotation.set(0, Math.PI, 0);
    this.train.add(this.camera);
    this.scene.add(this.train);

    const props = new Group();
    props.name = 'props';
    this.scene.add(props);

    const bufferStops = new Group();
    bufferStops.name = 'buffer-stops';
    this.scene.add(bufferStops);

    const [trainModel] = await Promise.all([
      this.models.load('train-proto'),
      addProps(props, stage.props, this.models),
      addModelPlacements(bufferStops, rails.bufferStops, this.models),
    ]);
    const trainInstance = trainModel.clone(true);
    trainInstance.name = 'train-proto';
    this.train.add(trainInstance);

    this.resize(container.clientWidth, container.clientHeight, window.devicePixelRatio);
  }

  update(_dt: number, pose: TrainPose): void {
    if (!this.renderer) return;
    this.train.position.copy(pose.position);
    this.train.quaternion.copy(pose.quaternion);
    this.train.updateMatrixWorld(true);
    this.camera.getWorldPosition(this.cameraPosition);
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
