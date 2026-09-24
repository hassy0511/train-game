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
}

const empty = (): Progress => ({ schema: SCHEMA, cleared: [], abilities: [], records: [] });

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
    };
  } catch {
    return empty();
  }
}

export function saveProgress(progress: Progress): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // Not saved (storage blocked); the game still plays.
  }
}

/** Adds items to a list field and saves. Returns true when something new was added. */
export function addToProgress(field: 'cleared' | 'abilities' | 'records', items: string[]): boolean {
  const progress = loadProgress();
  const list = progress[field] as string[];
  const fresh = items.filter((item) => !list.includes(item));
  if (fresh.length === 0) return false;
  list.push(...fresh);
  saveProgress(progress);
  return true;
}
