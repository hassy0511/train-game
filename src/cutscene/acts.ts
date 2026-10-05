import type { ActKind } from '../stage/types';

/**
 * v1.12 (えんしゅつ): the figures' little motions (cutscene step `act`), shared by the cutscene runner (how long a step
 * waits) and the view (src/view/three/actors.ts draws them). The models have no bones: the whole figure hops, bows,
 * tilts or turns about its feet, small and soft (PHASE: "gentle and cute").
 */
export const ACT = {
  /** One little hop (s) and its height as a part of the figure's height (at least `hopMin`, at most `hopMax` m). */
  hopSeconds: 0.42,
  hopLift: 0.28,
  hopMin: 0.12,
  hopMax: 0.7,
  /** One bigger hop ("jump"). */
  jumpSeconds: 0.7,
  jumpLift: 0.5,
  /** One bow (s) and how far it leans forward (rad). */
  nodSeconds: 0.55,
  nodAngle: 0.24,
  /** The head on one side (s, rad). */
  tiltSeconds: 0.8,
  tiltAngle: 0.3,
  /** "ばんざい": bounces and a sway (s). */
  cheerSeconds: 1.1,
  /** One quick turn there and back (s, rad). */
  wiggleSeconds: 0.38,
  wiggleAngle: 0.35,
  /** Swaying while waving: rad, times a second. */
  waveAngle: 0.1,
  waveRate: 1.5,
  /** A turn to face something, when the step does not say (s). */
  turnSeconds: 0.6,
  /** prefers-reduced-motion: every motion this much as big. */
  gentle: 0.5,
} as const;

/** How many times an act repeats when the step does not say. */
export function actTimes(kind: ActKind, times?: number): number {
  if (times !== undefined) return Math.max(1, Math.round(times));
  return kind === 'hop' || kind === 'nod' ? 2 : kind === 'wiggle' ? 3 : 1;
}

/** How long an act lasts (s): what a step without `nowait` waits. "wave" goes on until the next act (0 here). */
export function actSeconds(kind: ActKind, times?: number, seconds?: number): number {
  const n = actTimes(kind, times);
  switch (kind) {
    case 'hop':
      return n * ACT.hopSeconds;
    case 'jump':
      return n * ACT.jumpSeconds;
    case 'nod':
      return n * ACT.nodSeconds;
    case 'tilt':
      return n * ACT.tiltSeconds;
    case 'cheer':
      return n * ACT.cheerSeconds;
    case 'wiggle':
      return n * ACT.wiggleSeconds;
    case 'turn':
      return seconds ?? ACT.turnSeconds;
    case 'wave':
      return 0;
  }
}
