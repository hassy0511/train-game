import {
  Box3,
  BufferGeometry,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
  Float32BufferAttribute,
  Group,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { StageEvent } from '../../core/stage-events';
import type { ActKind, Emote, MissionDef, ResolvedActor, ResolvedRecord, ResolvedStation } from '../../stage/types';
import { ACT, actSeconds, actTimes } from '../../cutscene/acts';
import { NECK_DOWN, NECK_UP } from './abilities';
import { bakeModel, bakeTogether } from './bake';
import type { ModelLibrary } from './models';

/** v1.11 (5-3): the waving sway's axis (the figure's forward) and a scratch quaternion. */
const WAVE_AXIS = new Vector3(0, 0, 1);
const WAVE_TILT = new Quaternion();
const UP_AXIS = new Vector3(0, 1, 0);

/**
 * v1.12 (えんしゅつ): a figure's little motion going on (cutscene `act`). It moves the figure's "rig", a group holding
 * its meshes, so it adds to where the figure stands and how it is turned (a move, a turn) without fighting them.
 */
interface ActMotion {
  kind: Exclude<ActKind, 'turn'>;
  rig: Object3D;
  t: number;
  /** One go (s) and how many; a wave goes on until the next act (`times` 0). */
  each: number;
  times: number;
  /** The figure's height (m), for the hop's lift. */
  height: number;
  /** 1, or ACT.gentle with prefers-reduced-motion. */
  scale: number;
}

/** v1.12: a figure turning to face something (it stays so). */
interface ActTurn {
  object: Object3D;
  from: Quaternion;
  to: Quaternion;
  t: number;
  seconds: number;
}

/**
 * v1.11 (5-3): cutscene fx "hearts": 24 little pink hearts and gold stars on a loose ring round a figure (0.6–2.2 m up),
 * one mesh (one draw call) that turns slowly. A child of the figure, so a mirror-only figure has them in the mirror only.
 */
function heartsMesh(): Mesh {
  const heart = new Shape();
  heart.moveTo(0, -0.5);
  heart.bezierCurveTo(-0.15, -0.3, -0.5, -0.1, -0.5, 0.15);
  heart.bezierCurveTo(-0.5, 0.45, -0.1, 0.5, 0, 0.25);
  heart.bezierCurveTo(0.1, 0.5, 0.5, 0.45, 0.5, 0.15);
  heart.bezierCurveTo(0.5, -0.1, 0.15, -0.3, 0, -0.5);
  const star = new Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? 0.5 : 0.22;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  star.closePath();
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 24; i++) {
    const isHeart = i % 5 !== 2 && i % 5 !== 4;
    const g = new ShapeGeometry(isHeart ? heart : star, 4);
    const size = 0.16 + ((i * 7) % 5) * 0.025;
    const a = (i / 24) * Math.PI * 2;
    const r = 0.8 + ((i * 3) % 4) * 0.14;
    g.scale(size, size, size);
    g.rotateY(-a);
    g.translate(Math.cos(a) * r, 0.6 + ((i * 11) % 9) * 0.2, Math.sin(a) * r);
    const color = new Color(isHeart ? (i % 2 ? '#E8579F' : '#FF8FC0') : '#FFD66B');
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) color.toArray(colors, k * 3);
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    parts.push(g);
  }
  const mesh = new Mesh(mergeGeometries(parts) ?? new BufferGeometry(), new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }));
  mesh.name = 'hearts';
  return mesh;
}
import { addModelPlacements, placementMatrix, type ModelPlacement } from './props';

const ACTOR_MODELS: Record<string, string> = {
  cat: 'cat-sleep',
  amanojaku: 'amanojaku',
  passenger: 'passenger',
  'dino-mid': 'dino-mid-sleep',
  'dino-small': 'dino-small-walk',
  'dino-large': 'dino-large-body',
};
/** Models an actor switches to by state (sleeping vs standing). */
const STATE_MODELS: Record<string, { sleep: string; awake: string }> = {
  cat: { sleep: 'cat-sleep', awake: 'cat-stand' },
  'dino-mid': { sleep: 'dino-mid-sleep', awake: 'dino-mid-stand' },
};
/** v1.7: a "cat" with params.look "seabird" is a seabird basking on the rail (it flaps off when whistled). */
const SEABIRD_MODELS = { sleep: 'seabird-sleep', awake: 'seabird' };

function isSeabird(actor: ResolvedActor): boolean {
  return actor.type === 'cat' && (actor.params as { look?: string }).look === 'seabird';
}
/** v1.10 (4-1): a "cat" with params.look "seal" is a seal basking on the rail (it slides off on its belly when whistled). */
const SEAL_MODELS = { sleep: 'seal-sleep', awake: 'seal' };

function isSeal(actor: ResolvedActor): boolean {
  return actor.type === 'cat' && (actor.params as { look?: string }).look === 'seal';
}
/** v1.10 (3-3): a "cat" with params.look "turtle" is a sea turtle asleep on the rail under water (it swims off up). */
const TURTLE_MODELS = { sleep: 'sea-turtle-sleep', awake: 'sea-turtle' };

function isTurtle(actor: ResolvedActor): boolean {
  return actor.type === 'cat' && (actor.params as { look?: string }).look === 'turtle';
}
/** v1.10 (4-3): a "cat" with params.look "snowman" is a snowman on the rail (the whistle makes it roll aside). */
function isSnowman(actor: ResolvedActor): boolean {
  return actor.type === 'cat' && (actor.params as { look?: string }).look === 'snowman';
}
/** v1.11 (5-1): a "cat" with params.look "hedgehog" sniffs along the rail (it curls up and rolls aside when whistled). */
function isHedgehog(actor: ResolvedActor): boolean {
  return actor.type === 'cat' && (actor.params as { look?: string }).look === 'hedgehog';
}
/** v1.11 (5-1): a "dino-small" with params.look "fawn" is a fawn (it hops across; with the light on it stops to gaze). */
function isFawn(actor: ResolvedActor): boolean {
  return actor.type === 'dino-small' && (actor.params as { look?: string }).look === 'fawn';
}
/** v1.11 (5-2): a "cat" with params.look "windup-chick" / "windup-car" is a reverse-wound toy ("-back" until wound). */
function windupLook(actor: ResolvedActor): string | null {
  const look = (actor.params as { look?: string }).look;
  return actor.type === 'cat' && typeof look === 'string' && look.startsWith('windup-') ? look : null;
}
/** v1.10 (3-2): a "dino-small" with params.look "duck" is a mother duck and her ducklings crossing. */
function isDuck(actor: ResolvedActor): boolean {
  return actor.type === 'dino-small' && (actor.params as { look?: string }).look === 'duck';
}
/** Where the large dinosaur's neck joins its body (model space, m; NECK_PIVOT in assets/blender/dinos.py). */
const NECK_PIVOT = new Vector3(0, 8.0, 4.8);
const PLATFORM_CLEARANCE = 1.7;
const PLATFORM_HEIGHT = 1;
/** The stop line sits this far before the platform's far end (m). */
const PLATFORM_OVERHANG = 3;
const PASSENGER_SECONDS = 1.5;
const PASSENGER_SPACING = 1.2;
const PASSENGER_COLORS = ['#365F91', '#B8574F', '#3D786E'];

interface ActorMove {
  id: string;
  object: Object3D;
  from: Vector3;
  to: Vector3;
  elapsed: number;
  seconds: number;
  /** v1.11 (5-2): seconds to wait before it sets off (a toy's key turns back first). */
  delay: number;
  bob: boolean;
  /** v1.10 (4-3): it tumbles over and over on the way ("ころころ"), standing up again at the end. */
  roll: boolean;
}

interface PassengerMove {
  object: Object3D;
  from: Vector3;
  to: Vector3;
  elapsed: number;
  delay: number;
}

interface PartnerAnimation {
  kind: Emote;
  elapsed: number;
  seconds: number;
}

interface SparkleEffect {
  points: Points<BufferGeometry, PointsMaterial>;
  elapsed: number;
}

interface StationFrame {
  station: ResolvedStation;
  side: Vector3;
  forward: Vector3;
  up: Vector3;
}

function stationFrame(station: ResolvedStation): StationFrame {
  // v1.11 (PR8a): a reverse platform's frame faces −s, but its platformSide is along +s.
  const sideSign = (station.def.platformSide === 'right' ? -1 : 1) * (station.def.reverse ? -1 : 1);
  return {
    station,
    side: new Vector3(sideSign, 0, 0).applyQuaternion(station.quaternion),
    forward: new Vector3(0, 0, 1).applyQuaternion(station.quaternion),
    up: new Vector3(0, 1, 0).applyQuaternion(station.quaternion),
  };
}

function disposePassengerMaterials(object: Object3D): void {
  const materials = new Set<Material>();
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    if (Array.isArray(child.material)) child.material.forEach((material) => materials.add(material));
    else materials.add(child.material);
  });
  materials.forEach((material) => material.dispose());
}

function setOpacity(object: Object3D, opacity: number): void {
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material.transparent = opacity < 1;
      material.opacity = opacity;
      material.depthWrite = opacity >= 1;
    }
  });
}

/** Stage actors plus the event-driven station, passenger and character animation layer. */
export class ActorLayer {
  readonly group = new Group();
  private readonly objects = new Map<string, Object3D>();
  private readonly objectModels = new Map<string, string>();
  /**
   * Per id, bumped by every place and remove: a place whose model is still loading when a later place or a remove
   * for the same id comes is dropped (a cutscene's "▶▶" can take a figure off right after bringing it on).
   */
  private readonly generations = new Map<string, number>();
  /** Spawns still loading their model: a move for that id waits for it. */
  private readonly pendingSpawns = new Map<string, Promise<unknown>>();
  private readonly moving: ActorMove[] = [];
  private readonly passengerMoves: PassengerMove[] = [];
  private readonly passengers = new Set<Object3D>();
  private readonly waitingPassengers = new Map<string, Object3D[]>();
  private readonly initialWaiting = new Map<string, number>();
  private readonly passengerLods = new Map<BufferGeometry, Promise<BufferGeometry>>();
  private readonly passengerGeometries = new Map<number, Promise<BufferGeometry>>();
  private passengerSerial = 0;
  private goal: Object3D | null = null;
  private goalBaseY = 0;
  private readonly goalBaseQuaternion = new Quaternion();
  private goalSpin = 0;
  private partner: Object3D | null = null;
  private readonly partnerBasePosition = new Vector3();
  private readonly partnerBaseQuaternion = new Quaternion();
  private partnerAnimation: PartnerAnimation | null = null;
  private sparkle: SparkleEffect | null = null;
  private train: Object3D | null = null;
  private readonly actorTypes = new Map<string, string>();
  /** Actors whose look differs from their type's (a seabird "cat"). */
  private readonly lookModels = new Map<string, { sleep: string; awake: string }>();
  private readonly necks = new Map<string, { neck: Object3D; down: boolean; t: number }>();
  private readonly records = new Map<string, ResolvedRecord>();
  /** v1.10 (4-3): figures that roll as they move (a snowman rolling aside), turning about their own side axis. */
  private readonly rollers = new Set<string>();
  /** v1.11 (5-3): figures swaying as they wave (±0.1 rad, 1.5 times a second, the whole cutscene). */
  private readonly wavers = new Map<string, { object: Object3D; base: Quaternion; t: number }>();
  /** v1.11 (5-3): figures seen only in a mirror ("only"), or never in one ("hide"). */
  private readonly mirrorModes = new Map<string, 'only' | 'hide'>();
  /** v1.11 (5-3): fx "hearts" round a figure (by its id), and their time. */
  private readonly hearts = new Map<string, { mesh: Mesh; t: number }>();
  /** v1.10 (4-1): ids of the figures cutscenes brought on (an ice mirror may show them). */
  private readonly spawned = new Set<string>();
  /** v1.11 (5-1): figures that hop as they move (a fawn "ぴょこぴょこ"). */
  private readonly hoppers = new Set<string>();
  /** v1.12: the train's cars (0 = the lead), for figures riding in them. */
  private cars: Object3D[] = [];
  /** v1.12: the little motions and turns going on, by figure id ("partner" too). */
  private readonly motions = new Map<string, ActMotion>();
  private readonly turns = new Map<string, ActTurn>();
  /** v1.12: prefers-reduced-motion (every act half as big). */
  gentle = false;

  constructor(
    private readonly models: ModelLibrary,
    private readonly stations: ResolvedStation[],
    missions: MissionDef[],
  ) {
    this.group.name = 'actors';
    for (const mission of missions) {
      for (const step of mission.steps) {
        if (!step.board) continue;
        this.initialWaiting.set(step.stationId, (this.initialWaiting.get(step.stationId) ?? 0) + step.board);
      }
    }
  }

  setTrain(train: Object3D): void {
    this.train = train;
  }

  /** v1.12: the lead car and the cars behind it (figures can ride in them). */
  setCars(cars: Object3D[]): void {
    this.cars = cars;
  }

  setPartner(partner: Object3D): void {
    this.partner = partner;
    this.partnerBasePosition.copy(partner.position);
    this.partnerBaseQuaternion.copy(partner.quaternion);
  }

  async init(actors: ResolvedActor[], records: ResolvedRecord[] = []): Promise<void> {
    for (const actor of actors) {
      this.actorTypes.set(actor.id, actor.type);
      if (isSeabird(actor)) this.lookModels.set(actor.id, SEABIRD_MODELS);
      if (isSeal(actor)) this.lookModels.set(actor.id, SEAL_MODELS);
      if (isTurtle(actor)) this.lookModels.set(actor.id, TURTLE_MODELS);
      if (isDuck(actor)) this.lookModels.set(actor.id, { sleep: 'duck-family', awake: 'duck-family' });
      if (isHedgehog(actor)) {
        this.lookModels.set(actor.id, { sleep: 'hedgehog-walk', awake: 'hedgehog-ball' });
        this.rollers.add(actor.id);
      }
      if (isFawn(actor)) {
        this.lookModels.set(actor.id, { sleep: 'fawn', awake: 'fawn' });
        this.hoppers.add(actor.id);
      }
      if (isSnowman(actor)) {
        this.lookModels.set(actor.id, { sleep: 'snowman', awake: 'snowman' });
        this.rollers.add(actor.id);
      }
      const windup = windupLook(actor);
      if (windup) {
        this.lookModels.set(actor.id, { sleep: `${windup}-back`, awake: windup });
        this.hoppers.add(actor.id);
      }
    }
    // Nuts and squirrels are drawn by the forest gimmicks, grasshoppers by the meadow ones and rocks by the volcano
    // ones (they move on their own).
    // v1.11 (5-1): the little tanukis (lure groups) by the night layer (night.ts).
    // v1.11 (5-2): the toy band by the toy town layer (toy.ts).
    const drawnElsewhere = new Set(['trigger', 'nut', 'squirrel', 'grasshopper', 'rock-roll', 'rock-drop', 'whale', 'lure', 'parade']);
    await Promise.all(
      actors
        .filter((actor) => !drawnElsewhere.has(actor.type))
        .map((actor) =>
          this.place(actor.id, this.lookModels.get(actor.id)?.sleep ?? ACTOR_MODELS[actor.type] ?? actor.type, actor.position, actor.quaternion),
        ),
    );
    await Promise.all(actors.filter((a) => a.type === 'dino-large').map((a) => this.addNeck(a.id)));
    await Promise.all(
      records
        .filter((r) => r.def.model)
        .map((r) => {
          this.records.set(r.def.id, r);
          return this.place(`record:${r.def.id}`, r.def.model as string, r.position, r.quaternion);
        }),
    );
    await Promise.all([this.addStations(), this.addCrossingGates(actors), this.resetWaitingPassengers()]);
  }

  private async addNeck(id: string): Promise<void> {
    const body = this.objects.get(id);
    if (!body) return;
    const neck = (await this.models.load('dino-large-neck')).clone(true);
    neck.name = `${id}:neck`;
    neck.position.copy(NECK_PIVOT);
    neck.quaternion.copy(NECK_UP);
    body.add(neck);
    this.necks.set(id, { neck, down: false, t: 1 });
  }

  private async addStations(): Promise<void> {
    const platform = (await this.models.load('platform')).clone(true);
    const bounds = new Box3().setFromObject(platform);
    const platformLength = bounds.max.z - bounds.min.z;
    const clearance = PLATFORM_CLEARANCE + (this.models.has('platform') ? 0 : 2);

    const stationObjects = new Group();
    stationObjects.name = 'stations';
    this.group.add(stationObjects);
    // Each station's static parts are baked into one mesh, one draw call a station. Stations stay separately
    // culled objects: batching all four distant stations makes every platform render whenever one is visible,
    // which costs more triangles than it saves here.
    await Promise.all(this.stations.map((station) => this.addStation(stationObjects, station, clearance, platformLength)));
  }

  private async addStation(target: Group, station: ResolvedStation, clearance: number, platformLength: number): Promise<void> {
    const frame = stationFrame(station);
    const placements: ModelPlacement[] = [];
    const platformPosition = station.position
      .clone()
      .addScaledVector(frame.side, clearance)
      .addScaledVector(frame.forward, PLATFORM_OVERHANG - platformLength / 2);
    placements.push({ model: 'platform', position: platformPosition, quaternion: station.quaternion, scale: 1 });
    placements.push({
      model: 'platform-roof',
      position: platformPosition.clone().addScaledVector(frame.up, PLATFORM_HEIGHT),
      quaternion: station.quaternion,
      scale: 1,
    });

    const signQuaternion = station.quaternion
      .clone()
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (station.def.platformSide === 'left') !== !!station.def.reverse ? -Math.PI / 2 : Math.PI / 2));
    placements.push({
      model: 'station-sign',
      position: station.position
        .clone()
        .addScaledVector(frame.side, clearance + 2.1)
        .addScaledVector(frame.forward, -4)
        .addScaledVector(frame.up, PLATFORM_HEIGHT),
      quaternion: signQuaternion,
      scale: 1,
    });
    placements.push({ model: 'stop-line', position: station.position, quaternion: station.quaternion, scale: 1 });
    placements.push({
      model: 'stop-board',
      position: station.position.clone().addScaledVector(frame.side, PLATFORM_CLEARANCE + 0.6),
      quaternion: station.quaternion,
      scale: 1,
    });

    const templates = await Promise.all(placements.map((placement) => this.models.load(placement.model)));
    // Baked in the station's own frame, so the merged vertices stay near the origin.
    const toStation = new Matrix4().compose(station.position, station.quaternion, new Vector3(1, 1, 1)).invert();
    const baked = bakeTogether(
      placements.map((placement, index) => ({
        template: templates[index],
        matrix: toStation.clone().multiply(placementMatrix(placement, new Matrix4())),
      })),
    );
    if (baked) {
      baked.name = `station:${station.def.id}`;
      baked.position.copy(station.position);
      baked.quaternion.copy(station.quaternion);
      target.add(baked);
      return;
    }
    placements.forEach((placement, index) => {
      const instance = templates[index].clone(true);
      instance.name = `${placement.model}:${station.def.id}`;
      instance.position.copy(placement.position);
      instance.quaternion.copy(placement.quaternion);
      instance.scale.setScalar(placement.scale);
      target.add(instance);
    });
  }

  private async addCrossingGates(actors: ResolvedActor[]): Promise<void> {
    // A seabird basks on an open line (a sea cliff), not at a level crossing: no gate for it.
    const placements = actors
      .filter((actor) => actor.type === 'cat' && !isSeabird(actor) && !isSeal(actor) && !isTurtle(actor) && !isSnowman(actor) && !isHedgehog(actor) && windupLook(actor) !== 'windup-chick')
      .map((actor) => ({
        model: 'crossing-gate',
        position: actor.position.clone().add(new Vector3(-3, 0, 0).applyQuaternion(actor.quaternion)),
        quaternion: actor.quaternion,
        scale: 1,
      }));
    if (placements.length === 0) return;
    const crossings = new Group();
    crossings.name = 'crossing-gates';
    this.group.add(crossings);
    await addModelPlacements(crossings, placements, this.models);
  }

  private passengerGeometry(colorIndex: number): Promise<BufferGeometry> {
    const paletteIndex = colorIndex % PASSENGER_COLORS.length;
    const cached = this.passengerGeometries.get(paletteIndex);
    if (cached) return cached;

    const loading = this.models.load('passenger').then(async (template) => {
      const source = template.clone(true);
      source.updateMatrixWorld(true);
      const meshes: Mesh[] = [];
      source.traverse((child) => {
        if (child instanceof Mesh) meshes.push(child);
      });
      const geometries = await Promise.all(
        meshes.map(async (mesh) => {
          let lod = this.passengerLods.get(mesh.geometry);
          if (!lod) {
            const vertices = mesh.geometry.getAttribute('position')?.count ?? 0;
            lod = vertices > 12
              ? new SimplifyModifier().modify(mesh.geometry, Math.floor(vertices * 0.55))
              : Promise.resolve(mesh.geometry);
            this.passengerLods.set(mesh.geometry, lod);
          }
          const simplified = await lod;
          const geometry = new BufferGeometry();
          geometry.setAttribute('position', simplified.getAttribute('position').clone());
          const normal = simplified.getAttribute('normal');
          if (normal) geometry.setAttribute('normal', normal.clone());
          const index = simplified.getIndex();
          if (index) geometry.setIndex(index.clone());

          const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          const tintable = material as Material & { color?: Color };
          const color = tintable.color?.clone() ?? new Color('#FFFFFF');
          if (material.name.toLowerCase().includes('coat')) {
            color.lerp(new Color(PASSENGER_COLORS[paletteIndex]), 0.72);
          }
          const colors = new Float32Array(simplified.getAttribute('position').count * 3);
          for (let vertex = 0; vertex < colors.length; vertex += 3) {
            colors[vertex] = color.r;
            colors[vertex + 1] = color.g;
            colors[vertex + 2] = color.b;
          }
          geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
          geometry.applyMatrix4(mesh.matrixWorld);
          return geometry;
        }),
      );
      const merged = mergeGeometries(geometries, false);
      geometries.forEach((geometry) => geometry.dispose());
      if (!merged) throw new Error('Could not merge passenger geometry');
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      return merged;
    });
    this.passengerGeometries.set(paletteIndex, loading);
    return loading;
  }

  private async makePassenger(colorIndex: number): Promise<Object3D> {
    const geometry = await this.passengerGeometry(colorIndex);
    const passenger = new Group();
    passenger.add(new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02 })));
    passenger.name = `passenger-${this.passengerSerial++}`;
    passenger.userData.passenger = true;
    this.passengers.add(passenger);
    return passenger;
  }

  private waitingPosition(frame: StationFrame, index: number): Vector3 {
    return frame.station.position
      .clone()
      .addScaledVector(frame.side, PLATFORM_CLEARANCE + 2.5)
      .addScaledVector(frame.forward, -8 - index * PASSENGER_SPACING)
      .addScaledVector(frame.up, PLATFORM_HEIGHT);
  }

  private doorPosition(frame: StationFrame, index: number): Vector3 {
    return frame.station.position
      .clone()
      .addScaledVector(frame.side, 1.55)
      .addScaledVector(frame.forward, -6 - (index % 3) * 12.5)
      .addScaledVector(frame.up, PLATFORM_HEIGHT);
  }

  private orientPassenger(passenger: Object3D, frame: StationFrame): void {
    passenger.quaternion.copy(frame.station.quaternion);
    passenger.rotateY((frame.station.def.platformSide === 'left') !== !!frame.station.def.reverse ? -Math.PI / 2 : Math.PI / 2);
  }

  private removePassenger(passenger: Object3D): void {
    passenger.removeFromParent();
    this.passengers.delete(passenger);
    disposePassengerMaterials(passenger);
  }

  /** Everyone back where they wait at the start, but those in `boarded` (per station) who already got on. */
  private async resetWaitingPassengers(boarded: Record<string, number> = {}): Promise<void> {
    this.passengerMoves.length = 0;
    for (const passenger of this.passengers) this.removePassenger(passenger);
    this.passengers.clear();
    this.waitingPassengers.clear();

    await Promise.all(
      [...this.initialWaiting].map(async ([stationId, total]) => {
        const count = Math.max(0, total - (boarded[stationId] ?? 0));
        const station = this.stations.find((candidate) => candidate.def.id === stationId);
        if (!station) return;
        const frame = stationFrame(station);
        const waiting = await Promise.all(
          Array.from({ length: count }, async (_, index) => {
            const passenger = await this.makePassenger(index);
            passenger.position.copy(this.waitingPosition(frame, index));
            this.orientPassenger(passenger, frame);
            this.group.add(passenger);
            return passenger;
          }),
        );
        this.waitingPassengers.set(stationId, waiting);
      }),
    );
  }

  private bumpGeneration(id: string): number {
    const generation = (this.generations.get(id) ?? 0) + 1;
    this.generations.set(id, generation);
    return generation;
  }

  /** v1.10: where figure `id` is now (a cutscene's big bubble pops there), or null. */
  positionOf(id: string): Vector3 | null {
    const object = this.objects.get(id);
    if (!object) return null;
    // Round models have their origin at the bottom: the middle of one is up by half its height.
    const box = new Box3().setFromObject(object);
    return box.isEmpty() ? object.position.clone() : box.getCenter(new Vector3());
  }

  /** Puts `model` in as `id` (replacing what is there). Resolves to null when a later place or a remove won. */
  /**
   * v1.12 `parent`: what it stands in (a car it rides in; `position` and `quaternion` are then in the car's own space).
   * Left out, a figure swapping its model stays where the old one was (in its car, say).
   */
  private async place(id: string, model: string, position: Vector3, quaternion: Quaternion, parent?: Object3D, scale?: number): Promise<Object3D | null> {
    const generation = this.bumpGeneration(id);
    // Actors move and swap models only as a whole, so an untextured one can be drawn baked.
    const template = await this.models.load(model);
    if (this.generations.get(id) !== generation) return null;
    const instance = (bakeModel(template) ?? template).clone(true);
    instance.name = id;
    instance.position.copy(position);
    instance.quaternion.copy(quaternion);
    const old = this.objects.get(id);
    // v1.12: its size (a new model keeps the old one's).
    instance.scale.setScalar(scale ?? old?.scale.x ?? 1);
    const holder = parent ?? old?.parent ?? this.group;
    old?.removeFromParent();
    this.objects.set(id, instance);
    this.objectModels.set(id, model);
    holder.add(instance);
    // A motion on the old model ends with it (a wave goes on with the new one: see act()).
    const motion = this.motions.get(id);
    if (motion && motion.rig.parent !== instance) this.motions.delete(id);
    this.turns.delete(id);
    return instance;
  }

  /**
   * v1.12 (えんしゅつ): a figure's little motion (cutscene `act`; ActDef). `toward`: where a "turn" faces (world). The
   * partner's jump, tilt and cheer are its own emotes.
   */
  async act(id: string, kind: ActKind, times?: number, seconds?: number, toward?: Vector3 | null): Promise<void> {
    if (id === 'partner' && (kind === 'jump' || kind === 'tilt' || kind === 'cheer')) {
      this.startPartnerEmote(kind);
      return;
    }
    const pending = this.pendingSpawns.get(id);
    if (pending) await pending;
    let object = id === 'partner' ? this.partner : this.objects.get(id);
    if (!object) return;
    if (kind === 'turn') {
      if (!toward) return;
      const at = object.getWorldPosition(new Vector3());
      const yaw = Math.atan2(toward.x - at.x, toward.z - at.z);
      // In the figure's parent's space (a car it rides in turns with the car).
      const parentTurn = object.parent ? object.parent.getWorldQuaternion(new Quaternion()) : new Quaternion();
      const to = parentTurn.invert().multiply(new Quaternion().setFromAxisAngle(UP_AXIS, yaw));
      const time = seconds ?? ACT.turnSeconds;
      if (time <= 0) {
        object.quaternion.copy(to);
        this.turns.delete(id);
      } else {
        this.turns.set(id, { object, from: object.quaternion.clone(), to, t: 0, seconds: time });
      }
      return;
    }
    // Sakasa waves her hand ("amanojaku-wave", posed from her model) and sways while she does.
    const model = this.objectModels.get(id) ?? '';
    if (kind === 'wave' && model.startsWith('amanojaku') && model !== 'amanojaku-wave') {
      const placed = await this.place(id, 'amanojaku-wave', object.position.clone(), object.quaternion.clone());
      if (!placed) return;
      object = placed;
    }
    const old = this.motions.get(id);
    if (old) resetRig(old.rig);
    const rig = rigOf(object);
    const each = kind === 'wave' ? 1 / ACT.waveRate : actSeconds(kind, 1);
    const height = figureHeight(object);
    this.motions.set(id, { kind, rig, t: 0, each, times: kind === 'wave' ? 0 : actTimes(kind, times), height, scale: this.gentle ? ACT.gentle : 1 });
  }

  /** v1.12: the figure drawn for `id` ("partner": the partner in the cab), for the camera's shots. */
  shotFigure(id: string): Object3D | null {
    return id === 'partner' ? this.partner : (this.objects.get(id) ?? null);
  }

  private move(id: string, to: Vector3, seconds: number, delay = 0, bob = false, face = false): void {
    const object = this.objects.get(id);
    if (!object) return;
    const oldMove = this.moving.findIndex((move) => move.id === id);
    if (oldMove >= 0) this.moving.splice(oldMove, 1);
    // v1.12: it turns to the way it goes first (quickly, while it sets off).
    if (face && object.position.distanceToSquared(to) > 1e-4) void this.act(id, 'turn', undefined, 0.3, object.parent ? object.parent.localToWorld(to.clone()) : to);
    if (seconds <= 0 && delay <= 0) {
      object.position.copy(to);
      return;
    }
    this.moving.push({
      id,
      object,
      from: object.position.clone(),
      to: to.clone(),
      elapsed: 0,
      seconds: Math.max(seconds, 1e-3),
      delay,
      bob: bob || (this.objectModels.get(id) ?? '').startsWith('amanojaku') || this.hoppers.has(id),
      roll: this.rollers.has(id) || (this.objectModels.get(id) ?? '').startsWith('snowman') || this.objectModels.get(id) === 'snow-wave',
    });
  }

  private async animatePassengers(stationId: string, board: number, alight: number): Promise<void> {
    const station = this.stations.find((candidate) => candidate.def.id === stationId);
    if (!station) return;
    const frame = stationFrame(station);
    let delay = 0;

    for (let index = 0; index < alight; index += 1) {
      const passenger = await this.makePassenger(index + board);
      passenger.position.copy(this.doorPosition(frame, index));
      this.orientPassenger(passenger, frame);
      passenger.visible = delay === 0;
      this.group.add(passenger);
      const target = this.doorPosition(frame, index)
        .addScaledVector(frame.side, PLATFORM_CLEARANCE + 2.8)
        .addScaledVector(frame.forward, (index - (alight - 1) / 2) * 0.5);
      this.passengerMoves.push({ object: passenger, from: passenger.position.clone(), to: target, elapsed: 0, delay });
      delay += PASSENGER_SECONDS;
    }

    const waiting = this.waitingPassengers.get(stationId) ?? [];
    for (let index = 0; index < board; index += 1) {
      let passenger = waiting.shift();
      if (!passenger) {
        passenger = await this.makePassenger(index);
        passenger.position.copy(this.waitingPosition(frame, index));
        this.orientPassenger(passenger, frame);
        this.group.add(passenger);
      }
      setOpacity(passenger, 1);
      this.passengerMoves.push({
        object: passenger,
        from: passenger.position.clone(),
        to: this.doorPosition(frame, index),
        elapsed: 0,
        delay,
      });
      delay += PASSENGER_SECONDS;
    }
    this.waitingPassengers.set(stationId, waiting);
  }

  private startPartnerEmote(kind: Emote): void {
    if (!this.partner) return;
    this.partnerAnimation = { kind, elapsed: 0, seconds: kind === 'cheer' ? 1 : 0.75 };
  }

  private makeStationSparkles(): void {
    if (!this.train || this.stations.length === 0) return;
    const trainPosition = this.train.getWorldPosition(new Vector3());
    const station = this.stations.reduce((nearest, candidate) =>
      candidate.position.distanceToSquared(trainPosition) < nearest.position.distanceToSquared(trainPosition)
        ? candidate
        : nearest,
    );
    const frame = stationFrame(station);
    this.makeSparkles(
      station.position
        .clone()
        .addScaledVector(frame.side, PLATFORM_CLEARANCE + 1.8)
        .addScaledVector(frame.forward, -6)
        .addScaledVector(frame.up, 1.2),
    );
  }

  private makeSparkles(at: Vector3): void {
    this.clearSparkles();
    const positions: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      const angle = (index / 10) * Math.PI * 2;
      const radius = 0.8 + (index % 3) * 0.38;
      positions.push(Math.cos(angle) * radius, 0.25 + (index % 4) * 0.38, Math.sin(angle) * radius);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const material = new PointsMaterial({ color: '#FFD166', size: 0.34, sizeAttenuation: true, transparent: true });
    const points = new Points(geometry, material);
    points.name = 'sparkles';
    points.position.copy(at);
    this.group.add(points);
    this.sparkle = { points, elapsed: 0 };
  }

  private clearSparkles(): void {
    if (!this.sparkle) return;
    this.sparkle.points.removeFromParent();
    this.sparkle.points.geometry.dispose();
    this.sparkle.points.material.dispose();
    this.sparkle = null;
  }

  async onStageEvent(event: StageEvent): Promise<void> {
    switch (event.type) {
      case 'passengers':
        await this.animatePassengers(event.stationId, event.board, event.alight);
        break;
      case 'actor:spawn': {
        this.spawned.add(event.id);
        // v1.11 (5-3): seen only in a mirror, or never in one.
        if (event.mirror) this.mirrorModes.set(event.id, event.mirror);
        else this.mirrorModes.delete(event.id);
        // v1.12: riding in a car (its own space).
        const car = event.car !== undefined ? this.cars[event.car] : undefined;
        const placing = this.place(event.id, event.model, event.position, event.quaternion, car ?? this.group, event.scale ?? 1);
        this.pendingSpawns.set(event.id, placing);
        await placing;
        if (this.pendingSpawns.get(event.id) === placing) this.pendingSpawns.delete(event.id);
        const placed = this.objects.get(event.id);
        if (placed && this.mirrorModes.get(event.id) === 'only') placed.visible = false;
        // v1.11 (5-3): the mirror Sakasa waving sways from side to side ("amanojaku-wave").
        if (placed && event.model === 'amanojaku-wave') this.wavers.set(event.id, { object: placed, base: placed.quaternion.clone(), t: 0 });
        else this.wavers.delete(event.id);
        break;
      }
      case 'actor:move': {
        // Right after its spawn the figure may still be loading: it moves once it is there (unless removed).
        const pending = this.pendingSpawns.get(event.id);
        if (pending) await pending;
        this.move(event.id, event.position, event.seconds, 0, event.bob, event.face);
        break;
      }
      case 'actor:state': {
        const object = this.objects.get(event.id);
        const swap = this.lookModels.get(event.id) ?? STATE_MODELS[this.actorTypes.get(event.id) ?? ''];
        if (object && swap) {
          const want = event.state === 'awake' || event.state === 'flee' ? swap.awake : event.state === 'sleep' ? swap.sleep : null;
          if (want && this.objectModels.get(event.id) !== want) await this.place(event.id, want, object.position, object.quaternion);
        }
        const neck = this.necks.get(event.id);
        if (neck && (event.state === 'neck-down' || event.state === 'neck-up')) {
          const down = event.state === 'neck-down';
          if (down !== neck.down) {
            neck.down = down;
            neck.t = 0;
          }
        }
        if (event.position) this.move(event.id, event.position, event.seconds ?? 0, event.delay ?? 0);
        break;
      }
      case 'windup': {
        // v1.11 (5-2): a cutscene figure wound the right way round: its model without "-back", where it stands.
        if (event.kind !== 'cutscene') break;
        const object = this.objects.get(event.id);
        const model = this.objectModels.get(event.id);
        if (object && model?.endsWith('-back')) await this.place(event.id, model.slice(0, -5), object.position, object.quaternion);
        break;
      }
      case 'record:found': {
        const record = this.records.get(event.id);
        if (record) this.makeSparkles(record.position.clone().add(new Vector3(0, 0.5, 0)));
        break;
      }
      case 'hearts': {
        // v1.11 (5-3): hearts and stars round the figure (it may still be loading).
        const pending = this.pendingSpawns.get(event.id);
        if (pending) await pending;
        const object = this.objects.get(event.id);
        if (!object || this.hearts.has(event.id)) break;
        const mesh = heartsMesh();
        object.add(mesh);
        this.hearts.set(event.id, { mesh, t: 0 });
        break;
      }
      case 'actor:remove':
        this.motions.delete(event.id);
        this.turns.delete(event.id);
        this.mirrorModes.delete(event.id);
        this.hearts.delete(event.id);
        this.wavers.delete(event.id);
        this.bumpGeneration(event.id);
        this.pendingSpawns.delete(event.id);
        this.objects.get(event.id)?.removeFromParent();
        this.objects.delete(event.id);
        this.objectModels.delete(event.id);
        break;
      case 'goal': {
        this.goal?.removeFromParent();
        this.goal = null;
        if (event.stationId) {
          const station = this.stations.find((candidate) => candidate.def.id === event.stationId);
          if (station) {
            const frame = stationFrame(station);
            const flagModel = await this.models.load('goal-flag');
            // It bobs and spins as a whole: baked, it is one draw call.
            const flag = (bakeModel(flagModel) ?? flagModel).clone(true);
            flag.position
              .copy(station.position)
              .addScaledVector(frame.side, PLATFORM_CLEARANCE + 1.6)
              .addScaledVector(frame.forward, -4)
              .addScaledVector(frame.up, 4.5);
            flag.quaternion.copy(station.quaternion);
            this.goal = flag;
            this.goalBaseY = flag.position.y;
            this.goalBaseQuaternion.copy(flag.quaternion);
            this.group.add(flag);
          }
        }
        break;
      }
      case 'partner:emote':
        this.startPartnerEmote(event.kind);
        break;
      case 'stop':
        if (event.grade === 'perfect') this.makeStationSparkles();
        break;
      case 'rewind':
        this.clearSparkles();
        this.partnerAnimation = null;
        if (this.partner) {
          this.partner.position.copy(this.partnerBasePosition);
          this.partner.quaternion.copy(this.partnerBaseQuaternion);
        }
        await this.resetWaitingPassengers(event.boarded);
        break;
      default:
        break;
    }
  }

  /** v1.12: the little motions and turns (cutscene `act`), one frame. */
  private updateActs(dt: number): void {
    for (const [id, turning] of this.turns) {
      turning.t += dt;
      const k = Math.min(1, turning.t / turning.seconds);
      turning.object.quaternion.slerpQuaternions(turning.from, turning.to, k * k * (3 - 2 * k));
      if (k >= 1) this.turns.delete(id);
    }
    for (const [id, m] of this.motions) {
      m.t += dt;
      const rig = m.rig;
      const total = m.times > 0 ? m.each * m.times : Infinity;
      resetRig(rig);
      if (m.t >= total) {
        this.motions.delete(id);
        continue;
      }
      const p = (m.t % m.each) / m.each;
      const arc = Math.sin(Math.PI * p);
      const a = m.scale;
      switch (m.kind) {
        case 'hop':
        case 'jump': {
          const part = m.kind === 'hop' ? ACT.hopLift : ACT.jumpLift;
          const lift = Math.min(ACT.hopMax * (m.kind === 'jump' ? 1.4 : 1), Math.max(ACT.hopMin, part * m.height));
          rig.position.y = lift * arc * a;
          // Squashed a little on the ground, stretched in the air ("ぴょこん").
          const sy = 1 + (0.1 * arc - 0.06) * a;
          rig.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
          break;
        }
        case 'nod':
          rig.rotation.x = ACT.nodAngle * arc * a;
          break;
        case 'tilt':
          rig.rotation.z = ACT.tiltAngle * arc * a;
          break;
        case 'cheer':
          rig.position.y = Math.abs(Math.sin(p * Math.PI * 3)) * Math.min(0.35, 0.25 * m.height) * a;
          rig.rotation.z = Math.sin(p * Math.PI * 4) * 0.14 * a;
          break;
        case 'wiggle':
          rig.rotation.y = ACT.wiggleAngle * Math.sin(2 * Math.PI * p) * a;
          break;
        case 'wave':
          rig.rotation.z = Math.sin(2 * Math.PI * p) * ACT.waveAngle * (this.objectModels.get(id) === 'amanojaku-wave' ? 1 : 1.5) * a;
          break;
      }
    }
  }

  /** v1.11 (5-1): the figure drawn for `id` (an actor, or "record:<id>"), or null (the night layer hides a sleeper). */
  figure(id: string): Object3D | null {
    return this.objects.get(id) ?? null;
  }

  /**
   * v1.10 (4-1): the figures a cutscene brought on that are on screen now (for an ice mirror's reflection). v1.11 (5-3):
   * not the ones brought on "hide" (never in a mirror); the "only" ones are (see mirrorOnlyFigures).
   */
  cutsceneFigures(): Object3D[] {
    const out: Object3D[] = [];
    for (const id of this.spawned) {
      const o = this.objects.get(id);
      if (o && this.mirrorModes.get(id) !== 'hide') out.push(o);
    }
    return out;
  }

  /** v1.11 (5-3): the figures seen only in a mirror (hidden in the main pass; the scene shows them for the mirror's). */
  mirrorOnlyFigures(): Object3D[] {
    const out: Object3D[] = [];
    for (const [id, mode] of this.mirrorModes) {
      const o = this.objects.get(id);
      if (o && mode === 'only') out.push(o);
    }
    return out;
  }

  update(dt: number): void {
    for (const h of this.hearts.values()) {
      // They swell in, turn slowly and bob a little.
      h.t += dt;
      h.mesh.rotation.y = h.t * 0.5;
      h.mesh.position.y = Math.sin(h.t * 2.2) * 0.08;
      h.mesh.scale.setScalar(Math.min(1, h.t / 0.4));
    }
    this.updateActs(dt);
    for (const w of this.wavers.values()) {
      w.t += dt;
      w.object.quaternion.copy(w.base).multiply(WAVE_TILT.setFromAxisAngle(WAVE_AXIS, Math.sin(w.t * Math.PI * 2 * 1.5) * 0.1));
    }
    for (let index = this.moving.length - 1; index >= 0; index -= 1) {
      const move = this.moving[index];
      if (move.delay > 0) {
        move.delay -= dt;
        if (move.delay > 0) continue;
        move.from.copy(move.object.position);
      }
      move.elapsed = Math.min(move.elapsed + dt, move.seconds);
      const t = move.elapsed / move.seconds;
      move.object.position.lerpVectors(move.from, move.to, t);
      if (move.bob) move.object.position.y += Math.abs(Math.sin(t * Math.PI * 6)) * 0.24;
      if (move.roll) {
        // A little hop and a wobble each turn, upright again when it gets there ("ぽすん").
        move.object.position.y += Math.abs(Math.sin(t * Math.PI * 4)) * 0.35 * (1 - t);
        move.object.rotation.z = Math.sin(t * Math.PI * 8) * 0.35 * (1 - t);
      }
      if (t >= 1) this.moving.splice(index, 1);
    }

    for (let index = this.passengerMoves.length - 1; index >= 0; index -= 1) {
      const move = this.passengerMoves[index];
      move.elapsed += dt;
      if (move.elapsed < move.delay) continue;
      move.object.visible = true;
      const t = Math.min((move.elapsed - move.delay) / PASSENGER_SECONDS, 1);
      move.object.position.lerpVectors(move.from, move.to, t);
      move.object.position.y += Math.abs(Math.sin(t * Math.PI * 4)) * 0.1;
      setOpacity(move.object, t > 0.76 ? (1 - t) / 0.24 : 1);
      if (t >= 1) {
        this.removePassenger(move.object);
        this.passengerMoves.splice(index, 1);
      }
    }

    if (this.partner && this.partnerAnimation) {
      const animation = this.partnerAnimation;
      animation.elapsed = Math.min(animation.elapsed + dt, animation.seconds);
      const t = animation.elapsed / animation.seconds;
      this.partner.position.copy(this.partnerBasePosition);
      this.partner.quaternion.copy(this.partnerBaseQuaternion);
      if (animation.kind === 'jump') this.partner.position.y += Math.sin(t * Math.PI) * 0.48;
      if (animation.kind === 'tilt') this.partner.rotateZ(Math.sin(t * Math.PI) * 0.3);
      if (animation.kind === 'cheer') {
        this.partner.position.y += Math.abs(Math.sin(t * Math.PI * 3)) * 0.35;
        this.partner.rotateZ(Math.sin(t * Math.PI * 4) * 0.14);
      }
      if (t >= 1) this.partnerAnimation = null;
    }

    for (const neck of this.necks.values()) {
      if (neck.t >= 1) continue;
      neck.t = Math.min(1, neck.t + dt / 0.5);
      const e = neck.t * neck.t * (3 - 2 * neck.t);
      neck.neck.quaternion.slerpQuaternions(neck.down ? NECK_UP : NECK_DOWN, neck.down ? NECK_DOWN : NECK_UP, e);
    }

    if (this.goal) {
      this.goalSpin += dt * 1.5;
      this.goal.position.y = this.goalBaseY + Math.sin(this.goalSpin * 1.6) * 0.18;
      this.goal.quaternion.copy(this.goalBaseQuaternion);
      this.goal.rotateY(this.goalSpin);
    }

    if (this.sparkle) {
      this.sparkle.elapsed += dt;
      const t = Math.min(this.sparkle.elapsed, 1);
      this.sparkle.points.position.y += dt * 0.7;
      this.sparkle.points.rotation.y += dt * 1.8;
      this.sparkle.points.material.opacity = 1 - t;
      if (t >= 1) this.clearSparkles();
    }
  }
}

/** v1.12: the group a figure's motions move: its meshes, gathered under one child the first time. */
function rigOf(object: Object3D): Object3D {
  const had = object.userData.rig as Object3D | undefined;
  if (had && had.parent === object) return had;
  const rig = new Group();
  rig.name = 'rig';
  for (const child of [...object.children]) rig.add(child);
  object.add(rig);
  object.userData.rig = rig;
  return rig;
}

function resetRig(rig: Object3D): void {
  rig.position.set(0, 0, 0);
  rig.rotation.set(0, 0, 0);
  rig.scale.set(1, 1, 1);
}

/** v1.12: a figure's height (m) as drawn (its own scale), kept once worked out. */
function figureHeight(object: Object3D): number {
  const known = object.userData.height as number | undefined;
  if (known !== undefined) return known;
  const box = new Box3();
  const saved = object.quaternion.clone();
  object.quaternion.identity();
  object.updateMatrixWorld(true);
  box.setFromObject(object);
  object.quaternion.copy(saved);
  object.updateMatrixWorld(true);
  const h = box.isEmpty() ? 1 : box.max.y - box.min.y;
  object.userData.height = h;
  return h;
}
