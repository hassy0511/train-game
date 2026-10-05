import { Group, Quaternion, Vector3, type Object3D } from 'three';
import type { StageData } from '../../stage/types';
import { CASTLE } from '../../train/params';
import type { ModelLibrary } from './models';

/**
 * v1.11 (6-1 さかさまのしろ, PHASE9_CHAPTER5_6 第 7 部 §8 and §4.6 j): what moves in the upside-down town and is drawn
 * by code: the clock tower's hands turning backwards (one round a minute). The tower's dial faces −X in its own frame
 * (towards the line), CASTLE.dial m up; the hands ("clock-hands", origin at their pivot) sit on it.
 */
export class CastleGimmicks {
  readonly group = new Group();
  private readonly hands: Object3D[] = [];
  private angle = 0;

  constructor(private readonly stage: StageData) {
    this.group.name = 'castle';
  }

  static wanted(stage: StageData): boolean {
    return stage.props.some((p) => p.model === 'clock-tower');
  }

  async init(models: ModelLibrary): Promise<void> {
    const template = await models.load('clock-hands');
    for (const p of this.stage.props.filter((x) => x.model === 'clock-tower')) {
      const hands = template.clone(true);
      const pivot = new Group();
      pivot.position.copy(new Vector3(CASTLE.dial[0], CASTLE.dial[1], CASTLE.dial[2]).multiplyScalar(p.scale).applyQuaternion(p.quaternion).add(p.position));
      pivot.quaternion.copy(p.quaternion);
      pivot.add(hands);
      this.group.add(pivot);
      this.hands.push(hands);
    }
  }

  update(dt: number): void {
    // Backwards: anticlockwise as seen from the line. The dial faces −X; a turn about +X looks clockwise from −X, so the
    // angle goes down.
    this.angle = (this.angle - (dt * Math.PI * 2) / CASTLE.clockSeconds) % (Math.PI * 2);
    const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), this.angle);
    for (const h of this.hands) h.quaternion.copy(q);
  }
}
