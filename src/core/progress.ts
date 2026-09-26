import type { AbilityId } from '../stage/types';

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
}

const empty = (): Progress => ({ schema: SCHEMA, cleared: [], abilities: [], records: [], mapLinks: [] });

/** Reads the saved progress. Storage can be missing or blocked (private mode); then it starts empty. */
export function loadProgress(): Progress {
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
    };
  } catch {
    return empty();
  }
}

export function saveProgress(progress: Progress): void {
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

/** Forgets the whole progress (the parents' page, "きろくを ぜんぶ けす"). Settings are kept apart and stay. */
export function clearProgress(): void {
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
 * あいことば (PHASE7_FINISH §4 item 8): the whole progress as 12 letters to copy by hand and type in again later, on
 * this iPad or another one. Nothing leaves the device. Crockford's base 32 (no I, L, O, U; typed in, O reads as 0
 * and I or L as 1; case and dashes do not matter), shown as XXXX-XXXX-XXXX.
 * The first letter is the version: it fixes the lists below, so a code stays good when later chapters add stages
 * and records (they get a new version with longer lists and, if needed, more letters). Version 1 is 60 bits: the
 * version (5), what is done in the lists below (34: one bit per item) and a check (21 bits of FNV-1a over the
 * version and the items), so a mistyped letter is caught (a wrong code passes 1 time in 2 million).
 * Never reorder or drop an item of a published version.
 */
const PASSCODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PASSCODE_V1 = {
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
} as const;

const PASSCODE_FIELDS = ['cleared', 'abilities', 'records', 'mapLinks'] as const;

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

/** The progress as an あいことば ("XXXX-XXXX-XXXX"). Items the current version has no place for are left out. */
export function progressToPasscode(progress: Progress): string {
  const v = PASSCODE_V1;
  const items = PASSCODE_FIELDS.flatMap((field) => v[field].map((id) => ((progress[field] as string[]).includes(id) ? 1 : 0)));
  const bits = [...toBits(v.version, 5), ...items, ...toBits(passcodeCheck(v.version, items, v.checkBits), v.checkBits)];
  let code = '';
  for (let i = 0; i < bits.length; i += 5) code += PASSCODE_ALPHABET[fromBits(bits.slice(i, i + 5))];
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

export type PasscodeError = 'empty' | 'letters' | 'version' | 'length' | 'check';

/** Reads an あいことば back into a whole progress, or says what is wrong with it. */
export function passcodeToProgress(text: string): { ok: true; progress: Progress } | { ok: false; error: PasscodeError } {
  const clean = text
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[\s\-ー－_.]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (clean.length === 0) return { ok: false, error: 'empty' };
  const values = [...clean].map((c) => PASSCODE_ALPHABET.indexOf(c));
  if (values.some((value) => value < 0)) return { ok: false, error: 'letters' };
  const v = PASSCODE_V1;
  if (values[0] !== v.version) return { ok: false, error: 'version' };
  if (values.length !== v.letters) return { ok: false, error: 'length' };
  const bits = values.flatMap((value) => toBits(value, 5));
  const count = PASSCODE_FIELDS.reduce((sum, field) => sum + v[field].length, 0);
  const items = bits.slice(5, 5 + count);
  const check = fromBits(bits.slice(5 + count, 5 + count + v.checkBits));
  if (check !== passcodeCheck(v.version, items, v.checkBits)) return { ok: false, error: 'check' };
  const progress = empty();
  let at = 0;
  for (const field of PASSCODE_FIELDS) {
    for (const id of v[field]) {
      if (items[at++]) (progress[field] as string[]).push(id);
    }
  }
  return { ok: true, progress };
}
