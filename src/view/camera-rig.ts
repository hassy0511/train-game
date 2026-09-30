import { Quaternion, Vector3 } from 'three';
import { REVERSE, TRAIN } from '../train/params';
import type { TrainPose } from '../train/types';

/**
 * v1.11 (PR8a, PHASE9_CHAPTER5_6 第 3 部 A10): `rear` ("うしろの まど", the view out of the last car's back window) and
 * `chase-rev` (the view from ahead of the lead car, over the train the way it goes) are what `cab` and `chase` turn into
 * while reversing. They are not on the camera picker (CAMERA_MODES keeps its four).
 */
export type CameraMode = 'cab' | 'chase' | 'side' | 'top' | 'rear' | 'chase-rev';
export const CAMERA_MODES: CameraMode[] = ['cab', 'chase', 'side', 'top'];
/** Labels for the camera picker tiles. */
export const CAMERA_LABELS: Record<CameraMode, string> = {
  cab: 'うんてんせき',
  chase: 'うしろから',
  side: 'よこから',
  top: 'うえから',
  rear: 'うしろの まど',
  'chase-rev': 'まえから',
};

/** v1.11 (PR8a): the mode a picked camera turns into while reversing (A10). */
export function reversedCamera(mode: CameraMode): CameraMode {
  return mode === 'cab' ? 'rear' : mode === 'chase' ? 'chase-rev' : mode;
}

/** v1.11 (PR8a): the rear window camera's eye height (m) and field of view (degrees). */
export const REAR_CAMERA = { height: 2.3, fovDeg: 55, near: 0.4 } as const;

/** Desired camera placement in world space for one frame. */
export interface CameraTarget {
  position: Vector3;
  lookAt: Vector3;
  up: Vector3;
}

const FORWARD = new Vector3();
const UP = new Vector3();
const LEFT = new Vector3();

/**
 * Computes where the camera wants to be for a mode. Pure math shared by both views; the view
 * smooths toward it. `sideSign` picks the side for the side view (+1 = train's left).
 */
export function cameraTarget(mode: CameraMode, pose: TrainPose, out: CameraTarget, sideSign = 1): void {
  FORWARD.set(0, 0, 1).applyQuaternion(pose.quaternion);
  UP.set(0, 1, 0).applyQuaternion(pose.quaternion);
  LEFT.set(1, 0, 0).applyQuaternion(pose.quaternion);
  const p = pose.position;
  switch (mode) {
    case 'cab':
      out.position.copy(p).addScaledVector(UP, TRAIN.cabCameraOffset.y).addScaledVector(FORWARD, TRAIN.cabCameraOffset.z);
      out.lookAt.copy(out.position).addScaledVector(FORWARD, 10);
      out.up.copy(UP);
      break;
    case 'chase': {
      const consist = TRAIN.carSpacing * (TRAIN.carCount - 1);
      out.position.copy(p).addScaledVector(FORWARD, -(consist + 16)).addScaledVector(UP, 9).addScaledVector(LEFT, 4);
      out.lookAt.copy(p).addScaledVector(FORWARD, -consist / 2 + 6).addScaledVector(UP, 2);
      out.up.set(0, 1, 0);
      break;
    }
    case 'side': {
      const consist = TRAIN.carSpacing * (TRAIN.carCount - 1);
      out.position.copy(p).addScaledVector(LEFT, sideSign * 22).addScaledVector(UP, 6).addScaledVector(FORWARD, -consist / 2);
      out.lookAt.copy(p).addScaledVector(FORWARD, -consist / 2).addScaledVector(UP, 1.5);
      out.up.set(0, 1, 0);
      break;
    }
    case 'top':
      out.position.copy(p).addScaledVector(UP, 75).addScaledVector(FORWARD, 12);
      out.lookAt.copy(p).addScaledVector(FORWARD, 12.01);
      out.up.copy(FORWARD);
      break;
    case 'rear': {
      // Just outside the last car's back wall (its inside is not seen), looking back the way the train goes.
      const t = pose.tail;
      FORWARD.set(0, 0, 1).applyQuaternion(t.quaternion);
      UP.set(0, 1, 0).applyQuaternion(t.quaternion);
      out.position.copy(t.position).addScaledVector(UP, REAR_CAMERA.height).addScaledVector(FORWARD, -(TRAIN.length / 2 + REVERSE.rearCamOut));
      out.lookAt.copy(out.position).addScaledVector(FORWARD, -10);
      out.up.copy(UP);
      break;
    }
    case 'chase-rev': {
      // "うしろから" the other way round: ahead of the lead car, over the train towards where it goes.
      const consist = TRAIN.carSpacing * (TRAIN.carCount - 1);
      out.position.copy(p).addScaledVector(FORWARD, 16).addScaledVector(UP, 9).addScaledVector(LEFT, -4);
      out.lookAt.copy(p).addScaledVector(FORWARD, -consist / 2 - 6).addScaledVector(UP, 2);
      out.up.set(0, 1, 0);
      break;
    }
  }
}

/**
 * The title screen's camera (PHASE7_FINISH §4 item 6): it swings slowly to and fro around the standing train,
 * looking at the middle of the consist from a little above. `radius` and `height` in m; it swings `swingDeg` either
 * way of `centerDeg` (0 = the train's left side, as the side view; 90 = in front; 180 = its right side), one
 * to-and-fro in `seconds`. A swing and not a full circle: at a station the platform and the buildings behind it
 * stand close on one side.
 */
export interface OrbitCamera {
  radius: number;
  height: number;
  centerDeg: number;
  swingDeg: number;
  seconds: number;
  /** How far above the train's middle it looks (m): more lifts the view, so the train sits lower in the picture. */
  lift: number;
}

/** The orbit's angle (radians) `t` seconds after it started: it starts in the middle, going toward the front. */
export function orbitAngle(orbit: OrbitCamera, t: number): number {
  const deg = orbit.centerDeg + orbit.swingDeg * Math.sin((t * Math.PI * 2) / orbit.seconds);
  return (deg * Math.PI) / 180;
}

/** Where the orbiting title camera is at `angle` (radians from the train's left side, turning toward its front). */
export function orbitTarget(pose: TrainPose, orbit: OrbitCamera, angle: number, out: CameraTarget): void {
  FORWARD.set(0, 0, 1).applyQuaternion(pose.quaternion);
  LEFT.set(1, 0, 0).applyQuaternion(pose.quaternion);
  // Level circle: the train's own tilt (a slope) must not tip the horizon.
  FORWARD.y = 0;
  LEFT.y = 0;
  FORWARD.normalize();
  LEFT.normalize();
  const consist = TRAIN.carSpacing * (TRAIN.carCount - 1);
  out.lookAt.copy(pose.position).addScaledVector(FORWARD, -consist / 2);
  out.position
    .copy(out.lookAt)
    .addScaledVector(LEFT, Math.cos(angle) * orbit.radius)
    .addScaledVector(FORWARD, Math.sin(angle) * orbit.radius);
  out.position.y += orbit.height;
  out.lookAt.y += orbit.lift;
  out.up.set(0, 1, 0);
}

/** Smoothly moves `current` toward `target` (frame-rate independent). */
export function smoothCamera(current: CameraTarget, target: CameraTarget, dt: number, snap: boolean): void {
  if (snap) {
    current.position.copy(target.position);
    current.lookAt.copy(target.lookAt);
    current.up.copy(target.up);
    return;
  }
  const k = 1 - Math.exp(-dt * 6);
  current.position.lerp(target.position, k);
  current.lookAt.lerp(target.lookAt, k);
  current.up.lerp(target.up, k).normalize();
}

export function makeCameraTarget(): CameraTarget {
  return { position: new Vector3(), lookAt: new Vector3(), up: new Vector3(0, 1, 0) };
}

export const IDENTITY_QUATERNION = new Quaternion();
