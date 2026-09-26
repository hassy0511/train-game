import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LOD,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rail, RailFrame, RailNetwork } from '../../rail/types';
import type { RailBaseDef } from '../../stage/types';
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
/**
 * Past this distance (m, camera to a piece's centre) a piece of steel track is drawn without its sleepers: they are
 * about a pixel wide there and make up most of the track's triangles (2-3's island shows most of its 3 km at once).
 */
const SLEEPER_LOD_DISTANCE = 300;
const RAIL_COLOR = new Color('#6E6E6E');
/** How a rail is drawn: steel rails on ballast, or (2-2) two spider-silk threads with thin cross threads. */
export type TrackLook = 'rail' | 'silk';
const SILK_COLOR = new Color('#F4F7FF');
const SILK_RADIUS = 0.09;
const SILK_SIDES = 6;
const SILK_CROSS_STEP = 1.6;
/** Every this many metres a pair of support threads runs up and out to the grass beside the silk line. */
const SILK_SUPPORT_STEP = 40;
const SILK_SUPPORT_LATERAL = 9;
const SILK_SUPPORT_RISE = 14;
const BALLAST_COLOR = new Color('#A89F91');
const SLEEPER_COLOR = new Color('#6B4E2E');
/** v1.7 (2-3): the bed of a steep uphill (red-brown with yellow ">>"), of a slide (pale grey), and rock under the track. */
const STEEP_BALLAST_COLOR = new Color('#A45C3D');
const SLIDE_BALLAST_COLOR = new Color('#D6DBE0');
const CHEVRON_COLOR = new Color('#FFD43B');
const ROCK_BASE_COLOR = new Color('#8C7B6B');
const CHEVRON_STEP = 8;
/** A base reaching the ground widens by this much per metre of height (a ridge). */
const BASE_SPREAD = 0.5;
/**
 * A ridge's foot bulges out by up to this share of its spread, varying along it, so its sides are rock faces
 * catching the light differently, not one flat wall; its colour runs from dark at the foot to light at the top.
 */
const RIDGE_BULGE = 0.35;
const RIDGE_FOOT_COLOR = new Color('#6F5D4E');
const RIDGE_TOP_COLOR = new Color('#A8927A');
const RIDGE_COLOR_HEIGHT = 60;

/**
 * v1.7: how parts of the track look — slopes (bed colour, arrows) and the rock bed under a rail (`rails[].base`).
 * Drawn into the same vertex-coloured track pieces, so no extra draw calls.
 */
export interface TrackLooks {
  slopes: { railId: string; from: number; to: number; kind: 'up' | 'down' }[];
  bases: Map<string, RailBaseDef>;
  groundY: number | null;
}

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

/** Longest track segment on a straight (m); curves keep the 1 m samples. */
const MAX_STEP = 4;
/** A sample is kept once the rail has turned (or tilted) this much since the last kept one (radians). */
const KEEP_ANGLE = 0.035;

function samplePoints(rail: Rail): number[] {
  const samples = [0, rail.length];
  // Walk in SAMPLE_STEP steps and keep only the points where the rail bends: straights become long segments.
  let last = rail.frameAt(0);
  let lastS = 0;
  for (let s = SAMPLE_STEP; s < rail.length; s += SAMPLE_STEP) {
    const frame = rail.frameAt(s);
    const next = rail.frameAt(Math.min(rail.length, s + SAMPLE_STEP));
    const turned = Math.max(frame.tangent.angleTo(last.tangent), frame.up.angleTo(last.up), next.tangent.angleTo(last.tangent));
    if (s - lastS >= MAX_STEP || turned > KEEP_ANGLE) {
      samples.push(s);
      last = frame;
      lastS = s;
    }
  }
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

/** A stretch of rail built elsewhere (a springy bough bends its own track). */
export interface TrackSkip {
  railId: string;
  from: number;
  to: number;
}

const skipped = (skips: TrackSkip[], s: number): boolean => skips.some((k) => s > k.from && s < k.to);

/**
 * Track (rails, ballast, sleepers) of one rail between `from` and `to` as one vertex-coloured geometry. `look`:
 * steel rails or (2-2) silk; `looks` (v1.7): slope beds and the rock base, for steel rails.
 */
export function buildTrack(rail: Rail, from: number, to: number, look: TrackLook = 'rail', looks?: TrackLooks): BufferGeometry | null {
  // Exactly [from, to]: both ends are sample points even when no gap ends there (a flower bridge's gap is already
  // gone when its track is built), so the piece meets the rest of the line without a hole or an overlap.
  const end = Math.min(to, rail.length);
  const samples = [from, ...samplePoints(rail).filter((s) => s > from + 1e-6 && s < end - 1e-6), end];
  if (look === 'silk') return buildSilkChunk(rail, samples, from, to, []);
  const sleeper = new BoxGeometry(2.4, 0.15, 0.25);
  const geometry = buildChunk(rail, samples, from, to, sleeper, [], looks);
  sleeper.dispose();
  return geometry;
}

/** A round thread from `a` to `b` (both world points) with `radius`, as open tube quads. */
function addThread(data: GeometryData, a: Vector3, b: Vector3, radius: number, sides = SILK_SIDES): void {
  const axis = b.clone().sub(a);
  if (axis.lengthSq() < 1e-8) return;
  axis.normalize();
  const helper = Math.abs(axis.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  const u = new Vector3().crossVectors(axis, helper).normalize();
  const v = new Vector3().crossVectors(axis, u).normalize();
  const base = data.positions.length / 3;
  for (const end of [a, b]) {
    for (let k = 0; k < sides; k++) {
      const t = (k / sides) * Math.PI * 2;
      const p = end.clone().addScaledVector(u, Math.cos(t) * radius).addScaledVector(v, Math.sin(t) * radius);
      data.positions.push(p.x, p.y, p.z);
    }
  }
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides;
    data.indices.push(base + k, base + k1, base + sides + k1, base + sides + k1, base + sides + k, base + k);
  }
}

/** A pair of support threads from the silk up and out to the grass on both sides. */
function addSilkSupports(data: GeometryData, f: RailFrame): void {
  for (const side of [-1, 1]) {
    const foot = point(f, side * RAIL_HALF_GAUGE, SILK_RADIUS);
    const top = foot.clone().addScaledVector(f.right, side * SILK_SUPPORT_LATERAL).add(new Vector3(0, SILK_SUPPORT_RISE, 0));
    addThread(data, foot, top, 0.04, 4);
  }
}

/**
 * A hanging silk bridge (2-2 "fragile"): the silk track between `from` and `to` with no supports in between, and
 * support threads at both ends only. `u` is 0 at `from` and 1 at `to` for every vertex (for the sway).
 */
export function buildSilkBridge(rail: Rail, from: number, to: number): { geometry: BufferGeometry; u: Float32Array } | null {
  const track = buildSilkChunk(rail, samplePoints(rail), from, to + 1e-3, [], false);
  const anchors: GeometryData = { positions: [], indices: [] };
  addSilkSupports(anchors, rail.frameAt(from));
  addSilkSupports(anchors, rail.frameAt(to));
  const ends = painted(makeGeometry(anchors), SILK_COLOR);
  if (!track) return null;
  const geometry = mergeGeometries([track, ends]);
  track.dispose();
  ends.dispose();
  if (!geometry) return null;
  const a = rail.frameAt(from).position;
  const along = rail.frameAt(to).position.clone().sub(a);
  const length = along.length();
  along.normalize();
  const pos = geometry.getAttribute('position');
  const u = new Float32Array(pos.count);
  const p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).sub(a);
    u[i] = Math.max(0, Math.min(1, p.dot(along) / length));
  }
  return { geometry, u };
}

/**
 * Silk track: two round white threads where the rails run, a thin cross thread every 1.6 m, and every 40 m a
 * pair of support threads up to the grass on both sides. No ballast, no sleepers.
 */
function buildSilkChunk(rail: Rail, samples: number[], from: number, to: number, skips: TrackSkip[], supports = true): BufferGeometry | null {
  const data: GeometryData = { positions: [], indices: [] };
  for (let index = 0; index < samples.length - 1; index += 1) {
    const startS = samples[index];
    const endS = samples[index + 1];
    if (startS < from || startS >= to) continue;
    if (isInGap(rail, (startS + endS) / 2) || skipped(skips, (startS + endS) / 2)) continue;
    const start = rail.frameAt(startS);
    const end = rail.frameAt(endS);
    for (const lateral of [-RAIL_HALF_GAUGE, RAIL_HALF_GAUGE]) {
      addThread(data, point(start, lateral, SILK_RADIUS), point(end, lateral, SILK_RADIUS), SILK_RADIUS);
    }
  }
  const last = Math.min(to, rail.length + 1e-6);
  for (let s = Math.ceil(from / SILK_CROSS_STEP) * SILK_CROSS_STEP; s < last; s += SILK_CROSS_STEP) {
    if (isInGap(rail, s) || skipped(skips, s)) continue;
    const f = rail.frameAt(s);
    addThread(data, point(f, -RAIL_HALF_GAUGE - 0.1, SILK_RADIUS * 1.5), point(f, RAIL_HALF_GAUGE + 0.1, SILK_RADIUS * 1.5), 0.035, 4);
  }
  for (let s = Math.ceil(from / SILK_SUPPORT_STEP) * SILK_SUPPORT_STEP; supports && s < last; s += SILK_SUPPORT_STEP) {
    if (s < 1 || isInGap(rail, s) || skipped(skips, s)) continue;
    addSilkSupports(data, rail.frameAt(s));
  }
  if (data.indices.length === 0) return null;
  return painted(makeGeometry(data), SILK_COLOR);
}

/** Adds a quad whose front faces `facing` (the winding is picked to match). */
function addQuadFacing(data: GeometryData, a: Vector3, b: Vector3, c: Vector3, d: Vector3, facing: Vector3): void {
  const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
  if (n.dot(facing) >= 0) addQuad(data, a, b, c, d);
  else addQuad(data, a, d, c, b);
}

/** Which slope (v1.7) a track position is on, if any. */
function slopeKindAt(looks: TrackLooks | undefined, railId: string, s: number): 'up' | 'down' | null {
  if (!looks) return null;
  for (const z of looks.slopes) if (z.railId === railId && s >= z.from && s <= z.to) return z.kind;
  return null;
}

const DOWN = new Vector3(0, -1, 0);

/** v1.7: rock under one track segment, from the ballast's bottom edges down `depth` m or to the ground. */
function addBaseSegment(data: GeometryData, start: RailFrame, end: RailFrame, base: RailBaseDef, groundY: number | null, capStart: boolean, capEnd: boolean): void {
  const edge = (f: RailFrame, side: number): Vector3 => point(f, side * BALLAST_BOTTOM_HALF_WIDTH, BALLAST_BOTTOM_DEPTH);
  const foot = (f: RailFrame, side: number): Vector3 | null => {
    const top = edge(f, side);
    if (base.toGround) {
      if (groundY === null || top.y - groundY <= 0.05) return null;
      const h = top.y - groundY;
      const bulge = 1 + RIDGE_BULGE * rockHash(top.x, top.z);
      const out = new Vector3(f.right.x, 0, f.right.z).normalize().multiplyScalar(side * h * BASE_SPREAD * bulge);
      return new Vector3(top.x + out.x, groundY, top.z + out.z);
    }
    return top.clone().addScaledVector(DOWN, base.depth ?? 3);
  };
  const sl = foot(start, -1);
  const sr = foot(start, 1);
  const el = foot(end, -1);
  const er = foot(end, 1);
  if (!sl || !sr || !el || !er) return;
  const tsl = edge(start, -1);
  const tsr = edge(start, 1);
  const tel = edge(end, -1);
  const ter = edge(end, 1);
  addQuadFacing(data, tsr, sr, er, ter, start.right);
  addQuadFacing(data, tsl, tel, el, sl, start.right.clone().negate());
  if (!base.toGround) addQuadFacing(data, sl, el, er, sr, DOWN);
  if (capStart) addQuadFacing(data, tsl, tsr, sr, sl, start.tangent.clone().negate());
  if (capEnd) addQuadFacing(data, tel, ter, er, el, end.tangent);
}

/** A repeatable 0…1 number for a place (the same on every load, and for both segments sharing a point). */
function rockHash(x: number, z: number): number {
  const v = Math.sin(Math.round(x * 10) * 12.9898 + Math.round(z * 10) * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** v1.7: a ridge's colours, per vertex: dark at the foot, light at the top, each point a little different. */
function paintedRidge(geometry: BufferGeometry, groundY: number): BufferGeometry {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const c = new Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    c.copy(RIDGE_FOOT_COLOR).lerp(RIDGE_TOP_COLOR, Math.min(1, Math.max(0, (y - groundY) / RIDGE_COLOR_HEIGHT)));
    c.multiplyScalar(0.9 + 0.18 * rockHash(z, x));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

/** v1.7: a yellow ">" on the sleepers of a steep uphill, pointing up the slope. */
function addChevron(data: GeometryData, frame: RailFrame): void {
  const at = (lateral: number, along: number): Vector3 =>
    frame.position.clone().addScaledVector(frame.right, lateral).addScaledVector(frame.tangent, along).addScaledVector(frame.up, -0.13);
  for (const side of [-1, 1]) {
    addQuadFacing(data, at(0, 0.45), at(side * 0.22, 0.45), at(side * 0.8, -0.35), at(side * 0.58, -0.35), frame.up);
  }
}

/** One piece of track: rails, ballast and sleepers of `rail` between `from` and `to`, merged into one geometry. */
function buildChunk(
  rail: Rail,
  samples: number[],
  from: number,
  to: number,
  sleeper: BoxGeometry,
  skips: TrackSkip[],
  looks?: TrackLooks,
): BufferGeometry | null {
  const { bed, sleepers } = buildChunkParts(rail, samples, from, to, sleeper, skips, looks);
  return mergeParts([...bed, ...sleepers]);
}

/** Merges vertex-coloured parts into one geometry (with its bounding sphere) and disposes of the parts. */
function mergeParts(parts: BufferGeometry[]): BufferGeometry | null {
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  merged?.computeBoundingSphere();
  return merged;
}

/** The parts of one piece of track: the bed (rails, ballast, slope marks, rock base) and the sleepers. */
function buildChunkParts(
  rail: Rail,
  samples: number[],
  from: number,
  to: number,
  sleeper: BoxGeometry,
  skips: TrackSkip[],
  looks?: TrackLooks,
): { bed: BufferGeometry[]; sleepers: BufferGeometry[] } {
  const railData: GeometryData = { positions: [], indices: [] };
  const ballastData: GeometryData = { positions: [], indices: [] };
  // v1.7: slope beds in their own colours, arrows, and the rock bed under the rail.
  const steepData: GeometryData = { positions: [], indices: [] };
  const slideData: GeometryData = { positions: [], indices: [] };
  const chevronData: GeometryData = { positions: [], indices: [] };
  const baseData: GeometryData = { positions: [], indices: [] };
  const base = looks?.bases.get(rail.id);
  const hasBase = (s: number): boolean =>
    !!base && !isInGap(rail, s) && !skipped(skips, s) && !(base.skip ?? []).some((k) => s > k.from && s < k.to);
  for (let index = 0; index < samples.length - 1; index += 1) {
    const startS = samples[index];
    const endS = samples[index + 1];
    if (startS < from || startS >= to) continue;
    const mid = (startS + endS) / 2;
    if (isInGap(rail, mid) || skipped(skips, mid)) continue;
    const start = rail.frameAt(startS);
    const end = rail.frameAt(endS);
    addRailSegment(railData, start, end, -RAIL_HALF_GAUGE);
    addRailSegment(railData, start, end, RAIL_HALF_GAUGE);
    const kind = slopeKindAt(looks, rail.id, mid);
    addBallastSegment(kind === 'up' ? steepData : kind === 'down' ? slideData : ballastData, start, end);
    if (base && hasBase(mid)) {
      const before = index === 0 ? -1 : (samples[index - 1] + startS) / 2;
      const after = index + 2 < samples.length ? (endS + samples[index + 2]) / 2 : rail.length + 1;
      addBaseSegment(baseData, start, end, base, looks?.groundY ?? null, !hasBase(before), !hasBase(after));
    }
  }
  if (looks) {
    for (const z of looks.slopes) {
      if (z.railId !== rail.id || z.kind !== 'up') continue;
      for (let s = z.from + CHEVRON_STEP / 2; s < z.to; s += CHEVRON_STEP) {
        if (s >= from && s < to && !isInGap(rail, s) && !skipped(skips, s)) addChevron(chevronData, rail.frameAt(s));
      }
    }
  }
  const parts: BufferGeometry[] = [];
  if (railData.indices.length) parts.push(painted(makeGeometry(railData), RAIL_COLOR));
  if (ballastData.indices.length) parts.push(painted(makeGeometry(ballastData), BALLAST_COLOR));
  if (steepData.indices.length) parts.push(painted(makeGeometry(steepData), STEEP_BALLAST_COLOR));
  if (slideData.indices.length) parts.push(painted(makeGeometry(slideData), SLIDE_BALLAST_COLOR));
  if (chevronData.indices.length) parts.push(painted(makeGeometry(chevronData), CHEVRON_COLOR));
  if (baseData.indices.length) {
    const groundY = looks?.groundY ?? null;
    const geometry = makeGeometry(baseData);
    parts.push(base?.toGround && groundY !== null ? paintedRidge(geometry, groundY) : painted(geometry, ROCK_BASE_COLOR));
  }
  const sleepers: BufferGeometry[] = [];
  for (let s = Math.ceil(from / SLEEPER_STEP) * SLEEPER_STEP; s < Math.min(to, rail.length + 1e-6); s += SLEEPER_STEP) {
    if (isInGap(rail, s) || skipped(skips, s)) continue;
    sleepers.push(painted(sleeper.clone().applyMatrix4(frameMatrix(rail.frameAt(s), 0.225)), SLEEPER_COLOR));
  }
  return { bed: parts, sleepers };
}

/**
 * A piece of steel track as a level of detail: with its sleepers near the camera, without them past
 * SLEEPER_LOD_DISTANCE (one draw call either way). The geometries are centred on the piece, which sits there.
 */
function buildTrackPiece(
  rail: Rail,
  samples: number[],
  from: number,
  to: number,
  sleeper: BoxGeometry,
  skips: TrackSkip[],
  material: MeshLambertMaterial,
  name: string,
  looks?: TrackLooks,
): LOD | null {
  const { bed, sleepers } = buildChunkParts(rail, samples, from, to, sleeper, skips, looks);
  if (bed.length === 0 && sleepers.length === 0) return null;
  const bare = bed.length ? mergeGeometries(bed) : null;
  const full = mergeParts([...bed, ...sleepers]);
  if (!full) return null;
  const center = full.boundingSphere?.center.clone() ?? new Vector3();
  full.translate(-center.x, -center.y, -center.z);
  full.computeBoundingSphere();
  const lod = new LOD();
  lod.name = name;
  lod.position.copy(center);
  const near = new Mesh(full, material);
  near.name = name;
  lod.addLevel(near, 0);
  if (bare) {
    bare.translate(-center.x, -center.y, -center.z);
    bare.computeBoundingSphere();
    const far = new Mesh(bare, material);
    far.name = name;
    lod.addLevel(far, SLEEPER_LOD_DISTANCE);
  }
  return lod;
}

/**
 * Generates the track (in culled pieces) plus buffer-stop placements. `railLooks`: rails not drawn as steel rails
 * (2-2 silk); `looks` (v1.7): slope beds and rock bases.
 */
export function buildRailScene(
  network: RailNetwork,
  skips: TrackSkip[] = [],
  railLooks: Record<string, TrackLook> = {},
  looks?: TrackLooks,
): RailScene {
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
      const railSkips = skips.filter((k) => k.railId === rail.id);
      const name = `${rail.id}-track-${i}`;
      if (railLooks[rail.id] !== 'silk') {
        const piece = buildTrackPiece(rail, samples, i * CHUNK, to, sleeper, railSkips, material, name, looks);
        if (piece) group.add(piece);
        continue;
      }
      const geometry = buildSilkChunk(rail, samples, i * CHUNK, to, railSkips);
      if (!geometry) continue;
      const mesh = new Mesh(geometry, material);
      mesh.name = name;
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
