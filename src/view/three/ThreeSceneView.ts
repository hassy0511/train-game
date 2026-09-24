import {
  BoxGeometry,
  BufferGeometry,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
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
import { buildGapPits, buildJumpDevice, buildLightBeam, JunctionSigns } from './abilities';
import { ActorLayer } from './actors';
import { addEnvironment } from './environment';
import { ModelLibrary } from './models';
import { addModelPlacements, addProps } from './props';
import { buildDetachedRailPiece, buildRailScene } from './rail-mesh';

interface DoorVisual {
  group: Group;
  panel: Mesh;
}

interface RailCutEffect {
  group: Group;
  materials: Material[];
  elapsed: number;
}

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
  private stage: StageData | null = null;
  private rails: Group | null = null;
  private actors: ActorLayer | null = null;
  private readonly doors: DoorVisual[] = [];
  private doorProgress = 0;
  private doorTarget = 0;
  private doorSide = 1;
  private readonly railCutEffects: RailCutEffect[] = [];
  private signs: JunctionSigns | null = null;
  private readonly lightBeam = buildLightBeam();
  private jumpDevice: Object3D | null = null;
  private clock = 0;

  async init(container: HTMLElement, stage: StageData, network: RailNetwork): Promise<void> {
    this.stage = stage;
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

    this.actors = new ActorLayer(this.models, stage.stations, stage.file.missions);
    this.actors.setTrain(this.train);
    this.scene.add(this.actors.group);

    this.scene.add(buildGapPits(network, stage.file.environment.ground?.y ?? null));
    this.signs = new JunctionSigns(stage, this.models);
    this.scene.add(this.signs.group);
    this.train.add(this.lightBeam);

    const [trainModel, carModel, partnerModel] = await Promise.all([
      this.models.load('train-proto'),
      this.models.load('car-proto'),
      this.models.load('partner'),
      addProps(props, stage.props, this.models),
      addModelPlacements(bufferStops, rails.bufferStops, this.models),
      this.actors.init(stage.actors, stage.records),
      this.signs.init(),
    ]);
    const trainInstance = trainModel.clone(true);
    trainInstance.name = 'train-proto';
    this.train.add(trainInstance);
    for (const car of this.cars) car.add(carModel.clone(true));

    const partner = partnerModel.clone(true);
    partner.name = 'partner';
    partner.position.set(-0.9, 1.6, 4.6);
    this.train.add(partner);
    this.actors.setPartner(partner);
    this.addDoorVisuals();

    this.resize(container.clientWidth, container.clientHeight, window.devicePixelRatio);
  }

  private addDoorVisuals(): void {
    const panelGeometry = new BoxGeometry(0.055, 2.15, 1.42);
    const panelMaterial = new MeshBasicMaterial({ color: '#173746', transparent: true, opacity: 0.88 });
    for (const car of [this.train, ...this.cars]) {
      const group = new Group();
      group.name = 'door-opening-band';
      group.visible = false;
      const panel = new Mesh(panelGeometry, panelMaterial);
      group.add(panel);
      car.add(group);
      this.doors.push({ group, panel });
    }
  }

  private setDoor(open: boolean, stationId: string): void {
    this.doorTarget = open ? 1 : 0;
    const side = this.stageStationSide(stationId);
    if (side !== null) this.doorSide = side;
  }

  private stageStationSide(stationId: string): number | null {
    const station = this.stage?.stations.find((candidate) => candidate.def.id === stationId);
    return station ? (station.def.platformSide === 'left' ? 1 : -1) : null;
  }

  onStageEvent(event: StageEvent): void {
    if (event.type === 'rail:cut' && this.network && this.rails) {
      const detached = buildDetachedRailPiece(this.network, event.railId, event.from, event.to);
      if (detached) {
        const materials = new Set<Material>();
        detached.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
          else materials.add(object.material);
        });
        this.scene.add(detached);
        this.railCutEffects.push({ group: detached, materials: [...materials], elapsed: 0 });
      }
      // Gaps were added to the rail; rebuild the track meshes without the cut piece.
      const oldRails = this.rails;
      oldRails.removeFromParent();
      const rebuilt = buildRailScene(this.network);
      this.rails = rebuilt.group;
      this.scene.add(rebuilt.group);
      this.disposeDetachedObject(oldRails);
      return;
    }
    if (event.type === 'door') this.setDoor(event.open, event.stationId);
    if (event.type === 'light') this.lightBeam.visible = event.on;
    if (event.type === 'sign:reveal') this.signs?.reveal(event.junctionId);
    if (event.type === 'ability' && event.id === 'jump' && !this.jumpDevice) {
      this.jumpDevice = new Object3D();
      void buildJumpDevice(this.models).then((device) => {
        this.jumpDevice = device;
        this.train.add(device);
      });
    }
    if (event.type === 'rewind') {
      this.signs?.reset();
      this.doorProgress = 0;
      this.doorTarget = 0;
      for (const door of this.doors) door.group.visible = false;
      for (const effect of this.railCutEffects) this.disposeDetachedObject(effect.group);
      this.railCutEffects.length = 0;
    }
    void this.actors?.onStageEvent(event);
  }

  private disposeDetachedObject(root: Object3D): void {
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
      else materials.add(object.material);
    });
    root.removeFromParent();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }

  private updateDoorVisuals(dt: number): void {
    const step = dt / 0.3;
    if (this.doorProgress < this.doorTarget) this.doorProgress = Math.min(this.doorProgress + step, this.doorTarget);
    if (this.doorProgress > this.doorTarget) this.doorProgress = Math.max(this.doorProgress - step, this.doorTarget);
    for (const door of this.doors) {
      door.group.visible = this.doorProgress > 0.01;
      door.group.position.set(this.doorSide * (TRAIN.width / 2 + 0.035), 1.65, 0);
      door.panel.scale.z = Math.max(0.025, this.doorProgress);
    }
  }

  private updateRailCutEffects(dt: number): void {
    for (let index = this.railCutEffects.length - 1; index >= 0; index -= 1) {
      const effect = this.railCutEffects[index];
      effect.elapsed = Math.min(effect.elapsed + dt, 1);
      effect.group.position.y += dt * (2.5 + effect.elapsed * 2.5);
      effect.group.rotateX(dt * 2.4);
      effect.group.rotateZ(dt * 1.4);
      for (const material of effect.materials) material.opacity = 1 - effect.elapsed;
      if (effect.elapsed >= 1) {
        this.disposeDetachedObject(effect.group);
        this.railCutEffects.splice(index, 1);
      }
    }
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

    this.clock += dt;
    this.updateDoorVisuals(dt);
    this.updateRailCutEffects(dt);
    this.signs?.update(dt, this.clock);
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
    this.stage = null;
    this.scene.clear();
  }
}
