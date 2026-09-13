import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { Rail, RailFrame, RailNetwork } from '../../rail/types';
import type { ModelPlacement } from './props';

const SAMPLE_STEP = 1;
const SLEEPER_STEP = 0.8;
const RAIL_HALF_GAUGE = 0.75;
const RAIL_HALF_WIDTH = 0.05;
const RAIL_HEIGHT = 0.15;
const BALLAST_TOP_HALF_WIDTH = 1.6;
const BALLAST_BOTTOM_HALF_WIDTH = 2.2;
const BALLAST_TOP_DEPTH = 0.3;
const BALLAST_BOTTOM_DEPTH = 0.6;

interface GeometryData {
  positions: number[];
  indices: number[];
}

export interface RailScene {
  group: Group;
  bufferStops: ModelPlacement[];
}

function addQuad(data: GeometryData, a: Vector3, b: Vector3, c: Vector3, d: Vector3): void {
  const base = data.positions.length / 3;
  for (const point of [a, b, c, d]) data.positions.push(point.x, point.y, point.z);
  data.indices.push(base, base + 1, base + 2, base + 2, base + 3, base);
}

function makeGeometry(data: GeometryData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(data.positions, 3));
  geometry.setIndex(data.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function point(frame: RailFrame, lateral: number, depth: number): Vector3 {
  return frame.position.clone().addScaledVector(frame.right, lateral).addScaledVector(frame.up, -depth);
}

function isInGap(rail: Rail, s: number): boolean {
  return rail.gaps.some((gap) => s >= gap.from && s <= gap.to);
}

function samplePoints(rail: Rail): number[] {
  const samples = [0, rail.length];
  for (let s = SAMPLE_STEP; s < rail.length; s += SAMPLE_STEP) samples.push(s);
  for (const gap of rail.gaps) {
    samples.push(Math.max(0, Math.min(rail.length, gap.from)));
    samples.push(Math.max(0, Math.min(rail.length, gap.to)));
  }
  samples.sort((a, b) => a - b);
  return samples.filter((value, index) => index === 0 || Math.abs(value - samples[index - 1]) > 1e-6);
}

function addRailSegment(data: GeometryData, start: RailFrame, end: RailFrame, offset: number): void {
  const startLowTop = point(start, offset - RAIL_HALF_WIDTH, 0);
  const startHighTop = point(start, offset + RAIL_HALF_WIDTH, 0);
  const endLowTop = point(end, offset - RAIL_HALF_WIDTH, 0);
  const endHighTop = point(end, offset + RAIL_HALF_WIDTH, 0);
  const startLowBottom = point(start, offset - RAIL_HALF_WIDTH, RAIL_HEIGHT);
  const startHighBottom = point(start, offset + RAIL_HALF_WIDTH, RAIL_HEIGHT);
  const endLowBottom = point(end, offset - RAIL_HALF_WIDTH, RAIL_HEIGHT);
  const endHighBottom = point(end, offset + RAIL_HALF_WIDTH, RAIL_HEIGHT);

  addQuad(data, startLowTop, startHighTop, endHighTop, endLowTop);
  addQuad(data, startHighTop, startHighBottom, endHighBottom, endHighTop);
  addQuad(data, startLowTop, endLowTop, endLowBottom, startLowBottom);
}

function addBallastSegment(data: GeometryData, start: RailFrame, end: RailFrame): void {
  const startTopLow = point(start, -BALLAST_TOP_HALF_WIDTH, BALLAST_TOP_DEPTH);
  const startTopHigh = point(start, BALLAST_TOP_HALF_WIDTH, BALLAST_TOP_DEPTH);
  const endTopLow = point(end, -BALLAST_TOP_HALF_WIDTH, BALLAST_TOP_DEPTH);
  const endTopHigh = point(end, BALLAST_TOP_HALF_WIDTH, BALLAST_TOP_DEPTH);
  const startBottomLow = point(start, -BALLAST_BOTTOM_HALF_WIDTH, BALLAST_BOTTOM_DEPTH);
  const startBottomHigh = point(start, BALLAST_BOTTOM_HALF_WIDTH, BALLAST_BOTTOM_DEPTH);
  const endBottomLow = point(end, -BALLAST_BOTTOM_HALF_WIDTH, BALLAST_BOTTOM_DEPTH);
  const endBottomHigh = point(end, BALLAST_BOTTOM_HALF_WIDTH, BALLAST_BOTTOM_DEPTH);

  addQuad(data, startTopLow, startTopHigh, endTopHigh, endTopLow);
  addQuad(data, startTopHigh, startBottomHigh, endBottomHigh, endTopHigh);
  addQuad(data, startTopLow, endTopLow, endBottomLow, startBottomLow);
}

function frameMatrix(frame: RailFrame, depth: number): Matrix4 {
  const left = frame.right.clone().negate();
  const rotation = new Matrix4().makeBasis(left, frame.up, frame.tangent);
  const quaternion = new Quaternion().setFromRotationMatrix(rotation);
  const position = frame.position.clone().addScaledVector(frame.up, -depth);
  return new Matrix4().compose(position, quaternion, new Vector3(1, 1, 1));
}

/** Generates batched rail, sleeper and ballast meshes plus buffer-stop placements. */
export function buildRailScene(network: RailNetwork): RailScene {
  const group = new Group();
  group.name = 'rail-network';
  const railMaterial = new MeshLambertMaterial({ color: '#6E6E6E' });
  const ballastMaterial = new MeshLambertMaterial({ color: '#A89F91' });
  const sleeperMaterial = new MeshLambertMaterial({ color: '#6B4E2E' });
  const sleeperMatrices: Matrix4[] = [];
  const bufferStops: ModelPlacement[] = [];

  for (const rail of network.rails.values()) {
    const railData: GeometryData = { positions: [], indices: [] };
    const ballastData: GeometryData = { positions: [], indices: [] };
    const samples = samplePoints(rail);
    for (let index = 0; index < samples.length - 1; index += 1) {
      const startS = samples[index];
      const endS = samples[index + 1];
      if (isInGap(rail, (startS + endS) / 2)) continue;
      const start = rail.frameAt(startS);
      const end = rail.frameAt(endS);
      addRailSegment(railData, start, end, -RAIL_HALF_GAUGE);
      addRailSegment(railData, start, end, RAIL_HALF_GAUGE);
      addBallastSegment(ballastData, start, end);
    }

    const rails = new Mesh(makeGeometry(railData), railMaterial);
    rails.name = `${rail.id}-rails`;
    group.add(rails);
    const ballast = new Mesh(makeGeometry(ballastData), ballastMaterial);
    ballast.name = `${rail.id}-ballast`;
    group.add(ballast);

    for (let s = 0; s <= rail.length; s += SLEEPER_STEP) {
      if (!isInGap(rail, s)) sleeperMatrices.push(frameMatrix(rail.frameAt(s), 0.225));
    }

    if (rail.end.type === 'buffer') {
      const frame = rail.frameAt(rail.length);
      const rotation = new Matrix4().makeBasis(frame.right.clone().negate(), frame.up, frame.tangent);
      bufferStops.push({
        model: 'buffer-stop-proto',
        position: frame.position.clone(),
        quaternion: new Quaternion().setFromRotationMatrix(rotation),
        scale: 1,
      });
    }
  }

  const sleepers = new InstancedMesh(
    new BoxGeometry(2.4, 0.15, 0.25),
    sleeperMaterial,
    sleeperMatrices.length,
  );
  sleepers.name = 'sleepers';
  sleeperMatrices.forEach((matrix, index) => sleepers.setMatrixAt(index, matrix));
  sleepers.instanceMatrix.needsUpdate = true;
  group.add(sleepers);

  return { group, bufferStops };
}
