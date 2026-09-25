import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
/**
 * Track is built in pieces this long (m), each one mesh (rails, ballast and sleepers in vertex colours), so the
 * pieces behind the camera or past the fog are culled instead of drawing the whole line every frame.
 */
const CHUNK = 100;
const RAIL_COLOR = new Color('#6E6E6E');
const BALLAST_COLOR = new Color('#A89F91');
const SLEEPER_COLOR = new Color('#6B4E2E');

interface GeometryData {
  positions: number[];
  indices: number[];
}

export interface RailScene {
  group: Group;
  bufferStops: ModelPlacement[];
}

/** Builds the short piece that is thrown clear while a rail gap is created. */
export function buildDetachedRailPiece(network: RailNetwork, railId: string, from: number, to: number): Group | null {
  const rail = network.rails.get(railId);
  if (!rail) return null;

  const center = Math.max(0, Math.min(rail.length, (from + to) / 2));
  const length = Math.max(0.9, Math.min(2.4, Math.abs(to - from)));
  const frame = rail.frameAt(center);
  const matrix = frameMatrix(frame, 0);
  const piece = new Group();
  piece.name = 'detached-rail-piece';
  matrix.decompose(piece.position, piece.quaternion, piece.scale);

  const railMaterial = new MeshLambertMaterial({ color: '#6E6E6E', transparent: true });
  const ballastMaterial = new MeshLambertMaterial({ color: '#A89F91', transparent: true });
  const sleeperMaterial = new MeshLambertMaterial({ color: '#6B4E2E', transparent: true });

  const ballast = new Mesh(new BoxGeometry(4.2, 0.3, length), ballastMaterial);
  ballast.name = 'detached-ballast';
  ballast.position.y = -0.45;
  piece.add(ballast);

  for (const lateral of [-RAIL_HALF_GAUGE, RAIL_HALF_GAUGE]) {
    const railMesh = new Mesh(new BoxGeometry(RAIL_HALF_WIDTH * 2, RAIL_HEIGHT, length), railMaterial);
    railMesh.name = 'detached-rail';
    railMesh.position.set(lateral, -RAIL_HEIGHT / 2, 0);
    piece.add(railMesh);
  }

  const sleeperCount = 3;
  for (let index = 0; index < sleeperCount; index += 1) {
    const sleeper = new Mesh(new BoxGeometry(2.4, 0.15, 0.25), sleeperMaterial);
    sleeper.name = 'detached-sleeper';
    sleeper.position.set(0, -0.225, (index - 1) * Math.min(0.75, length / 3));
    piece.add(sleeper);
  }
  return piece;
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

/** Paints every vertex of `geometry` one colour (for merging parts that share one vertex-colour material). */
function painted(geometry: BufferGeometry, color: Color): BufferGeometry {
  if (geometry.getAttribute('uv')) geometry.deleteAttribute('uv');
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

/** One piece of track: rails, ballast and sleepers of `rail` between `from` and `to`, merged into one geometry. */
function buildChunk(rail: Rail, samples: number[], from: number, to: number, sleeper: BoxGeometry): BufferGeometry | null {
  const railData: GeometryData = { positions: [], indices: [] };
  const ballastData: GeometryData = { positions: [], indices: [] };
  for (let index = 0; index < samples.length - 1; index += 1) {
    const startS = samples[index];
    const endS = samples[index + 1];
    if (startS < from || startS >= to) continue;
    if (isInGap(rail, (startS + endS) / 2)) continue;
    const start = rail.frameAt(startS);
    const end = rail.frameAt(endS);
    addRailSegment(railData, start, end, -RAIL_HALF_GAUGE);
    addRailSegment(railData, start, end, RAIL_HALF_GAUGE);
    addBallastSegment(ballastData, start, end);
  }
  const parts: BufferGeometry[] = [];
  if (railData.indices.length) parts.push(painted(makeGeometry(railData), RAIL_COLOR));
  if (ballastData.indices.length) parts.push(painted(makeGeometry(ballastData), BALLAST_COLOR));
  for (let s = Math.ceil(from / SLEEPER_STEP) * SLEEPER_STEP; s < Math.min(to, rail.length + 1e-6); s += SLEEPER_STEP) {
    if (isInGap(rail, s)) continue;
    parts.push(painted(sleeper.clone().applyMatrix4(frameMatrix(rail.frameAt(s), 0.225)), SLEEPER_COLOR));
  }
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  merged?.computeBoundingSphere();
  return merged;
}

/** Generates the track (in culled pieces) plus buffer-stop placements. */
export function buildRailScene(network: RailNetwork): RailScene {
  const group = new Group();
  group.name = 'rail-network';
  const material = new MeshLambertMaterial({ vertexColors: true });
  const sleeper = new BoxGeometry(2.4, 0.15, 0.25);
  const bufferStops: ModelPlacement[] = [];

  for (const rail of network.rails.values()) {
    const samples = samplePoints(rail);
    const pieces = Math.max(1, Math.ceil(rail.length / CHUNK));
    for (let i = 0; i < pieces; i++) {
      const to = i === pieces - 1 ? rail.length + 1 : (i + 1) * CHUNK;
      const geometry = buildChunk(rail, samples, i * CHUNK, to, sleeper);
      if (!geometry) continue;
      const mesh = new Mesh(geometry, material);
      mesh.name = `${rail.id}-track-${i}`;
      group.add(mesh);
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
  sleeper.dispose();
  return { group, bufferStops };
}
