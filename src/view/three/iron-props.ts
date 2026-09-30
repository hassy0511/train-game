import { BufferGeometry, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import type { StageEvent } from '../../core/stage-events';
import type { IronLook, IronProp, StageData } from '../../stage/types';
import { IRON_PROPS, TRAIN } from '../../train/params';
import { ironBucketGeometry, ironCanGeometry, SIGN_BELL_AT, signBellGeometry, signPostGeometry } from './magnet-placeholders';
import { kitMaterial } from './placeholder-kit';

/**
 * v1.11 (PR5, PHASE9_0 §3, PHASE9_CHAPTER5_6 第 2 部 M3.4・M12): the iron odds and ends by the line: tin cans, tin
 * buckets and signs with a bell, each kind drawn in one call (InstancedMesh), and the one being tugged: a can or a
 * bucket flies to the lower corner of the train's front on its own side ("びよん"; away from the lamp and the windows,
 * never two), drops off and rolls to a stop by the line ("からん"); a bell stretches out towards the train and springs
 * back. Hidden until the magnet light is learned (the stages before 5-3 look as they always did).
 */

/** Where a can sticks on the lead car (car frame, +Z forward; x by the side it came from). */
const STICK = new Vector3(1.05, 0.45, TRAIN.length / 2 + 0.15);
/** How far a bell stretches towards the train (m). */
const BELL_REACH = 1.8;

interface Placed {
  prop: IronProp;
  mesh: InstancedMesh;
  slot: number;
  position: Vector3;
  quaternion: Quaternion;
  /** The bell's instance (a sign's), and where it hangs. */
  bellSlot?: number;
  bellAt?: Vector3;
}

export class IronPropsView {
  readonly group = new Group();
  private readonly placed: Placed[] = [];
  private readonly meshes = new Map<string, InstancedMesh>();
  private flying: { placed: Placed; phase: 'fly' | 'stuck' | 'fall' | 'bell' | 'spring'; t: number; from: Vector3; to: Vector3; side: number } | null = null;
  private flyer: Mesh | null = null;
  private readonly matrix = new Matrix4();
  private readonly tmp = new Vector3();
  private readonly one = new Vector3(1, 1, 1);
  private readonly zero = new Vector3(0, 0, 0);
  private readonly spin = new Quaternion();

  constructor(
    private readonly stage: StageData,
    private readonly train: Object3D,
  ) {
    this.group.name = 'iron-props';
    this.group.visible = false;
    this.build();
  }

  static wanted(stage: StageData): boolean {
    return stage.ironProps.length > 0;
  }

  private build(): void {
    const props = this.stage.ironProps;
    const groundY = this.stage.file.environment.ground?.y ?? null;
    const counts: Record<string, number> = { can: 0, bucket: 0, post: 0, bell: 0 };
    const drawsPost = (p: IronProp): boolean => p.look === 'bell' && (p.prop === undefined || this.stage.file.props[p.prop]?.model === 'sign-bell');
    for (const p of props) {
      if (p.look === 'bell') counts.bell++;
      else counts[p.look]++;
      if (drawsPost(p)) counts.post++;
    }
    const geos: Record<string, () => BufferGeometry> = { can: ironCanGeometry, bucket: ironBucketGeometry, post: signPostGeometry, bell: signBellGeometry };
    for (const [kind, n] of Object.entries(counts)) {
      if (n === 0) continue;
      const mesh = new InstancedMesh(geos[kind](), kitMaterial(), n);
      mesh.name = `iron-${kind}`;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      this.meshes.set(kind, mesh);
      this.group.add(mesh);
    }
    for (const p of props) {
      const rail = this.stage.network.getRail(p.railId);
      const frame = rail.frameAt(p.at);
      const position = frame.position.clone().addScaledVector(frame.right, p.lateral);
      if (groundY !== null) position.y = Math.max(groundY, position.y - 0.3);
      // It faces the rail (a sign's arm reaches over towards it).
      const toward = frame.right.clone().multiplyScalar(-Math.sign(p.lateral || 1));
      toward.y = 0;
      toward.normalize();
      const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), toward);
      if (p.look !== 'bell') {
        const mesh = this.meshes.get(p.look) as InstancedMesh;
        const slot = mesh.count++;
        // A little turn of its own, so the cans do not all stand alike.
        const own = quaternion.clone().multiply(this.spin.setFromAxisAngle(new Vector3(0, 1, 0), (p.index * 1.7) % (Math.PI * 2)));
        this.matrix.compose(position, own, this.one);
        mesh.setMatrixAt(slot, this.matrix);
        this.placed.push({ prop: p, mesh, slot, position, quaternion: own });
        continue;
      }
      const bells = this.meshes.get('bell') as InstancedMesh;
      const bellSlot = bells.count++;
      const bellAt = SIGN_BELL_AT.clone().applyQuaternion(quaternion).add(position);
      this.matrix.compose(bellAt, quaternion, this.one);
      bells.setMatrixAt(bellSlot, this.matrix);
      let mesh = bells;
      let slot = bellSlot;
      if (drawsPost(p)) {
        mesh = this.meshes.get('post') as InstancedMesh;
        slot = mesh.count++;
        this.matrix.compose(position, quaternion, this.one);
        mesh.setMatrixAt(slot, this.matrix);
      }
      this.placed.push({ prop: p, mesh, slot, position, quaternion, bellSlot, bellAt });
    }
    for (const mesh of this.meshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }

  onEvent(e: StageEvent): void {
    if (e.type === 'ability' && e.id === 'magnetLight') this.group.visible = true;
    if (e.type === 'iron:biyon') this.biyon(e.index);
    if (e.type === 'iron:karan') this.karan(e.index);
    if (e.type === 'rewind') this.resetAll();
  }

  private byIndex(index: number): Placed | undefined {
    return this.placed.find((p) => p.prop.index === index);
  }

  private biyon(index: number): void {
    const placed = this.byIndex(index);
    if (!placed) return;
    this.finishFlying();
    const side = placed.prop.lateral >= 0 ? 1 : -1;
    if (placed.prop.look === 'bell') {
      this.flying = { placed, phase: 'bell', t: 0, from: (placed.bellAt as Vector3).clone(), to: new Vector3(), side };
      return;
    }
    // The can leaves its place: the flyer carries it.
    this.setInstance(placed.mesh, placed.slot, placed.position, placed.quaternion, this.zero);
    const flyer = this.flyerFor(placed.prop.look);
    flyer.position.copy(placed.position);
    flyer.quaternion.copy(placed.quaternion);
    flyer.visible = true;
    this.flying = { placed, phase: 'fly', t: 0, from: placed.position.clone(), to: new Vector3(), side };
  }

  private karan(index: number): void {
    const f = this.flying;
    if (!f || f.placed.prop.index !== index) return;
    if (f.phase === 'bell') {
      f.phase = 'spring';
      f.t = 0;
      return;
    }
    // Off the train: it drops to the ground and rolls a little way out from the line.
    const flyer = this.flyer as Mesh;
    this.train.updateMatrixWorld();
    flyer.getWorldPosition(this.tmp);
    this.train.remove(flyer);
    this.group.add(flyer);
    flyer.position.copy(this.tmp);
    const out = new Vector3(f.side * 2.6, 0, -1.5).applyQuaternion(this.train.quaternion);
    const ground = this.stage.file.environment.ground?.y ?? this.tmp.y - 1;
    f.from = this.tmp.clone();
    f.to = this.tmp.clone().add(out);
    f.to.y = ground;
    f.phase = 'fall';
    f.t = 0;
  }

  private flyerFor(look: IronLook): Mesh {
    const geometry = look === 'bucket' ? ironBucketGeometry() : ironCanGeometry();
    if (!this.flyer) {
      this.flyer = new Mesh(geometry, kitMaterial());
      this.flyer.name = 'iron-flying';
    } else {
      this.flyer.geometry.dispose();
      this.flyer.geometry = geometry;
    }
    this.flyer.removeFromParent();
    this.group.add(this.flyer);
    this.flyer.scale.setScalar(1);
    return this.flyer;
  }

  private setInstance(mesh: InstancedMesh, slot: number, position: Vector3, quaternion: Quaternion, scale: Vector3): void {
    this.matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(slot, this.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** A flight cut short (another starts, a rewind): the can is where it would end up. */
  private finishFlying(): void {
    const f = this.flying;
    if (!f) return;
    this.flying = null;
    const p = f.placed;
    if (p.bellSlot !== undefined && p.bellAt) {
      this.setInstance(this.meshes.get('bell') as InstancedMesh, p.bellSlot, p.bellAt, p.quaternion, this.one);
      return;
    }
    if (f.phase === 'fall') this.setInstance(p.mesh, p.slot, f.to, p.quaternion, this.one);
    else this.setInstance(p.mesh, p.slot, p.position, p.quaternion, this.one);
    if (this.flyer) this.flyer.visible = false;
  }

  /** A rewind: every odd and end back in its place. */
  private resetAll(): void {
    this.flying = null;
    if (this.flyer) {
      this.flyer.removeFromParent();
      this.flyer.visible = false;
    }
    for (const p of this.placed) {
      if (p.bellSlot !== undefined && p.bellAt) this.setInstance(this.meshes.get('bell') as InstancedMesh, p.bellSlot, p.bellAt, p.quaternion, this.one);
      if (p.mesh.name !== 'iron-bell') this.setInstance(p.mesh, p.slot, p.position, p.quaternion, this.one);
    }
  }

  update(dt: number): void {
    const f = this.flying;
    if (!f) return;
    f.t += dt;
    const P = IRON_PROPS;
    if (f.phase === 'bell') {
      // The bell stretches out on its string towards the train, jiggling ("びよん… ちりん").
      const p = f.placed;
      const u = Math.min(1, f.t / P.flySeconds);
      this.train.updateMatrixWorld();
      const lamp = this.tmp.set(0, 1.5, TRAIN.length / 2).applyMatrix4(this.train.matrixWorld);
      const dir = lamp.sub(p.bellAt as Vector3);
      const reach = Math.min(BELL_REACH, dir.length());
      dir.normalize().multiplyScalar(reach * u * u * (3 - 2 * u));
      const at = (p.bellAt as Vector3).clone().add(dir);
      at.y += Math.sin(f.t * 25) * 0.05;
      f.to.copy(at);
      this.setInstance(this.meshes.get('bell') as InstancedMesh, p.bellSlot as number, at, p.quaternion, this.one);
      return;
    }
    if (f.phase === 'spring') {
      const p = f.placed;
      const u = Math.min(1, f.t / 0.3);
      const at = f.to.clone().lerp(p.bellAt as Vector3, u);
      at.y += Math.sin(f.t * 30) * 0.08 * (1 - u);
      this.setInstance(this.meshes.get('bell') as InstancedMesh, p.bellSlot as number, at, p.quaternion, this.one);
      if (u >= 1) this.flying = null;
      return;
    }
    const flyer = this.flyer;
    if (!flyer) return;
    if (f.phase === 'fly') {
      const u = Math.min(1, f.t / P.flySeconds);
      this.train.updateMatrixWorld();
      const stick = this.tmp.set(STICK.x * f.side, STICK.y, STICK.z).applyMatrix4(this.train.matrixWorld);
      flyer.position.lerpVectors(f.from, stick, u);
      flyer.position.y += Math.sin(Math.PI * u) * 1.2;
      if (u >= 1) {
        // Stuck under the front corner: it rides along.
        f.phase = 'stuck';
        f.t = 0;
        this.group.remove(flyer);
        this.train.add(flyer);
        flyer.position.set(STICK.x * f.side, STICK.y, STICK.z);
        flyer.quaternion.identity();
      }
      return;
    }
    if (f.phase === 'fall') {
      const u = Math.min(1, f.t / P.rollSeconds);
      const drop = Math.min(1, u * 3);
      flyer.position.lerpVectors(f.from, f.to, u);
      flyer.position.y = f.from.y + (f.to.y - f.from.y) * drop * drop;
      flyer.rotateZ(dt * 8 * (1 - u));
      if (u >= 1) {
        // It lies where it rolled to for the rest of the try.
        this.setInstance(f.placed.mesh, f.placed.slot, f.to, flyer.quaternion, this.one);
        flyer.visible = false;
        this.flying = null;
      }
    }
  }
}
