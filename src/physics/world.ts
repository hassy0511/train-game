import type { Quaternion, Vector3 } from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { TRAIN } from '../train/params';

type Rapier = typeof RAPIER_NS;

export interface SensorEvent {
  id: string;
  entered: boolean;
}

const FIXED_STEP = 1 / 60;
const MAX_SUBSTEPS = 8;

/**
 * Rapier world. The train is a kinematic body driven by the rail; everything the train can
 * "touch" is a sensor collider, and hits come back as SensorEvents.
 */
export class PhysicsWorld {
  private readonly world: RAPIER_NS.World;
  private readonly eventQueue: RAPIER_NS.EventQueue;
  private readonly sensorIds = new Map<number, string>();
  private trainBody: RAPIER_NS.RigidBody | null = null;
  private trainCollider: RAPIER_NS.Collider | null = null;
  private accumulator = 0;

  private constructor(private readonly R: Rapier) {
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_STEP;
    this.eventQueue = new R.EventQueue(true);
  }

  static async create(): Promise<PhysicsWorld> {
    // Separate chunk: the inlined wasm is large and only needed once the stage is loading.
    const R = (await import('@dimforge/rapier3d-compat')).default;
    await R.init();
    return new PhysicsWorld(R);
  }

  addTrain(position: Vector3, quaternion: Quaternion): void {
    const R = this.R;
    const bodyDesc = R.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(position.x, position.y, position.z)
      .setRotation(quaternion);
    this.trainBody = this.world.createRigidBody(bodyDesc);
    const colliderDesc = R.ColliderDesc.cuboid(TRAIN.width / 2, TRAIN.height / 2, TRAIN.length / 2)
      .setTranslation(0, TRAIN.height / 2, 0)
      .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS)
      .setActiveCollisionTypes(R.ActiveCollisionTypes.DEFAULT | R.ActiveCollisionTypes.KINEMATIC_FIXED);
    this.trainCollider = this.world.createCollider(colliderDesc, this.trainBody);
  }

  /** Adds a box sensor whose bottom center is at `position`. */
  addSensor(id: string, position: Vector3, quaternion: Quaternion, size: Vector3): void {
    const R = this.R;
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z).setRotation(quaternion),
    );
    const desc = R.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
      .setTranslation(0, size.y / 2, 0)
      .setSensor(true)
      .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS)
      .setActiveCollisionTypes(R.ActiveCollisionTypes.DEFAULT | R.ActiveCollisionTypes.KINEMATIC_FIXED);
    const collider = this.world.createCollider(desc, body);
    this.sensorIds.set(collider.handle, id);
  }

  setTrainPose(position: Vector3, quaternion: Quaternion): void {
    if (!this.trainBody) return;
    this.trainBody.setNextKinematicTranslation({ x: position.x, y: position.y, z: position.z });
    this.trainBody.setNextKinematicRotation(quaternion);
  }

  /** Advances the world in fixed steps and returns the sensor events that fired. */
  step(dt: number): SensorEvent[] {
    const events: SensorEvent[] = [];
    this.accumulator = Math.min(this.accumulator + dt, FIXED_STEP * MAX_SUBSTEPS);
    while (this.accumulator >= FIXED_STEP) {
      this.world.step(this.eventQueue);
      this.accumulator -= FIXED_STEP;
      this.eventQueue.drainCollisionEvents((h1, h2, started) => {
        const train = this.trainCollider?.handle;
        const other = h1 === train ? h2 : h2 === train ? h1 : null;
        if (other === null) return;
        const id = this.sensorIds.get(other);
        if (id !== undefined) events.push({ id, entered: started });
      });
    }
    return events;
  }
}
