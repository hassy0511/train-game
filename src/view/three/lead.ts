import { Group, MathUtils, Mesh, MeshLambertMaterial, Object3D, Quaternion, SphereGeometry, Vector3 } from 'three';
import type { LeadPose } from '../../mission/lead';
import type { RailNetwork } from '../../rail/types';
import { LEAD } from '../../train/params';
import { bakeModel } from './bake';
import type { ModelLibrary } from './models';

const Y = new Vector3(0, 1, 0);

/**
 * v1.11 (6-1, PHASE9_CHAPTER5_6 第 7 部 §4.1 見た目): Sakasa in "おいかけっこ", moved by code every frame from the lead's
 * pose: running she leans 10° forward and bobs with her steps (every LEAD.hopSeconds; twice as fast in a dash, with
 * little dust puffs), turning round takes LEAD.turnSeconds, standing she looks at the train and hops, waving. Once the
 * lead is over (pose null) she is gone from here (her home figure is a cutscene figure, ActorLayer).
 */
export class LeadFigure {
  readonly group = new Group();
  private figure: Object3D | null = null;
  private model = '';
  private loading: string | null = null;
  private t = 0;
  private yaw = 0;
  private yawSet = false;
  private pose: LeadPose | null = null;
  private readonly puffs: { o: Object3D; t: number }[] = [];
  private puffIn = 0;
  private puffTemplate: Mesh | null = null;

  constructor(
    private readonly models: ModelLibrary,
    private readonly network: RailNetwork,
    private readonly groundY: number | null,
  ) {
    this.group.name = 'lead';
  }

  set(pose: LeadPose | null): void {
    this.pose = pose;
  }

  private ensure(model: string): void {
    if (this.model === model || this.loading === model) return;
    this.loading = model;
    void this.models.load(model).then((template) => {
      if (this.loading !== model) return;
      this.loading = null;
      const instance = (bakeModel(template) ?? template).clone(true);
      instance.name = 'lead-figure';
      this.figure?.removeFromParent();
      this.figure = instance;
      this.model = model;
      this.group.add(instance);
    });
  }

  update(dt: number): void {
    const pose = this.pose;
    if (!pose) {
      if (this.figure) this.figure.visible = false;
      this.yawSet = false;
      for (const p of this.puffs) p.o.removeFromParent();
      this.puffs.length = 0;
      return;
    }
    this.ensure(pose.model);
    const figure = this.figure;
    if (!figure) return;
    figure.visible = true;
    this.t += dt;
    const rail = this.network.getRail(pose.railId);
    const frame = rail.frameAt(Math.max(0, Math.min(rail.length, pose.s)));
    const at = frame.position.clone().addScaledVector(frame.right, pose.lateral);
    if (this.groundY !== null) at.y = Math.max(this.groundY, at.y - 0.4);
    // Facing: along the way (running on), or back towards the train (standing, following, waiting).
    const dir = pose.facing === 'ahead' ? frame.tangent.clone() : frame.tangent.clone().negate();
    const want = Math.atan2(dir.x, dir.z);
    if (!this.yawSet) {
      this.yaw = want;
      this.yawSet = true;
    } else {
      const d = MathUtils.euclideanModulo(want - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
      const rate = Math.PI / LEAD.turnSeconds;
      this.yaw += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    }
    const moving = Math.abs(pose.speed) > 0.3;
    const period = LEAD.hopSeconds / (pose.dashing ? 2 : 1);
    let lift = 0;
    let lean = 0;
    if (moving) {
      lift = Math.abs(Math.sin((this.t / period) * Math.PI)) * (pose.dashing ? 0.22 : 0.14);
      lean = MathUtils.degToRad(pose.facing === 'ahead' ? 10 : 6);
    } else if (pose.waving) {
      // Hopping on the spot, looking at the train ("ぴょんぴょん").
      lift = Math.max(0, Math.sin(this.t * Math.PI * 2 * 1.4)) * 0.18;
    }
    figure.position.copy(at).addScaledVector(Y, lift);
    figure.quaternion.setFromAxisAngle(Y, this.yaw).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), lean));
    this.updatePuffs(dt, pose, at);
  }

  /** Little dust puffs at her feet in a dash ("しゅたたた〜"). */
  private updatePuffs(dt: number, pose: LeadPose, at: Vector3): void {
    if (pose.dashing) {
      this.puffIn -= dt;
      if (this.puffIn <= 0) {
        this.puffIn = 0.12;
        this.addPuff(at.clone());
      }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.t += dt;
      const k = p.t / 0.6;
      p.o.scale.setScalar(0.25 + k * 0.5);
      p.o.position.y += dt * 0.4;
      if (k >= 1) {
        p.o.removeFromParent();
        this.puffs.splice(i, 1);
      }
    }
  }

  private addPuff(at: Vector3): void {
    if (this.puffs.length > 10) return;
    // A soft white ball of dust (drawn in code; a few at a time, gone in 0.6 s).
    this.puffTemplate ??= new Mesh(new SphereGeometry(0.5, 8, 6), new MeshLambertMaterial({ color: '#fff6ea', transparent: true, opacity: 0.8 }));
    const o = this.puffTemplate.clone();
    o.position.copy(at);
    this.group.add(o);
    this.puffs.push({ o, t: 0 });
  }
}

/**
 * v1.11 (6-1, 第 3 部 B6.4・A10): friends riding along ("crew"): Sakasa sits behind the driver's seat in the lead car
 * ("amanojaku-sit", seen through the windows; 6-1's ending and 6-2). PR8a moves her to the rear window while reversing.
 */
export async function addCrewSeat(models: ModelLibrary, car: Object3D): Promise<Object3D> {
  const template = await models.load('amanojaku-sit');
  const sit = (bakeModel(template) ?? template).clone(true);
  sit.name = 'crew-sakasa';
  // Behind the partner's place (the cab at +Z), on the other side of the aisle, facing forward.
  sit.position.set(0.8, 1.15, 2.6);
  car.add(sit);
  return sit;
}
