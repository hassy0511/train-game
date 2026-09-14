import { Quaternion, Vector3 } from 'three';
import { TRAIN } from '../train/params';
import type { TrainPose } from '../train/types';

export type CameraMode = 'cab' | 'chase' | 'side' | 'top';
export const CAMERA_MODES: CameraMode[] = ['cab', 'chase', 'side', 'top'];
/** Short labels for the camera button (fits a 96 px round button). */
export const CAMERA_LABELS: Record<CameraMode, string> = {
  cab: 'うんてん',
  chase: 'うしろ',
  side: 'よこ',
  top: 'うえ',
};

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
  }
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
