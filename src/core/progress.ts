import type { AbilityId } from '../stage/types';
import world from '../world/world.json';
import { seenMapLinks } from '../world/pages';
import type { WorldFile } from '../world/types';

const KEY = 'train-game.progress.v1';
const SCHEMA = 1;

/** What the player has done so far. The seed of the Phase 4 save; kept tiny on purpose. */
export interface Progress {
  schema: typeof SCHEMA;
  /** Stage ids cleared at least once. */
  cleared: string[];
  abilities: AbilityId[];
  /** Record ids found (the picture book). */
  records: string[];
  /** World-map links ("from>to") whose rail has already been drawn in (the growing rail plays once). */
  mapLinks: string[];
  /**
   * PHASE7_FINISH §4 item 3: where to go on from ("つづきから"). `mission` is the 0-based index of the mission to
   * start (at least 1: it starts at the last station of the mission before). Written once a mission is done (its
   * "できた！" card and the cutscene after it), only for a stage not cleared yet and never lower than it was for
   * that stage (see advanceResume); cleared when that stage is cleared. Optional, so the schema stays 1 and older
   * saves load.
   */
  resume?: Resume;
}

export interface Resume {
  stage: string;
  mission: number;
  /** What the missions before brought, for the clear card: graded stops, "ぴったり" ones, records found on the way. */
  stops?: number;
  perfect?: number;
  found?: string[];
}

const empty = (): Progress => ({ schema: SCHEMA, cleared: [], abilities: [], records: [], mapLinks: [] });

/**
 * 「かくにん モード」 (src/core/kakunin.ts): a sandbox run keeps the progress in memory, copied from the save when it
 * starts. Everything reads and writes that copy as usual (clears, records, abilities, the resume, the map's rails),
 * and nothing reaches localStorage, so the child's save stays byte for byte as it was. A new page load starts clean.
 */
let sandbox: Progress | null = null;

/** From now on the progress is an in-memory copy of the save and nothing is written (until the page is left). */
export function startSandbox(): void {
  sandbox = loadProgress();
}

/** Reads the saved progress. Storage can be missing or blocked (private mode); then it starts empty. */
export function loadProgress(): Progress {
  if (sandbox) return structuredClone(sandbox);
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw) as Partial<Progress>;
    if (data.schema !== SCHEMA) return empty();
    return {
      schema: SCHEMA,
      cleared: Array.isArray(data.cleared) ? data.cleared.filter((v) => typeof v === 'string') : [],
      abilities: Array.isArray(data.abilities) ? (data.abilities.filter((v) => typeof v === 'string') as AbilityId[]) : [],
      records: Array.isArray(data.records) ? data.records.filter((v) => typeof v === 'string') : [],
      mapLinks: Array.isArray(data.mapLinks) ? data.mapLinks.filter((v) => typeof v === 'string') : [],
      ...(isResume(data.resume) ? { resume: cleanResume(data.resume) } : {}),
    };
  } catch {
    return empty();
  }
}

export function saveProgress(progress: Progress): void {
  if (sandbox) {
    sandbox = structuredClone(progress);
    return;
  }
  askPersistence();
  try {
    window.localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // Not saved (storage blocked); the game still plays.
  }
}

/** Adds items to a list field and saves. Returns true when something new was added. */
export function addToProgress(field: 'cleared' | 'abilities' | 'records' | 'mapLinks', items: string[]): boolean {
  const progress = loadProgress();
  const list = progress[field] as string[];
  const fresh = items.filter((item) => !list.includes(item));
  if (fresh.length === 0) return false;
  list.push(...fresh);
  saveProgress(progress);
  return true;
}

function isResume(value: unknown): value is Resume {
  const r = value as Partial<Resume> | null | undefined;
  return !!r && typeof r.stage === 'string' && typeof r.mission === 'number' && Number.isInteger(r.mission) && r.mission >= 1;
}

const count = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;

/** A copy with only the known fields (the optional ones only when they make sense). */
function cleanResume(r: Resume): Resume {
  const stops = count(r.stops);
  const perfect = count(r.perfect);
  const found = Array.isArray(r.found) ? r.found.filter((v) => typeof v === 'string') : undefined;
  return {
    stage: r.stage,
    mission: r.mission,
    ...(stops !== undefined ? { stops } : {}),
    ...(perfect !== undefined ? { perfect } : {}),
    ...(found && found.length > 0 ? { found } : {}),
  };
}

/** Sets (or with null forgets) where to go on from ("つづきから") and saves. */
export function setResume(resume: Resume | null): void {
  const progress = loadProgress();
  if (resume) progress.resume = cleanResume(resume);
  else if (progress.resume) delete progress.resume;
  else return;
  saveProgress(progress);
}

/**
 * A mission is done: "つづきから" moves on to `resume`, unless that would lose a place worth more. There is one
 * slot, and it belongs to the stage the child is working through: a replay of a cleared stage (going back for the
 * records, where "▶▶" helps instead) never writes it, and starting the same stage over (はじめから, or its island on
 * the map) never takes it back to an earlier mission. Returns whether it was written.
 */
export function advanceResume(resume: Resume): boolean {
  const progress = loadProgress();
  if (progress.cleared.includes(resume.stage)) return false;
  const now = progress.resume;
  if (now && now.stage === resume.stage && now.mission >= resume.mission) return false;
  setResume(resume);
  return true;
}

/** Forgets the whole progress (the parents' page, "きろくを ぜんぶ けす"). Settings are kept apart and stay. */
export function clearProgress(): void {
  if (sandbox) return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: nothing was saved anyway.
  }
}

let persistAsked = false;

/**
 * Asks the browser to keep this site's storage (PHASE7_FINISH §4 item 8): Safari may drop a tab's data after a while
 * without a visit (a home-screen app is spared). Once per page load, only when something is being saved; harmless
 * where it is missing or refused.
 */
function askPersistence(): void {
  if (persistAsked) return;
  persistAsked = true;
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!storage?.persist || !storage.persisted) return;
  void storage
    .persisted()
    .then((already) => (already ? true : storage.persist()))
    .catch(() => false);
}

/** Whether the browser keeps this site's storage for good (null: it cannot tell). */
export async function storagePersisted(): Promise<boolean | null> {
  try {
    const storage = navigator.storage;
    if (!storage?.persisted) return null;
    return await storage.persisted();
  } catch {
    return null;
  }
}

/*
 * あいことば (PHASE7_FINISH §4 item 8, version 2: PHASE8_CHAPTER3_4 第 1 部 §5, version 3: PHASE9_CHAPTER5_6 第 1 部
 * §7.2): the whole progress as a few letters to copy by hand and type in again later, on this iPad or another one.
 * Nothing leaves the device. Crockford's base 32 (no I, L, O, U; typed in, O reads as 0 and I or L as 1; case,
 * spaces and dashes do not matter), shown in groups of 4 (XXXX-XXXX-XXXX-XXXX-XXXX).
 * The first letter is the version: it fixes the lists below, so a code stays good when later chapters add stages
 * and records (they get a new version with longer lists and, if needed, more letters). A code is the version (5
 * bits), what is done in the version's lists (one bit per item), zero padding bits if the version has any, and a
 * check (FNV-1a over the version and the items, `checkBits` long), so a mistyped letter is caught.
 * - Version 1 (12 letters, 60 bits): chapters 1 and 2, the rails one bit each (6 + 4 + 18 + 6 = 34 items), 21
 *   check bits.
 * - Version 2 (16 letters, 80 bits): chapters 1 to 4 (12 + 6 + 36 = 54 items), 21 check bits. No rails: they are
 *   rebuilt from the clears on reading, all seen, and the ends of the done chapters too (seenMapLinks), so a child
 *   who types it in is not shown them again; only up to the pages there were then (`pages`).
 * - Version 3 (20 letters, 100 bits): chapters 1 to 6 (17 + 8 + 51 = 76 items), 19 check bits (a wrong code passes
 *   1 time in 520,000). No rails, like version 2.
 * New codes are always the latest version; every version ever published is still read. Never reorder or drop an
 * item of a published version.
 */
const PASSCODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export interface PasscodeVersion {
  version: number;
  letters: number;
  checkBits: number;
  cleared: readonly string[];
  abilities: readonly AbilityId[];
  records: readonly string[];
  /** The rails, one bit each. Without it none are carried: they are rebuilt from the clears on reading. */
  mapLinks?: readonly string[];
  /**
   * A version without rails: the map pages there were when it came out. Rebuilt rails and chapter ends count as
   * seen only up to this page, so a rail into a page added later still grows once (PHASE9_CHAPTER5_6 第 1 部 §7.3).
   */
  pages?: number;
  /**
   * Zero bits between the items and the check, when the items and a check of at least 16 bits do not fill the
   * letters exactly (PHASE9_CHAPTER5_6 第 1 部 §7.2). A code whose padding is not all zero is rejected as mistyped.
   * `5 + items + padBits + checkBits = 5 × letters` (scripts/check-stages.mjs).
   */
  padBits?: number;
}

const PASSCODE_V1: PasscodeVersion = {
  version: 1,
  letters: 12,
  checkBits: 21,
  cleared: ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3'],
  abilities: ['whistle', 'jump', 'light', 'rocket'],
  records: [
    'town-board',
    'hq-plans',
    'roof-balloon',
    'dino-egg',
    'cliff-nest',
    'footprints',
    'cloud-crystal',
    'weathervane',
    'upside-island',
    'squirrel-nest',
    'acorn-big',
    'treetop',
    'watage',
    'yotsuba',
    'mizutamari',
    'pumice-float',
    'sulfur-crystal',
    'bubble-spring',
  ],
  mapLinks: ['1-1>1-2', '1-2>1-3', '1-3>2-1', '2-1>2-2', '2-2>2-3', '2-3>1-1'],
};

/**
 * Chapters 3 and 4 after version 1's items, in stage order (3 records a stage). 4-3's are the ones its design gives
 * (PHASE8_CHAPTER3_4 第 8 部); scripts/check-stages.mjs (npm run build) and pause-settings.spec.ts check that every
 * stage file's clear, ability and records have a place here, so a stage that ships with other ids fails before this
 * version is published.
 * `magnetLight` (chapter 5) and `reverse` (chapter 6) came with version 3. Read only now (new codes are version 3).
 */
const PASSCODE_V2: PasscodeVersion = {
  version: 2,
  letters: 16,
  checkBits: 21,
  pages: 2,
  cleared: [...PASSCODE_V1.cleared, '3-1', '3-2', '3-3', '4-1', '4-2', '4-3'],
  abilities: [...PASSCODE_V1.abilities, 'dive', 'plow'],
  records: [
    ...PASSCODE_V1.records,
    'rainbow-shell',
    'sea-pearl',
    'iron-star',
    'kingfisher-feather',
    'river-jade',
    'snow-bud',
    'sunset-starfish',
    'star-sand',
    'festival-bell',
    'frost-flower',
    'glow-shell',
    'ice-bell',
    'frozen-fall',
    'spiral-mitten',
    'tin-shovel',
    'snow-hare',
    'ice-flower',
    'sleigh-bell',
  ],
};

/**
 * Chapters 5 and 6 after version 2's items, in stage order (3 records a stage), with their two abilities
 * (PHASE9_CHAPTER5_6 §0.6, 第 1 部 §7.2). Published before those stages are all built: the ids are the design's, and
 * the bits of a stage not built yet stay 0. As for version 2, scripts/check-stages.mjs and pause-settings.spec.ts
 * fail if a stage ships with other ids, so fix the stage, never this list. 6-2 with more than 3 records would need
 * fewer check bits (at least 16) or 24 letters with `padBits` (§7.2).
 */
const PASSCODE_V3: PasscodeVersion = {
  version: 3,
  letters: 20,
  checkBits: 19,
  pages: 3,
  cleared: [...PASSCODE_V2.cleared, '5-1', '5-2', '5-3', '6-1', '6-2'],
  abilities: [...PASSCODE_V2.abilities, 'magnetLight', 'reverse'],
  records: [
    ...PASSCODE_V2.records,
    // 5-1
    'moon-bunnies',
    'pond-moonstone',
    'lantern-bell',
    // 5-2
    'gold-screw',
    'glow-marble',
    'tin-key',
    // 5-3
    'kagami-kanban',
    'hand-mirror',
    'sakasa-doodle',
    // 6-1
    'up-raindrop',
    'upside-top',
    'backward-book',
    // 6-2
    'swirl-acorn',
    'left-shell',
    'sakasa-tag',
  ],
};

/** Every version ever published (scripts/check-stages.mjs checks their bit counts and lists at build time). */
export const PASSCODE_VERSIONS: readonly PasscodeVersion[] = [PASSCODE_V1, PASSCODE_V2, PASSCODE_V3];
/** New codes are written in this one. */
export const PASSCODE_LATEST = PASSCODE_V3;
/** How many letters a new あいことば has (for the parents' page). */
export const PASSCODE_LETTERS = PASSCODE_LATEST.letters;

const PASSCODE_FIELDS = ['cleared', 'abilities', 'records', 'mapLinks'] as const;

/** The version's items in order, field by field (a field it does not carry adds none). */
const passcodeItems = (v: PasscodeVersion): { field: (typeof PASSCODE_FIELDS)[number]; id: string }[] =>
  PASSCODE_FIELDS.flatMap((field) => (v[field] ?? []).map((id) => ({ field, id })));

/** 32-bit FNV-1a over bits packed 8 to a byte (the version first), cut to `bits` bits. */
function passcodeCheck(version: number, items: number[], bits: number): number {
  let hash = 0x811c9dc5;
  const bytes = [version];
  for (let i = 0; i < items.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (items[i + j] ?? 0);
    bytes.push(byte);
  }
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash & ((1 << bits) - 1);
}

const toBits = (value: number, count: number): number[] => Array.from({ length: count }, (_, i) => (value >> (count - 1 - i)) & 1);
const fromBits = (bits: number[]): number => bits.reduce((value, bit) => value * 2 + bit, 0);

/** The progress in one version's あいことば. Items the version has no place for are left out. */
function encodePasscode(progress: Progress, v: PasscodeVersion): string {
  const items = passcodeItems(v).map(({ field, id }) => ((progress[field] as string[]).includes(id) ? 1 : 0));
  const pad = Array.from({ length: v.padBits ?? 0 }, () => 0);
  const bits = [...toBits(v.version, 5), ...items, ...pad, ...toBits(passcodeCheck(v.version, items, v.checkBits), v.checkBits)];
  let code = '';
  for (let i = 0; i < bits.length; i += 5) code += PASSCODE_ALPHABET[fromBits(bits.slice(i, i + 5))];
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

/** The progress as an あいことば in the latest version ("XXXX-XXXX-XXXX-XXXX-XXXX"). */
export function progressToPasscode(progress: Progress): string {
  return encodePasscode(progress, PASSCODE_LATEST);
}

export type PasscodeError = 'empty' | 'letters' | 'version' | 'length' | 'check';

/**
 * Reads an あいことば of any version back into a whole progress, or says what is wrong with it (for a wrong
 * length, also how many letters that version has).
 */
export function passcodeToProgress(
  text: string,
): { ok: true; progress: Progress } | { ok: false; error: PasscodeError; letters?: number } {
  const clean = text
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[\s\-ー－_.]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (clean.length === 0) return { ok: false, error: 'empty' };
  const values = [...clean].map((c) => PASSCODE_ALPHABET.indexOf(c));
  if (values.some((value) => value < 0)) return { ok: false, error: 'letters' };
  const v = PASSCODE_VERSIONS.find((version) => version.version === values[0]);
  if (!v) return { ok: false, error: 'version' };
  if (values.length !== v.letters) return { ok: false, error: 'length', letters: v.letters };
  const bits = values.flatMap((value) => toBits(value, 5));
  const list = passcodeItems(v);
  const items = bits.slice(5, 5 + list.length);
  const pad = v.padBits ?? 0;
  const padding = bits.slice(5 + list.length, 5 + list.length + pad);
  const check = fromBits(bits.slice(5 + list.length + pad, 5 + list.length + pad + v.checkBits));
  if (padding.some((bit) => bit !== 0) || check !== passcodeCheck(v.version, items, v.checkBits)) return { ok: false, error: 'check' };
  const progress = empty();
  list.forEach(({ field, id }, i) => {
    if (items[i]) (progress[field] as string[]).push(id);
  });
  if (!v.mapLinks) progress.mapLinks = seenMapLinks(world as unknown as WorldFile, progress.cleared, v.pages);
  return { ok: true, progress };
}
