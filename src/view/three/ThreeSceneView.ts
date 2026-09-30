import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Fog,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NoToneMapping,
  Object3D,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
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
import { cameraTarget, makeCameraTarget, orbitAngle, orbitTarget, smoothCamera, type CameraMode, type OrbitCamera } from '../camera-rig';
import { buildGapPits, buildJumpDevice, buildLightBeam, Flocks, JunctionSigns, SkyGimmicks } from './abilities';
import { ForestGimmicks } from './forest';
import { MeadowGimmicks } from './meadow';
import { VolcanoGimmicks } from './volcano-gimmicks';
import { IceGimmicks } from './ice';
import { PlowGimmicks } from './plow';
import { VillageGimmicks } from './village';
import { NightGimmicks } from './night';
import { frameWave, SnowGimmicks } from './snow';
import { iceZones, thinIceZones } from '../../gimmick/ice';
import { slopeZones } from '../../gimmick/slope';
import type { EnvironmentDef, RailBaseDef, ResolvedProp } from '../../stage/types';
import { ActorLayer } from './actors';
import { bakeModel } from './bake';
import { CAMERA_FAR, EnvironmentState, FOG_CULL_MARGIN, snowBeds } from './environment-state';
import { ModelLibrary } from './models';
import { addModelPlacements, addProps } from './props';
import { buildDetachedRailPiece, buildRailScene, buildTrack, type TrackLook, type TrackLooks } from './rail-mesh';
import { WaterLayer } from './water';
import { SeaGimmicks } from './sea';
import { RiverGimmicks } from './river';
import { HarbourGimmicks } from './harbour';

/**
 * v1.7: a fixed (cutscene) camera is a wide shot from far out (2-3's ending, from the sea): while it is on, the
 * fog and the draw distance reach this many times further, so the far side of the picture is not lost in the fog.
 * v1.10: the default of the cutscene step's `reach` (a close shot says 1).
 */
const FIXED_CAMERA_REACH = 2.5;

interface DoorVisual {
  group: Group;
  panel: Mesh;
}

interface RailCutEffect {
  group: Group;
  materials: Material[];
  elapsed: number;
}

/** v1.7: a stretch of track (and the props tagged on it) falling into the sea below after a cut. */
interface FallingPiece {
  object: Object3D;
  velocity: number;
  spin: Vector3;
  elapsed: number;
  /** Disposed when done (the cut track); tagged props are only removed. */
  own: boolean;
}

/** v1.10 (4-1): track bed colours on ice and thin ice (snow: environment-state.ts). */
const ICE_BED = '#BFE3F2';
const THIN_ICE_BED = '#8CC3E0';

/** v1.7: a field-of-view boost (degrees) while the rocket burns. */
const ROCKET_FOV = 6;

/** Production Three.js view for the first-person train scene. */
export class ThreeSceneView implements SceneView {
  private renderer: WebGLRenderer | null = null;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(TRAIN.cabFovDeg, 1, 0.1, CAMERA_FAR);
  private readonly train = new Group();
  private readonly cars: Group[] = [];
  private readonly models = new ModelLibrary();
  private readonly cameraPosition = new Vector3();
  /** The look: sky, fog, far plane, lights, ground, stars, cloud sea, falling snow (PHASE9 B6.1). */
  private readonly environment = new EnvironmentState(this.scene, this.camera);
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
  private flocks: Flocks | null = null;
  private sky3: SkyGimmicks | null = null;
  private forest: ForestGimmicks | null = null;
  private meadow: MeadowGimmicks | null = null;
  private volcano: VolcanoGimmicks | null = null;
  /** v1.10 (4-1): ice sheets, thin ice, snow, snowbirds and ice mirrors (null on a stage without them). */
  private ice: IceGimmicks | null = null;
  /** v1.10 (4-2): the snowplow, snow walls and buried stretches; the village's evening, lanterns and swirl marks. */
  private plow: PlowGimmicks | null = null;
  private village: VillageGimmicks | null = null;
  /** v1.10 (4-3): tunnels, the snow wave and the false exit (null on a stage without them). */
  private snow: SnowGimmicks | null = null;
  /** v1.11 (5-1): sleepers, tanukis, firefly forks, fake lanterns, the cars' windows at night (null without them). */
  private night: NightGimmicks | null = null;
  /** v1.7: slope beds and rock bases, kept for rebuilding the track after a cut. */
  private trackLooks: TrackLooks | undefined;
  /** v1.7: props with a tag, each in its own group (a cut can drop them). */
  private readonly taggedProps: { prop: ResolvedProp; group: Group }[] = [];
  private readonly falling: FallingPiece[] = [];
  private fovBoost = 0;
  private fovTarget = 0;
  /** "がめんの ゆれ: へらす": the rocket does not widen the view. */
  private calm = false;
  private boughSkips: { railId: string; from: number; to: number }[] = [];
  private railLooks: Record<string, TrackLook> = {};
  private readonly lightBeam = buildLightBeam();
  private jumpDevice: Object3D | null = null;
  private clock = 0;
  /** v1.7: a cutscene camera standing still. */
  private fixedCamera: { at: Vector3; lookAt: Vector3; reach: number } | null = null;
  /** The title screen's camera swinging around the train, and how long it has been on (s). */
  private orbit: OrbitCamera | null = null;
  private orbitTime = 0;
  /** v1.10: the stage's water (null without any). */
  private water: WaterLayer | null = null;
  /** v1.10 (3-1): whales, currents, bubble forks (null on a stage without them). */
  private sea: SeaGimmicks | null = null;
  /** v1.10 (3-2): waterfalls; (3-3): the lighthouse, the festival and the moon (null on a stage without them). */
  private river: RiverGimmicks | null = null;
  private harbour: HarbourGimmicks | null = null;
  private readonly underColor = new Color();
  private readonly zoneTint = new Color();
  /** v1.10: what the scene looked like above water, while the camera is under it. */
  private aboveWater: { background: Color | null; fog: Fog | null; fogColor: Color | null } | null = null;

  async init(container: HTMLElement, stage: StageData, network: RailNetwork): Promise<void> {
    this.stage = stage;
    // v1.10 (4-1): a stencil buffer for the ice mirrors' window.
    const renderer = new WebGLRenderer({ antialias: true, stencil: true });
    // Counted over the whole frame (the mirror pass is a second render call); reset at the start of update().
    renderer.info.autoReset = false;
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = NoToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.environment.apply(stage.file.environment);

    this.network = network;
    // Springy boughs (ForestGimmicks) and hanging silk bridges (MeadowGimmicks) draw their own track; the rest
    // of the line is built here.
    const boughSkips = stage.file.gimmicks.flatMap((g) =>
      g.type === 'bough' && g.railId !== undefined && g.from !== undefined && g.to !== undefined
        ? [{ railId: g.railId, from: g.from, to: g.to }]
        : [],
    );
    this.boughSkips = [...boughSkips, ...MeadowGimmicks.trackSkips(stage)];
    this.railLooks = Object.fromEntries(stage.file.rails.flatMap((r) => (r.look && r.look !== 'rail' ? [[r.id, r.look]] : [])));
    const bases = new Map<string, RailBaseDef[]>();
    for (const r of stage.file.rails) if (r.base) bases.set(r.id, Array.isArray(r.base) ? r.base : [r.base]);
    const slopes = slopeZones(stage.file.gimmicks);
    // v1.10 (4-1): the bed is white on snow, pale blue on ice and a deeper blue on thin ice.
    const beds = [
      ...snowBeds(stage.file.rails, stage.file.environment),
      ...iceZones(stage.file.gimmicks).map((z) => ({ railId: z.railId, from: z.from, to: z.to, color: ICE_BED })),
      ...thinIceZones(stage.file.gimmicks).map((z) => ({ railId: z.railId, from: z.from, to: z.to, color: THIN_ICE_BED })),
    ];
    this.trackLooks =
      bases.size > 0 || slopes.length > 0 || beds.length > 0
        ? { bases, slopes, groundY: stage.file.environment.ground?.y ?? null, beds }
        : undefined;
    const rails = buildRailScene(network, this.boughSkips, this.railLooks, this.trackLooks);
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
    this.flocks = new Flocks(stage);
    this.scene.add(this.flocks.group);
    this.sky3 = new SkyGimmicks(stage);
    this.scene.add(this.sky3.group);
    this.forest = new ForestGimmicks(stage);
    this.scene.add(this.forest.group);
    this.meadow = new MeadowGimmicks(stage, this.train);
    this.scene.add(this.meadow.group);
    this.volcano = new VolcanoGimmicks(stage, this.train);
    this.scene.add(this.volcano.group);
    if (stage.file.environment.water?.length) {
      this.water = new WaterLayer(stage);
      this.scene.add(this.water.group);
    }
    if (SeaGimmicks.wanted(stage)) {
      this.sea = new SeaGimmicks(stage, this.train, (id) => this.actors?.positionOf(id) ?? null);
      this.scene.add(this.sea.group);
    }
    if (RiverGimmicks.wanted(stage)) {
      this.river = new RiverGimmicks(stage);
      this.scene.add(this.river.group);
    }
    if (HarbourGimmicks.wanted(stage)) {
      this.harbour = new HarbourGimmicks(stage);
      this.scene.add(this.harbour.group);
    }
    const g = stage.file.gimmicks;
    const icy = g.some((x) => ['ice-sheet', 'thin-ice', 'mirror'].includes(x.type)) || !!stage.file.environment.snow;
    const birds = stage.file.actors.some((a) => (a.params as { look?: string } | undefined)?.look === 'snowbird');
    if (icy || birds) {
      this.ice = new IceGimmicks(stage, this.train);
      this.scene.add(this.ice.group);
    }
    // The snowplow rides on the train from the stage it is learned in on (its walls only where there are some).
    this.plow = new PlowGimmicks(stage, this.train);
    this.scene.add(this.plow.group);
    if (stage.file.props.some((p) => p.model === 'lantern' || p.trace) || stage.file.cutscenes && Object.values(stage.file.cutscenes).some((c) => c.some((st) => 'sky' in st))) {
      this.village = new VillageGimmicks(this.scene, this.environment);
    }
    if (SnowGimmicks.wanted(stage)) {
      this.snow = new SnowGimmicks(stage, this.scene, this.environment);
      this.scene.add(this.snow.group);
    }
    if (NightGimmicks.wanted(stage)) {
      this.night = new NightGimmicks(stage, this.actors, this.cars);
      this.scene.add(this.night.group);
    }
    // Tagged props stay separate so a cutscene can drop them (the old bridge's girders).
    for (const prop of stage.props) {
      if (!prop.tag) continue;
      const group = new Group();
      group.name = `tag:${prop.tag}`;
      this.scene.add(group);
      this.taggedProps.push({ prop, group });
    }

    const [trainModel, carModel, partnerModel] = await Promise.all([
      this.models.load('train-proto'),
      this.models.load('car-proto'),
      this.models.load('partner'),
      // v1.11 (5-1): sleepers each on their own (they hide by themselves: the night layer).
      addProps(props, stage.props.filter((p) => !p.tag && !(p.sleeper && this.night)), this.models),
      ...this.taggedProps.map(({ prop, group }) => addProps(group, [prop], this.models)),
      addModelPlacements(bufferStops, rails.bufferStops, this.models),
      this.actors.init(stage.actors, stage.records),
      this.signs.init(),
      this.flocks.init(this.models),
      this.sky3.init(this.models),
      this.forest.init(this.models),
      this.meadow.init(this.models),
      this.volcano.init(this.models),
      this.sea?.init(this.models),
      this.ice?.init(this.models),
      this.plow.init(this.models),
      this.night?.init(this.models),
    ]);
    this.lookChanged();
    // After the lights and the fog are all in (it dims them in a tunnel).
    await this.snow?.init(this.models);
    // The train, cars and partner only ever move as a whole (door bands, the light beam and the jump unit are
    // objects of their own), so each draws baked, in one call.
    const trainInstance = (bakeModel(trainModel) ?? trainModel).clone(true);
    trainInstance.name = 'train-proto';
    this.train.add(trainInstance);
    const carTemplate = bakeModel(carModel) ?? carModel;
    for (const car of this.cars) car.add(carTemplate.clone(true));

    const partner = (bakeModel(partnerModel) ?? partnerModel).clone(true);
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
      if (event.style === 'fall') {
        if (event.instant) this.removeCutProps(event.railId, event.from, event.to, event.props);
        else this.dropCutStretch(event.railId, event.from, event.to, event.props);
      }
      const detached =
        event.style === 'fall' || event.instant ? null : buildDetachedRailPiece(this.network, event.railId, event.from, event.to);
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
      const rebuilt = buildRailScene(this.network, this.boughSkips, this.railLooks, this.trackLooks);
      this.rails = rebuilt.group;
      this.scene.add(rebuilt.group);
      this.disposeDetachedObject(oldRails);
      return;
    }
    if (event.type === 'door') this.setDoor(event.open, event.stationId);
    if (event.type === 'dome') this.water?.setDome(event.on, event.instant);
    if (event.type === 'light') this.lightBeam.visible = event.on;
    this.sky3?.onStageEvent(event);
    this.forest?.onEvent(event);
    this.meadow?.onEvent(event);
    this.volcano?.onEvent(event);
    this.sea?.onEvent(event);
    this.ice?.onEvent(event);
    this.river?.onEvent(event);
    this.harbour?.onEvent(event);
    // v1.10 (3-3): at the festival the jellyfish lanterns float up.
    if (event.type === 'festival') this.flocks?.lift('lantern-jelly', 3, event.instant ? 0 : 2.5);
    this.plow?.onEvent(event);
    this.village?.onEvent(event);
    this.snow?.onEvent(event);
    this.night?.onEvent(event);
    if (event.type === 'ability' && event.id === 'rocket') void this.volcano?.addRocketUnit(this.models);
    if (event.type === 'rocket') this.fovTarget = event.state === 'burn' && !this.calm ? ROCKET_FOV : 0;
    if (event.type === 'sign:reveal') this.signs?.reveal(event.junctionId);
    if (event.type === 'sign:reset') this.signs?.reset(event.junctionId);
    if (event.type === 'ability' && event.id === 'jump' && !this.jumpDevice) {
      this.jumpDevice = new Object3D();
      void buildJumpDevice(this.models).then((device) => {
        this.jumpDevice = device;
        this.train.add(device);
      });
    }
    if (event.type === 'rewind') {
      this.fovTarget = 0;
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

  /**
   * v1.7 cut style "fall": the cut stretch of track, and the props tagged `tag` standing on it, fall into the
   * sea below ("がらがら… ぽちゃん").
   */
  private dropCutStretch(railId: string, from: number, to: number, tag?: string): void {
    const rail = this.network?.rails.get(railId);
    if (!rail) return;
    // The gap is already in the rail: build the piece as it was.
    rail.removeGap(from, to);
    const geometry = buildTrack(rail, from, to, this.railLooks[railId] ?? 'rail', this.trackLooks);
    rail.addGap(from, to);
    if (geometry) {
      const mesh = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true }));
      mesh.name = 'falling-track';
      mesh.frustumCulled = false;
      // Pivot about the stretch's middle so it tips as it falls.
      const middle = rail.frameAt((from + to) / 2).position;
      geometry.translate(-middle.x, -middle.y, -middle.z);
      mesh.position.copy(middle);
      this.scene.add(mesh);
      this.falling.push({ object: mesh, velocity: 0, spin: new Vector3(0.25, 0, 0.35), elapsed: 0, own: true });
    }
    if (!tag) return;
    for (const { prop, group } of this.taggedProps) {
      if (prop.tag !== tag) continue;
      if (prop.onRail && (prop.onRail.railId !== railId || prop.onRail.at < from - 1 || prop.onRail.at > to + 1)) continue;
      // Tip about the prop's own place.
      const pivot = new Group();
      pivot.position.copy(prop.position);
      this.scene.add(pivot);
      group.position.sub(prop.position);
      pivot.add(group);
      const k = this.falling.length;
      this.falling.push({ object: pivot, velocity: -1 - (k % 3), spin: new Vector3(0.3 * ((k % 2) * 2 - 1), 0, 0.4), elapsed: 0, own: false });
    }
  }

  /** A fast-forwarded "fall" cut: the props tagged `tag` on the stretch are simply gone (as after their fall). */
  private removeCutProps(railId: string, from: number, to: number, tag?: string): void {
    if (!tag) return;
    for (const { prop, group } of this.taggedProps) {
      if (prop.tag !== tag) continue;
      if (prop.onRail && (prop.onRail.railId !== railId || prop.onRail.at < from - 1 || prop.onRail.at > to + 1)) continue;
      group.removeFromParent();
    }
  }

  private updateFalling(dt: number): void {
    const ground = this.stage?.file.environment.ground?.y ?? null;
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.elapsed += dt;
      f.velocity -= 9.8 * dt;
      f.object.position.y += f.velocity * dt;
      f.object.rotation.x += f.spin.x * dt;
      f.object.rotation.z += f.spin.z * dt;
      const gone = f.elapsed > 6 || (ground !== null && f.object.position.y < ground - 12);
      if (!gone) continue;
      if (f.own) this.disposeDetachedObject(f.object);
      else f.object.removeFromParent();
      this.falling.splice(i, 1);
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

  setFixedCamera(fixed: { at: [number, number, number]; lookAt: [number, number, number]; reach?: number } | null): void {
    const was = this.fixedCamera !== null;
    this.fixedCamera = fixed ? { at: new Vector3(...fixed.at), lookAt: new Vector3(...fixed.lookAt), reach: fixed.reach ?? FIXED_CAMERA_REACH } : null;
    if (was !== (fixed !== null)) this.cameraSnap = true;
    // Further out for the wide shot (the fog follows in update()). After it, the far plane comes back in with the
    // easing fog (easeFarBack), never inside it: a far plane cut short of a thin fog shows a hard horizon.
    this.widenFar();
  }

  /** While a fixed camera is on, the far plane reaches as far as its fog does. */
  private widenFar(): void {
    const { baseFog, baseFar } = this.environment;
    if (this.fixedCamera && baseFog && baseFar > 0) {
      const far = Math.max(baseFar, baseFog.far * this.fixedCamera.reach + FOG_CULL_MARGIN);
      if (far > this.camera.far) {
        this.camera.far = far;
        this.camera.updateProjectionMatrix();
      }
    }
  }

  /**
   * PHASE9 B6.1: changes the look (a 6-2 section's, 5-1's day and night), as often as wanted. Only what differs from
   * the look before is built again.
   */
  applyEnvironment(env: EnvironmentDef): void {
    this.environment.apply(env);
    // Under water the view had kept the look above the surface to come back to: it takes the new one next frame.
    this.aboveWater = null;
    this.widenFar();
    // An evening still turning stops: the new look wins.
    this.village?.onLook();
    this.lookChanged();
  }

  /**
   * v1.11 (5-1): what follows the look's lighting: at night the cars' windows glow, and the light's beam fades out
   * along its length (no bright wedge against the dark sky; by day it is drawn as it always was).
   */
  private lookChanged(): void {
    const night = this.environment.lighting === 'night';
    this.night?.setNight(night);
    const day = this.lightBeam.getObjectByName('light-beam-day');
    const dark = this.lightBeam.getObjectByName('light-beam-night');
    if (day) day.visible = !night;
    if (dark) dark.visible = night;
  }

  /** v1.11: the look's lighting now ("day", "evening", "night", "cave"; a test hook). */
  get lighting(): string {
    return this.environment.lighting;
  }

  setOrbit(orbit: OrbitCamera | null): void {
    this.orbit = orbit;
    this.orbitTime = 0;
    this.cameraSnap = true;
  }

  /** After a fixed camera: the far plane shrinks back with the fog as it eases in (to the usual reach at the end). */
  private easeFarBack(): void {
    const baseFar = this.environment.baseFar;
    if (this.fixedCamera || baseFar <= 0 || this.camera.far <= baseFar) return;
    const fog = this.scene.fog as Fog | null;
    let far = Math.max(baseFar, (fog?.far ?? 0) + FOG_CULL_MARGIN);
    if (far - baseFar < 1) far = baseFar;
    if (far !== baseFar && far >= this.camera.far - 0.5) return;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  /** The stage fog, reaching further while a fixed camera is on. */
  private fogReach(): { near: number; far: number } | null {
    const fog = this.environment.baseFog;
    if (!fog || !this.fixedCamera) return fog;
    const reach = this.fixedCamera.reach;
    return { near: fog.near * reach, far: fog.far * reach };
  }

  setCalm(calm: boolean): void {
    this.calm = calm;
    if (calm) this.fovTarget = 0;
  }

  update(dt: number, pose: TrainPose, fx: CameraFx): void {
    if (!this.renderer) return;
    this.renderer.info.reset();
    this.train.position.copy(pose.position);
    this.train.quaternion.copy(pose.quaternion);
    this.cars.forEach((car, i) => {
      const cp = pose.cars[i];
      if (cp) {
        car.position.copy(cp.position);
        car.quaternion.copy(cp.quaternion);
      }
    });
    // On a swaying silk bridge the cars sag with it (the cab view goes with the lead car).
    const silkDip = this.train.position.clone();
    this.meadow?.rideSilk([this.train, ...this.cars]);
    // v1.10 (4-1): through thin ice the cars sink half-way and bob (the cab goes with the lead car).
    this.ice?.rideSink([this.train, ...this.cars]);
    silkDip.subVectors(this.train.position, silkDip);

    if (this.fixedCamera) {
      this.camTarget.position.copy(this.fixedCamera.at);
      this.camTarget.lookAt.copy(this.fixedCamera.lookAt);
      this.camTarget.up.set(0, 1, 0);
    } else if (this.orbit) {
      this.orbitTime += dt;
      orbitTarget(pose, this.orbit, orbitAngle(this.orbit, this.orbitTime), this.camTarget);
    } else {
      // v1.10: looking straight down from under the surface shows only a patch of seabed: while the train runs under
      // water the view from above follows it from behind instead.
      const mode = this.cameraMode === 'top' && this.water?.isSubmerged ? 'chase' : this.cameraMode;
      cameraTarget(mode, pose, this.camTarget);
      // v1.10 (4-3): the snow wave behind the train comes into the side and back cameras' picture.
      const wave = this.snow?.waveFocus;
      if (wave && (mode === 'side' || mode === 'chase')) frameWave(mode, pose, wave, this.camTarget);
    }
    // The cab view and the title's orbit are exact every frame (no easing toward them).
    const cab = this.cameraMode === 'cab' && !this.fixedCamera && !this.orbit;
    smoothCamera(this.camCurrent, this.camTarget, dt, this.cameraSnap || cab || (!!this.orbit && !this.fixedCamera));
    this.cameraSnap = false;
    this.camera.position.copy(this.camCurrent.position);
    this.camera.up.copy(this.camCurrent.up);
    this.camera.lookAt(this.camCurrent.lookAt);
    if (cab) {
      this.camera.position.add(silkDip);
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
    this.flocks?.update(dt);
    this.forest?.update(dt);
    this.meadow?.update(dt, cab);
    this.volcano?.update(dt);
    this.sea?.update(dt);
    this.river?.update(dt);
    this.environment.update(dt);
    if (this.ice) {
      this.ice.trainRail = pose.railId;
      this.ice.trainFront = pose.s + TRAIN.length / 2;
      this.ice.trainSpeed = pose.speed;
      this.ice.update(dt);
    }
    if (this.plow) {
      this.plow.trainSpeed = pose.speed;
      this.plow.update(dt);
    }
    this.village?.update(dt);
    this.night?.update(dt);
    this.updateFalling(dt);
    // A little wider view while the rocket burns (not a shake).
    const fov = this.fovBoost + (this.fovTarget - this.fovBoost) * Math.min(1, dt * 4);
    if (Math.abs(fov - this.fovBoost) > 1e-3) {
      this.fovBoost = fov;
      this.camera.fov = TRAIN.cabFovDeg + fov;
      this.camera.updateProjectionMatrix();
    }
    this.sky3?.update(dt, pose.railId, pose.s + TRAIN.length / 2, this.scene.fog as Fog | null, this.fogReach());
    // v1.10 (4-3): a tunnel's dark over the fog stretches' fog.
    this.snow?.update(dt);
    this.easeFarBack();
    const sky = this.environment.sky;
    if (this.sky3 && sky) {
      const uniforms = (sky.material as ShaderMaterial).uniforms;
      if (uniforms.mist) uniforms.mist.value = this.sky3.mist;
    }
    this.actors?.update(dt);
    this.updateWater(dt, cab);
    this.cameraPosition.copy(this.camera.position);
    sky?.position.copy(this.cameraPosition);
    this.harbour?.update(dt, this.cameraPosition);
    this.renderer.render(this.scene, this.camera);
    // v1.10 (4-1): what the nearest ice mirror shows, drawn into its window.
    this.ice?.renderReflection(this.renderer, this.scene, this.camera, [this.train, ...this.cars], this.actors?.cutsceneFigures() ?? []);
  }

  /** v1.10 (4-1): the ice mirror reflecting now (its gimmicks[] index), or −1 (test hook). */
  get mirrorIndex(): number {
    return this.ice?.activeIndex ?? -1;
  }

  setSnowWave(wave: { railId: string; s: number; speed: number; state: string } | null): void {
    this.snow?.setWave(wave);
  }

  setSubmerged(on: boolean): void {
    this.water?.setSubmerged(on);
  }

  isCameraUnderwater(): boolean {
    return this.aboveWater !== null;
  }

  /**
   * v1.10: the water layer, then the look under water: with the camera under a surface the fog and the background
   * take the water's colour and seeing distance, and the sky hides; back above, they come back as they were (the
   * fog stretches of sky3 set their own reach again every frame).
   */
  private updateWater(dt: number, cab: boolean): void {
    if (!this.water) return;
    const under = this.water.update(dt, this.camera, cab, [this.train, ...this.cars]);
    // Held under the surface, a camera outside the cab still looks at the train.
    if (!cab) this.camera.lookAt(this.camCurrent.lookAt);
    const look = under ? this.water.underLook : null;
    if (look) {
      if (!this.aboveWater) {
        const fog = this.scene.fog as Fog | null;
        this.aboveWater = {
          background: this.scene.background instanceof Color ? this.scene.background.clone() : null,
          fog,
          fogColor: fog ? fog.color.clone() : null,
        };
        if (!fog) this.scene.fog = new Fog(look.color, 1, look.far);
        if (this.environment.sky) this.environment.sky.visible = false;
      }
      const fog = this.scene.fog as Fog;
      // v1.10 (3-1): a fog stretch with its own colour (the deep place) darkens the water to it and pulls the reach
      // in (the light lets it out again), easing as the stretch's own fog does.
      const mist = this.sky3?.zoneColor ? (this.sky3.mist > 0.01 ? this.sky3.mist : 0) : 0;
      const color = mist > 0 && this.sky3?.zoneColor ? this.underColor.set(look.color).lerp(this.zoneTint.set(this.sky3.zoneColor), Math.min(1, mist)) : this.underColor.set(look.color);
      fog.color.copy(color);
      fog.near = 1;
      fog.far = mist > 0 ? Math.min(look.far, Math.max(4, this.sky3?.fogReach ?? look.far)) : look.far;
      if (this.scene.background instanceof Color) this.scene.background.copy(color);
      else this.scene.background = color.clone();
    } else if (this.aboveWater) {
      const was = this.aboveWater;
      this.aboveWater = null;
      if (was.fog && was.fogColor) was.fog.color.copy(was.fogColor);
      this.scene.fog = was.fog;
      const baseFog = this.environment.baseFog;
      if (was.fog && baseFog) {
        was.fog.near = baseFog.near;
        was.fog.far = baseFog.far;
      }
      if (was.background && this.scene.background instanceof Color) this.scene.background.copy(was.background);
      if (this.environment.sky) this.environment.sky.visible = true;
    }
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
    this.stage = null;
    this.scene.clear();
  }
}
