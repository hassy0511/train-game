import type { RailNetwork } from '../rail/types';
import type { GimmickDef, IronLook, IronProp, MagnetKind, MagnetLook, MagnetParams, MagnetTarget, StageFile } from '../stage/types';
import { IRON_LOOKS, MAGNET_KINDS } from '../stage/types';
import { IRON_PROPS, MAGNET } from '../train/params';

/**
 * v1.11 (PR5, PHASE9_CHAPTER5_6 第 2 部 M3, M9): where the magnet light's iron targets and the iron odds and ends by the
 * line are, worked out once when a stage loads (pure: no browser, so scripts/check-stages.mjs runs it too).
 */

const text = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** The model drawn for each look (stand-ins drawn in code until built: src/view/three/magnet-placeholders.ts). */
export const MAGNET_LOOK_MODELS: Record<MagnetLook, string> = {
  star: 'iron-star-small',
  bell: 'iron-bell-small',
  'rail-piece': 'rail-piece',
  // 6-1's drawbridge is made with its own ticket (0021); until then it is the loose rail piece.
  drawbridge: 'rail-piece',
  'toy-blocks': 'toy-blocks-loose',
  door: 'iron-door',
  crossing: 'crossing-bar-iron',
  mirror: 'turn-mirror-small',
};

const DEFAULT_LOOK: Record<MagnetKind, MagnetLook> = { pick: 'star', bridge: 'rail-piece', gate: 'door', turn: 'mirror' };

/** The "magnet" gimmicks of a stage (index into gimmicks[] and their params), shape unchecked. */
export function magnetGimmicks(gimmicks: GimmickDef[]): { index: number; g: GimmickDef; p: MagnetParams }[] {
  const out: { index: number; g: GimmickDef; p: MagnetParams }[] = [];
  gimmicks.forEach((g, index) => {
    if (g.type === 'magnet') out.push({ index, g, p: (g.params ?? {}) as unknown as MagnetParams });
  });
  return out;
}

/**
 * Where "ぽよん" puts the train back by default: `back` m before `at` along the way it came (onto the rail its side way
 * forks off, when `at` is closer than that to the side way's start).
 */
export function backAlong(file: StageFile, network: RailNetwork, railId: string, at: number, back: number): { railId: string; at: number } {
  let rail = railId;
  let s = at - back;
  for (let hop = 0; hop < 4 && s < 0; hop++) {
    const feeder = file.junctions.find((j) => j.railId !== rail && (j.left === rail || j.right === rail));
    if (!feeder) break;
    s = feeder.at + s;
    rail = feeder.railId;
  }
  const length = network.rails.get(rail)?.length ?? 0;
  return { railId: rail, at: Math.min(Math.max(0, s), length) };
}

/** The iron targets: the magnet gimmicks, and the records needing the magnet light (as "pick"). Sorted by rail, at. */
export function magnetTargets(file: StageFile, network: RailNetwork): MagnetTarget[] {
  const out: MagnetTarget[] = [];
  for (const { index, g, p } of magnetGimmicks(file.gimmicks)) {
    if (g.railId === undefined || g.from === undefined) continue;
    const kind: MagnetKind = MAGNET_KINDS.includes(p.kind) ? p.kind : 'pick';
    const look = p.look ?? DEFAULT_LOOK[kind];
    const lateral = kind === 'pick' || kind === 'turn' ? num(p.lateral, 0) : 0;
    const height = kind === 'pick' || kind === 'turn' ? num(p.height, 0) : 0;
    const open = kind === 'bridge' || kind === 'gate';
    const end = kind === 'bridge' ? (g.to ?? g.from + MAGNET.gapMin) : kind === 'gate' ? g.from + 1 : g.from;
    out.push({
      id: String(p.id),
      kind,
      railId: g.railId,
      at: g.from,
      end,
      offset: { lateral, height },
      minAhead: open ? 0 : Math.max(MAGNET.minAhead, Math.hypot(lateral, height)),
      look,
      model: p.model ?? MAGNET_LOOK_MODELS[look] ?? MAGNET_LOOK_MODELS[DEFAULT_LOOK[kind]],
      gimmick: index,
      line: p.line === undefined ? null : text(p.line),
      done: p.done === undefined ? (kind === 'bridge' ? 'つながった！' : kind === 'gate' ? 'あいた！' : null) : text(p.done),
      miss: text(p.miss),
      rewind: open ? (p.rewind ?? backAlong(file, network, g.railId, g.from, MAGNET.rewindBefore)) : undefined,
      junction: p.junction,
      mirror: p.mirror,
      piece:
        kind === 'bridge'
          ? { lateral: num(p.piece?.lateral, -9), height: num(p.piece?.height, 0), rotationY: num(p.piece?.rotationY, 60) }
          : undefined,
    });
  }
  for (const r of file.records) {
    if (r.requires !== 'magnetLight' || !('onRail' in r)) continue;
    const lateral = r.onRail.lateral ?? 0;
    const height = r.onRail.heightFromRail ?? 0;
    out.push({
      id: `record:${r.id}`,
      kind: 'pick',
      railId: r.onRail.railId,
      at: r.onRail.at,
      end: r.onRail.at,
      offset: { lateral, height },
      minAhead: Math.max(MAGNET.minAhead, Math.hypot(lateral, height)),
      look: null,
      model: r.model ?? 'record-default',
      recordId: r.id,
      line: text(r.hint),
      done: null,
      miss: null,
    });
  }
  return out.sort((a, b) => a.railId.localeCompare(b.railId) || a.at - b.at);
}

/** mulberry32: a small repeatable random number generator (0 ≤ n < 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed from the stage id (the same stage always gets the same odds and ends). */
function seedOf(id: string): number {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Where scattered odds and ends are not put on rail `railId`: stretches [from, to] along it. */
function keepClear(file: StageFile, network: RailNetwork, magnets: MagnetTarget[], railId: string): [number, number][] {
  const out: [number, number][] = [];
  const P = IRON_PROPS;
  const rail = network.getRail(railId);
  for (const st of file.stations) if (st.railId === railId) out.push([st.at - P.clearStation, st.at + P.clearStation]);
  for (const g of rail.gaps) out.push([g.from - P.clearGap, g.to + P.clearGap]);
  for (const w of [...rail.surfaces, ...rail.dives]) out.push([w.from, w.to]);
  for (const sp of rail.plows) out.push([sp.from - P.clearGap, sp.to]);
  for (const t of magnets) if (t.railId === railId) out.push([t.at - P.clearTarget, t.end + P.clearTarget]);
  for (const j of file.junctions) {
    if (j.railId === railId) out.push([j.at - P.clearJunction, j.at + P.clearJunction]);
    if (j.railId !== railId && (j.left === railId || j.right === railId)) out.push([-Infinity, P.clearJunction]);
  }
  for (const r of file.rails) {
    if (r.end.type !== 'merge') continue;
    if (r.id === railId) out.push([rail.length - P.clearJunction, Infinity]);
    if (r.end.railId === railId && r.id !== railId) out.push([r.end.at - P.clearJunction, r.end.at + P.clearJunction]);
  }
  // Quiet inside the mirror (5-3's mirror-flip stretches, PR6a).
  for (const g of file.gimmicks) {
    if (g.type === 'mirror-flip' && g.railId === railId && g.from !== undefined) out.push([g.from, g.to ?? g.from]);
  }
  return out;
}

/**
 * The iron odds and ends of a stage (PHASE9_0 §3, 第 2 部 M3.4): scattered along every rail about every
 * `environment.ironProps.every` m (default IRON_PROPS.every, ± jitter, repeatably from the stage id), sides by turns,
 * up to IRON_PROPS.max; then the props with `iron`. None with `environment.ironProps: false` or without a ground.
 */
export function ironPropsFor(file: StageFile, network: RailNetwork, magnets: MagnetTarget[]): IronProp[] {
  const P = IRON_PROPS;
  const out: IronProp[] = [];
  const setting = file.environment.ironProps;
  const groundY = file.environment.ground?.y ?? null;
  if (setting !== false && groundY !== null) {
    const every = setting?.every ?? P.every;
    const looks = (setting?.looks?.length ? setting.looks : IRON_LOOKS).filter((l) => IRON_LOOKS.includes(l));
    const weights = looks.map((l) => P.weights[l]);
    const total = weights.reduce((a, b) => a + b, 0);
    const random = mulberry32(seedOf(file.id));
    let side = random() < 0.5 ? -1 : 1;
    for (const def of file.rails) {
      const rail = network.getRail(def.id);
      const clear = keepClear(file, network, magnets, def.id);
      for (let s = every * 0.5 + (random() * 2 - 1) * P.jitter; s < rail.length - 10 && out.length < P.max; s += every + (random() * 2 - 1) * P.jitter) {
        if (s < 10 || clear.some(([a, b]) => s >= a && s <= b)) continue;
        if (rail.frameAt(s).position.y - groundY > P.groundMax) continue;
        let pick = random() * total;
        let look: IronLook = looks[0];
        for (let i = 0; i < looks.length; i++) {
          pick -= weights[i];
          if (pick <= 0) {
            look = looks[i];
            break;
          }
        }
        const lateral = side * (P.lateralMin + random() * (P.lateralMax - P.lateralMin));
        side = -side;
        out.push({ index: out.length, railId: def.id, at: Math.round(s * 10) / 10, lateral: Math.round(lateral * 100) / 100, height: look === 'bell' ? P.bellHeight : 0, look });
      }
    }
  }
  file.props.forEach((p, i) => {
    if (!p.iron || !('onRail' in p)) return;
    out.push({ index: out.length, railId: p.onRail.railId, at: p.onRail.at, lateral: p.onRail.lateral ?? 0, height: p.iron === 'bell' ? P.bellHeight : 0, look: p.iron, prop: i });
  });
  return out.sort((a, b) => a.railId.localeCompare(b.railId) || a.at - b.at).map((p, index) => ({ ...p, index }));
}

/** A stage prop with `iron` whose own model the iron layer draws instead (a can, a bucket, a whole sign with its bell). */
export function ironDrawsProp(p: { iron?: IronLook; model: string }): boolean {
  return p.iron === 'can' || p.iron === 'bucket' || (p.iron === 'bell' && p.model === 'sign-bell');
}
