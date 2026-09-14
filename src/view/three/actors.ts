import { Box3, Group, Object3D, Quaternion, Vector3 } from 'three';
import type { StageEvent } from '../../core/stage-events';
import type { ResolvedActor, ResolvedStation } from '../../stage/types';
import type { ModelLibrary } from './models';

/**
 * Minimal actor, station and goal visuals so stage 1-1 is playable before ticket 0004.
 * 0004 replaces this with the real animations (cat poses, passengers, doors, rail-cut effect).
 */
const ACTOR_MODELS: Record<string, string> = { cat: 'cat-sleep', amanojaku: 'amanojaku', passenger: 'passenger' };
const PLATFORM_CLEARANCE = 1.7;
/** The stop line sits this far before the platform's far end (m). */
const PLATFORM_OVERHANG = 3;

interface Moving {
  object: Object3D;
  from: Vector3;
  to: Vector3;
  t: number;
  seconds: number;
}

export class ActorLayer {
  readonly group = new Group();
  private readonly objects = new Map<string, Object3D>();
  private readonly moving: Moving[] = [];
  private goal: Object3D | null = null;
  private goalSpin = 0;

  constructor(
    private readonly models: ModelLibrary,
    private readonly stations: ResolvedStation[],
  ) {
    this.group.name = 'actors';
  }

  async init(actors: ResolvedActor[]): Promise<void> {
    await Promise.all(
      actors
        .filter((a) => a.type !== 'trigger')
        .map((a) => this.place(a.id, ACTOR_MODELS[a.type] ?? a.type, a.position, a.quaternion)),
    );
    await Promise.all(
      this.stations.map(async (st) => {
        // Station frame: local +X is the train's left side, +Z is the travel direction.
        // `st.position` is the stop line (where the train front stops).
        const sideDir = new Vector3(st.def.platformSide === 'right' ? -1 : 1, 0, 0).applyQuaternion(st.quaternion);
        const forward = new Vector3(0, 0, 1).applyQuaternion(st.quaternion);

        const platform = (await this.models.load('platform')).clone(true);
        // The platform model's origin is the center of its rail-side edge; the placeholder box is centered, so push it 2 m further.
        const clearance = PLATFORM_CLEARANCE + (this.models.has('platform') ? 0 : 2);
        // Use the model's real length so a 30 m or 45 m platform both end 3 m past the stop line.
        const bounds = new Box3().setFromObject(platform);
        const length = bounds.max.z - bounds.min.z;
        platform.position
          .copy(st.position)
          .addScaledVector(sideDir, clearance)
          .addScaledVector(forward, PLATFORM_OVERHANG - length / 2);
        platform.quaternion.copy(st.quaternion);
        this.group.add(platform);

        // White stop line across the track and a striped "とまれ" board on the platform side.
        const line = (await this.models.load('stop-line')).clone(true);
        line.position.copy(st.position);
        line.quaternion.copy(st.quaternion);
        this.group.add(line);
        const board = (await this.models.load('stop-board')).clone(true);
        board.position.copy(st.position).addScaledVector(sideDir, PLATFORM_CLEARANCE + 0.6);
        board.quaternion.copy(st.quaternion);
        this.group.add(board);
      }),
    );
  }

  private async place(id: string, model: string, position: Vector3, quaternion: Quaternion): Promise<Object3D> {
    const template = await this.models.load(model);
    const instance = template.clone(true);
    instance.name = id;
    instance.position.copy(position);
    instance.quaternion.copy(quaternion);
    this.objects.get(id)?.removeFromParent();
    this.objects.set(id, instance);
    this.group.add(instance);
    return instance;
  }

  private move(id: string, to: Vector3, seconds: number): void {
    const object = this.objects.get(id);
    if (!object) return;
    if (seconds <= 0) {
      object.position.copy(to);
      return;
    }
    this.moving.push({ object, from: object.position.clone(), to: to.clone(), t: 0, seconds });
  }

  async onStageEvent(event: StageEvent): Promise<void> {
    switch (event.type) {
      case 'actor:spawn':
        await this.place(event.id, event.model, event.position, event.quaternion);
        break;
      case 'actor:move':
        this.move(event.id, event.position, event.seconds);
        break;
      case 'actor:state': {
        const object = this.objects.get(event.id);
        if (object && (event.state === 'awake' || event.state === 'flee') && this.models.has('cat-stand')) {
          await this.place(event.id, 'cat-stand', object.position, object.quaternion);
        } else if (object && event.state === 'sleep' && this.models.has('cat-sleep')) {
          await this.place(event.id, 'cat-sleep', event.position ?? object.position, object.quaternion);
        }
        if (event.position) this.move(event.id, event.position, event.seconds ?? 0);
        break;
      }
      case 'actor:remove':
        this.objects.get(event.id)?.removeFromParent();
        this.objects.delete(event.id);
        break;
      case 'goal': {
        this.goal?.removeFromParent();
        this.goal = null;
        if (event.stationId) {
          const st = this.stations.find((s) => s.def.id === event.stationId);
          if (st) {
            const flag = (await this.models.load('goal-flag')).clone(true);
            flag.position.copy(st.position).y += 8;
            this.goal = flag;
            this.group.add(flag);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  update(dt: number): void {
    for (let i = this.moving.length - 1; i >= 0; i--) {
      const m = this.moving[i];
      m.t = Math.min(m.t + dt / m.seconds, 1);
      m.object.position.lerpVectors(m.from, m.to, m.t);
      if (m.t >= 1) this.moving.splice(i, 1);
    }
    if (this.goal) {
      this.goalSpin += dt * 2;
      this.goal.rotation.y = this.goalSpin;
    }
  }
}
