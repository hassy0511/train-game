import {
  Box3,
  BufferGeometry,
  Color,
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
import type { Emote, MissionDef, ResolvedActor, ResolvedRecord, ResolvedStation } from '../../stage/types';
import { NECK_DOWN, NECK_UP } from './abilities';
import { bakeModel, bakeTogether } from './bake';
import type { ModelLibrary } from './models';
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
  bob: boolean;
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
  const sideSign = station.def.platformSide === 'right' ? -1 : 1;
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

  setPartner(partner: Object3D): void {
    this.partner = partner;
    this.partnerBasePosition.copy(partner.position);
    this.partnerBaseQuaternion.copy(partner.quaternion);
  }

  async init(actors: ResolvedActor[], records: ResolvedRecord[] = []): Promise<void> {
    for (const actor of actors) {
      this.actorTypes.set(actor.id, actor.type);
      if (isSeabird(actor)) this.lookModels.set(actor.id, SEABIRD_MODELS);
    }
    // Nuts and squirrels are drawn by the forest gimmicks, grasshoppers by the meadow ones and rocks by the volcano
    // ones (they move on their own).
    const drawnElsewhere = new Set(['trigger', 'nut', 'squirrel', 'grasshopper', 'rock-roll', 'rock-drop']);
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
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), station.def.platformSide === 'left' ? -Math.PI / 2 : Math.PI / 2));
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
      .filter((actor) => actor.type === 'cat' && !isSeabird(actor))
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
    passenger.rotateY(frame.station.def.platformSide === 'left' ? -Math.PI / 2 : Math.PI / 2);
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

  /** Puts `model` in as `id` (replacing what is there). Resolves to null when a later place or a remove won. */
  private async place(id: string, model: string, position: Vector3, quaternion: Quaternion): Promise<Object3D | null> {
    const generation = this.bumpGeneration(id);
    // Actors move and swap models only as a whole, so an untextured one can be drawn baked.
    const template = await this.models.load(model);
    if (this.generations.get(id) !== generation) return null;
    const instance = (bakeModel(template) ?? template).clone(true);
    instance.name = id;
    instance.position.copy(position);
    instance.quaternion.copy(quaternion);
    this.objects.get(id)?.removeFromParent();
    this.objects.set(id, instance);
    this.objectModels.set(id, model);
    this.group.add(instance);
    return instance;
  }

  private move(id: string, to: Vector3, seconds: number): void {
    const object = this.objects.get(id);
    if (!object) return;
    const oldMove = this.moving.findIndex((move) => move.id === id);
    if (oldMove >= 0) this.moving.splice(oldMove, 1);
    if (seconds <= 0) {
      object.position.copy(to);
      return;
    }
    this.moving.push({
      id,
      object,
      from: object.position.clone(),
      to: to.clone(),
      elapsed: 0,
      seconds,
      bob: this.objectModels.get(id) === 'amanojaku',
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
        const placing = this.place(event.id, event.model, event.position, event.quaternion);
        this.pendingSpawns.set(event.id, placing);
        await placing;
        if (this.pendingSpawns.get(event.id) === placing) this.pendingSpawns.delete(event.id);
        break;
      }
      case 'actor:move': {
        // Right after its spawn the figure may still be loading: it moves once it is there (unless removed).
        const pending = this.pendingSpawns.get(event.id);
        if (pending) await pending;
        this.move(event.id, event.position, event.seconds);
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
        if (event.position) this.move(event.id, event.position, event.seconds ?? 0);
        break;
      }
      case 'record:found': {
        const record = this.records.get(event.id);
        if (record) this.makeSparkles(record.position.clone().add(new Vector3(0, 0.5, 0)));
        break;
      }
      case 'actor:remove':
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

  update(dt: number): void {
    for (let index = this.moving.length - 1; index >= 0; index -= 1) {
      const move = this.moving[index];
      move.elapsed = Math.min(move.elapsed + dt, move.seconds);
      const t = move.elapsed / move.seconds;
      move.object.position.lerpVectors(move.from, move.to, t);
      if (move.bob) move.object.position.y += Math.abs(Math.sin(t * Math.PI * 6)) * 0.24;
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
