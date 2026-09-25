/** Player settings (the gear on the title screen). Kept apart from the progress save: resetting one never touches the other. */
const KEY = 'train-game.settings.v1';

/** 0 = off, 1 = soft, 2 = loud. */
export type VolumeLevel = 0 | 1 | 2;

export interface Settings {
  music: VolumeLevel;
  sound: VolumeLevel;
  /** Less screen shake (braking, fails): for children who get motion sick. */
  calm: boolean;
  /** Lever on the right, buttons on the left. */
  leftHanded: boolean;
}

export const DEFAULT_SETTINGS: Settings = { music: 2, sound: 2, calm: false, leftHanded: false };

/** Gain for each volume level. */
export const VOLUME_GAIN: Record<VolumeLevel, number> = { 0: 0, 1: 0.45, 2: 1 };

const level = (v: unknown, fallback: VolumeLevel): VolumeLevel => (v === 0 || v === 1 || v === 2 ? v : fallback);

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const data = JSON.parse(raw) as Partial<Settings>;
    return {
      music: level(data.music, DEFAULT_SETTINGS.music),
      sound: level(data.sound, DEFAULT_SETTINGS.sound),
      calm: typeof data.calm === 'boolean' ? data.calm : DEFAULT_SETTINGS.calm,
      leftHanded: typeof data.leftHanded === 'boolean' ? data.leftHanded : DEFAULT_SETTINGS.leftHanded,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not saved (storage blocked); the setting still applies until the page closes.
  }
}
