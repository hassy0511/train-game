import { Vector3 } from 'three';
import type { RailDef, StageFile, Vec3 } from '../stage/types';
import { Rail } from './rail';
import type { RailNetwork } from './types';

const JOIN_TOLERANCE = 0.5;
const PHANTOM_DISTANCE = 8;

const toVector = (p: Vec3): Vector3 => new Vector3(p[0], p[1], p[2]);

function makeRail(def: RailDef, leadIn?: Vector3, leadOut?: Vector3): Rail {
  return new Rail({
    id: def.id,
    points: def.points.map(toVector),
    up: def.up ? toVector(def.up) : undefined,
    gaps: def.gaps,
    end: def.end,
    leadIn,
    leadOut,
  });
}

/**
 * Builds all rails of a stage. Rails that start at a junction or end in a merge get a phantom
 * control point so their tangent lines up with the rail they connect to.
 */
export function buildRailNetwork(file: StageFile): RailNetwork {
  const ids = new Set<string>();
  for (const def of file.rails) {
    if (ids.has(def.id)) throw new Error(`Duplicate rail id "${def.id}"`);
    ids.add(def.id);
  }

  // Pass 1: plain rails, used to query tangents at junctions and merge points.
  const plain = new Map<string, Rail>();
  for (const def of file.rails) plain.set(def.id, makeRail(def));

  // Pass 2: rebuild with phantom points where needed.
  const rails = new Map<string, Rail>();
  for (const def of file.rails) {
    let leadIn: Vector3 | undefined;
    let leadOut: Vector3 | undefined;

    const feeder = file.junctions.find(
      (j) => j.railId !== def.id && (j.left === def.id || j.right === def.id),
    );
    if (feeder) {
      const parent = plain.get(feeder.railId);
      if (!parent) throw new Error(`Junction "${feeder.id}" references unknown rail "${feeder.railId}"`);
      const frame = parent.frameAt(feeder.at);
      const start = toVector(def.points[0]);
      const gap = frame.position.distanceTo(start);
      if (gap > JOIN_TOLERANCE) {
        throw new Error(
          `Rail "${def.id}" must start at junction "${feeder.id}" (off by ${gap.toFixed(2)} m)`,
        );
      }
      const d = Math.min(PHANTOM_DISTANCE, start.distanceTo(toVector(def.points[1])));
      leadIn = start.clone().addScaledVector(frame.tangent, -d);
    }

    if (def.end.type === 'merge') {
      const target = plain.get(def.end.railId);
      if (!target) throw new Error(`Rail "${def.id}" merges into unknown rail "${def.end.railId}"`);
      const frame = target.frameAt(def.end.at);
      const last = toVector(def.points[def.points.length - 1]);
      const gap = frame.position.distanceTo(last);
      if (gap > JOIN_TOLERANCE) {
        throw new Error(`Rail "${def.id}" must end on rail "${def.end.railId}" (off by ${gap.toFixed(2)} m)`);
      }
      const d = Math.min(PHANTOM_DISTANCE, last.distanceTo(toVector(def.points[def.points.length - 2])));
      leadOut = last.clone().addScaledVector(frame.tangent, d);
    }

    rails.set(def.id, makeRail(def, leadIn, leadOut));
  }

  return {
    rails,
    getRail(id: string): Rail {
      const rail = rails.get(id);
      if (!rail) throw new Error(`Unknown rail "${id}"`);
      return rail;
    },
  };
}
