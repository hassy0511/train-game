import type { Settings, VolumeLevel } from '../core/settings';

interface Row<K extends keyof Settings> {
  key: K;
  label: string;
  choices: { value: Settings[K]; label: string }[];
}

const VOLUME: { value: VolumeLevel; label: string }[] = [
  { value: 0, label: 'けす' },
  { value: 1, label: 'ちいさく' },
  { value: 2, label: 'おおきく' },
];

const ROWS: Row<keyof Settings>[] = [
  { key: 'music', label: 'おんがく', choices: VOLUME },
  { key: 'sound', label: 'こうかおん', choices: VOLUME },
  {
    key: 'calm',
    label: 'がめんの ゆれ',
    choices: [
      { value: false, label: 'あり' },
      { value: true, label: 'へらす' },
    ],
  },
  {
    key: 'leftHanded',
    label: 'レバーの ばしょ',
    choices: [
      { value: false, label: 'ひだり' },
      { value: true, label: 'みぎ' },
    ],
  },
] as Row<keyof Settings>[];

/** How long "おうちの かたへ" must be held to open (a child's tap does nothing). */
export const PARENTS_HOLD_SECONDS = 2;

/**
 * Settings overlay (from the gear on the title screen). Every tap applies at once through `onChange`
 * (the caller saves and applies); "とじる" closes it. With `onParents`, a small "おうちの かたへ" at the bottom opens
 * the parents' page after a PARENTS_HOLD_SECONDS long press (PHASE7_FINISH §4 item 9).
 */
export function showSettings(root: HTMLElement, current: Settings, onChange: (next: Settings) => void, onParents?: () => void): void {
  let settings = { ...current };
  const el = document.createElement('div');
  el.id = 'settings';
  el.className = 'overlay settings';
  const h = document.createElement('h1');
  h.textContent = 'せってい';
  const list = document.createElement('div');
  list.className = 'settings-list';
  for (const row of ROWS) {
    const line = document.createElement('div');
    line.className = 'settings-row';
    const label = document.createElement('div');
    label.className = 'settings-label';
    label.textContent = row.label;
    const group = document.createElement('div');
    group.className = 'settings-choices';
    const buttons: HTMLButtonElement[] = [];
    for (const choice of row.choices) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'settings-choice';
      b.dataset.setting = row.key;
      b.dataset.value = String(choice.value);
      b.textContent = choice.label;
      b.setAttribute('aria-pressed', String(settings[row.key] === choice.value));
      b.addEventListener('click', () => {
        settings = { ...settings, [row.key]: choice.value };
        for (const other of buttons) other.setAttribute('aria-pressed', String(other === b));
        onChange(settings);
      });
      buttons.push(b);
      group.appendChild(b);
    }
    line.append(label, group);
    list.appendChild(line);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.id = 'settings-close';
  close.className = 'big-button';
  close.textContent = 'とじる';
  close.addEventListener('click', () => el.remove());
  el.append(h, list, close);
  if (onParents) el.appendChild(parentsButton(onParents));
  root.appendChild(el);
}

/**
 * "おうちの かたへ": opens only when held for PARENTS_HOLD_SECONDS (a ring fills while held). Letting go early, or
 * sliding off, starts over. How it opens ("2秒 長押し") is hidden until a short tap, and is in kanji for the
 * grown-up: a child who reads hiragana is not told how to get in.
 */
function parentsButton(onOpen: () => void): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'settings-parents';
  btn.className = 'parents-hold';
  btn.style.setProperty('--hold', `${PARENTS_HOLD_SECONDS}s`);
  btn.innerHTML = '<span class="parents-hold-ring" aria-hidden="true"></span><span class="parents-hold-label">おうちの かたへ</span>';
  const hint = document.createElement('span');
  hint.className = 'parents-hold-hint';
  hint.textContent = '2秒 長押し';
  btn.appendChild(hint);
  let timer = 0;
  const stop = (): void => {
    window.clearTimeout(timer);
    timer = 0;
    btn.classList.remove('is-holding');
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    stop();
    btn.classList.remove('is-hinting');
    btn.classList.add('is-holding');
    timer = window.setTimeout(() => {
      stop();
      onOpen();
    }, PARENTS_HOLD_SECONDS * 1000);
  });
  btn.addEventListener('pointerup', () => {
    if (!timer) return;
    stop();
    // Too short: say how it opens (in kanji: a parent reads it, a child sees nothing they can read).
    btn.classList.add('is-hinting');
  });
  btn.addEventListener('pointercancel', stop);
  btn.addEventListener('pointerleave', stop);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  return btn;
}
