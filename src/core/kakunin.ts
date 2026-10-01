import type { Progress } from './progress';
import type { AbilityId, StageFile } from '../stage/types';

/*
 * 「かくにん モード」 (docs/TECH_SPEC.md §かくにん モード): the owner's way to open any stage at any mission to check
 * it, without touching the child's save. It ships in the production build, behind a 4-digit number kept only as a
 * SHA-256 here (the digits are written nowhere). This file is the lock, the flag kept on the device and the rules
 * of the sandbox run and of the `?stage=` lock; src/ui/kakunin.ts is the number pad and the stage list.
 */

/** The device's flag (its own key, apart from the progress save): holds KAKUNIN_HASH once the code was right. */
export const KAKUNIN_FLAG_KEY = 'train-game.kakunin.v1';

/** SHA-256 (hex) of `train-game-kakunin:<4 digits>`. */
export const KAKUNIN_HASH = '80eaae856b4fc19a430f4f92ea3a592073d382618d7915a5397176eb6c7a1f0f';

export const KAKUNIN_DIGITS = 4;

const PREFIX = 'train-game-kakunin:';

async function sha256Hex(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Whether `digits` is the code. False too where Web Crypto is missing (it needs a secure context: https or localhost). */
export async function checkKakuninCode(digits: string): Promise<boolean> {
  if (!/^[0-9]+$/.test(digits) || typeof crypto === 'undefined' || !crypto.subtle) return false;
  try {
    return (await sha256Hex(PREFIX + digits)) === KAKUNIN_HASH;
  } catch {
    return false;
  }
}

/** This device was unlocked before. The stored value must be the hash itself: a stray "1" does not count. */
export function kakuninUnlocked(): boolean {
  try {
    return window.localStorage.getItem(KAKUNIN_FLAG_KEY) === KAKUNIN_HASH;
  } catch {
    return false;
  }
}

/** Remembers on this device that the code was right. */
export function rememberKakunin(): void {
  try {
    window.localStorage.setItem(KAKUNIN_FLAG_KEY, KAKUNIN_HASH);
  } catch {
    // Storage blocked: it works until the page is left.
  }
}

/** 「かくにん モードを やめる」: forgets it. */
export function forgetKakunin(): void {
  try {
    window.localStorage.removeItem(KAKUNIN_FLAG_KEY);
  } catch {
    // Nothing was kept.
  }
}

/**
 * Whether `?stage=`, `kakunin=` and `mission=` are held back: only in a production build, and not under browser
 * automation (a kid's iPad never reports `navigator.webdriver`; the Playwright smoke tests open locked stages
 * directly all over the place). The dev server is never locked.
 */
export function stageLockActive(): boolean {
  return import.meta.env.PROD && navigator.webdriver !== true;
}

/** A check-mode run (`kakunin=1`) is allowed with the flag, or wherever the lock is off. */
export function kakuninRunAllowed(): boolean {
  return !stageLockActive() || kakuninUnlocked();
}

/**
 * Whether this page address must bounce to the title (the caller goes to `location.pathname`): without the flag, a
 * test stage (0-*), a stage the save has not opened (its `unlock.requires` not all cleared; the stage of "つづきから"
 * is let through), an unknown stage, or the check mode's own `kakunin=` / `mission=`. The map itself opens stages
 * with `?stage=…&go=1`, so an open one passes.
 */
export async function stageBounces(
  params: URLSearchParams,
  progress: Progress,
  peek: (id: string) => Promise<{ unlock: { requires: string[] } } | null>,
): Promise<boolean> {
  if (!stageLockActive() || kakuninUnlocked()) return false;
  if (params.has('kakunin') || params.has('mission')) return true;
  const id = params.get('stage');
  if (id === null) return false;
  if (id.startsWith('0-')) return true;
  const stage = await peek(id);
  if (!stage) return true;
  if (progress.resume?.stage === id) return false;
  return !stage.unlock.requires.every((r) => progress.cleared.includes(r));
}

/** `?stage=…&go=1&kakunin=1&mission=<0-based index>`: a stage run in the sandbox from that mission (0 is from the start). */
export function kakuninSearch(stageId: string, mission = 0): string {
  return `?stage=${encodeURIComponent(stageId)}&go=1&kakunin=1${mission > 0 ? `&mission=${mission}` : ''}`;
}

/** The mission a check run starts at: `mission=` when it names one of the stage's missions, else 0. */
export function kakuninMission(params: URLSearchParams, missionCount: number): number {
  const n = Number.parseInt(params.get('mission') ?? '', 10);
  return Number.isInteger(n) && n >= 0 && n < missionCount ? n : 0;
}

/**
 * The abilities a check run has on top of the save's and the stages before's: what the stage's opening teaches and
 * what the missions before `from` taught (their ending cutscene, a chase's mid-step cutscene), so a mission started
 * halfway has every button it would have when played from the start.
 */
export function abilitiesTaughtBefore(file: StageFile, from: number): AbilityId[] {
  const out: AbilityId[] = [];
  const cutscene = (id: string | undefined): void => {
    for (const step of (id && file.cutscenes?.[id]) || []) if ('unlock' in step) out.push(step.unlock);
  };
  cutscene(file.opening);
  for (let i = 0; i < from && i < file.missions.length; i++) {
    for (const step of file.missions[i].steps) cutscene(step.lead?.learn);
    cutscene(file.missions[i].onComplete);
  }
  return out;
}
